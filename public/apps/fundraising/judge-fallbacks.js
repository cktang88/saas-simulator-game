// Deterministic offline scorers for the investor-side judges. They score the SAME criteria as the LLM rubric
// (judge-rubrics.js) from observable text features, so an offline run still separates a stellar operator
// from a mediocre one. Anti-gaming: counts are capped, repeated keywords count once, and numbers only count
// next to a metric noun, so keyword stuffing does not move the score much.
import { weighted } from '../../core/rubric.js';
import { clamp, words } from '../../core/util.js';
import { outreachCriteria, MEETING_CRITERIA, BOARD_CRITERIA, ACCEL_CRITERIA, SBIR_CRITERIA } from './judge-rubrics.js';

const lc = (t) => String(t ?? '').toLowerCase();
const HYPE = /(revolutioniz|disrupt|game-chang|synerg|world-class|best-in-class|cutting-edge|paradigm|uber for|next-gen)/;
const METRIC_NOUN = '(mrr|arr|revenue|customers?|users?|paying|churn|retention|burn|runway|growth|signups?|pilots?|lois?|margin|cac|ltv|payback)';
/** Distinct metric mentions: a number within a few words of a metric noun (either order). */
function metricMentions(text) {
  const t = lc(text);
  const found = new Set();
  const re1 = new RegExp(`(\\$\\s?[\\d,.]+\\s?[km]?|\\d[\\d,.]*\\s?%?)\\s?(?:[a-z/-]+\\s){0,2}?${METRIC_NOUN}`, 'g');
  const re2 = new RegExp(`${METRIC_NOUN}[^.\\n]{0,24}?(\\$\\s?[\\d,.]+\\s?[km]?|\\d[\\d,.]*\\s?%)`, 'g');
  for (const m of t.matchAll(re1)) found.add(m[2] ?? m[0]);
  for (const m of t.matchAll(re2)) found.add(m[1]);
  return found.size;
}
const hits = (t, re) => new Set((lc(t).match(re) ?? [])).size;
const clamp5 = (v) => Math.round(clamp(v, 1, 5));
// Anti-stuffing: real prose is 25%+ function words; a keyword list is not. Stuffed text caps every criterion at 2.
const STOP = new Set('the a an and or but to of in on for with at by from is are was were be been we our us i you your my it this that as so if not no have has had will would can could do does did them they their there here what when which who how'.split(' '));
export function looksStuffed(text) {
  const toks = lc(text).split(/[^a-z']+/).filter(Boolean);
  if (toks.length < 12) return false;
  return toks.filter((x) => STOP.has(x)).length / toks.length < 0.12;
}
export const capIfStuffed = (scores, text) => (looksStuffed(text) ? Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.min(v, 2)])) : scores);
const finish = (scores, criteria, text = '') => { const sc = capIfStuffed(scores, text); return { scores: sc, score: weighted(sc, criteria) }; };

// ---- Outreach ----
export function outreachScoresFallback(text, inv, { warm = false } = {}) {
  const t = String(text ?? '');
  const l = lc(t);
  const n = words(t);
  const head = t.split(/\s+/).slice(0, 38).join(' ');
  const headMetrics = metricMentions(head);
  const allMetrics = metricMentions(t);
  const hype = HYPE.test(l);
  const hook = clamp5(headMetrics >= 2 ? 5 : headMetrics === 1 ? 4 : allMetrics ? 2.5 : 1) - (hype ? 1 : 0);
  const firm = inv?.firm && l.includes(lc(inv.firm).split(' ')[0]);
  const thesisHit = inv?.thesis && lc(inv.thesis).split(/\W+/).filter((w) => w.length > 5).some((w) => l.includes(w));
  const specificRef = /(your (investment|portfolio|post|essay|talk|thesis)|saw your|i read your|you (backed|invested))/.test(l);
  const fit = clamp5(1 + (firm ? 1 : 0) + (thesisHit ? 1.5 : 0) + (specificRef ? 1.5 : 0));
  const ask = clamp5(/(pick your brain|synerg|explore opportunit)/.test(l) ? 1 : (/(\b(15|20|30)[- ]?(min|minute)|call|intro(duction)? to|meet)/.test(l) ? 2.2 : 1) + (/(raising|round|safe|\$\s?\d[\d.,]*\s?[km]\b)/.test(l) ? 1.8 : 0) + (/(this month|next week|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|closing|q[1-4])/.test(l) ? 0.8 : 0));
  const credibility = clamp5(3 + (allMetrics ? 1 : -1) - (hype ? 2 : 0) + (/(i (built|ran|led|was)|years|previously|founder of)/.test(l) ? 0.7 : 0));
  const cap = warm ? [60, 90, 130, 200] : [90, 120, 170, 250];
  const concision = n < 15 ? 1 : n <= cap[0] ? 5 : n <= cap[1] ? 4 : n <= cap[2] ? 3 : n <= cap[3] ? 2 : 1;
  const sentences = t.split(/[.!?]+/).filter((x) => x.trim()).length;
  const forwardable = clamp5((n <= 110 ? 3 : n <= 160 ? 2 : 1) + (sentences >= 2 && sentences <= 5 ? 1 : 0) + (/(see below|as discussed|thread|forward)/.test(l) ? -1.5 : 0.5) + (allMetrics ? 0.5 : 0));
  const base = { hook, ask, credibility, concision };
  return finish(warm ? { ...base, forwardable } : { ...base, fit }, outreachCriteria(warm), t);
}

// ---- Meeting (founder answers only) ----
export function meetingScoresFallback(transcript) {
  const mine = transcript.filter((m) => m.from === 'me').map((m) => String(m.text ?? ''));
  const all = mine.join(' \n');
  const l = lc(all);
  const avg = mine.length ? mine.reduce((a, x) => a + words(x), 0) / mine.length : 0;
  const mm = metricMentions(all);
  const metrics_command = clamp5(mm === 0 ? 1 : mm === 1 ? 2 : mm === 2 ? 3 : mm <= 4 ? 4 : 5);
  const weak = hits(l, /\b(churn|weakness|weakest|risk|worr|honest|honestly|don't know|do not know|haven't|have not|mistake|struggl|biggest problem|not yet|gap)\b/g);
  const candor = clamp5(1.5 + weak * 1.2) - (HYPE.test(l) ? 0.5 : 0);
  const moat = hits(l, /\b(data|workflow|integration|lock-in|distribution|proprietary|insight|why now|last (12|18|24) months|changed|switching cost|system of record|feedback loop)\b/g);
  const insight_moat = clamp5(1.3 + moat * 0.9) - (HYPE.test(l) ? 0.5 : 0);
  const directness = clamp5(avg < 6 ? 1 : avg < 15 ? 2.5 : avg <= 100 ? 4.5 : avg <= 160 ? 3 : 2);
  const ask = /(raising|round|safe|\$\s?\d[\d.,]*\s?[km]\b|cap)/.test(l);
  const miles = /(milestone|runway|series a|next round|18 months|24 months|reach \$|get us to|use of funds)/.test(l);
  const ask_milestones = ask && miles ? 5 : ask ? 3 : miles ? 2 : 1;
  const control = clamp5(1 + (mine.length >= 4 ? 1 : 0) + (avg >= 15 && avg <= 100 ? 1.5 : 0) + (/\?/.test(all) ? 1 : 0) + (/(next step|follow up|i'll send|i will send|send you)/.test(l) ? 1 : 0));
  return finish({ metrics_command, candor, insight_moat, directness, ask_milestones, control }, MEETING_CRITERIA, all);
}

// ---- Update: progress criterion (the other four come from heuristicUpdate) ----
export function updateProgressFallback(u) {
  const lines = String(u.highlights ?? '').split('\n').map((x) => x.trim()).filter((x) => x.length > 8);
  if (!lines.length) return 1;
  const withNum = lines.filter((x) => metricMentions(x) > 0 || /\$\s?\d|\d+%/.test(x)).length;
  const compared = lines.filter((x) => /(vs\.?|from|up|down|last month|prior|mom|→|->|\+\d|-\d)/i.test(x)).length;
  const askLink = /(last month|intro|you (helped|sent)|thanks)/i.test(`${u.highlights} ${u.summary}`) ? 0.7 : 0;
  return clamp5(1 + (withNum / lines.length) * 2 + (compared / lines.length) * 1.3 + askLink);
}

// ---- Board memo ----
export function boardScoresFallback(memo, m = {}) {
  const l = lc(memo);
  const n = words(memo);
  const nums = (l.match(/\$\s?\d|\d+%|\d+ (customers|users)/g) ?? []).length;
  const plan_vs_actual = clamp5(1 + (/(plan|budget|target|forecast)/.test(l) ? 1.3 : 0) + (/\bvs\.?\b|versus|against plan|actual/.test(l) ? 1 : 0) + Math.min(1.2, nums * 0.25) + (/(variance|because|due to|driven by|caused)/.test(l) ? 0.8 : 0));
  const decisionHits = hits(l, /\b(decision|approve|approval|vote|recommend|option a|option b|we need your|ask of the board)\b/g);
  const decisions = clamp5(1 + decisionHits * 1.2 + (/(by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|friday|next)|deadline)/.test(l) ? 0.7 : 0));
  const riskHits = hits(l, /\b(risk|concern|miss|behind|downside|worst case|churn|threat|mitigat)\b/g);
  const risks_candor = clamp5(1 + riskHits * 0.9 + (/(mitigat|if .* then|plan b|contingency)/.test(l) ? 0.8 : 0));
  const cash_runway = clamp5(1 + (/(cash|bank balance)/.test(l) ? 1 : 0) + (/runway|months of/.test(l) ? 1.2 : 0) + (/burn/.test(l) ? 0.8 : 0) + (/(scenario|downside|base case|if we)/.test(l) ? 1 : 0));
  const concision = n < 60 ? 1.5 : n <= 900 ? 4.5 : n <= 1500 ? 3 : 1.5;
  return finish({ plan_vs_actual, decisions, risks_candor, cash_runway, concision: clamp5(concision) }, BOARD_CRITERIA, memo);
}

// ---- Accelerator application ----
export function accelScoresFallback(answers) {
  const list = Array.isArray(answers) ? answers : String(answers ?? '').split('\n');
  const text = list.join('\n');
  const l = lc(text);
  const firstSentences = list.map((a) => String(a).split(/[.!?\n]/)[0]);
  const longOpeners = firstSentences.filter((s) => words(s) > 30).length;
  const plain_answer = clamp5(4 - (HYPE.test(l) ? 2 : 0) - longOpeners * 0.8 - (words(text) < 100 ? 1 : 0));
  const mm = metricMentions(text);
  const progress = clamp5(1 + Math.min(2.5, mm * 0.8) + (/(shipped|launched|live|paying|in production)/.test(l) ? 1 : 0) + (/(we plan|will build|going to|aim to|hope to)/.test(l) && !mm ? -0.5 : 0));
  const insight = clamp5(1 + (hits(l, /\b(talked to|spoke (to|with)|interviewed|customers? (told|said)|users? (told|said)|(they|clients|owners|managers) told me|told me|learned|realized|discovered|calls? with|surprised)\b/g) + (/(talked to|spoke (to|with)|interviewed|called)\s+(\d+|dozens|hundreds)/.test(l) ? 1 : 0)) * 1.1 + (/\d+ (customers|users|calls|interviews|conversations)/.test(l) ? 1 : 0));
  const velocity = clamp5(1.5 + (/(in (a |one |two |three |\d+ )?(days?|weeks?)|over a weekend|every (day|week)|weekly|shipped)/.test(l) ? 1.7 : 0) + (/(github|changelog|built|wrote the code|i coded)/.test(l) ? 1.2 : 0));
  const ambition_team = clamp5(1.5 + (/(billion|\$\d+\s?b\b|large market|industry|every )/.test(l) ? 1 : 0) + (/(co-?founder|team|solo|alone|by myself)/.test(l) ? 1 : 0) + (/(because i|years (at|in|as)|previously|worked at|domain)/.test(l) ? 1.3 : 0));
  return finish({ plain_answer, progress, insight, velocity, ambition_team }, ACCEL_CRITERIA, text);
}

// ---- SBIR proposal ----
export function sbirScoresFallback(text) {
  const l = lc(text);
  const risk = hits(l, /\b(hypothes\w*|uncertaint\w*|unknown|technical risk|novel|feasibility|experiment\w*|prototype|benchmark|algorithm|sensor|materials?|model training|accuracy of)\b/g);
  const routine = hits(l, /\b(web app|dashboard|crud|integrat\w*|saas|subscription|landing page|mobile app|ui|workflow tool)\b/g);
  const technical_risk = clamp5(1 + risk * 0.8 - routine * 0.5);
  const innovation = clamp5(1 + hits(l, /\b(prior art|state of the art|compared (to|with)|existing|novel|patent\w*|unlike|barrier)\b/g) * 0.9 + (/\d+(\.\d+)?\s?(x|%)/.test(l) ? 0.8 : 0));
  const approach = clamp5(1 + hits(l, /\b(aim \d|specific aims?|milestone\w*|phase ii|success criteri\w*|go\/no-go|metric\w*|months?|deliverable\w*|fallback)\b/g) * 0.8 + (/\d+\s?%|\d+(\.\d+)?\s?(x|ms|seconds|percent)/.test(l) ? 0.8 : 0));
  const team = clamp5(1 + hits(l, /\b(ph\.?d|years of|expertise|engineer\w*|laborator\w*|collaborat\w*|university|published|advisor)\b/g) * 0.9);
  const commercial = clamp5(1 + hits(l, /\b(customer\w*|pilot\w*|loi|discovery|market|revenue|phase iii|phase ii|adopt\w*|interviews?)\b/g) * 0.7);
  const out = finish({ technical_risk, innovation, approach, team, commercial }, SBIR_CRITERIA, text);
  return { ...out, deep_tech: out.scores.technical_risk >= 3.5 };
}

// ---- Traction claims vs the real metrics (game-side, deterministic) ----
// Investors, accelerators, boards and co-founder candidates all find out the real numbers (data room, Stripe
// export, diligence). A headline claim well above the systems of record is a credibility failure no matter how
// well the rest is written, so the game caps the judged quality instead of trusting the model to notice.
// Tolerance: 25% plus $1K MRR / 3 customers above the truth [design] (rounding up is not lying; inventing is).
const MONEY = '\\$\\s?(\\d+(?:[.,]\\d+)?)\\s?(k|m)?\\b';
export function inflatedClaims(text, m = {}) {
  const t = String(text ?? '');
  const out = [];
  const num = (v, u) => parseFloat(String(v).replace(/,/g, '')) * (/k/i.test(u ?? '') ? 1e3 : /m/i.test(u ?? '') ? 1e6 : 1);
  const realMrr = m.mrr ?? 0, realCust = m.customers ?? 0;
  // Goals and plans ("reach $1.2M ARR in 18 months") are not claims.
  const isGoal = (x) => /\b(reach|reaches|reaching|will reach|would|could|will|target|goal|plan|forecast|projected|aim|get(ting)? (us )?to|grow(ing)? to|path to|toward|towards|hit|by)\s*$/i.test(t.slice(Math.max(0, x.index - 24), x.index))
    || /^\s*(arr|mrr)?\s*(in|within|by)\s+(\d+|q[1-4]|the next|next|20\d\d|end of|month|year)/i.test(t.slice(x.index + x[0].length, x.index + x[0].length + 30));
  // Past jobs ("grew ARR to $5M at my previous company") are not claims about this company.
  const isPast = (x) => /\b(previous|prior|former|last (company|startup|job|role)|at my|ex-|before (this|that|founding))\b/i.test(t.slice(Math.max(0, x.index - 70), x.index + x[0].length + 40));
  const claims = (re, div = 1) => [...t.matchAll(re)].filter((x) => !isGoal(x) && !isPast(x)).map((x) => num(x[1], x[2]) / div);
  const mrrClaims = [
    ...claims(new RegExp(`${MONEY}\\s*(?:in\\s+)?(?:mrr|monthly recurring revenue)`, 'gi')),
    ...claims(new RegExp(`\\bmrr\\b[^.\\n$]{0,20}?${MONEY}`, 'gi')),
    ...claims(new RegExp(`${MONEY}\\s*(?:in\\s+)?arr\\b`, 'gi'), 12),
  ];
  const badMrr = mrrClaims.filter((c) => c > realMrr * 1.25 + 1000);
  if (badMrr.length) out.push(`claims $${Math.round(Math.max(...badMrr)).toLocaleString('en-US')} MRR; real MRR is $${Math.round(realMrr).toLocaleString('en-US')}`);
  const custClaims = [...t.matchAll(/(\d[\d,]*)\s+(?:paying\s+|enterprise\s+|active\s+)?(?:customers|clients|logos)\b/gi)].filter((x) => !isGoal(x) && !isPast(x)).map((x) => +x[1].replace(/,/g, '')).filter((n) => n < 1e6);
  const badCust = custClaims.filter((c) => c > realCust * 1.25 + 3);
  if (badCust.length) out.push(`claims ${Math.max(...badCust)} customers; real paying customers: ${realCust}`);
  return out;
}
