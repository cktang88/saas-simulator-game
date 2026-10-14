// Vibe-coding app-builder path for non-technical founders (Lovable / Bolt / v0 / Replit Agent): prompt-built
// features with credits, a Supabase-style backend panel (tables with RLS, keys), a basic security scan that
// misses permissive policies, publish/export, a senior review, and the ceiling where you must harden, migrate
// to real code or keep prompting.
//
// Sources: docs/research/tools/deep/d07-ai-coding.md §3.4–3.7, §5, §6; docs/review/tool-gap-analysis.md item 13.
//  - Prices: Bolt Pro $25 (10M tokens) [verified]; Replit Core $20 incl. $20 credits, effort-based beyond
//    [verified structure]; Lovable Pro ~$25 and v0 $30/user [unverified].
//  - Security: samples range from ~11% (SupaExplorer: credentials in frontend) and ~10% (Lovable
//    CVE-2025-48757: exposed data) to 98% (vendor scan: ≥1 vulnerability). Simulator truth: most generated apps
//    have some issue; a meaningful minority leak data. Lovable's scanner does not test whether a policy
//    actually blocks access [secondary].
//  - MVP in hours instead of ~80 agent-hours; hardening 20–60 h later [design].
// All hazards and multipliers are [design].

import { clamp, round2 } from '../../core/util.js';

export const BUILDERS = {
  lovable: { label: 'Lovable Pro', monthly: 25, hours: 25, topup: 2.5, unverified: true, rollback: false, note: 'Chat-to-app with Supabase/Lovable Cloud; ~80% of builders are non-technical (company claim).' },
  bolt: { label: 'Bolt Pro', monthly: 25, hours: 20, topup: 2, rollback: false, note: '10M tokens/month; error-fix loops burn tokens fast.' },
  v0: { label: 'v0 Team', monthly: 30, hours: 15, topup: 2, unverified: true, rollback: false, frontend: true, note: 'Best for UI and landing pages; backend work hits the ceiling sooner.' },
  replit: { label: 'Replit Core', monthly: 20, hours: 5, topup: 4, rollback: false, note: 'Effort-based pay-as-you-go beyond the $20 credits; set a budget first.' },
};

export const BUILDER = {
  baseMult: 3, floorMult: 0.35, maturityFeatures: 10, // 3× on a fresh app, falling as the app grows [design]
  foundationHuman: 30, // human-equivalent foundation hours on a builder (→ ~10 founder hours at 3×)
  ceilingAccounts: 25,
  loopBase: 0.4, loopPerGrade: 0.02, loopMin: 0.08, loopWaste: 0.3, ceilingLoopExtra: 0.25,
  keyChancePerFeature: 0.08,
  rlsDraw: { locked: 0.5, permissive: 0.25, off: 0.25 },
  hazard: { serviceRole: 0.12, off: 0.05, permissive: 0.025, base: 0.003 }, // per month with paying users
  review: { usd: 1200, founderHours: 2 }, // one senior engineer, ~8 h at $150/h [design]
  hardenHours: [20, 30], rebuildShare: 0.5, lockInExtra: 0.3,
};

const HEAVY = /\b(stripe|payment|webhook|proration|subscription billing|sso|saml|oauth|background job|cron|queue|multi-tenant|workspace|hipaa|soc ?2|gdpr|audit log|permissions?|roles?)\b/i;

export function builderSlice(slice) {
  const b = (slice.builder ??= {});
  b.tool ??= null; b.recurringId ??= null; b.active ??= false; b.tables ??= []; b.serviceRoleInFrontend ??= false;
  b.scannedDay ??= null; b.scanFindings ??= null; b.exported ??= false; b.reviewed ??= false; b.budgetCap ??= false;
  b.usage ??= { month: null, hours: 0, topupUsd: 0 }; b.leaks ??= []; b.ceiling ??= null; b.loops ??= 0;
  return b;
}

export function builderMultiplier(shippedCount) {
  return round2(BUILDER.baseMult * Math.max(BUILDER.floorMult, 1 - shippedCount / BUILDER.maturityFeatures));
}

export function loopChance(gradeTotal, b) {
  const p = clamp(BUILDER.loopBase - BUILDER.loopPerGrade * (gradeTotal ?? 6), BUILDER.loopMin, BUILDER.loopBase);
  return round2(p + (b.ceiling?.choice === 'keep' ? BUILDER.ceilingLoopExtra : 0));
}

const tableName = (title) => String(title || 'items').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28) || 'items';
export function drawRls(rand) {
  const r = rand();
  return r < BUILDER.rlsDraw.locked ? 'locked' : r < BUILDER.rlsDraw.locked + BUILDER.rlsDraw.permissive ? 'permissive' : 'off';
}

// A feature shipped on the builder adds a table (RLS drawn) and may put the service_role key in frontend code.
export function onBuilderShip(b, f, rand) {
  b.tables.push({ name: tableName(f.title), rls: drawRls(rand), featureId: f.id });
  if (rand() < BUILDER.keyChancePerFeature) b.serviceRoleInFrontend = true;
  b.scanFindings = null; // a new publish needs a new scan
}
export function onFoundation(b, rand) {
  if (!b.tables.some((t) => t.name === 'profiles')) b.tables.push({ name: 'profiles', rls: drawRls(rand) });
}

// Basic scanner: flags tables with RLS OFF and a service_role key in the bundle. It does not test whether an
// enabled policy really blocks access, so permissive policies pass.
export function scan(b) {
  const findings = [];
  for (const t of b.tables) if (t.rls === 'off') findings.push({ kind: 'rls_off', table: t.name, msg: `Table "${t.name}" has row-level security disabled: anyone with the public anon key can read it.` });
  if (b.serviceRoleInFrontend) findings.push({ kind: 'service_role', msg: 'A service_role key is in frontend JavaScript. It bypasses RLS for anyone who opens dev tools.' });
  b.scanFindings = findings;
  return findings;
}

// Senior review: finds permissive policies too and fixes everything (plus a hardening list).
export function seniorReview(b) {
  const permissive = b.tables.filter((t) => t.rls === 'permissive').map((t) => t.name);
  for (const t of b.tables) t.rls = 'locked';
  b.serviceRoleInFrontend = false;
  b.reviewed = true;
  return { permissive };
}

// Monthly probability that real customer data leaks (only once paying users exist).
export function leakHazardMonthly(b) {
  const h = BUILDER.hazard;
  let miss = 1 - h.base;
  if (b.serviceRoleInFrontend) miss *= 1 - h.serviceRole;
  for (const t of b.tables) miss *= 1 - (t.rls === 'off' ? h.off : t.rls === 'permissive' ? h.permissive : 0);
  return round2((1 - miss) * 10000) / 10000;
}
export const dailyFromMonthly = (p) => 1 - Math.pow(1 - p, 1 / 30);

// Usage for a builder session: returns { stalledShare, topupUsd }.
export function builderUsage(b, tool, wantHours) {
  const t = BUILDERS[tool];
  const left = Math.max(0, t.hours - (b.usage.hours ?? 0));
  const covered = Math.min(left, wantHours);
  let extra = wantHours - covered, topupUsd = 0;
  if (extra > 0 && !b.budgetCap) { topupUsd = extra * t.topup; extra = 0; }
  b.usage.hours = round2((b.usage.hours ?? 0) + wantHours - extra);
  b.usage.topupUsd = round2((b.usage.topupUsd ?? 0) + topupUsd);
  return { stalledShare: wantHours > 0 ? extra / wantHours : 0, topupUsd: round2(topupUsd) };
}

// Ceiling check: lots of users or a feature the builder can't do well.
export function ceilingReason(b, { accounts = 0, queued = [] }) {
  if (b.ceiling) return null;
  if (accounts >= BUILDER.ceilingAccounts) return `${accounts} accounts: load, caching, background jobs and monitoring are missing from the generated app`;
  const heavy = queued.find((f) => HEAVY.test(`${f.title} ${f.solution} ${(f.acceptance ?? []).join(' ')}`));
  if (heavy) return `"${heavy.title}" needs payments edge cases, custom auth, background jobs or tenant isolation, which builders handle poorly`;
  return null;
}

// Tier read for the builder path.
export function builderScore(b) {
  let s = 0;
  if (b.scannedDay != null) s += 0.2;
  if (!b.serviceRoleInFrontend) s += 0.2;
  if (b.tables.length && b.tables.every((t) => t.rls !== 'off')) s += 0.15;
  if (b.reviewed) s += 0.2;
  if (b.exported) s += 0.1;
  if (b.budgetCap) s += 0.15;
  return round2(s);
}
