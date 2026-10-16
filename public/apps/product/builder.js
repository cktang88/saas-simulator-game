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
import { logMistake } from '../../core/operator.js';

// Each builder is a different paradigm (docs/research/tools/2026q4/web-content.md §1, deep/d07-ai-coding.md):
//  - Lovable: chat describes the whole app; full-stack React + Supabase/Lovable Cloud. Billed in CREDITS PER TASK
//    (0.5 a button colour, 1.7 a landing page [verified: lovable.dev/pricing]); monthly credits roll over once and
//    then expire, and failed attempts are not refunded. Failure mode: the credit-burn loop. On a buggy app every
//    "fix the error" prompt is a paid task that often breaks something else, so loops get likelier as bugs pile up.
//  - Bolt.new: in-browser (StackBlitz) dev environment, TOKEN-metered (Pro $25 = 10M tokens [verified, d07]). Every
//    prompt re-sends the project as context, so tokens per build hour grow with the app. Failure mode: the bill
//    climbs as the app grows. Framework choice and code download keep lock-in low.
//  - v0 (Vercel): FRONTEND-first React/shadcn + Next.js generation, USD credits. UI work is fast and the code is clean
//    and yours, but backend work (auth, database, billing, jobs) is wired by hand at half speed, and the first
//    backend-heavy feature hits the ceiling.
//  - Replit Agent: agent builds AND hosts the app (database, deployments), EFFORT-based pricing billed in arrears
//    (Core $20 incl. $20 of usage [verified structure, d07]). Failure modes: the surprise bill (no stop unless you set
//    a budget), the agent touching the production database unless dev and prod are split (July 2025 incident), and
//    hosting lock-in when you leave.
// allowance/unitsPerHour/unitUsd: the plan's monthly units, units per build hour and USD per extra unit [design
// except allowances]. lockIn: extra share of rebuild hours when migrating to real code; rebuildShare: share of shipped
// work to redo. All [design].
export const BUILDERS = {
  lovable: { label: 'Lovable Pro', monthly: 25, paradigm: 'credits', unitName: 'credits', allowance: 100, unitsPerHour: 4, loopUnits: 6, unitUsd: 0.25, rollover: true, bugLoop: 0.04, rebuildShare: 0.6, lockIn: 0.3, ceilingAccounts: 25, hours: 25, rollback: false, note: 'Chat-to-app with Supabase/Lovable Cloud; credits per task, unused monthly credits roll over once then expire, failed attempts are not refunded. ~80% of builders are non-technical (company claim).' },
  bolt: { label: 'Bolt Pro', monthly: 25, paradigm: 'tokens', unitName: 'M tokens', allowance: 10, unitsPerHour: 0.35, contextGrowth: 0.15, loopUnits: 1, unitUsd: 2.5, rebuildShare: 0.5, lockIn: 0.1, ceilingAccounts: 25, hours: 28, rollback: false, note: '10M tokens/month. Each prompt re-sends the project, so a bigger app burns more tokens per hour; error-fix loops burn them fastest.' },
  v0: { label: 'v0 Team', monthly: 30, paradigm: 'frontend', unitName: 'USD of credits', allowance: 30, unitsPerHour: 1.5, loopUnits: 2, unitUsd: 1, backendFactor: 0.5, rebuildShare: 0.3, lockIn: 0, ceilingAccounts: 25, hours: 20, unverified: true, rollback: false, frontend: true, note: 'Best for UI and pages (React/shadcn on Vercel, clean code you own). Backend work is wired by hand and hits the ceiling first.' },
  replit: { label: 'Replit Core', monthly: 20, paradigm: 'effort', unitName: 'USD of effort', allowance: 20, unitsPerHour: 4, loopUnits: 8, unitUsd: 1, arrears: true, prodRisk: 0.004, rebuildShare: 0.5, lockIn: 0.4, ceilingAccounts: 60, hours: 5, rollback: false, note: 'Agent builds and hosts the app. Effort-based pay-as-you-go beyond the $20 credits, billed in arrears: set a budget, and split dev and prod databases.' },
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
  b.usage.units ??= 0; b.usage.carry ??= 0; b.usage.burned ??= 0; b.usage.arrears ??= 0; b.usage.loops ??= 0;
  b.devProdSplit ??= false; b.burnedTotalUsd ??= 0; b.expiredUnits ??= 0;
  return b;
}

export function builderMultiplier(shippedCount) {
  return round2(BUILDER.baseMult * Math.max(BUILDER.floorMult, 1 - shippedCount / BUILDER.maturityFeatures));
}

export function loopChance(gradeTotal, b, { openBugs = 0 } = {}) {
  const p = clamp(BUILDER.loopBase - BUILDER.loopPerGrade * (gradeTotal ?? 6), BUILDER.loopMin, BUILDER.loopBase);
  const bug = Math.min(0.15, (BUILDERS[b.tool]?.bugLoop ?? 0) * openBugs); // Lovable: "fix the error" loops on a buggy app
  return round2(p + bug + (b.ceiling?.choice === 'keep' ? BUILDER.ceilingLoopExtra : 0));
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

const BACKEND = /\b(database|backend|api|auth|login|sign ?in|sync|import|export|integration|email|notification|stripe|payment|webhook|cron|queue|roles?|permissions?)\b/i;
export const isBackendTask = (f) => Boolean(f) && BACKEND.test(`${f.title ?? ''} ${f.solution ?? ''}`);

/** Units per build hour now (Bolt's context grows with the app; the others are flat). */
export function unitsPerHourNow(tool, shipped = 0) {
  const t = BUILDERS[tool];
  return round2(t.unitsPerHour * (1 + (t.contextGrowth ?? 0) * shipped));
}

// Month rollover: Lovable carries last month's unused credits once (then they expire); the others reset. Replit's
// arrears for the month just ended come due.
function rollMonth(b, t, month) {
  if (b.usage.month === month) return 0;
  const unused = b.usage.month ? Math.max(0, t.allowance + (b.usage.carry ?? 0) - (b.usage.units ?? 0)) : 0;
  const carry = t.rollover ? Math.min(t.allowance, unused) : 0;
  b.expiredUnits = round2((b.expiredUnits ?? 0) + Math.max(0, unused - carry));
  const due = b.usage.arrears ?? 0;
  b.usage = { month, hours: 0, topupUsd: 0, units: 0, carry, burned: 0, arrears: 0, loops: 0 };
  return round2(due);
}

/**
 * Usage for one builder session, by paradigm. ctx: { loop, shipped, task, rand, month, state }.
 * Returns { stalledShare, topupUsd, arrearsDue, burnedUsd, factorMult, destructive }.
 */
export function builderUsage(b, tool, wantHours, ctx = {}) {
  const t = BUILDERS[tool];
  const { loop = false, shipped = 0, task = null, rand = null, month = b.usage.month, state = null } = ctx;
  const arrearsDue = rollMonth(b, t, month);
  const rate = unitsPerHourNow(tool, shipped);
  const burned = loop ? t.loopUnits : 0; // a failed attempt is still a paid task / tokens / effort, never refunded
  const want = wantHours * rate + burned;
  const left = Math.max(0, t.allowance + (b.usage.carry ?? 0) - (b.usage.units ?? 0));
  const extra = Math.max(0, want - left);
  let topupUsd = 0, stalledUnits = 0;
  if (extra > 0) {
    if (b.budgetCap) stalledUnits = extra;
    else if (t.arrears) b.usage.arrears = round2((b.usage.arrears ?? 0) + extra * t.unitUsd); // no stop, bill later
    else topupUsd = round2(extra * t.unitUsd);
  }
  b.usage.units = round2((b.usage.units ?? 0) + want - stalledUnits);
  b.usage.hours = round2((b.usage.hours ?? 0) + wantHours * (want > 0 ? 1 - stalledUnits / want : 1));
  b.usage.topupUsd = round2((b.usage.topupUsd ?? 0) + topupUsd);
  const burnedUsd = round2(burned * t.unitUsd);
  if (loop) { b.usage.burned = round2((b.usage.burned ?? 0) + burned); b.usage.loops = (b.usage.loops ?? 0) + 1; b.burnedTotalUsd = round2((b.burnedTotalUsd ?? 0) + burnedUsd); }
  // v0: the UI generates fast, the backend is wired by hand.
  const factorMult = t.backendFactor && isBackendTask(task) ? t.backendFactor : 1;
  // Replit: the agent works against the same database the app serves unless dev and prod are split.
  const destructive = Boolean(t.prodRisk && !b.devProdSplit && rand && rand() < t.prodRisk * Math.max(0.25, wantHours / 4));
  if (state && loop && (t.paradigm === 'credits' || t.paradigm === 'tokens') && b.usage.loops >= 3) {
    logMistake(state, { functionId: 'ai_building', id: 'credit_burn_loop', label: `${t.label}: ${t.unitName} burned on fix loops`, cost: { usd: round2(b.usage.burned * t.unitUsd), hours: b.usage.loops * 0.5 }, circles: true, detail: `${b.usage.loops} sessions this month where the builder broke working code and the "fix it" prompts were billed (${round2(b.usage.burned)} ${t.unitName}, not refunded). A stellar operator writes a tighter spec, rolls back to the last working version, or fixes the one file by hand instead of re-prompting.`, app: 'product', key: `burn:${b.usage.month}` });
  }
  return { stalledShare: want > 0 ? stalledUnits / want : 0, topupUsd, arrearsDue, burnedUsd, factorMult, destructive };
}

/** One-line usage summary for the UI. */
export function usageLine(b, tool) {
  const t = BUILDERS[tool];
  const cap = round2(t.allowance + (b.usage.carry ?? 0));
  const parts = [`${round2(b.usage.units ?? 0)} / ${cap} ${t.unitName} this month`];
  if (t.contextGrowth) parts.push(`${t.unitsPerHour} per build hour on a new app, more as it grows`);
  if (b.usage.arrears) parts.push(`$${round2(b.usage.arrears)} accrued, billed next month`);
  if (b.usage.burned) parts.push(`${round2(b.usage.burned)} burned on fix loops`);
  if (b.expiredUnits) parts.push(`${round2(b.expiredUnits)} expired unused`);
  return parts.join(' · ');
}

// Ceiling check: lots of users or a feature the builder can't do well (v0: the first backend feature).
export function ceilingReason(b, { accounts = 0, queued = [] }) {
  if (b.ceiling) return null;
  const t = BUILDERS[b.tool] ?? {};
  const limit = t.ceilingAccounts ?? BUILDER.ceilingAccounts;
  if (accounts >= limit) return `${accounts} accounts: load, caching, background jobs and monitoring are missing from the generated app`;
  const heavy = queued.find((f) => HEAVY.test(`${f.title} ${f.solution} ${(f.acceptance ?? []).join(' ')}`));
  if (heavy) return `"${heavy.title}" needs payments edge cases, custom auth, background jobs or tenant isolation, which builders handle poorly`;
  if (t.frontend) { const be = queued.find((f) => isBackendTask(f)); if (be) return `"${be.title}" is backend work: v0 generates the UI; the database, auth and server logic are yours to wire`; }
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
  if (BUILDERS[b.tool]?.prodRisk && !b.devProdSplit) s -= 0.1;
  if ((b.burnedTotalUsd ?? 0) > 20) s -= 0.1;
  return round2(clamp(s, 0, 1));
}
