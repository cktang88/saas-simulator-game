// Customer discovery (Mom Test) helpers: hidden persona facts, question classification, a deterministic
// fallback interviewee, transcript grading and note extraction. Pure.
//
// Sources: docs/research/sales-and-research.md §4 (Mom Test principles, grading rubric, recruiting
// response rates, synthetic users = rehearsal only, NN/G 2024/2025).

import { clamp, words } from '../../core/util.js';
import { s15 } from '../../core/rubric-schema.js';
import { REALISM } from '../../core/llm.js';
import { INTERVIEWEE_RULES } from './rubrics.js';

// Recruiting [S, practitioner estimates 2025–26]: response rates warm 40–60%, community 25–40%, cold 5–15%.
// Game hours = outreach messages needed for one booked call × ~8 min each, and days until the call [A].
export const RECRUIT = {
  warm: { label: 'Warm network / intro', response: 0.5, hours: 0.3, days: [1, 3] },
  community: { label: 'Community post / DM', response: 0.3, hours: 0.6, days: [3, 6] },
  cold: { label: 'Cold outreach', response: 0.1, hours: 1.4, days: [5, 10] },
};
export const INTERVIEW_MINUTES = 45;
export const PAIN_REAL_SHARE = 0.55; // [design] share of plausible ICP people for whom the pain is real and current
export const FACT_KEYS = ['lastTime', 'workaround', 'spend', 'frequency', 'decision', 'priorities'];
export const COMMITMENTS = ['none', 'followup', 'intro', 'pilot', 'loi', 'preorder'];
export const COMMIT_LABEL = { none: 'No commitment', followup: 'Follow-up meeting', intro: 'Introduction', pilot: 'Pilot', loi: 'Letter of intent', preorder: 'Pre-order / deposit' };

const Q = {
  leading: /(wouldn'?t it be|don'?t you (hate|think|agree|find)|isn'?t it|wouldn'?t you|you'?d (love|want|agree)|surely|right\?|agree that|must be (annoying|painful|frustrating)|how much do you hate|how frustrating)/i,
  hypothetical: /(would you|will you|if (we|i|there was|there were|you had|you could)|could you see yourself|how much would you pay|would that|might you|imagine|in the future|are you going to|do you think you('?d| would))/i,
  pitch: /(our [a-z]+ (app|tool|product|feature|platform|software)|would have saved|our (demo|price|pricing)|\$\d+ for (our|it)|we'?re building|we are building|i'?m building|i am building|our (product|app|tool|platform|solution)|my (product|app|tool|startup)|we built|i built|it will|it can|our ai|let me show|demo|feature that|we (help|let|allow)|sign up|launching)/i,
  generic: /(do you usually|how often do you|in general|typically|normally|do you ever|what do you think about)/i,
  good: /(tell me about the last time|last time|walk me through|what did you|how did you|what happened|what does (it|that) cost|how much (did|does) (it|that|you)|who else|what have you tried|why (did|is|was)|what was the hardest|what('?s| is) the hardest|what happens if|how are you (dealing|handling|solving)|what do you use|what did that|how long did|show me|can you show|where does|when did)/i,
};

// Classify one founder turn. Returns array of tags.
export function classifyQuestion(text) {
  const t = String(text ?? '');
  const tags = [];
  if (Q.leading.test(t)) tags.push('leading');
  if (Q.hypothetical.test(t)) tags.push('hypothetical');
  if (Q.pitch.test(t)) tags.push('pitch');
  if (Q.generic.test(t)) tags.push('generic');
  if (Q.good.test(t) && !tags.includes('leading') && !tags.includes('pitch') && !tags.includes('hypothetical')) tags.push('good');
  if (/(intro|introduce|who else should i talk|pilot|letter of intent|\bloi\b|pre-?order|deposit|pay (now|upfront|today)|next step|follow[- ]?up|meet again|try it with)/i.test(t)) tags.push('ask');
  return tags;
}

// The same Mom Test labels as typed yes/no decisions for Jev (core/llm.js decide()): each label is independent,
// so a question can be both leading and hypothetical. Regexes miss paraphrases; Jev reads the meaning.
export const QUESTION_TAG_QUESTIONS = {
  leading: { type: 'noul', instructions: 'Does the founder\'s latest message suggest the answer they want to hear?', criteria: { true: 'It nudges toward an answer ("wouldn\'t it be great", "that must be painful, right?", "you\'d agree that…", "I bet you hate…")', false: 'It is neutral; the interviewee could answer either way without disagreeing with the founder' } },
  hypothetical: { type: 'noul', instructions: 'Does the latest message ask the interviewee to imagine or predict what they would do, pay or want, instead of what actually happened?', criteria: { true: 'It asks what they would do, pay or want in an imagined situation ("would you use", "how much would you pay", "imagine if", "suppose you had")', false: 'It asks about things that already happened or are true now, or it simply proposes a concrete next step (booking a call, an intro)' } },
  pitch: { type: 'noul', instructions: 'Is the founder presenting their OWN product or company in the latest message (what it does, its features, its name, its price, a demo)?', criteria: { true: 'It says what the founder is building or selling, names it, gives its features or price, or offers a demo', false: 'It does not describe the founder\'s own product; a question about an imagined generic tool is not a pitch, and neither is a bare request for a pilot, meeting or intro' } },
  generic: { type: 'noul', instructions: 'Is the latest message a question about the interviewee\'s general habits or general opinions ("do you usually", "how often", "do you ever", "what do you think about X")?', criteria: { true: 'It asks what they usually, typically or generally do, how often, whether they ever do something, or their opinion of a topic in general', false: 'It asks about one specific instance or current facts (tools, spend, people), or it is a hypothetical (would you), a leading statement, a pitch, a request or not a habit question at all' } },
  good: { type: 'noul', instructions: 'Does the latest message ask the interviewee to recount specific real facts: a past event, its cost, what they tried, what they use or pay for today, or who else is involved?', criteria: { true: 'It asks about the last time, a walk-through of what happened, what it cost, what they tried, the tools or people they pay today, or who else decides', false: 'It does not ask about specific facts; habit questions ("do you usually", "how often"), opinions, and requests for an intro, meeting or pilot are not questions about facts' } },
  commitment: { type: 'noul', instructions: 'Does the latest message ask for a concrete next step that costs the interviewee time, reputation or money?', criteria: { true: 'It asks for an intro, a follow-up meeting, a pilot, a letter of intent, a pre-order or a deposit', false: 'It does not ask for any commitment' } },
};
export const QUESTION_TAG_MIN_P = 0.6; // [design] a label needs ≥60% to count; a false "good" inflates the grade more than a missed one

/** Tags for one founder turn: Jev when live (independent yes/no per label), else the regex classifier. */
export async function classifyQuestionLive(llm, text, { previousReply = '', cache = null } = {}) {
  const regex = classifyQuestion(text);
  const d = await llm.decide({
    task: 'interview_question_tags',
    state: { setting: 'A founder is running a Mom Test customer-discovery interview.', interviewee_last_said: String(previousReply).slice(0, 1500), founder_latest_message: String(text).slice(0, 2000) },
    questions: QUESTION_TAG_QUESTIONS,
    fallback: () => Object.fromEntries(Object.keys(QUESTION_TAG_QUESTIONS).map((k) => [k, { type: 'noul', noul: regex.includes(k) ? 1 : 0 }])),
    cache,
  });
  const tags = Object.keys(QUESTION_TAG_QUESTIONS).filter((k) => (d.answers[k]?.noul ?? 0) >= QUESTION_TAG_MIN_P);
  // "good" never coexists with leading, pitch or hypothetical (same rule as the regex classifier).
  return { tags: tags.filter((t) => t !== 'good' || !tags.some((x) => ['leading', 'pitch', 'hypothetical'].includes(x))), mock: d.mock };
}

// Hidden facts for a persona, deterministic from rand. Live LLM can enrich them at creation.
export function makeFacts(rand, { model = 'smb', icp = '', name = '', painReal: forced = null } = {}) {
  const drawn = rand() < PAIN_REAL_SHARE;
  const painReal = forced ?? drawn; // a persona drawn from the hidden market passes its real pain in
  const hours = painReal ? 2 + Math.round(rand() * 6) : Math.round(rand() * 2);
  const spend = model === 'b2c' ? (painReal ? 5 + Math.round(rand() * 15) : 0) : painReal ? 50 + Math.round(rand() * 400) : Math.round(rand() * 30);
  const tool = ['a spreadsheet', 'email threads', 'a generic project tool', 'pen and paper', 'a freelancer they pay', 'a ChatGPT prompt they paste into'][Math.floor(rand() * 6)];
  return {
    painReal,
    lastTime: painReal ? `Last ${['Tuesday', 'week', 'month-end', 'Friday'][Math.floor(rand() * 4)]} it ate about ${hours} hours and something slipped through` : 'Honestly can\'t remember a specific recent time it was a real problem',
    workaround: painReal ? `Uses ${tool}; patched it together themselves` : `Uses ${tool} and it is fine`,
    spend: spend ? `Spends about $${spend}/month on it today (tools or someone's time)` : 'Spends nothing on it today',
    frequency: painReal ? ['every week', 'every month-end', 'several times a week'][Math.floor(rand() * 3)] : 'rarely',
    decision: model === 'b2c' ? 'Decides alone, cancels anything unused' : model === 'ent' ? 'Needs their VP and IT security to sign off' : 'Owner decides; anything over ~$100/month needs a second thought',
    priorities: painReal ? 'It is in their top 3 problems this quarter' : 'Hiring and sales matter far more right now',
    spendNum: spend,
    hoursNum: hours,
    _icp: String(icp).slice(0, 200),
    _name: name,
  };
}

const FREQ_TEXT = { daily: 'almost every day', weekly: 'every week', monthly: 'every month', rare: 'a few times a year' };
const capFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * Ground a rehearsal persona's hidden facts in the hidden person drawn from the market (core/truth.js drawPerson):
 * their own last incident, workaround, what it costs them, how often it bites, whether they hold the budget, and
 * what else competes for their quarter. Fields the drawn person does not carry keep makeFacts' values, so the
 * random stream (and every seeded test) is unchanged. customerType tunes who signs off.
 */
export function personalizeFacts(base, drawn, { customerType = null, model = 'smb' } = {}) {
  if (!drawn) return base;
  const f = { ...base };
  const pain = Boolean(base.painReal);
  if (pain && drawn.lastIncident) f.lastTime = `${capFirst(String(drawn.lastIncident))}; it ate about ${base.hoursNum} hours`;
  if (pain && drawn.workaround) f.workaround = `Uses ${drawn.workaround}; patched it together themselves`;
  if (pain && drawn.workaroundCostMonthly > 0) {
    const usd = Math.max(5, Math.round(drawn.workaroundCostMonthly / 5) * 5);
    f.spend = `Spends about $${usd}/month on it today (tools or someone's time)`;
    f.spendNum = usd;
  }
  if (pain && FREQ_TEXT[drawn.frequency]) f.frequency = FREQ_TEXT[drawn.frequency];
  const others = (drawn.competingPriorities ?? []).slice(0, 2).join(' and ');
  if (others) f.priorities = pain ? `It is in their top 3 problems this quarter, alongside ${others}` : `${capFirst(others)} matter far more right now`;
  const consumer = model === 'b2c' || customerType === 'consumers' || drawn.role === 'consumer';
  if (consumer) f.decision = 'Decides alone, cancels anything unused';
  else if (drawn.role === 'outsider') f.decision = 'Would not be the one buying; not their area';
  else if (customerType === 'enterprise' || customerType === 'mid_market' || model === 'ent') f.decision = drawn.budgetAuthority ? 'Owns the budget, but security review and procurement still have to clear any new vendor' : 'Would need their VP to sponsor it and IT security to sign off';
  else if (drawn.budgetAuthority) f.decision = customerType === 'startups' ? 'Can put it on the company card; anything over a few hundred a month goes past the CEO' : 'Owner decides; anything over ~$100/month needs a second thought';
  else f.decision = customerType === 'startups' ? 'Uses it, but the founder or eng manager approves new tools' : 'Uses it day to day; the owner signs off on anything that costs money';
  return f;
}

// Offline interviewee voice: the same behaviour (what gets revealed, what gets committed) for every persona, but each
// person phrases it their own way (variant picked by name), and a consumer does not talk like a shop owner. [design]
const LINES = {
  hypothetical: ['Probably, yeah. Depends on the price I guess. Hard to say.', 'I mean, maybe? I say yes to a lot of things I never end up using.', 'Sure, in theory. Ask me again when it exists.', 'Hard to know. If it was cheap and just worked, possibly.'],
  leading: ['Yeah, I suppose so. Doesn\'t everyone?', 'I guess? You seem pretty sure about it.', 'Sure, I can see why you\'d think that.', 'Mm, yeah, that sounds right.'],
  pitchPain: ['Sounds nice. I\'d have to see it.', 'Okay. I\'d want to see it on my own stuff before I believed it.', 'Could be useful. Everyone promises that, though.'],
  pitchNoPain: ['Cool, sounds useful for someone. Good luck with it!', 'Neat. Not really my problem, but I can see it.', 'Nice idea. I\'m probably not the person who\'d use it.'],
  stacked: ['That\'s a lot of questions at once. Honestly it depends.', 'Sorry, which part? It depends on a few things.', 'Hm, there\'s a lot in there. It varies.'],
  genericPain: ['Depends on the week. Sometimes it\'s fine, sometimes it\'s a mess.', 'Usually it\'s okay, until it really isn\'t.', 'It comes and goes. Some weeks are rough.'],
  genericNoPain: ['Not really, it\'s fine most of the time.', 'Honestly it doesn\'t come up much.', 'Not something I think about a lot.'],
  unclear: ['Sorry, what do you mean exactly?', 'I\'m not sure I follow. Can you say that differently?', 'What do you mean by that?'],
  brushOff: ['Keep me posted, I guess. Pretty busy right now.', 'Maybe later. It\'s a hectic stretch.', 'Send me something and I\'ll look when I can.'],
  repeat: ['You asked that already.', 'I think I answered that one.', 'Same answer as before, really.'],
};
const COMMIT_LINES = {
  business: {
    preorder: ['If it does what we discussed, I can put down a deposit. Send me something.', 'Send me an invoice for the first month and I\'ll pay it if it does what you said.'],
    pilot: ['I could try it with one real week of our work. If it saves the hours I\'ll keep going.', 'Let\'s try it on next month\'s batch. If it holds up, we talk money.'],
    intro: ['Talk to someone I know who runs a similar operation; they complain about this more than I do. I\'ll intro you.', 'I know two people with the exact same headache. I\'ll connect you.'],
    followup: ['Sure, send me a time next week and show me something concrete.', 'Happy to talk again once you have something I can click.'],
  },
  consumer: {
    preorder: ['If it actually does that, I\'d pay for the first few months up front.', 'Send me a link. If it\'s what you described, I\'ll pay now.'],
    pilot: ['I\'d try it for a couple of weeks and see if I stick with it.', 'Put me on the beta. I\'ll use it for real and tell you.'],
    intro: ['My sister has the same problem, I\'ll put you in touch.', 'A friend of mine moans about this constantly. I\'ll send you her way.'],
    followup: ['Sure, message me when there\'s something to try.', 'Ping me next week, I can look then.'],
  },
};
const lineFor = (kind, persona, salt = '') => { const arr = LINES[kind]; return arr[Math.floor(pseudo(`${persona?.name ?? ''}|${kind}|${salt}`) * arr.length) % arr.length]; };

const FACT_PROMPT = {
  lastTime: /(last time|recent|when did|walk me through|what happened|tell me about)/i,
  workaround: /(how do you|what do you (use|do)|currently|today|right now|tried|workaround|handle|deal with|solve)/i,
  spend: /(cost|spend|pay|paying|budget|money|\$|price|how much)/i,
  frequency: /(how often|frequency|every|times a)/i,
  decision: /(who (else|decides|signs|approves)|decision|boss|approve|buy)/i,
  priorities: /(priority|priorities|biggest|hardest|most important|top|worry|keeps you up)/i,
};

// Offline interviewee: answers past-specific questions with the next relevant hidden fact, hypotheticals
// with polite fluff, pitches with compliments, and commits only if the pain is real and they're asked.
export function fallbackReply(persona, history, question) {
  const facts = persona.facts;
  const tags = classifyQuestion(question);
  const revealedSoFar = new Set(history.flatMap((m) => m.revealed ?? []));
  const goodTurns = new Set(history.filter((m) => m.from === 'me' && (m.tags ?? []).includes('good')).map((m) => String(m.text).toLowerCase().trim())).size;
  let reply, revealed = [], commitment = 'none';
  // One question at a time (review P8): long or multi-part questions get a vague answer, repeats get called out.
  const single = words(question) < 25 && (String(question).match(/\?/g) ?? []).length <= 1;
  const qTok = new Set(String(question).toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const repeat = history.filter((m) => m.from === 'me').some((m) => {
    const o = new Set(String(m.text).toLowerCase().split(/\W+/).filter((w) => w.length > 2));
    const inter = [...qTok].filter((w) => o.has(w)).length;
    return inter / Math.max(1, new Set([...qTok, ...o]).size) >= 0.7;
  });
  const turn = history.filter((m) => m.from === 'me').length;
  const say = (kind) => lineFor(kind, persona, turn);
  if (repeat) return { reply: say('repeat'), revealed: [], commitment: 'none' };
  const hit = Object.keys(FACT_PROMPT).find((k) => FACT_PROMPT[k].test(question) && !revealedSoFar.has(k)) ?? Object.keys(FACT_PROMPT).find((k) => FACT_PROMPT[k].test(question));
  if (tags.includes('ask')) {
    if (facts.painReal && goodTurns >= 2) {
      const earned = goodTurns >= 4 && facts.spendNum >= 200 && pseudo(`${facts._name}|${question}`) < 0.3;
      commitment = /pre-?order|deposit|pay/i.test(question) ? (earned ? 'preorder' : 'pilot') : /pilot|try/i.test(question) ? 'pilot' : /intro|who else/i.test(question) ? 'intro' : 'followup';
      const opts = COMMIT_LINES[persona.audience === 'consumer' || /^Decides alone/.test(facts.decision ?? '') ? 'consumer' : 'business'][commitment];
      reply = opts[Math.floor(pseudo(`${persona.name ?? ''}|${commitment}`) * opts.length) % opts.length];
    } else reply = say('brushOff');
  } else if (tags.includes('pitch')) reply = say(facts.painReal ? 'pitchPain' : 'pitchNoPain');
  else if (tags.includes('leading')) reply = say('leading');
  else if (tags.includes('hypothetical')) reply = say('hypothetical');
  else if (!single) reply = say('stacked');
  else if (hit && (tags.includes('good') || !tags.includes('generic'))) {
    revealed = [hit];
    reply = facts[hit] + '.';
  } else if (tags.includes('generic')) reply = say(facts.painReal ? 'genericPain' : 'genericNoPain');
  else reply = say('unclear');
  return { reply, revealed, commitment };
}

const pseudo = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

// Heuristic transcript grade per the research rubric. messages: [{from:'me'|'them', text, tags?, revealed?, commitment?}]
export function gradeTranscript(messages, persona) {
  const me = messages.filter((m) => m.from === 'me');
  const them = messages.filter((m) => m.from === 'them');
  const meWords = me.reduce((a, m) => a + words(m.text), 0);
  const allWords = meWords + them.reduce((a, m) => a + words(m.text), 0);
  const talkRatio = allWords ? meWords / allWords : 0;
  const c = { leading: [], hypothetical: [], pitch: [], generic: [], good: [] };
  const seen = new Set();
  let repeats = 0;
  for (const m of me) {
    const key = String(m.text).toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(key)) { repeats++; continue; } // repeating a question earns nothing
    seen.add(key);
    for (const t of m.tags ?? classifyQuestion(m.text)) if (c[t]) c[t].push(m.text);
  }
  const revealed = [...new Set(them.flatMap((m) => m.revealed ?? []))];
  const order = COMMITMENTS;
  const commitment = them.map((m) => m.commitment ?? 'none').reduce((best, x) => (order.indexOf(x) > order.indexOf(best) ? x : best), 'none');
  let score = 45 + 6 * Math.min(6, c.good.length) - 9 * c.leading.length - 8 * c.hypothetical.length - 10 * c.pitch.length - 3 * c.generic.length
    + 6 * revealed.length + { none: 0, followup: 4, intro: 10, pilot: 14, loi: 16, preorder: 18 }[commitment] - (talkRatio > 0.3 ? Math.round((talkRatio - 0.3) * 80) : 0);
  if (me.length < 4) score -= 15;
  score -= 6 * repeats;
  score = clamp(Math.round(score), 0, 100);
  const feedback = [];
  if (c.pitch.length) feedback.push(`You pitched ${c.pitch.length}× before understanding their problem. Anything they said after that is politeness.`);
  if (c.hypothetical.length) feedback.push(`${c.hypothetical.length} hypothetical/future question(s) ("would you…"): answers to these are fluff. Ask about the last time it happened.`);
  if (c.leading.length) feedback.push(`${c.leading.length} leading question(s): you told them the answer you wanted.`);
  if (talkRatio > 0.3) feedback.push(`You talked ${Math.round(talkRatio * 100)}% of the time (aim for under 30%).`);
  if (!revealed.length) feedback.push('No specifics about past behaviour, workarounds or spend came out.');
  if (commitment === 'none') feedback.push('Ended without a commitment (intro, follow-up, pilot, pre-order). "Keep me posted" is a polite no.');
  if (!feedback.length) feedback.push('Solid Mom Test interview: past specifics, little pitching, and a concrete next step.');
  const insights = revealed.map((k) => ({ theme: themeForFact(k), type: k === 'spend' ? 'spend' : k === 'workaround' ? 'workaround' : k === 'lastTime' ? 'pain' : 'behavior', text: persona?.facts?.[k] ?? k }));
  if (commitment !== 'none') insights.push({ theme: 'Commitments', type: 'commitment', text: COMMIT_LABEL[commitment] });
  // Per-criterion scores (INTERVIEW_CRITERIA) so offline results have the same shape as a live judge.
  const kinds = new Set(revealed);
  const criteria = {
    past_specifics: s15(1 + Math.min(4, c.good.length) - (revealed.length ? 0 : 1)),
    no_leading: s15(5 - 2 * (c.leading.length + c.hypothetical.length)),
    no_pitching: s15(5 - 2 * c.pitch.length - (talkRatio > 0.5 ? 2 : talkRatio > 0.3 ? 1 : 0)),
    digs_for_cost: s15(1 + ['spend', 'workaround', 'decision', 'frequency'].filter((k) => kinds.has(k)).length),
    earns_commitment: { none: 1, followup: 3, intro: 3, pilot: 4, loi: 5, preorder: 5 }[commitment],
  };
  return {
    score, talkRatio, ...criteria, evidence: [],
    leadingQuestions: c.leading, hypotheticals: c.hypothetical, pitching: c.pitch, goodQuestions: c.good,
    pastSpecifics: revealed.map((k) => persona?.facts?.[k] ?? k), commitments: commitment === 'none' ? [] : [commitment],
    insights, feedback: feedback.join(' '),
  };
}
const themeForFact = (k) => ({ lastTime: 'Pain & triggers', workaround: 'Current workaround', spend: 'Money & willingness to pay', frequency: 'Pain & triggers', decision: 'Buying process', priorities: 'Priorities' }[k] ?? 'Other');

const THEMES = [
  ['Money & willingness to pay', /(\$|cost|spend|pay|budget|price|expensive|cheap|invoice)/i],
  ['Current workaround', /(spreadsheet|excel|sheet|manual|by hand|workaround|currently use|we use|they use|tool|zapier|notion|email|paper|copy)/i],
  ['Pain & triggers', /(hours?|every|each|month[- ]end|week|late|miss|error|frustrat|pain|annoy|chase|wast)/i],
  ['Buying process', /(boss|approve|decid|sign[- ]?off|procurement|security|it team|partner|budget holder)/i],
  ['Feature requests', /(wish|want|would like|need a|feature|integration|export|if it could)/i],
  ['Commitments', /(intro|pilot|loi|letter of intent|pre-?order|deposit|follow[- ]?up|next meeting)/i],
];
export function themeOf(text) {
  return THEMES.find(([, re]) => re.test(text))?.[0] ?? 'Other';
}

// Extract insights from real-call notes (fallback for the LLM extractor).
export function extractFromNotes(notes, commitments = []) {
  const sentences = String(notes ?? '').split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/^[-*•\s]+/, '').trim()).filter((s) => words(s) >= 4);
  const scored = sentences.map((s) => ({ s, v: (/\d/.test(s) ? 2 : 0) + (/["“]/.test(s) ? 1 : 0) + (/(last|yesterday|ago|did|spent|paid|tried|used|lost)/i.test(s) ? 2 : 0) + (/(would|will|might|love|great idea|cool)/i.test(s) ? -2 : 0) }));
  const insights = scored.filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6).map(({ s }) => ({ theme: themeOf(s), type: /(\$|cost|spend|pay)/i.test(s) ? 'spend' : /(spreadsheet|use|manual|tool)/i.test(s) ? 'workaround' : 'pain', text: s.slice(0, 240) }));
  for (const c of commitments) insights.push({ theme: 'Commitments', type: 'commitment', text: COMMIT_LABEL[c] ?? c });
  const compliments = sentences.filter((s) => /(love(d)? (it|the idea)|would love|great idea|would (definitely )?(use|buy|pay)|sounds (great|amazing|cool))/i.test(s));
  const pastSpecific = scored.filter((x) => x.v >= 2).length;
  const quality = clamp(30 + 10 * pastSpecific + 15 * commitments.length - 10 * compliments.length, 0, 100);
  const issues = [];
  if (compliments.length) issues.push(`${compliments.length} compliment(s)/future promise(s) recorded: they are not validation.`);
  if (!pastSpecific) issues.push('No past-behaviour specifics (numbers, last time, what they tried or spent).');
  if (!commitments.length) issues.push('No commitment recorded.');
  const has = (re) => sentences.some((x) => re.test(x));
  const best = commitments.reduce((a, c) => Math.max(a, { followup: 3, intro: 3, pilot: 4, loi: 5, preorder: 5 }[c] ?? 1), 1);
  const criteria = {
    past_facts: s15(1 + pastSpecific),
    money_and_workaround: s15(1 + (has(/(\$|cost|spend|paid|pay|budget|hours? )/i) ? 2 : 0) + (has(/(spreadsheet|excel|manual|tool|use[sd]?|tried|workaround|by hand)/i) ? 2 : 0)),
    quotes_vs_interpretation: s15(1 + Math.min(4, (String(notes ?? '').match(/["“]/g) ?? []).length / 2)),
    compliments_filtered: compliments.length ? (has(/(not (a )?(validation|evidence)|polite|fluff|compliment)/i) ? 4 : 2) : 4,
    commitment_signal: best,
  };
  return { insights, quality, issues, ...criteria, evidence: [] };
}

// System prompt for the interviewee role-play (interview_chat). In character, never a grader: the persona decides how
// much to share from INTERVIEWEE_RULES (past specific + single open question = a real fact; everything else = fluff).
export function intervieweeSystem(persona) {
  const f = persona.facts;
  return `${REALISM}
You are ${persona.name}, ${persona.role}${persona.company ? ` at ${persona.company}` : ''}. ${persona.context ?? ''}
A founder is interviewing you on a video call (you agreed to 45 minutes as a favour). HIDDEN FACTS (stay consistent; reveal at most ONE per reply, then list its key in "revealed"; if they repeat a question, say so):
${FACT_KEYS.map((k) => `- ${k}: ${f[k]}`).join('\n')}
The pain is ${f.painReal ? 'REAL for you' : 'NOT a priority for you'}.
${INTERVIEWEE_RULES}
If the pain is not real, never go beyond "keep me posted". Short answers (1-3 sentences).`;
}
