// Releases (Vercel / Sentry style): every shipped feature is a deployment; some deploys are bad (change-failure
// rate from the AI-coding workflow, product/agent.js). Monitoring, alerts and a canary decide how fast you
// learn about a bad release; rollback or a fix-forward decides how long it hurts. Error issues are grouped
// deterministically with event counts, users affected, first/last seen and release.
//
// Sources: docs/review/tool-gap-analysis.md item 14; D07 §1 step 5; DORA 2025 (AI ↔ more change failures and
// slower recovery). Which tool watches production (Sentry, PostHog, Better Stack, Datadog, LogRocket, AppSignal) and
// whether source maps are uploaded set the fix time: see observability.js and docs/research/tools/2026q4/dev-data.md §1.
// Sentry Team ~$26/mo and Seer $40 per ACTIVE CONTRIBUTOR/mo are third-party figures; detection lags, MTTRs and churn
// bumps are [design].

import { uid, round2 } from '../../core/util.js';
import { fixMultFor, seerUsable } from './observability.js';

export const RELEASE_SETUP = {
  monitoring: { label: 'Error monitoring (pick a tool under Observability)', hours: 1, note: 'Errors show up grouped by release with events and users affected. The tool you pick sets price, depth and fix time.' },
  sourcemaps: { label: 'Upload source maps and tag releases in CI', hours: 1, needs: 'monitoring', note: 'Without them stack traces are minified and issues are unreadable: fixes take ~1.8x longer and Seer cannot help [design].' },
  alerts: { label: 'Alert on error-rate spike (to your phone)', hours: 0.25, needs: 'monitoring', note: 'You hear about a bad deploy in minutes, not from a customer.' },
  canary: { label: 'Staging + 10% canary rollout', hours: 2, note: 'Bad releases reach 10% of users first; with alerts they roll back automatically. ~15 min extra per deploy.' },
  seer: { label: 'Sentry Seer (AI root cause + fix PR)', hours: 0.25, perContributor: 40, needs: 'monitoring', note: '$40 per active contributor per month (anyone opening 2+ PRs) [third-party]. Sentry only, needs source maps. Useful on about 60–70% of issues [design]: fixes take ~40% less time when it is right.' },
};
export const DEPLOY_OVERHEAD_H = 0.25; // per deploy with canary/staging [design]
export const TRIAGE_HOURS = 0.5; // weekly error triage
// Minutes from a bad deploy to someone noticing [design].
export const DETECT_MIN = { alerts: 10, monitoring: 240, none: 1440 };
const ERROR_TITLES = ['TypeError: Cannot read properties of undefined (reading \'%s\')', 'Unhandled promise rejection in %s', '500 on POST /api/%s', 'Timeout calling %s', 'Database constraint violation in %s', 'Hydration mismatch on the %s page'];

export function releasesSlice(slice) {
  const r = (slice.releases ??= {});
  r.flags ??= {}; r.obs ??= r.flags.monitoring ? 'sentry' : null; if (r.flags.monitoring) r.flags.sourcemaps ??= true; r.deployments ??= []; r.errors ??= []; r.incidentMinutes ??= 0; r.pendingHours ??= 0; r.lastTriageDay ??= null; r.rollbacks ??= 0;
  return r;
}

const slug = (t) => String(t || 'feature').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'feature';

// Create a deployment for a shipped feature. cfr: change-failure probability. rand: () => [0,1).
export function deploy(rel, f, { day, cfr, rand, accounts = 0, migration = false }) {
  const d = { id: uid('dpl'), featureId: f.id, title: f.title, day, status: 'ready', bad: false, canary: Boolean(rel.flags.canary), migration };
  rel.deployments.unshift(d);
  if (rel.deployments.length > 200) rel.deployments.length = 200;
  if (rel.flags.canary) rel.pendingHours = round2(rel.pendingHours + DEPLOY_OVERHEAD_H);
  if (rand() >= cfr) return { deployment: d, error: null };
  d.bad = true;
  const crash = rand() < 0.3;
  const impact = (rel.flags.canary ? 0.1 : 1) * (crash ? 1 : 0.25);
  const detectMin = rel.flags.alerts && rel.flags.monitoring ? DETECT_MIN.alerts : rel.flags.monitoring ? DETECT_MIN.monitoring : DETECT_MIN.none * (1 + Math.floor(rand() * 2));
  const e = {
    id: uid('err'), deploymentId: d.id, featureId: f.id, release: d.id.slice(-6),
    title: ERROR_TITLES[Math.floor(rand() * ERROR_TITLES.length)].replace('%s', slug(f.title)),
    severity: crash ? 'crash' : 'error', impact, firstSeen: day, lastSeen: day,
    events: Math.max(1, Math.round((accounts + 3) * impact * (crash ? 40 : 8))), users: Math.max(1, Math.round((accounts + 1) * impact * (crash ? 0.8 : 0.3))),
    detectMin, visible: Boolean(rel.flags.monitoring), status: 'unresolved', minutes: 0, fixHours: crash ? 3 : 1.5,
  };
  e.fixHours = round2(e.fixHours * fixMultFor(rel, e)); // tool depth and missing source maps
  // Canary + alerts: the rollout halts and rolls back on its own.
  if (rel.flags.canary && rel.flags.alerts && rel.flags.monitoring) {
    e.status = 'resolved'; e.resolvedDay = day; e.how = 'auto-rollback'; e.minutes = detectMin + 10; d.status = 'rolled_back';
    rel.incidentMinutes += e.minutes * impact;
  }
  rel.errors.unshift(e);
  if (rel.errors.length > 200) rel.errors.length = 200;
  return { deployment: d, error: e };
}

// Daily tick: unresolved errors accrue incident minutes and events; without monitoring the founder only learns
// from tickets after the lag. Returns the churn multiplier to apply and newly surfaced errors.
export function releasesDay(rel, { day, accounts = 0 }) {
  const surfaced = [];
  let pain = 0;
  for (const e of rel.errors) {
    if (e.status !== 'unresolved') continue;
    e.lastSeen = day;
    e.events += Math.max(1, Math.round((accounts + 3) * e.impact * (e.severity === 'crash' ? 40 : 8)));
    e.minutes += 1440;
    rel.incidentMinutes += 1440 * e.impact;
    pain += e.impact * (e.severity === 'crash' ? 1 : 0.3);
    if (!e.visible && (day - e.firstSeen) * 1440 >= e.detectMin) { e.visible = true; e.via = 'customer tickets'; surfaced.push(e); }
  }
  return { churnMult: round2(1 + Math.min(0.25, 0.08 * pain)), surfaced };
}

// Same-day fixes still cost the detection lag plus the time to act.
function closeMinutes(rel, e, actMin) {
  if (e.minutes > 0) return;
  e.minutes = (e.visible ? Math.min(e.detectMin, 1440) : 1440) + actMin;
  rel.incidentMinutes += e.minutes * e.impact;
}

// Player actions. Each returns { ok, hours, error?, note? }.
export function rollback(rel, errId, { rand }) {
  const e = rel.errors.find((x) => x.id === errId);
  if (!e || e.status !== 'unresolved') return { ok: false, hours: 0, error: 'Nothing to roll back.' };
  // The migration already ran: retrying the rollback cannot undo it (and must not double the fix again).
  if (e.rollbackFailed) return { ok: false, hours: 0, error: 'Rollback is not possible: the release ran a database migration. Fix it forward.' };
  const d = rel.deployments.find((x) => x.id === e.deploymentId);
  rel.rollbacks++;
  if (d?.migration && rand() < 0.25) { // the release changed the schema; rolling back the code leaves data in the new shape
    e.fixHours = round2(e.fixHours * 2); e.rollbackFailed = true;
    return { ok: false, hours: 0.5, error: 'Rollback failed: the release ran a database migration. You need a fix forward (twice the work).' };
  }
  closeMinutes(rel, e, 15);
  e.status = 'resolved'; e.resolvedDay = e.lastSeen; e.how = 'rollback';
  if (d) d.status = 'rolled_back';
  return { ok: true, hours: 0.25, note: 'Rolled back. The feature stays shipped but the faulty change is reverted until you fix it.' };
}

export function resolveWithFix(rel, errId, { seerUseful = false } = {}) {
  const e = rel.errors.find((x) => x.id === errId);
  if (!e || e.status !== 'unresolved') return { ok: false, hours: 0, error: 'Already resolved.' };
  const hours = round2(e.fixHours * (seerUsable(rel) && seerUseful ? 0.6 : 1));
  closeMinutes(rel, e, hours * 60);
  e.status = 'resolved'; e.how = 'fix'; e.resolvedDay = e.lastSeen;
  return { ok: true, hours };
}

export function ignoreError(rel, errId) {
  const e = rel.errors.find((x) => x.id === errId);
  if (!e || e.status !== 'unresolved') return { ok: false, hours: 0 };
  e.status = 'ignored'; e.impact = round2(e.impact * 0.5); // still hurts some users, quietly
  return { ok: true, hours: 0 };
}

// Weekly triage surfaces everything monitoring has seen.
export function triageErrors(rel, day) {
  rel.lastTriageDay = day;
  let n = 0;
  for (const e of rel.errors) if (e.status === 'unresolved' && rel.flags.monitoring && !e.visible) { e.visible = true; n++; }
  return n;
}

// Stats for the tier read: incident minutes per 100 deploys and mean minutes to recover.
export function releaseStats(rel) {
  const deps = rel.deployments.length;
  const bad = rel.errors.length;
  const resolved = rel.errors.filter((e) => e.status === 'resolved');
  const mttr = resolved.length ? Math.round(resolved.reduce((a, e) => a + Math.max(e.minutes, e.detectMin), 0) / resolved.length) : null;
  return { deploys: deps, bad, cfr: deps ? round2(bad / deps) : null, mttr, minutesPer100: deps ? Math.round(rel.incidentMinutes / deps * 100) : 0, open: rel.errors.filter((e) => e.status === 'unresolved').length };
}

export const fmtMinutes = (m) => (m == null ? '—' : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${round2(m / 60)} h` : `${Math.round(m / 1440)} days`);
