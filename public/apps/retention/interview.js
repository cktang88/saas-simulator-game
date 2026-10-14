// Exit interviews: a short call with a customer who just cancelled. Surveys are cheap and often misleading
// ("too expensive" from an account that never activated); a well-run interview (open questions about what
// happened, no pitching, no leading "was it the price?") is how a stellar operator learns the real reason.
// Pure logic + the LLM persona prompt; the Customers app runs it.
import { clamp, words } from '../../core/util.js';
import { CHURN_REASONS, CROSS } from '../../data/churn-reasons.js';
import { shrink } from '../../core/operator.js';

// [design] Founder time: outreach email + scheduling 15 min; the call itself 30 min plus 10 min notes.
export const INTERVIEW = {
  outreachHours: 0.25,
  callHours: 0.75,
  // Share of churned customers who agree to a 20-30 minute exit call [design]: B2B accounts with a relationship
  // talk more often; consumers almost never.
  accept: { crm: 0.45, smb: 0.25, b2c: 0.08, ent: 0.5 },
  involuntaryAccept: 0.3, // relative: failed-payment churners rarely engage (CROSS.exitSurveyAccuracy)
  windowDays: 45,
  revealBase: 0.08,
  revealSlope: 0.85,
};

const OPEN = /\b(what|how|why|walk me through|tell me|describe|when)\b/i;
const PAST = /\b(last time|when did|what happened|before you|the day|the week|that week|first notic(e|ed)|the moment|what changed|who (decided|else)|involved|using now|use now|instead)\b/i;
const LEADING = /\b(was it (the )?(price|cost|money)|did you (not )?like|wasn'?t it|don'?t you think|isn'?t it|would you come back if|was it because)\b/i;
const PITCH = /\b(we (just )?(shipped|launched|added|have)|did you know|actually,? (we|it)|our new|discount|coupon|free month|special offer|come back)\b/i;

/** Heuristic interview quality 0..1 from the founder's questions (offline judge; shrunk toward the median). */
export function exitInterviewQuality(text) {
  const t = String(text ?? '');
  const qs = t.split(/\n|(?<=\?)/).map((x) => x.trim()).filter((x) => x.length > 3);
  const raw = qs.filter((x) => /\?$/.test(x) || OPEN.test(x));
  if (!raw.length) return 0.05;
  // Distinct questions only: the same opener repeated earns nothing (anti-stuffing).
  const key = (x) => x.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean).slice(0, 4).join(' ');
  const asked = [...new Map(raw.map((x) => [key(x), x])).values()];
  let s = 0.15;
  const open = asked.filter((x) => OPEN.test(x)).length;
  const past = asked.filter((x) => PAST.test(x)).length;
  const leading = asked.filter((x) => LEADING.test(x)).length;
  const pitch = qs.filter((x) => PITCH.test(x)).length;
  s += Math.min(0.3, 0.1 * open);
  s += Math.min(0.3, 0.12 * past);
  if (asked.length >= 3 && asked.length <= 8) s += 0.1;
  if (raw.length > 10) s -= 0.1; // an interrogation, not a conversation
  s -= 0.15 * leading;
  s -= 0.2 * pitch;
  if (words(t) > 250) s -= 0.1;
  if (asked.length < raw.length * 0.75) s -= 0.15;
  return clamp(s, 0, 1);
}

export function interviewAcceptance({ model, crm, involuntary }) {
  const base = model === 'b2c' ? INTERVIEW.accept.b2c : crm ? INTERVIEW.accept.crm : model === 'ent' ? INTERVIEW.accept.ent : INTERVIEW.accept.smb;
  return base * (involuntary ? INTERVIEW.involuntaryAccept : 1);
}

/** Chance the customer tells you the real reason, from the judged quality (LLM) blended with the heuristic. */
export function revealChance(heuristicQ, llmQ = null, mock = true) {
  const h = mock ? shrink(heuristicQ, 1, 0.45, 1) : heuristicQ; // offline keyword reads are weak evidence
  const q = llmQ != null && Number.isFinite(llmQ) ? 0.5 * h + 0.5 * clamp(llmQ, 0, 1) : h;
  return clamp(INTERVIEW.revealBase + INTERVIEW.revealSlope * q, 0, 0.9);
}

export const INTERVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['questionQuality', 'coaching', 'candidAnswer', 'guardedAnswer'],
  properties: {
    questionQuality: { type: 'number', description: '0-1: open, non-leading questions about what actually happened; no pitching or defending' },
    coaching: { type: 'string', description: 'One sentence: what a great interviewer would have asked instead' },
    candidAnswer: { type: 'string', description: '2-4 sentences in character revealing the real reason with specifics' },
    guardedAnswer: { type: 'string', description: '1-3 sentences in character repeating the polite surface answer' },
  },
};

export function interviewPrompt({ name, company, segmentLabel, trueReason, stated, productName, questions }) {
  const r = CHURN_REASONS[trueReason] ?? CHURN_REASONS.other;
  return {
    system: `You are ${name}${company ? ` from ${company}` : ''}${segmentLabel ? ` (${segmentLabel})` : ''}. You cancelled ${productName} recently. The REAL reason: ${r.label}. ${r.note ?? ''} In the exit survey you said: "${stated ?? 'nothing (you skipped it)'}". You are polite and busy. You only open up to a founder who asks open questions about what happened, listens, and does not pitch or argue. Also act as an interview coach scoring the founder's questions.`,
    prompt: `The founder's questions:\n${String(questions).slice(0, 1500)}\n\nScore the questions, write one coaching sentence, then write both answers: candidAnswer (you explain the real reason with concrete detail) and guardedAnswer (you repeat the polite surface answer).`,
  };
}

export function interviewFallback({ trueReason, stated, questions }) {
  const r = CHURN_REASONS[trueReason] ?? CHURN_REASONS.other;
  const q = exitInterviewQuality(questions);
  return {
    questionQuality: q,
    coaching: q >= 0.6 ? 'Good: open questions about what happened. Ask who else was involved in the decision.' : 'Ask open questions about the moment they decided ("walk me through the week you cancelled"), never "was it the price?", and do not pitch.',
    candidAnswer: `Honestly? ${r.label}. ${r.note ? r.note.split('.')[0] + '.' : ''}`.trim(),
    guardedAnswer: stated ? `Like I said in the survey: ${String(stated).toLowerCase()}.` : "It just wasn't the right fit for us right now.",
  };
}

export const surveyResponseRate = (sub, base) => (sub.churnReason === 'payment_failed' ? CROSS.exitSurveyAccuracy.involuntaryChurnersAnswering : base);
