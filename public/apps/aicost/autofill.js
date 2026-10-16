// Spec autofill: drafts a feature spec from the evidence the player has actually gathered (real research insights,
// interviews, support tickets, feature requests, churn reasons, experiment learnings). The draft is only as specific as
// that evidence: with little of it the text is generic and the genericity blocker in product/spec.js still stops it.
// It cites what it used, takes ~0.2 h (vs 1-2 h to write by hand), and an UNEDITED draft can never score above "good".
// Repeated autofill without evidence logs autofilled_generic_specs and inflates the build of the resulting feature.
//
// Offline deterministic fallback here; product.js may ask the LLM (task spec_autofill) first and pass its draft in.

import { round2 } from '../../core/util.js';
import { researchSlice, productSlice } from '../product/store.js';
import { specKey } from '../product/spec.js';
import { logMistake } from '../../core/operator.js';

export const AUTOFILL_HOURS = 0.2; // vs SPEC_HOURS.first 0.5-1 h of writing plus the thinking [design]
export const AUTOFILL_CAP = 14; // an unedited draft tops out at a "good" 14/20 [design]
export const WEAK_BELOW = 0.3;
export const WEAK_EFFORT = 1.25; // building the wrong or unclear thing costs time [design]

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const lcFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const FIG = /(\$\s?\d[\d,.]*\s?[km]?|\d+(?:\.\d+)?\s*(?:h|hrs?|hours?|mins?|minutes?|days?|weeks?|%))/i;
const FREQ = /\b(daily|weekly|monthly|quarterly|every (?:day|week|month|quarter|friday|monday)|at (?:the )?month[- ]end|at close)\b/i;

/** Everything the draft may cite, read-only. */
export function gatherEvidence(state) {
  const R = researchSlice(state);
  const real = R.insights.filter((i) => i.real && !i.excluded); // set-aside conversations and unmasked panel fraud count for nothing
  const synthetic = R.insights.filter((i) => !i.real).length;
  const interviews = R.interviews.filter((i) => i.real && i.status === 'done').length;
  const sup = state.apps.support;
  const tickets = sup?.tickets ?? [];
  const byCat = {};
  for (const t of tickets) if (t.category) byCat[t.category] = (byCat[t.category] ?? 0) + 1;
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0] ?? null;
  const requests = (sup?.flows?.requests ?? []).filter((r) => !r.dupOf).map((r) => ({ text: r.text, votes: r.votes ?? 0, accounts: r.accountIds?.length ?? 0 })).sort((a, b) => b.accounts - a.accounts || b.votes - a.votes);
  const reasons = Object.entries(state.churn?.reasons ?? {}).sort((a, b) => b[1] - a[1]);
  const churned = reasons.reduce((a, [, n]) => a + n, 0);
  const learnings = (state.apps.insights?.experiments ?? []).filter((e) => e.learning);
  const w = real.reduce((a, i) => a + (i.verified ? 1 : 0.5), 0);
  const rv = requests.reduce((a, r) => a + r.votes + r.accounts, 0);
  const strength = Math.max(0, Math.min(1,
    0.4 * Math.min(1, w / 6) + 0.25 * Math.min(1, interviews / 6) + 0.15 * Math.min(1, rv / 10)
    + 0.1 * Math.min(1, tickets.length / 25) + 0.1 * Math.min(1, churned / 10)));
  return { real, synthetic, interviews, tickets: tickets.length, topCat, requests, reasons, churned, learnings, strength: round2(strength) };
}

function themeFocus(real) {
  const by = {};
  for (const i of real) by[i.theme] = (by[i.theme] ?? 0) + (i.verified ? 1 : 0.5);
  const top = Object.entries(by).filter(([t]) => t !== 'Commitments').sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

/** Deterministic draft from the evidence. Returns { fields, cites, linked, strength, weak }. */
export function draftFromEvidence(state, ev = gatherEvidence(state)) {
  const company = state.company ?? {};
  const focus = themeFocus(ev.real);
  const pool = ev.real.filter((i) => !focus || i.theme === focus || i.type === 'workaround' || i.type === 'spend');
  const pick = (type) => pool.find((i) => i.type === type) ?? ev.real.find((i) => i.type === type);
  const pain = pick('pain') ?? pick('behavior') ?? ev.real.find((i) => i.type !== 'commitment');
  const work = pick('workaround');
  const spend = pick('spend');
  const cites = [], linked = [];
  const cite = (i) => { if (i && !linked.includes(i.id)) { linked.push(i.id); cites.push(`Real interview insight (${i.who ?? 'interviewee'}): "${clip(i.text, 140)}"`); } };
  cite(pain); cite(work); cite(spend);
  if (ev.requests[0]) cites.push(`Feature request "${clip(ev.requests[0].text, 80)}": ${ev.requests[0].accounts} account(s), ${ev.requests[0].votes} vote(s)`);
  if (ev.topCat && ev.tickets >= 5) cites.push(`${ev.topCat[1]} of ${ev.tickets} support tickets are about ${ev.topCat[0]}`);
  if (ev.churned >= 3 && ev.reasons[0]) cites.push(`${ev.reasons[0][1]} of ${ev.churned} cancellations cite "${ev.reasons[0][0]}"`);
  if (ev.learnings[0]) cites.push(`Experiment learning: ${clip(ev.learnings[0].learning, 100)}`);

  const icp = clip(company.icp, 140);
  const icpWords = icp.split(/\s+/).filter((w) => w.length > 3);
  const userSpecific = icpWords.length >= 4;
  const user = userSpecific ? icp : 'Small business owners';

  let title, problem, solution, acceptance, metric, baseline, nonGoals;
  if (pain) {
    const n = ev.real.filter((i) => i.theme === pain.theme).length;
    const m = Math.max(ev.interviews, 1);
    const fig = (spend ?? pain).text.match(FIG)?.[0];
    const freq = [pain, work, spend].map((i) => i?.text?.match(FREQ)?.[0]).find(Boolean);
    const where = work ? `Today they ${lcFirst(clip(work.text, 130)).replace(/^they /i, '')}.` : 'Today they handle it by hand.';
    const trig = freq ? `${freq[0].toUpperCase()}${freq.slice(1)}` : 'When it comes up';
    const claims = ev.interviews >= 3 ? `${Math.min(n, ev.interviews)} of ${ev.interviews} real interviewees` : 'An interviewee';
    problem = `${trig}, ${claims} hit this: "${clip(pain.text, 150)}". ${where}${fig ? ` It costs about ${fig}.` : ' [confirm: hours or dollars lost per month]'}`;
    const phrase = clip(pain.text, 60).replace(/["“”]/g, '').replace(/[.!?].*$/, '');
    title = `Automate: ${phrase.split(' ').slice(0, 7).join(' ')}`;
    solution = ev.interviews >= 2
      ? `When ${lcFirst(phrase.split(' ').slice(0, 10).join(' '))} happens, the product detects it from the connected data, sends the user a notification with the details and exports the result so they no longer ${work ? 'do it by hand' : 'chase it manually'}.`
      : 'The product detects the issue, sends the user a notification and exports a report.';
    acceptance = ev.interviews >= 2
      ? ['Given a connected account with 20 records, when the trigger fires, then the notification is sent within 5 minutes and the record is marked resolved.', 'If the connection has expired or no record matches, the user sees an error and the item stays in the open list.']
      : ['When the trigger fires, the user gets a notification.'];
    metric = ev.interviews >= 3 ? `Time spent on this task per account falls by 50% within 30 days of enabling` : 'Increase activation';
    baseline = ev.interviews >= 3 ? `${Math.min(n, ev.interviews)} of ${m} interviewees today (measure for 2 weeks first: 0 of ${Math.max(5, m)} accounts)` : '';
    nonGoals = ev.interviews >= 3 ? 'Mobile app; SSO; non-English UI' : '';
  } else {
    title = 'Seamless AI-powered experience';
    problem = 'Users need a better way to manage their workflow and want a more seamless experience.';
    solution = 'A seamless, intuitive AI-powered dashboard that will improve the UX and make things easier for users.';
    acceptance = ['Works well and is intuitive'];
    metric = 'Increase engagement by 50%';
    baseline = '';
    nonGoals = '';
  }
  const fields = { title, user, problem, solution, acceptance, acceptanceText: acceptance.join('\n'), metric, baseline, nonGoals };
  return { fields, cites, linked, strength: ev.strength, weak: ev.strength < WEAK_BELOW };
}

const FIELDS = ['title', 'user', 'problem', 'solution', 'metric', 'baseline', 'nonGoals'];
/**
 * Apply a draft to a feature (blank fields only unless force). Charges nothing itself: the caller spends AUTOFILL_HOURS.
 * `draft` may come from the LLM path; below the evidence floor it is replaced by the generic deterministic draft, because a
 * model asked to write a spec from nothing invents specifics the player never gathered.
 */
export function autofillSpec(state, f, { draft = null, force = false } = {}) {
  const ev = gatherEvidence(state);
  let d = draftFromEvidence(state, ev);
  let source = 'offline';
  if (draft && ev.strength >= 0.25) {
    const fields = { ...d.fields, ...draft };
    if (draft.acceptanceText) fields.acceptance = String(draft.acceptanceText).split('\n').map((x) => x.trim()).filter(Boolean);
    d = { ...d, fields };
    source = 'LLM';
  }
  const blank = (k) => !String(f[k] ?? '').trim();
  for (const k of FIELDS) if (force || blank(k)) f[k] = d.fields[k];
  if (force || !(f.acceptance?.length)) { f.acceptance = [...d.fields.acceptance]; f.acceptanceText = f.acceptance.join('\n'); }
  f.evidence = [...new Set([...(f.evidence ?? []), ...d.linked])];
  f.autofill = { day: state.day, strength: ev.strength, weak: d.weak, cites: d.cites, source, usedInterviews: ev.interviews, key: specKey(f) };
  const slice = productSlice(state);
  const log = (slice.autofillLog ??= []);
  log.push({ day: state.day, featureId: f.id, strength: ev.strength, weak: d.weak });
  const recentWeak = log.filter((x) => x.weak && state.day - x.day <= 60);
  if (d.weak && recentWeak.length >= 2) {
    logMistake(state, {
      functionId: 'product_prioritization', id: 'autofilled_generic_specs', app: 'product', label: 'Autofilled a spec with almost no evidence',
      cost: { hours: 3, days: 4 }, circles: true, delayed: true,
      detail: `Autofill had only ${ev.interviews} real interview(s) and little else to draw on, so the draft was generic. Specs built on it cost rework and build time on the wrong thing. Talk to customers first.`,
      key: `autofill:${f.id}:${recentWeak.length}`,
    });
  }
  return { ok: true, hours: AUTOFILL_HOURS, strength: ev.strength, weak: d.weak, cites: d.cites, source };
}

/** Is the draft still exactly what autofill wrote? (then grading is capped) */
export const isUneditedAutofill = (f) => Boolean(f.autofill && f.autofill.key === specKey(f));

/** Cap a grade for an unedited draft: the player must add their own specifics to reach a high-quality spec. */
export function capAutofillGrade(f, g) {
  if (!isUneditedAutofill(f) || g.total == null || g.total <= AUTOFILL_CAP) return g;
  g.total = AUTOFILL_CAP;
  g.issues = [...(g.issues ?? []), 'This is still the unedited autofill draft: add your own specifics (real numbers, the failure case, what is out of scope) before it can rate higher.'];
  g.autofillCapped = true;
  return g;
}

export function autofillPrompt(state, ev = gatherEvidence(state)) {
  const lines = ev.real.slice(0, 14).map((i) => `- [REAL ${i.type}] (${i.theme}) ${clip(i.text, 200)}`);
  return `Company: ${state.company?.name ?? ''}, ${clip(state.company?.oneLiner, 160)}. ICP: ${clip(state.company?.icp, 200)}\nReal interviews logged: ${ev.interviews}.\nEVIDENCE:\n${lines.join('\n') || '(none)'}\nSupport tickets: ${ev.tickets}. Feature requests: ${ev.requests.slice(0, 3).map((r) => `${clip(r.text, 60)} (${r.accounts} accounts)`).join('; ') || 'none'}. Cancellations: ${ev.churned}.\nDraft a one-page feature spec using ONLY this evidence. Where the evidence does not say, write "[confirm: ...]" instead of inventing figures.`;
}
export const AUTOFILL_SYSTEM = 'You draft SaaS feature specs for a solo founder from the evidence provided. Never invent interviews, numbers or customers. Be specific only where the evidence is. Plain English, no buzzwords.';
export const AUTOFILL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'user', 'problem', 'solution', 'acceptanceText', 'metric', 'baseline', 'nonGoals'],
  properties: { title: { type: 'string' }, user: { type: 'string' }, problem: { type: 'string' }, solution: { type: 'string' }, acceptanceText: { type: 'string', description: 'one Given/When/Then per line, include a failure case' }, metric: { type: 'string' }, baseline: { type: 'string' }, nonGoals: { type: 'string' } },
};
