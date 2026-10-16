// Forwardable intro blurb judge (offline heuristic + the LLM judge spec). A good forwardable blurb is what the
// connector pastes to the target to ask "want to meet?" (double opt-in). docs/research/cold-email-alternatives-2026.md
// section 4: ask specifically (one named target), a forwardable 3-sentence blurb, easy to decline.
//
// Criteria (0..1 each): specific (a concrete outcome or number, no buzzword soup), short (35-130 words), whyThem
// (names the target AND gives a reason it is relevant to them), easyYes (a small ask that is easy to decline),
// noWall (no attachment / deck / booking-link wall). Weights are [design].
//
// Anti-gaming: the heuristic is weak evidence, so callers shrink offline scores harder (core/operator.js shrink); a
// blurb stuffed with decline phrases or marker words is capped; "why them" needs the target's name or company plus a
// reason clause, so it cannot be satisfied by boilerplate when the target is unknown.
//
// Pure module: no state, no randomness.

const BUZZ = /\b(revolutionary|synerg\w*|game[- ]?chang\w*|disrupt\w*|cutting[- ]edge|world[- ]class|innovative|leverag\w*|best[- ]in[- ]class|next[- ]gen\w*|ai[- ]powered|seamless\w*|robust|paradigm|10x|unlock\w*|supercharg\w*)\b/gi;
const OUTCOME = /\b(cut|cuts|saved?|saves|reduc\w*|halv\w*|doubl\w*|from \S+ to \S+|went from|in \d+ (days?|weeks?)|per (month|week)|hours?|minutes?|%|percent|\$\d)/i;
const REASON = /\b(because|since|given|saw|noticed|heard|read|they're|they are|their|after|as they|who (runs|leads|owns|manages|is)|just (raised|hired|launched|moved|switched)|hiring|struggl\w*|dealing with)\b/i;
const EASY = /\b(no worries|no pressure|totally fine|if not,? no|only if|if it's not a fit|if not a fit|feel free to (say no|pass)|easy (to )?(say )?no|happy to (send|share)|if (it|this) (helps|is useful))\b/gi;
const SMALL_ASK = /\b(1[05]|20|quick|short) ?(-| )?(min\w*|call|chat)|\bopen to (a )?(chat|call|intro)\b|\bworth (a|an) (intro|chat)\b/i;
const WALL = /\b(attached|attachment|see (the )?deck|our deck|pdf|calendly|book a (demo|call|time)|sign up|click here|link below|schedule (a )?demo)\b/gi;
const URL = /https?:\/\/\S+/gi;

export const BLURB_WEIGHTS = { specific: 0.25, short: 0.2, whyThem: 0.25, easyYes: 0.15, noWall: 0.15 }; // [design]

const wordsOf = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean);
const count = (re, t) => (String(t).match(re) ?? []).length;

/**
 * Judge a forwardable blurb. ctx: { targetName, targetCompany } (both optional; without a target "why them" cannot score).
 * Returns { score 0..1, band 'none'|'sloppy'|'crisp', criteria, notes[], words }.
 */
export function judgeBlurb(text, { targetName = '', targetCompany = '' } = {}) {
  const t = String(text ?? '').trim();
  const w = wordsOf(t);
  const n = w.length;
  const notes = [];
  if (n < 15) {
    return { score: 0, band: 'none', criteria: { specific: 0, short: 0, whyThem: 0, easyYes: 0, noWall: 1 }, notes: ['No forwardable blurb: the connector has to write the pitch for you, so most do not.'], words: n };
  }
  const lower = t.toLowerCase();
  const buzz = count(BUZZ, t);
  let specific = (/\d/.test(t) ? 0.5 : 0) + (OUTCOME.test(t) ? 0.5 : 0);
  specific = Math.max(0, Math.min(1, specific - 0.25 * buzz));
  if (buzz >= 2) notes.push('Buzzwords instead of a concrete result.');
  else if (specific < 0.5) notes.push('Say what changed for a customer like them, with a number.');
  const short = n <= 130 && n >= 35 ? 1 : n < 35 ? 0.6 : n <= 200 ? 0.5 : 0.1;
  if (n > 130) notes.push(`${n} words: a forwardable blurb is 3-5 sentences.`);
  const first = String(targetName ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const co = String(targetCompany ?? '').trim().toLowerCase();
  const coWord = co.split(/\s+/).filter((x) => x.length >= 3 && !/^(the|inc|llc|ltd|and|a)$/.test(x)).sort((x, y) => y.length - x.length)[0] ?? '';
  const named = Boolean((first && first.length > 1 && new RegExp(`\\b${first.replace(/[^a-z0-9]/g, '')}\\b`).test(lower)) || (coWord && lower.includes(coWord)));
  const whyThem = named ? (REASON.test(t) ? 1 : 0.5) : 0;
  if (!named) notes.push(targetName || targetCompany ? 'Never says why this specific person should take the call.' : 'No named target: the connector has to guess who you mean.');
  else if (whyThem < 1) notes.push('Names them but gives no reason it matters to them now.');
  const easyN = count(EASY, t);
  const easyYes = Math.min(1, (easyN ? 0.6 : 0) + (SMALL_ASK.test(t) ? 0.4 : 0));
  if (easyYes < 0.6) notes.push('Make it easy to say yes or no (a 15-minute call, no pressure if not a fit).');
  const wallN = count(WALL, t) + Math.max(0, count(URL, t) - 1);
  const noWall = wallN === 0 ? 1 : wallN === 1 ? 0.5 : 0;
  if (wallN) notes.push('Decks, attachments and booking links make the connector do work before the target has said yes.');
  const criteria = { specific: +specific.toFixed(2), short, whyThem, easyYes: +easyYes.toFixed(2), noWall };
  let score = Object.entries(BLURB_WEIGHTS).reduce((a, [k, wt]) => a + wt * criteria[k], 0);
  // Stuffing guard: several decline phrases or a wall of marker words reads as a template, not a note.
  const sentences = t.split(/[.!?]+\s/).filter((x) => x.trim().length > 3);
  const repeated = sentences.length - new Set(sentences.map((x) => x.trim().toLowerCase())).size;
  if (easyN > 2 || repeated > 0 || sentences.length < 2) { score = Math.min(score, 0.5); notes.push('Reads like a template.'); }
  score = +Math.max(0, Math.min(1, score)).toFixed(2);
  return { score, band: score >= 0.7 ? 'crisp' : 'sloppy', criteria, notes, words: n };
}

/** Prompt pieces for an LLM judge of the same criteria (callers pass judgeBlurb as the offline fallback). */
export const BLURB_JUDGE = {
  system: 'You are a busy, well-connected operator who gets asked for intros every week. Judge this forwardable intro blurb exactly as you would before deciding whether to forward it. Be strict: most blurbs are vague, too long or about the sender instead of the recipient.',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['specific', 'short', 'whyThem', 'easyYes', 'noWall', 'note'],
    properties: {
      specific: { type: 'number', description: '0-1: concrete problem and result (numbers, a named outcome), no buzzwords' },
      short: { type: 'number', description: '0-1: 3-5 sentences, forwardable as-is' },
      whyThem: { type: 'number', description: '0-1: says why THIS named target should care now' },
      easyYes: { type: 'number', description: '0-1: small ask, easy to decline gracefully' },
      noWall: { type: 'number', description: '0-1: no deck, attachments or booking links before they said yes' },
      note: { type: 'string', description: 'one sentence: what would make you forward it' },
    },
  },
  prompt: (blurb, { targetName = '', targetCompany = '' } = {}) => `Target the founder wants to meet: ${targetName || '(none named)'}${targetCompany ? ` at ${targetCompany}` : ''}.\n\nBlurb:\n"""${String(blurb ?? '').slice(0, 2000)}"""`,
};

/** Fold an LLM judgement into the same shape as judgeBlurb. */
export function fromJudge(data, words = 0) {
  const criteria = Object.fromEntries(Object.keys(BLURB_WEIGHTS).map((k) => [k, Math.max(0, Math.min(1, Number(data?.[k]) || 0))]));
  const score = +Object.entries(BLURB_WEIGHTS).reduce((a, [k, wt]) => a + wt * criteria[k], 0).toFixed(2);
  return { score, band: words < 15 ? 'none' : score >= 0.7 ? 'crisp' : 'sloppy', criteria, notes: data?.note ? [String(data.note)] : [], words };
}
