// Customer discovery (Mom Test) helpers: hidden persona facts, question classification, a deterministic
// fallback interviewee, transcript grading and note extraction. Pure.
//
// Sources: docs/research/sales-and-research.md §4 (Mom Test principles, grading rubric, recruiting
// response rates, synthetic users = rehearsal only, NN/G 2024/2025).

import { clamp, words } from '../../core/util.js';

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
  pitch: /(we'?re building|we are building|i'?m building|i am building|our (product|app|tool|platform|solution)|my (product|app|tool|startup)|we built|i built|it will|it can|our ai|let me show|demo|feature that|we (help|let|allow)|sign up|launching)/i,
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
  if (Q.good.test(t) && !tags.includes('leading')) tags.push('good');
  if (/(intro|introduce|who else should i talk|pilot|letter of intent|\bloi\b|pre-?order|deposit|pay (now|upfront|today)|next step|follow[- ]?up|meet again|try it with)/i.test(t)) tags.push('ask');
  return tags;
}

// Hidden facts for a persona, deterministic from rand. Live LLM can enrich them at creation.
export function makeFacts(rand, { model = 'smb', icp = '', name = '' } = {}) {
  const painReal = rand() < PAIN_REAL_SHARE;
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
  const goodTurns = history.filter((m) => m.from === 'me' && (m.tags ?? []).includes('good')).length;
  let reply, revealed = [], commitment = 'none';
  const hit = Object.keys(FACT_PROMPT).find((k) => FACT_PROMPT[k].test(question) && !revealedSoFar.has(k)) ?? Object.keys(FACT_PROMPT).find((k) => FACT_PROMPT[k].test(question));
  if (tags.includes('ask')) {
    if (facts.painReal && goodTurns >= 2) {
      commitment = /pre-?order|deposit|pay/i.test(question) && facts.spendNum > 100 ? 'preorder' : /pilot|try/i.test(question) ? 'pilot' : /intro|who else/i.test(question) ? 'intro' : 'followup';
      reply = { preorder: 'If it does what we discussed, I can put down a deposit. Send me something.', pilot: 'I could try it with one real week of our work. If it saves the hours I\'ll keep going.', intro: 'Talk to my friend who runs a similar shop, she complains about this more than I do. I\'ll intro you.', followup: 'Sure, send me a time next week and show me something concrete.' }[commitment];
    } else reply = 'Keep me posted, I guess. Pretty busy right now.';
  } else if (tags.includes('pitch')) reply = facts.painReal ? 'Sounds nice. I\'d have to see it.' : 'Cool, sounds useful for someone. Good luck with it!';
  else if (tags.includes('leading')) reply = 'Yeah, I suppose so. Doesn\'t everyone?';
  else if (tags.includes('hypothetical')) reply = 'Probably, yeah. Depends on the price I guess. Hard to say.';
  else if (hit && (tags.includes('good') || !tags.includes('generic'))) {
    revealed = [hit];
    reply = facts[hit] + '.';
  } else if (tags.includes('generic')) reply = facts.painReal ? 'Depends on the week. Sometimes it\'s fine, sometimes it\'s a mess.' : 'Not really, it\'s fine most of the time.';
  else reply = 'Sorry, what do you mean exactly?';
  return { reply, revealed, commitment };
}

// Heuristic transcript grade per the research rubric. messages: [{from:'me'|'them', text, tags?, revealed?, commitment?}]
export function gradeTranscript(messages, persona) {
  const me = messages.filter((m) => m.from === 'me');
  const them = messages.filter((m) => m.from === 'them');
  const meWords = me.reduce((a, m) => a + words(m.text), 0);
  const allWords = meWords + them.reduce((a, m) => a + words(m.text), 0);
  const talkRatio = allWords ? meWords / allWords : 0;
  const c = { leading: [], hypothetical: [], pitch: [], generic: [], good: [] };
  for (const m of me) for (const t of m.tags ?? classifyQuestion(m.text)) if (c[t]) c[t].push(m.text);
  const revealed = [...new Set(them.flatMap((m) => m.revealed ?? []))];
  const order = COMMITMENTS;
  const commitment = them.map((m) => m.commitment ?? 'none').reduce((best, x) => (order.indexOf(x) > order.indexOf(best) ? x : best), 'none');
  let score = 45 + 6 * Math.min(6, c.good.length) - 9 * c.leading.length - 8 * c.hypothetical.length - 10 * c.pitch.length - 3 * c.generic.length
    + 6 * revealed.length + { none: 0, followup: 4, intro: 10, pilot: 14, loi: 16, preorder: 18 }[commitment] - (talkRatio > 0.3 ? Math.round((talkRatio - 0.3) * 80) : 0);
  if (me.length < 4) score -= 15;
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
  return {
    score, talkRatio,
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
  return { insights, quality, issues };
}
