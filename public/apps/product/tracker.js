// Linear-style tracker on top of the product slice: issue keys (ENG-123), a Triage inbox for bug reports from
// real usage (accept / decline / mark duplicate), and two-week cycles with carry-over.
//
// Source: docs/research/tools/deep/d06-posthog-linear.md Part 2 (W2 triage, W3 cycles, §6 failure modes:
// duplicate proliferation, silent cycle rollover). Duplicate share and triage minutes are [design].

import { round2 } from '../../core/util.js';

export const CYCLE_DAYS = 14;
export const TRIAGE_MIN_PER_ISSUE = 2;
export const DUP_SHARE = 0.25; // share of user bug reports that duplicate an existing one [design]

export function issueKey(slice, item) {
  if (!item.key) { slice.issueSeq = (slice.issueSeq ?? 0) + 1; item.key = `ENG-${slice.issueSeq}`; }
  return item.key;
}

export const triageQueue = (slice) => (slice.bugs ?? []).filter((b) => b.triage && !b.fixedDay);

// A duplicate report of an existing bug (same problem, slightly different words).
export function duplicateOf(b, day, n = 0) {
  return { ...b, id: `${b.id}_dup${n}`, key: undefined, title: `Customer report: ${b.title.replace(/^Customer report: /, '')}`, dupOf: b.id, progress: 0, foundDay: day, fixedDay: null, triage: true };
}

// Triage actions. Return { ok, note, mistake? }.
export function triageAccept(slice, bugId, priority = 'medium') {
  const b = slice.bugs.find((x) => x.id === bugId);
  if (!b) return { ok: false };
  b.triage = false; b.priority = priority;
  if (b.dupOf && slice.bugs.some((x) => x.id === b.dupOf)) return { ok: true, note: 'Accepted, but it looks like a duplicate: someone may fix the same bug twice.', wasted: b.hours };
  return { ok: true };
}
export function triageDecline(slice, bugId, day) {
  const b = slice.bugs.find((x) => x.id === bugId);
  if (!b) return { ok: false };
  b.triage = false; b.fixedDay = day; b.wontFix = true;
  const real = !b.dupOf && b.severity !== 'low';
  // Declining a real bug does not remove it from the product: customers keep hitting it and report it again (the
  // same mechanism as a wrong "duplicate" call). Without this, closing every report as won't-fix erased the bug's
  // churn and tech-debt cost for free.
  if (real) slice.latentBugs = [...(slice.latentBugs ?? []), { ...b, id: `${b.id}_re${day}`, key: undefined, fixedDay: null, wontFix: false, triage: true, appearDay: day + 14, foundDay: null }];
  return { ok: true, real };
}
// Mark as duplicate of another open or fixed bug. If it wasn't really a duplicate, the bug comes back later.
export function triageDuplicate(slice, bugId, day) {
  const b = slice.bugs.find((x) => x.id === bugId);
  if (!b) return { ok: false };
  b.triage = false; b.fixedDay = day; b.duplicate = true;
  if (!b.dupOf) { // wrong call: the real bug is still there and resurfaces
    slice.latentBugs = [...(slice.latentBugs ?? []), { ...b, id: `${b.id}_re`, key: undefined, fixedDay: null, duplicate: false, appearDay: day + 14, foundDay: null }];
    return { ok: true, wrong: true };
  }
  return { ok: true };
}

export function cycleOf(day) { return Math.floor(Math.max(0, day) / CYCLE_DAYS); }

// Current cycle: completed scope, open scope and carry-over (work started before this cycle, still open).
export function cycleSummary(slice, day) {
  const n = cycleOf(day), start = n * CYCLE_DAYS;
  const shipped = slice.features.filter((f) => f.status === 'shipped' && f.shippedDay >= start);
  const fixed = (slice.bugs ?? []).filter((b) => b.fixedDay != null && b.fixedDay >= start && !b.wontFix && !b.duplicate);
  const open = slice.features.filter((f) => f.status === 'queued' || f.status === 'building');
  const carry = open.filter((f) => (f.startedDay ?? Infinity) < start);
  const done = shipped.reduce((a, f) => a + (f.effortHours ?? 0), 0) + fixed.reduce((a, b) => a + (b.hours ?? 0), 0);
  const left = open.reduce((a, f) => a + Math.max(0, (f.effortHours ?? 0) - (f.progressHours ?? 0)), 0);
  return { n: n + 1, start, end: start + CYCLE_DAYS - 1, shipped, fixed, open, carry, progress: done + left ? round2(done / (done + left)) : 0 };
}
