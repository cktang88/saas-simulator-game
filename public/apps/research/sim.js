// Simulated REAL interviews. Each recruited person is a hidden drawPerson(...) record; the chat runs through
// buildTurnRequest (system prompt + per-turn private note) on the LLM path (settleReply clamps whatever the model returns) and through
// offlineAnswer when offline. Hidden facts are revealed only as the questions earn them, commitments are what the
// facts allow, and the transcript is graded with the existing Mom Test rubric. The result is evidence the game
// verified (unlike honour-system notes) — but only as good as WHO you recruited and HOW you asked.

import { clamp } from '../../core/util.js';
import { notify, spendHours } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { monthlyPrice } from '../../core/market.js';
import { disc, dstream, incidentDaysOf } from './store.js';
import { INTERVIEW_HOURS, completionCost, payUsd, noShowP, CHANNELS } from './recruit.js';
import { insightsFromSim, COMMIT_RANK } from './synthesis.js';
import {
  newHiddenState, advanceState, settleReply, offlineAnswer, buildTurnRequest,
  classifyQuestion as classifyQ, detectAsk, EARNING_TYPES, COMMITMENT_ORDER,
} from '../../data/persona-prompts.js';
import { gradeTranscript, COMMIT_LABEL } from '../product/interview.js';
import { nicheBrief } from '../growth/nicheUse.js';

export const MAX_SIM_TURNS = 24;
const QTAG = { past_specific: 'good', open_followup: 'good', price_current: 'good', hypothetical: 'hypothetical', price_hypothetical: 'hypothetical', feature_request: 'hypothetical', leading: 'leading', pitch: 'pitch', generic: 'generic', stacked: 'generic' };
const LEGACY_KEY = { lastIncident: 'lastTime' };
const WORKAROUNDS = ['a spreadsheet and a lot of manual chasing', 'email threads and calendar reminders', 'a shared inbox and sticky notes', 'a generic project tool nobody likes', 'paper notes and the phone', 'a freelancer who patches it together'];

export const confirmedBefore = (iv) => iv.confirmedDay != null && iv.confirmedDay >= iv.day - 2 && iv.confirmedDay < iv.day;

const whenText = (d) => (d <= 1 ? 'Yesterday' : d <= 7 ? `${d} days ago` : d <= 15 ? 'About two weeks ago' : d <= 45 ? `About ${Math.round(d / 7)} weeks ago` : `About ${Math.max(2, Math.round(d / 30))} months ago`);

/** The hidden record in the shape persona-prompts expects: spoken text for incident and workaround, never raw numbers. */
export function chatPerson(state, iv) {
  const h = iv.hidden;
  // dstream is keyed on state.seed, which every rng(state) call advances: draw the spoken story once per person and keep
  // it on the interview, so the incident and workaround stay the same from one question to the next.
  if (!iv.spoken) {
    const r = dstream(state, `persona:${iv.id}`);
    const job = (h.claimJob ?? (h.jobsRanked ?? []).find((j) => !j.decoy)?.label ?? 'the core problem').replace(/^(to )?/i, '').toLowerCase();
    const hours = 1 + Math.round((h.painIntensity ?? 0.5) * 6);
    // A niche interviewee speaks the dossier's incident, tool and vocabulary (core/truth.js flavor).
    const nicheIncident = h.nicheId && h.hasPain && h.lastIncident ? String(h.lastIncident) : null;
    const days = incidentDaysOf(h);
    const incident = nicheIncident ?? (h.hasPain && days != null
      ? `${whenText(days)} it went wrong with ${job}: it ate about ${hours} hours and ${['a client noticed before we did', 'something slipped through', 'two people had to drop what they were doing', 'it hit cash for a week'][Math.floor(r() * 4)]}`
      : null);
    const workaround = h.nicheId && h.hasPain && h.workaround ? h.workaround : h.hasPain ? WORKAROUNDS[Math.floor(r() * WORKAROUNDS.length)] : ['the setup we already have', 'a tool the team picked years ago'][Math.floor(r() * 2)];
    iv.spoken = { incident, workaround };
  }
  return { ...h, name: iv.persona.name, role: `${h.title}${iv.persona.company ? ` (${iv.persona.company})` : ''}${h.nicheId ? `. ${nicheBrief(state, h.nicheId)}` : ''}`, segmentId: undefined, lastIncident: iv.spoken.incident, workaround: iv.spoken.workaround };
}

const toHistory = (msgs) => msgs.map((m) => ({ from: m.from, text: m.text, revealed: m.revealed ?? [], commitment: m.commitment, statedWtp: m.statedWtp }));

/** Start the call. The interviewee may no-show (more likely unconfirmed, cold and unpaid); a confirmation the day before cuts it. */
export function startSim(state, id, { charge = false } = {}) {
  const iv = disc(state).interviews.find((x) => x.id === id);
  if (!iv?.sim || iv.status !== 'scheduled') throw new Error('This call is not waiting to be held.');
  if (state.day < iv.day) throw new Error('Too early: they are available from the booked day.');
  if (charge) spendHours(state, INTERVIEW_HOURS.scheduling, 'Scheduling an interview');
  const confirmed = confirmedBefore(iv);
  const r = dstream(state, `noshow:${iv.id}`);
  if (r() < noShowP(iv, confirmed)) {
    iv.status = 'no-show'; iv.noShowBy = 'them';
    notify(state, `${iv.persona.name} did not show up for the interview.${confirmed ? '' : ' You never sent a day-before confirmation.'}`, { type: 'bad', app: 'research' });
    if (!confirmed && iv.channel !== 'friends') logMistake(state, { functionId: 'customer_discovery', id: 'interview_no_confirm', label: 'Interviewee no-show, no day-before confirmation', app: 'research', cost: { hours: 0.75 }, key: `ivnoshow:${iv.id}`, charge: true, detail: `${iv.persona.name} flaked; the slot and the recruiting hours were wasted. A one-line confirmation the day before cuts no-shows by roughly two thirds [design].` });
    return iv;
  }
  iv.status = 'live'; iv.startedDay = state.day; iv.day = state.day;
  iv.hs = newHiddenState();
  const warm = ['friend', 'warm'].includes(iv.hidden.relationship);
  iv.messages = [{ from: 'them', text: warm ? `Hey! Happy to help however I can. Go ahead.` : `Hi, this is ${iv.persona.name}. I have about thirty minutes. What did you want to ask?`, revealed: [], commitment: 'none', sentiment: warm ? 'positive' : 'neutral', qtype: 'small_talk' }];
  return iv;
}

/** One founder question. ctx.llm.ask runs the persona on the LLM path; offline it is offlineAnswer from the same record. */
export async function sendSimTurn(ctx, iv, text) {
  const state = ctx.state;
  const q = String(text ?? '').trim();
  if (!q) throw new Error('Ask something.');
  if (iv.status !== 'live') throw new Error('The call is not live.');
  if (iv.messages.filter((m) => m.from === 'me').length >= MAX_SIM_TURNS) throw new Error('Time is up: end the call.');
  const person = chatPerson(state, iv);
  const hist = toHistory(iv.messages);
  const type = classifyQ(q, hist);
  const ask = detectAsk(q);
  const price = (() => { try { return monthlyPrice(state); } catch { return null; } })();
  const mine = { from: 'me', text: q, qtype: type, tags: [...(QTAG[type] ? [QTAG[type]] : []), ...(ask ? ['ask'] : [])] };
  const productKnown = hist.some((m, i) => m.from === 'me' && classifyQ(m.text, hist.slice(0, i)) === 'pitch') || type === 'pitch';
  const rand = dstream(state, `chat:${iv.id}:${iv.messages.length}`);
  const offline = () => offlineAnswer(person, q, hist, rand, { price });
  // The same request the persona eval measures: per-turn private note from the shared planner, then settleReply clamps it.
  const req = buildTurnRequest(person, q, hist, { productKnown, price, name: iv.persona.name });
  const res = await ctx.llm.ask({
    task: 'interview_chat_sim', system: req.system, prompt: req.prompt,
    schema: req.schema, temperature: req.temperature, maxTokens: req.maxTokens, fallback: offline,
  });
  const v = settleReply(person, res.data, hist, req.plan, { question: q });
  iv.messages.push(mine);
  iv.hs = advanceState(iv.hs, type, v);
  iv.messages.push({ from: 'them', text: v.reply, revealed: v.revealed, commitment: v.commitment, statedWtp: v.statedWtp, sentiment: v.sentiment, qtype: type, mock: !!res.mock, flags: v.flags });
  // Professional respondents slip when the interviewer verifies the basics (who decides, what they pay, the last time).
  if (iv.hidden.fraud && !iv.unmasked && iv.hs.questionTypes.filter((t) => EARNING_TYPES.includes(t)).length >= 3 && dstream(state, `unmask:${iv.id}:${iv.messages.length}`)() < 0.5) {
    iv.unmasked = true;
    iv.messages.push({ from: 'system', text: 'Their answers about their role and numbers stop adding up. This looks like a professional respondent, not someone who does this job.' });
  }
  return iv;
}

/** Best commitment the person made, in the legacy vocabulary (deposit counts as a pre-order). */
export function bestCommitment(iv) {
  const order = (c) => COMMITMENT_ORDER.indexOf(c);
  const best = iv.messages.filter((m) => m.from === 'them').map((m) => m.commitment ?? 'none').reduce((b, c) => (order(c) > order(b) ? c : b), 'none');
  return best === 'deposit' ? 'preorder' : best;
}

/**
 * End the call: grade the transcript (Mom Test rubric), pay the incentive for a completed call, write down what the person
 * actually said as structured insights, bank an introduction when one was earned, and check for a debrief.
 * opts.grader(ctx, iv, heuristic) may return a better grade (LLM panel); charge:true spends the call hours (tests).
 */
export async function finishSim(ctx, iv, { grader = null, charge = false } = {}) {
  const state = ctx.state;
  if (iv.status !== 'live') throw new Error('The call is not live.');
  if (charge) spendHours(state, INTERVIEW_HOURS.call + INTERVIEW_HOURS.notes, 'Customer interview (simulated)');
  const msgs = iv.messages.filter((m) => m.from !== 'system').map((m) => ({ ...m, commitment: m.commitment === 'deposit' ? 'preorder' : m.commitment }));
  const facts = {};
  for (const m of msgs) for (const k of m.revealed ?? []) facts[LEGACY_KEY[k] ?? k] = m.text;
  const h = gradeTranscript(msgs, { facts });
  const g = (grader ? await grader(ctx, iv, h) : null) ?? { ...h, source: 'offline heuristic' };
  const best = bestCommitment(iv);
  iv.grade = { score: Math.round(clamp(g.score ?? h.score, 0, 100)), talkRatio: h.talkRatio, commitments: best === 'none' ? [] : [best], leadingQuestions: g.leadingQuestions ?? h.leadingQuestions, hypotheticals: g.hypotheticals ?? h.hypotheticals, pitching: g.pitching ?? h.pitching, goodQuestions: g.goodQuestions ?? h.goodQuestions, pastSpecifics: h.pastSpecifics, feedback: g.feedback ?? h.feedback, source: g.source ?? 'offline heuristic', selfReported: false, simulated: true };
  iv.status = 'done'; iv.doneDay = state.day; iv.verified = true;
  const r = disc(state);
  if (!iv.unmasked) {
    const cost = completionCost(iv);
    if (cost > 0) payUsd(state, cost, `Interview incentive${iv.recruit?.panel ? ' + panel fee' : ''}: ${iv.persona.name}`);
  } else iv.recruit = { ...(iv.recruit ?? {}), voided: true };
  const ins = insightsFromSim(state, iv);
  for (const i of ins) { if (iv.unmasked) i.excluded = true; r.insights.unshift(i); }
  if (COMMIT_RANK[best] >= COMMIT_RANK.intro && !iv.unmasked) { r.introCredits++; r.recruit.referrals.push({ segmentId: iv.hidden.segmentId, fromInterview: iv.id }); }
  notify(state, `Interview with ${iv.persona.name} done${best !== 'none' ? `, commitment: ${COMMIT_LABEL[best]}` : ', no commitment'}${iv.unmasked ? '. Looked like a professional respondent: not counted.' : ''}.`, { type: 'info', app: 'research' });
  return iv;
}

/** Day-before confirmation: cuts the no-show chance by about two thirds [design]. */
export function confirmSim(state, id) {
  const iv = disc(state).interviews.find((x) => x.id === id);
  if (!iv?.sim || iv.status !== 'scheduled') throw new Error('Nothing to confirm.');
  if (state.day >= iv.day) throw new Error('Too late: confirm the day before.');
  iv.confirmedDay = state.day;
  return iv;
}
export function cancelSim(state, id) {
  const iv = disc(state).interviews.find((x) => x.id === id);
  if (!iv?.sim || iv.status !== 'scheduled') throw new Error('Nothing to cancel.');
  iv.status = 'canceled';
  return iv;
}
