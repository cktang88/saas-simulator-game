// Product triggers and actions for the Automations app (docs/review/tool-gap-analysis.md §4 contract):
// every event has a stable id, a day and the ids needed to fetch records; every action returns
// { ok, error?, hoursCost, usdCost }, supports a dry run, and costs founder hours only when a human would
// have done the work. Read-only on state except the actions.

import { productSlice, newFeature } from './store.js';
import { queueFeature } from '../product.js';
import { triageQueue } from './tracker.js';
import { specKey } from './spec.js';

export const PRODUCT_TRIGGERS = ['spec_graded', 'feature_shipped', 'bug_found', 'release_failed', 'metric_check_ready'];

// Events since a day (inclusive). Derived from the slice so nothing is missed between ticks.
export function productEvents(state, { since = state.day - 1 } = {}) {
  const sl = productSlice(state);
  const out = [];
  for (const f of sl.features) {
    if (f.grade && f.grade.day >= since) out.push({ id: `spec_graded:${f.id}:${f.gradeKey?.length ?? 0}:${f.grade.day}`, type: 'spec_graded', day: f.grade.day, featureId: f.id, pass: Boolean(f.grade.pass), total: f.grade.total ?? null, title: f.title });
    if (f.status === 'shipped' && f.shippedDay >= since) out.push({ id: `feature_shipped:${f.id}`, type: 'feature_shipped', day: f.shippedDay, featureId: f.id, title: f.title, note: String(f.solution ?? '').slice(0, 200) });
    if (f.check && f.check.day >= since) out.push({ id: `metric_check_ready:${f.id}`, type: 'metric_check_ready', day: f.check.day, featureId: f.id, verdict: f.check.verdict, text: f.check.text });
  }
  for (const b of sl.bugs) if ((b.foundDay ?? -1) >= since) out.push({ id: `bug_found:${b.id}`, type: 'bug_found', day: b.foundDay, bugId: b.id, key: b.key ?? null, severity: b.severity, title: b.title, triage: Boolean(b.triage) });
  for (const e of sl.releases?.errors ?? []) if (e.visible && e.firstSeen >= since) out.push({ id: `release_failed:${e.id}`, type: 'release_failed', day: e.firstSeen, errorId: e.id, featureId: e.featureId, severity: e.severity, users: e.users, title: e.title });
  return out.sort((a, b) => a.day - b.day);
}

// Actions. Spec drafting is human work (it needs the founder's judgment), so the action only opens a draft.
export const PRODUCT_ACTIONS = {
  create_spec_draft(state, { title = '', user = '', problem = '' } = {}, { dryRun = false } = {}) {
    if (!String(title).trim()) return { ok: false, error: 'title required', hoursCost: 0, usdCost: 0 };
    if (dryRun) return { ok: true, hoursCost: 0, usdCost: 0, preview: { title } };
    const f = { ...newFeature(state), title: String(title).slice(0, 90), user: String(user).slice(0, 200), problem: String(problem).slice(0, 2000), source: 'automation' };
    productSlice(state).features.push(f);
    return { ok: true, featureId: f.id, hoursCost: 0, usdCost: 0 };
  },
  queue_feature(state, { featureId } = {}, { dryRun = false } = {}) {
    const f = productSlice(state).features.find((x) => x.id === featureId);
    if (!f) return { ok: false, error: 'no such feature', hoursCost: 0, usdCost: 0 };
    if (!(f.status === 'draft' && f.grade?.pass && f.gradeKey === specKey(f))) return { ok: false, error: 'only specs that passed review (and were not edited since) can be queued', hoursCost: 0, usdCost: 0 };
    if (!dryRun) queueFeature(state, f);
    return { ok: true, hoursCost: 0, usdCost: 0 };
  },
  add_changelog_entry(state, { featureId, note = '' } = {}, { dryRun = false } = {}) {
    const sl = productSlice(state);
    const f = sl.features.find((x) => x.id === featureId && x.status === 'shipped');
    if (!f) return { ok: false, error: 'feature not shipped', hoursCost: 0, usdCost: 0 };
    const exists = sl.changelog.find((c) => c.featureId === featureId);
    if (!dryRun) { if (exists) exists.note = String(note || exists.note).slice(0, 200); else sl.changelog.unshift({ day: state.day, featureId, title: f.title, note: String(note).slice(0, 200) }); }
    return { ok: true, hoursCost: 0, usdCost: 0, updated: Boolean(exists) };
  },
};

export const triageCount = (state) => triageQueue(productSlice(state)).length;
