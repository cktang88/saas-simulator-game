// Hypotheses and kill criteria. A hypothesis names the customer, the problem, the current workaround, the money and the
// channel, and states pass/fail criteria BEFORE the interviews ("at least 5 of 10 screened ops managers describe it in
// the last month and at least 2 commit to a pilot"). Evidence is evaluated against those criteria, counting only the
// people who match the stated customer and are not friends. Loosening the bar after seeing results is a logged mistake.
//
// Sources: docs/research/early-stage/pmf-process.md (pre-registered criteria, kill criteria), misleading-feedback.md.

import { uid, words } from '../../core/util.js';
import { disc, median } from './store.js';
import { targetRead } from './recruit.js';
import { personRows, COMMIT_RANK } from './synthesis.js';
import { recordBet } from './consequences.js';

export const FN = 'customer_discovery';
export const COMMIT_LEVELS = { intro: 'an introduction', pilot: 'a pilot', loi: 'a letter of intent', preorder: 'a pre-order or deposit' };

export const defaultCriteria = () => ({ minDescribing: 5, outOf: 10, withinDays: 30, minCommits: 2, commitLevel: 'pilot', minSpend: 0, strangersOnly: true });

function cleanCriteria(c = {}) {
  const d = defaultCriteria();
  const num = (x, lo, hi, dflt) => { const n = Number(x); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt; };
  const out = {
    minDescribing: num(c.minDescribing, 1, 40, d.minDescribing), outOf: num(c.outOf, 1, 60, d.outOf), withinDays: num(c.withinDays, 3, 180, d.withinDays),
    minCommits: num(c.minCommits, 0, 40, d.minCommits), commitLevel: COMMIT_LEVELS[c.commitLevel] ? c.commitLevel : d.commitLevel, minSpend: num(c.minSpend, 0, 100000, d.minSpend),
    strangersOnly: c.strangersOnly !== false,
  };
  if (out.outOf < out.minDescribing) throw new Error('"Out of" cannot be smaller than the number who must describe the problem.');
  if (out.minCommits > out.outOf) throw new Error('You cannot require more commitments than interviews.');
  return out;
}

/** Sentence form of the criteria, written back to the player and used in the kill-criteria view. */
export const criteriaText = (c) => `At least ${c.minDescribing} of ${c.outOf} ${c.strangersOnly ? 'screened strangers ' : ''}describe the problem from the last ${c.withinDays} days${c.minCommits ? ` and at least ${c.minCommits} commit to ${COMMIT_LEVELS[c.commitLevel]} or more` : ''}${c.minSpend ? `, with a median current spend of at least $${c.minSpend}/mo` : ''}. Otherwise: kill or pivot.`;

export function addHypothesis(state, { customer, problem, workaround = '', wtp = '', channel = 'cold_email', criteria = {} }) {
  const c = String(customer ?? '').trim(); const p = String(problem ?? '').trim();
  if (words(c) < 3) throw new Error('Name the customer: a role, a kind of company and a size.');
  if (words(p) < 4) throw new Error('State the problem in a sentence a customer would recognise.');
  const r = disc(state);
  const h = {
    id: uid('hyp'), createdDay: state.day, customer: c.slice(0, 200), problem: p.slice(0, 300), workaround: String(workaround).slice(0, 200), wtp: String(wtp).slice(0, 80), channel,
    criteria: cleanCriteria(criteria), criteriaLog: [], status: 'open', decision: null, doneAtCreate: r.interviews.filter((i) => i.real && i.status === 'done').length,
  };
  r.hyps.unshift(h);
  return h;
}

/** Who counts toward a hypothesis: completed real conversations after it was written, with people who match its customer. */
export function qualifying(state, h) {
  const tr = targetRead(state, h.customer);
  const seg = new Set(tr.segments);
  return personRows(state).filter((p) => p.doneDay >= h.createdDay && (seg.size ? seg.has(p.segmentId) : p.segmentId != null && p.segmentId !== 'outsider') && !(h.criteria.strangersOnly && p.close));
}

export function evaluateHypothesis(state, h) {
  const c = h.criteria;
  const q = qualifying(state, h);
  const describing = q.filter((p) => p.behaviour && !p.negative && (p.incidentDays == null || p.incidentDays <= c.withinDays));
  const commits = q.filter((p) => p.commit >= (COMMIT_RANK[c.commitLevel] ?? 3));
  const spend = median(q.map((p) => p.cost).filter((x) => x != null && x > 0));
  const spendOk = !c.minSpend || (spend != null && spend >= c.minSpend);
  const pass = describing.length >= c.minDescribing && commits.length >= c.minCommits && spendOk && q.length >= Math.min(c.outOf, Math.max(c.minDescribing, 1));
  const remaining = Math.max(0, c.outOf - q.length);
  const impossible = describing.length + remaining < c.minDescribing || commits.length + remaining < c.minCommits;
  const status = pass ? 'pass' : q.length >= c.outOf || impossible ? 'fail' : 'collecting';
  return {
    status, qualifying: q.length, describing: describing.length, commits: commits.length, spend, spendOk, remaining,
    summary: `${describing.length} of ${q.length} qualifying people described it in the last ${c.withinDays} days; ${commits.length} committed to ${COMMIT_LEVELS[c.commitLevel]} or more${c.minSpend ? `; median spend ${spend != null ? `$${Math.round(spend)}` : 'unknown'}` : ''}`,
  };
}

const loosened = (a, b) => b.minDescribing < a.minDescribing || b.minCommits < a.minCommits || b.withinDays > a.withinDays || b.minSpend < a.minSpend || (COMMIT_RANK[b.commitLevel] ?? 3) < (COMMIT_RANK[a.commitLevel] ?? 3) || (a.strangersOnly && !b.strangersOnly) || b.outOf < a.outOf;

/**
 * Change the criteria. Loosening them after conversations exist is moving the goalposts: recorded on the hypothesis
 * (and in the discipline read), and if you then call it validated and build for a segment without the problem, the
 * build hours are logged as moved_goalposts when that happens (consequences.js). `charge` is kept for old callers.
 */
export function editCriteria(state, id, patch, { charge = false } = {}) {
  const h = disc(state).hyps.find((x) => x.id === id);
  if (!h) throw new Error('Hypothesis not found.');
  const next = cleanCriteria({ ...h.criteria, ...patch });
  const seen = qualifying(state, h).length;
  const before = h.criteria;
  const worse = seen > 0 && loosened(before, next);
  h.criteriaLog.push({ day: state.day, from: before, to: next, afterResults: seen > 0, loosened: worse });
  h.criteria = next;
  void charge;
  return { hypothesis: h, movedGoalposts: worse };
}

/**
 * Record your verdict. A verdict contrary to the evidence has a cost that arrives later: calling it validated when the
 * criteria failed (usually on friends' enthusiasm) is queued as validated_with_friends; keeping going after a failed test
 * without a new hypothesis is remembered for the Scorecard read.
 */
export function decideHypothesis(state, id, verdict) {
  const h = disc(state).hyps.find((x) => x.id === id);
  if (!h) throw new Error('Hypothesis not found.');
  if (!['validated', 'killed', 'continue'].includes(verdict)) throw new Error('Choose validated, killed or continue.');
  const ev = evaluateHypothesis(state, h);
  h.decision = { verdict, day: state.day, status: ev.status, summary: ev.summary };
  h.status = verdict === 'killed' ? 'killed' : verdict === 'validated' ? (ev.status === 'pass' ? 'passed' : 'called-early') : ev.status === 'fail' ? 'ignored-fail' : 'open';
  // A verdict is a bet on the market. Called validated without meeting the original bar (skipped, or met only after
  // loosening it): if the segment really lacks the problem and you build for it, the build hours are the mistake.
  const loosened = h.criteriaLog.some((l) => l.loosened);
  if (verdict === 'validated' && (ev.status !== 'pass' || loosened)) {
    const rows = personRows(state).filter((p) => p.doneDay >= h.createdDay);
    const close = rows.filter((p) => p.close).length;
    recordBet(state, { kind: 'validated', hypothesisId: h.id, customer: h.customer, loosened, summary: `${ev.summary}${close ? `; ${close} of ${rows.length} conversations were with friends or warm contacts` : ''}`, key: `validated:${h.id}` });
  }
  return h;
}

/** Summary used by the planner/kill-criteria view: the most recent open hypothesis and whether its test has failed. */
export function killSignal(state) {
  const hs = disc(state).hyps;
  const open = hs.find((h) => h.status === 'open' || h.status === 'ignored-fail');
  if (!open) return null;
  const ev = evaluateHypothesis(state, open);
  return { hypothesisId: open.id, customer: open.customer, status: ev.status, summary: ev.summary, text: criteriaText(open.criteria) };
}

/** Discipline read for the operator tier: criteria written first, no bent goalposts, verdicts that follow the evidence. */
export function hypothesisDiscipline(state) {
  const hs = disc(state).hyps;
  if (!hs.length) return null;
  let score = 0; let n = 0;
  for (const h of hs) {
    const ev = evaluateHypothesis(state, h);
    let s = h.doneAtCreate >= 3 ? 0.25 : 0.55; // written before the interviews it judges, not after a pile of them
    if (h.criteriaLog.some((l) => l.loosened)) s -= 0.4;
    if (h.decision) {
      const v = h.decision.verdict;
      if ((ev.status === 'pass' && v === 'validated') || (ev.status === 'fail' && v === 'killed')) s += 0.45;
      else if (ev.status === 'fail' && v === 'continue') s -= 0.2;
      else if (v === 'validated' && ev.status !== 'pass') s -= 0.35;
    } else if (ev.status === 'fail') s -= 0.1;
    else if (ev.status === 'pass') s += 0.1;
    score += Math.max(0, Math.min(1, s)); n++;
  }
  return { score: score / n, n };
}
