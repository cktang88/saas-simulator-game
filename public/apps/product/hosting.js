// Hosting platform: where production runs and what that choice does to the bill, the founder's ops hours, the
// incident rate and the cost of leaving. Each platform has its own pricing SHAPE (per seat + usage, usage-metered,
// fixed instances, per-second machines, platform fee on top of your own cloud, raw cloud) and its own trap.
//
// Research: docs/research/tools/2026q4/dev-data.md §2 (prices are third-party aggregator figures, vendors move
// often: "check the vendor page"). Porter's fee ($6/GB RAM + $13/vCPU per month, excluding the cloud bill) is the
// vendor page. EKS control plane ~$73/mo ($0.10/h) is AWS list price. Every curve, ops-hour figure, incident rate
// and migration multiplier below is a [design] assumption, not a statistic.
//
// Determinism: daily draws use a hash of (seed, day, key), never rng(state), so turning hosting on does not shift the
// random stream of other systems. No Date.now / Math.random.

import { clamp, round2, hash } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { activeSubs, trialingSubs, mrr } from '../../core/stripe.js';
import { raiseProductIncident } from '../insights/raise.js';
import { productSlice } from './store.js';

const MONTH = 30;
export const h01 = (key) => (parseInt(hash(String(key)), 36) % 1000003) / 1000003;
const accountsOf = (state) => (state.stripe ? activeSubs(state).length + trialingSubs(state).length : 0);
export const engineersOf = (state) => (state.apps?.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent' && m.role === 'engineer' && (m.startDay ?? 0) <= (state.day ?? 0)).length;
/** People who open pull requests: the founder plus human engineers (Sentry Seer bills per active contributor). */
export const contributorsOf = (state) => 1 + engineersOf(state);

// ---- Platforms ----
// sizes (Render only): instance price and the account load it carries before it saturates [design capacities].
export const RENDER_SIZES = {
  free: { label: 'Free (spins down when idle)', usd: 0, cap: 15, coldStart: true },
  starter: { label: 'Starter 512 MB', usd: 7, cap: 60 },
  standard: { label: 'Standard 2 GB', usd: 25, cap: 300 },
  pro: { label: 'Pro 4 GB', usd: 85, cap: 1200 },
  pro_plus: { label: 'Pro Plus 8 GB', usd: 175, cap: 3000 },
};
export const HOSTS = {
  vercel: {
    label: 'Vercel', shape: 'per seat + usage', counterparty: 'Vercel', setupH: 2, opsH: 0.25, incidents: 0.4, migrateOutH: 22, status: 'keep',
    paradigm: 'git push -> preview URL per PR -> promote; frontend and serverless functions. Merge, check the preview, promote, roll back from the deployment list.',
    easy: 'Next.js frontends, previews for every PR, near-zero ops.', hard: 'Long-running backends, queues and websockets; function and bandwidth usage make the backend bill unpredictable.',
    trap: 'Per-seat plus usage: a traffic spike, a bot crawl or a runaway function bills thousands unless Spend Management caps it. The free Hobby plan bars commercial use.',
    fit: 'pre-seed to Series A (frontend)', price: 'Pro $20/seat/mo + usage beyond the included credit [third-party]',
  },
  railway: {
    label: 'Railway', shape: 'usage-metered', counterparty: 'Railway', setupH: 3, opsH: 0.5, incidents: 0.9, migrateOutH: 16, status: 'keep',
    paradigm: 'Containers and databases on one canvas, billed per GB-second and vCPU-second. git push, add a Postgres or Redis service, set env vars, watch usage.',
    easy: 'A full backend (API, worker, Postgres) in an afternoon, cheap at low load.', hard: 'Costs climb with constant load; many ad-hoc services get messy.',
    trap: 'The bill tracks load, so it climbs steadily as you grow; nobody re-reads the usage page.', fit: 'pre-seed / seed', price: 'Hobby $5, Pro $20/mo incl. usage, then per GB-s and vCPU-s [third-party]',
  },
  render: {
    label: 'Render', shape: 'fixed instances', counterparty: 'Render', setupH: 3, opsH: 0.5, incidents: 0.5, migrateOutH: 16, status: 'keep-alt',
    paradigm: 'Heroku-like: connect a repo, pick an instance size, deploy; managed Postgres and blueprints. You scale by changing the size.',
    easy: 'A predictable bill.', hard: 'Nothing scales for you: an undersized instance saturates, an oversized one is paid for at idle. The free tier cold-starts.',
    trap: 'Right-sizing is your job: outgrow the instance and requests time out; keep a big one "to be safe" and pay for idle.', fit: 'seed', price: 'Starter ~$7/mo per instance, larger fixed sizes [third-party]',
  },
  fly: {
    label: 'Fly.io', shape: 'per-second machines', counterparty: 'Fly.io', setupH: 6, opsH: 1.5, incidents: 1.2, migrateOutH: 18, status: 'keep-alt',
    paradigm: 'Firecracker machines in many regions from the CLI (fly deploy); volumes; scale machines per region.',
    easy: 'Cheap compute and running close to users in several regions.', hard: 'More ops knowledge: machines, volumes and multi-region data consistency are on you.',
    trap: 'Multi-region looks free; keeping data consistent across regions is your problem and each region adds ops hours.', fit: 'seed, infra-savvy teams', price: 'Per-second machine billing; no free compute for new accounts [third-party]',
  },
  porter: {
    label: 'Porter (on your AWS)', shape: 'platform fee + your cloud bill', counterparty: 'Porter', cloud: 'aws', setupH: 12, opsH: 0.75, incidents: 0.5, migrateOutH: 14, status: 'keep-alt',
    paradigm: 'PaaS UX on Kubernetes inside YOUR AWS account: connect GitHub, define services, cron and workers, autoscale, preview environments.',
    easy: 'Heroku-style deploys on your own cloud: AWS credits pay the cloud part, SOC 2 and customer-owned-cloud asks get easier, no DevOps hire.',
    hard: 'You pay Porter AND the AWS bill; the cluster has a cost floor; Kubernetes concepts leak.',
    trap: 'Pre-revenue without AWS credits it is a ~$200/mo floor for a product a $20 PaaS would run.', fit: 'seed to Series B (with AWS credits or own-cloud needs)', price: '$6/GB RAM + $13/vCPU per month, plus the AWS bill [vendor: porter.run/pricing]',
  },
  aws: {
    label: 'AWS directly (ECS / Lambda)', shape: 'raw cloud usage', counterparty: 'AWS', cloud: 'aws', setupH: 40, opsH: 4, incidents: 0.3, migrateOutH: 30, status: 'keep',
    paradigm: 'Full primitives with IAM and VPCs, driven by Terraform or CDK and the console.',
    easy: 'The lowest unit cost at scale, the biggest credits (AWS Activate) and no ceiling.', hard: 'The most setup hours, IAM and networking, patching and upgrades every week.',
    trap: 'A solo founder running raw AWS pays in hours every week; skipped maintenance turns into outages.', fit: 'Series A+ with a platform engineer', price: 'Usage; credits via AWS Activate [unverified terms]',
  },
  heroku: {
    label: 'Heroku', shape: 'dynos', counterparty: 'Heroku', setupH: 2, opsH: 0.25, incidents: 1.2, migrateOutH: 16, status: 'outdated',
    outdated: { since: '2022-11-28', note: 'Free dynos ended 28 Nov 2022 and the startup default moved to Railway, Render and Fly. 2026 commentary calls it effectively dead for new startups [unverified]. Not offered for new projects; existing apps keep running.' },
    paradigm: 'git push heroku main, dynos and add-ons.', easy: '', hard: '', trap: '', fit: 'legacy', price: '-',
  },
};
export const HOST_IDS = Object.keys(HOSTS).filter((k) => HOSTS[k].status !== 'outdated');
export const HOSTING = {
  lockInPerMonth: 0.05, // [design] each month on a platform adds 5% to the migration work (cap +150%)
  spikePerMonth: 0.05, // [design] traffic spike / bot crawl / runaway function on usage-billed serverless
  capHours: 0.5, spendCapUsd: 50, resizeHours: 0.5, regionOpsH: 0.5,
  cutoverIncidentP: 0.25, // [design] chance a migration without a staged cutover causes an outage
};

export function hostingSlice(slice) {
  const h = (slice.hosting ??= {});
  h.platform ??= null; // null = never chosen (the default stack's Vercel row may still be billing)
  h.sinceDay ??= null; h.spendCap ??= false; h.size ??= 'starter'; h.regions ??= 1;
  h.opsDebt ??= 0; h.lastOpsWeek ??= null; h.lastBill ??= null; h.bills ??= []; h.moves ??= [];
  h.incidents ??= 0; h.spikes ??= 0; h.wasted ??= 0; h.lastSpikeMonth ??= null; h.saturatedDays ??= 0;
  return h;
}
const prodSlice = (state) => productSlice(state);

/** The platform in effect: the chosen one, or the default stack's Vercel row if it is still active. */
export function effectivePlatform(state) {
  const h = hostingSlice(prodSlice(state));
  const cl = state.apps?.perks?.cloud;
  if (cl && cl.provider && cl.provider !== 'default' && h.platform !== 'porter') return null; // moved to a raw cloud in AI costs → billed there
  if (h.platform) return h.platform;
  return (state.recurring ?? []).some((r) => r.active && /^vercel$/i.test(r.vendor)) ? 'vercel' : null;
}

/** Monthly bill for a platform at a load. Pure. Returns { platform, cloud, usage, total, note }. */
export function hostBill(id, { accounts = 0, seats = 1, size = 'starter', regions = 1 } = {}) {
  const a = Math.max(0, accounts);
  switch (id) {
    case 'vercel': { // Pro: $20 per deploying seat, includes a $20 usage credit; functions/bandwidth grow faster than linear for a backend
      const usage = 0.03 * a + 0.00005 * Math.max(0, a - 300) ** 2;
      return { platform: 20 * seats, cloud: 0, usage: round2(Math.max(0, usage - 20)), total: round2(20 * seats + Math.max(0, usage - 20)), note: `${seats} seat(s) x $20 + usage` };
    }
    case 'railway': { const usage = 24 + 0.12 * a; return { platform: 20, cloud: 0, usage: round2(Math.max(0, usage - 20)), total: round2(20 + Math.max(0, usage - 20)), note: 'Pro $20 incl. $20 usage, then metered' }; }
    case 'render': { const s = RENDER_SIZES[size] ?? RENDER_SIZES.starter; const db = s.usd ? 20 : 0; return { platform: s.usd + db, cloud: 0, usage: 0, total: s.usd + db, note: `${s.label} + managed Postgres` }; }
    case 'fly': { const usage = (5 + 0.07 * a) * Math.max(1, regions) + 3; return { platform: 0, cloud: 0, usage: round2(usage), total: round2(usage), note: `machines in ${regions} region(s), per second` }; }
    case 'porter': { const vcpu = Math.max(2, Math.ceil(a / 250)); const fee = 13 * vcpu + 6 * 2 * vcpu; const cloud = 73 + 35 * vcpu + 30; return { platform: fee, cloud: round2(cloud), usage: 0, total: round2(fee + cloud), note: `${vcpu} vCPU / ${2 * vcpu} GB on EKS in your AWS account` }; }
    case 'aws': { const cloud = 40 + 0.1 * a; return { platform: 0, cloud: round2(cloud), usage: 0, total: round2(cloud), note: 'ECS + RDS + load balancer' }; }
    case 'heroku': { const t = 50 + 0.15 * a; return { platform: round2(t), cloud: 0, usage: 0, total: round2(t), note: 'dynos + Postgres add-on' }; }
    default: return { platform: 0, cloud: 0, usage: 0, total: 0, note: '' };
  }
}
export const renderSizeFor = (accounts) => Object.entries(RENDER_SIZES).find(([k, s]) => k !== 'free' && accounts <= s.cap)?.[0] ?? 'pro_plus';

/** Hours to move from the current platform to another one now (lock-in grows with months on it). */
export function migrationHours(state, to) {
  const h = hostingSlice(prodSlice(state));
  const from = effectivePlatform(state);
  const target = HOSTS[to];
  if (!target) return 0;
  if (!from) return target.setupH;
  const months = h.sinceDay == null ? 0 : Math.max(0, ((state.day ?? 0) - h.sinceDay) / MONTH);
  const lock = 1 + Math.min(1.5, months * HOSTING.lockInPerMonth);
  const live = accountsOf(state) > 0 || (h.bills.length > 0) || (productSlice(state).features ?? []).some((f) => f.status === 'shipped');
  return round2(target.setupH + HOSTS[from].migrateOutH * lock * (live ? 1 : 0.25)); // nothing in production yet: little to move [design]
}

/** Choose (or move to) a platform. Returns { ok, hours, usd, error }. UI charges hours. */
export function chooseHost(state, id, { staged = false } = {}) {
  const host = HOSTS[id];
  if (!host) return { ok: false, error: 'Unknown platform' };
  const slice = prodSlice(state);
  const h = hostingSlice(slice);
  const from = effectivePlatform(state);
  if (host.status === 'outdated' && from !== id) return { ok: false, error: `${host.label} is not offered for new projects: ${host.outdated.note}` };
  if (from === id && h.platform === id) return { ok: false, error: 'Already there' };
  const hours = from && from !== id ? migrationHours(state, id) + (staged ? 4 : 0) : host.setupH;
  let usd = 0;
  if (from && from !== id) {
    // Cutover month: the old platform still bills while you move (a month of double running) [design].
    usd = accountsOf(state) > 0 ? hostBill(from, loadOf(state, h)).total : 0;
    if (usd > 0) post(state, { amount: -usd, counterparty: HOSTS[from].counterparty, description: `${HOSTS[from].label}: last month while migrating to ${host.label}`, category: 'hosting', method: 'card', meta: { app: 'product', hosting: from, ...(HOSTS[from].cloud ? { provider: HOSTS[from].cloud } : {}) } });
    h.moves.push({ day: state.day, from, to: id, hours, usd: round2(usd), staged });
    if (!staged && h01(`cutover|${state.seed}|${state.day}|${id}`) < HOSTING.cutoverIncidentP && accountsOf(state) > 0) {
      raiseProductIncident(state, { cause: `cutover from ${HOSTS[from].label} to ${host.label} (DNS, env vars, a missed worker)`, severity: 0.4, minutes: 180, source: 'hosting' });
      logMistake(state, { functionId: 'infra_ops', id: 'unstaged_cutover', app: 'product', label: 'Migrated hosting with no staged cutover', cost: { hours: 3, reputation: 0.5 }, charge: true, detail: 'A big-bang move broke production for about three hours. A stellar operator runs both platforms side by side, moves traffic in steps and keeps the old one for rollback.', key: `cutover:${state.day}` });
    }
    if (h.moves.filter((m) => state.day - m.day < 180).length >= 2) logMistake(state, { functionId: 'infra_ops', id: 'hosting_churn', app: 'product', label: 'Moved hosting twice in six months', cost: { hours: Math.round(hours) }, circles: true, delayed: true, detail: 'Each move re-does deploys, env vars, DNS and on-call. Pick the platform for the next 12-18 months of load, not this week\'s.', key: `hostchurn:${state.day}` });
  }
  h.platform = id; h.sinceDay = state.day; h.opsDebt = 0; h.spendCap = false;
  if (id === 'render') h.size = renderSizeFor(accountsOf(state));
  // This module bills the chosen platform itself, so a Vercel or Railway line from the default stack or the price
  // catalog stops (moveCloud in AI costs does the same for Vercel/Supabase).
  for (const r of state.recurring ?? []) if (r.active && /^(vercel|railway)$/i.test(r.vendor)) { r.active = false; r.movedToHost = true; }
  stageMistakes(state, id);
  return { ok: true, hours: round2(hours), usd: round2(usd) };
}

function stageMistakes(state, id) {
  const a = accountsOf(state), eng = engineersOf(state), aws = awsCredit(state);
  if (id === 'aws' && eng < 1 && a < 1500) logMistake(state, { functionId: 'infra_ops', id: 'raw_cloud_too_early', app: 'product', label: 'Raw AWS with no platform engineer', cost: { hours: 20 }, delayed: true, detail: `${HOSTS.aws.setupH} h of setup and ~${HOSTS.aws.opsH} h a week of IAM, networking and patching for ${a} accounts. A stellar operator runs a PaaS until load or customers demand their own cloud, then uses Porter or hires for it.`, key: 'raw_aws_early' });
  if (id === 'porter' && a < 100 && aws < 2000) logMistake(state, { functionId: 'infra_ops', id: 'porter_too_early', app: 'product', label: 'Kubernetes-in-your-cloud before there was load or credits', cost: { usd: 150 * 6 }, delayed: true, detail: `Porter plus an EKS cluster is a ~$${Math.round(hostBill('porter', { accounts: a }).total)}/mo floor with no AWS credits to pay it. A $20 PaaS runs this product; Porter fits once AWS credits land or a customer needs your own cloud.`, key: 'porter_early' });
}

const awsCredit = (state) => (state.apps?.perks?.credits ?? []).filter((c) => c.provider === 'aws' && c.status === 'active').reduce((s, c) => s + (c.balance ?? 0), 0);
const loadOf = (state, h) => ({ accounts: accountsOf(state), seats: contributorsOf(state), size: h.size, regions: h.regions });

export function setSpendCap(state, on = true) { const h = hostingSlice(prodSlice(state)); h.spendCap = Boolean(on); return { ok: true, hours: on ? HOSTING.capHours : 0.1 }; }
export function resizeRender(state, size) {
  const h = hostingSlice(prodSlice(state));
  if (effectivePlatform(state) !== 'render') return { ok: false, error: 'Only on Render' };
  if (!RENDER_SIZES[size]) return { ok: false, error: 'Unknown size' };
  h.size = size; return { ok: true, hours: HOSTING.resizeHours };
}
export function setRegions(state, n) {
  const h = hostingSlice(prodSlice(state));
  if (effectivePlatform(state) !== 'fly') return { ok: false, error: 'Only on Fly.io' };
  h.regions = clamp(Math.round(n), 1, 6); return { ok: true, hours: 1 };
}

/** Is someone paged when production goes down? (Insights uptime paging, or an observability tool with uptime checks.) */
export const pagedFor = (state) => Boolean(state.apps?.insights?.flags?.paging);

function chargeOps(state, hours, label) {
  const f = state.founder;
  if (!f) return 0;
  const left = Math.max(0, (f.hoursPerWeek ?? 50) - (f.hoursUsed ?? 0));
  const h = round2(Math.min(hours, left));
  if (h > 0) { f.hoursUsed = (f.hoursUsed ?? 0) + h; (f.timeLog ??= []).push({ day: state.day, hours: h, label }); }
  return h;
}

/** Daily tick: weekly ops hours, saturation, platform incidents and usage spikes. */
export function hostingDay(state) {
  const id = effectivePlatform(state);
  if (!id) return;
  const host = HOSTS[id];
  const slice = prodSlice(state);
  const h = hostingSlice(slice);
  const t = state.day ?? 0;
  const a = accountsOf(state);
  const live = a > 0;
  // 1. Weekly ops: platform maintenance, upgrades, IAM, machines. Skipped hours become ops debt.
  const week = Math.floor(t / 7);
  if (h.platform && h.lastOpsWeek !== week) {
    h.lastOpsWeek = week;
    const need = host.opsH + (id === 'fly' ? HOSTING.regionOpsH * (h.regions - 1) : 0);
    const got = chargeOps(state, need, `Hosting ops (${host.label})`);
    h.opsDebt = got + 0.01 < need ? Math.min(8, h.opsDebt + 1) : Math.max(0, h.opsDebt - 1);
  }
  if (!live) return;
  const chosen = Boolean(h.platform); // unchosen default stack: Insights' generic incident model already covers outages
  // 2. Render: saturation when the instance is too small; idle waste when it is far too big.
  let sat = 1;
  if (id === 'render') {
    const s = RENDER_SIZES[h.size] ?? RENDER_SIZES.starter;
    if (a > s.cap) { sat = 1 + Math.min(4, (a - s.cap) / s.cap * 3); h.saturatedDays++; }
  }
  // 3. Platform incidents: base rate x ops debt x saturation x multi-region consistency.
  const debt = 1 + 0.5 * Math.min(6, h.opsDebt) * (id === 'aws' ? 2 : 1);
  const regionRisk = id === 'fly' && h.regions > 1 ? 1 + 0.25 * (h.regions - 1) : 1;
  const perYear = host.incidents * debt * sat * regionRisk;
  if (chosen && h01(`hostinc|${state.seed}|${t}|${id}`) < perYear / 365) {
    const paged = pagedFor(state);
    const minutes = Math.round((paged ? 45 : 150) * (h01(`hostmin|${state.seed}|${t}`) * 1.5 + 0.5) * (state.apps?.product?.observability?.vendor === 'betterstack' || state.apps?.product?.observability?.vendor === 'datadog' ? 0.7 : 1));
    const cause = sat > 1 ? `${RENDER_SIZES[h.size].label} instance saturated (${a} accounts)` : id === 'aws' && h.opsDebt > 0 ? 'unpatched infrastructure / expired certificate on raw AWS' : id === 'fly' && h.regions > 1 ? 'region failover with stale replica data' : `${host.label} platform incident`;
    raiseProductIncident(state, { cause, severity: clamp(0.15 + minutes / 1200, 0.1, 0.8), minutes, source: 'hosting' });
    chargeOps(state, minutes / 60 + 0.5, `Hosting incident (${host.label})`);
    h.incidents++;
    if (sat > 1) logMistake(state, { functionId: 'infra_ops', id: 'render_undersized', app: 'product', label: 'Outgrew a fixed instance and did not resize', cost: { hours: 1, customers: 1 }, charge: false, delayed: true, detail: `${a} accounts on a ${RENDER_SIZES[h.size].label} instance (comfortable to ~${RENDER_SIZES[h.size].cap}). Fixed-instance hosting never scales itself: check CPU and memory monthly and resize ahead of load.`, key: `undersized:${Math.floor(t / 30)}` });
    if (id === 'aws' && h.opsDebt > 0) logMistake(state, { functionId: 'infra_ops', id: 'ops_debt_outage', app: 'product', label: 'Skipped infrastructure upkeep caused an outage', cost: { hours: 2 }, delayed: true, detail: 'Raw cloud needs weekly upkeep (patches, certificates, IAM, backups). The weeks you skipped came due at once.', key: `opsdebt:${Math.floor(t / 30)}` });
  }
  // 4. Usage spikes on serverless usage billing (Vercel): one draw per month.
  const month = Math.floor(t / MONTH);
  if (id === 'vercel' && a >= 25 && h.lastSpikeMonth !== month && t % MONTH === 15) {
    h.lastSpikeMonth = month;
    if (h01(`spike|${state.seed}|${month}`) < HOSTING.spikePerMonth * (a >= 300 ? 2 : 1)) {
      h.spikes++;
      if (h.spendCap) {
        post(state, { amount: -HOSTING.spendCapUsd, counterparty: 'Vercel', description: 'Usage spike stopped at your Spend Management cap', category: 'hosting', method: 'card', meta: { app: 'product', usage: true } });
        raiseProductIncident(state, { cause: 'Vercel paused the project at your spend cap during a traffic spike', severity: 0.2, minutes: 60, source: 'hosting' });
        notify(state, 'A traffic spike hit your Vercel spend cap: the project paused for about an hour instead of billing thousands.', { type: 'warn', app: 'product' });
      } else {
        const usd = Math.round(300 * 10 ** (h01(`spikeusd|${state.seed}|${month}`)));
        post(state, { amount: -usd, counterparty: 'Vercel', description: 'Usage spike: bandwidth and function invocations (bot crawl / viral traffic)', category: 'hosting', method: 'card', meta: { app: 'product', usage: true } });
        h.wasted = round2(h.wasted + usd);
        notify(state, `Vercel bill spike: ${usd.toLocaleString('en-US')} USD of bandwidth and function usage from one traffic burst. Spend Management would have capped it.`, { type: 'bad', app: 'product' });
        logMistake(state, { functionId: 'infra_ops', id: 'serverless_bill_spike', app: 'product', label: 'Usage-billed hosting with no spend cap', cost: { usd, hours: 1 }, charge: true, detail: `A burst of bot or viral traffic billed ${usd} USD in bandwidth and function time. A stellar operator sets a spend cap and an alert on day one.`, key: `spike:${month}` });
      }
    }
  }
}

/** Monthly: the platform bill in its own shape. Cloud portions carry provider 'aws' so AWS credits apply. */
export function hostingMonthEnd(state) {
  const slice = prodSlice(state);
  const h = hostingSlice(slice);
  if (!h.platform) return; // the default stack's Vercel row bills as a plain recurring line
  const id = effectivePlatform(state);
  if (!id) return;
  const host = HOSTS[id];
  const b = hostBill(id, loadOf(state, h));
  const meta = { app: 'product', hosting: id };
  if (b.platform + b.usage > 0) post(state, { amount: -round2(b.platform + b.usage), counterparty: host.counterparty, description: `${host.label} (${host.shape}): ${b.note}`, category: 'hosting', method: 'card', meta: { ...meta, usage: b.usage > 0 } });
  if (b.cloud > 0) post(state, { amount: -b.cloud, counterparty: 'AWS', description: `AWS bill under ${host.label}: ${b.note}`, category: 'hosting', method: 'card', meta: { ...meta, provider: 'aws', usage: true } });
  if (id === 'render') { const right = hostBill('render', { size: renderSizeFor(accountsOf(state)) }).total; if (b.total > right * 2.5) h.wasted = round2(h.wasted + b.total - right); }
  h.lastBill = { day: state.day, ...b };
  h.bills.push({ day: state.day, platform: id, total: b.total, accounts: accountsOf(state) });
  if (h.bills.length > 36) h.bills.shift();
}

// ---- Fit read used by the infra_ops operator reader ----
/** 0-1: how well the platform fits the company's stage today [design]. */
export function hostFit(state, id = effectivePlatform(state)) {
  if (!id) return null;
  const a = accountsOf(state), eng = engineersOf(state), aws = awsCredit(state);
  const h = hostingSlice(prodSlice(state));
  switch (id) {
    case 'vercel': return (a < 500 ? 1 : 0.6) - (h.spendCap ? 0 : 0.25);
    case 'railway': return a < 2000 ? 0.95 : 0.7;
    case 'render': { const s = RENDER_SIZES[h.size]; return s?.coldStart && a > 0 ? 0.4 : a > (s?.cap ?? 0) ? 0.45 : hostBill('render', { size: h.size }).total > hostBill('render', { size: renderSizeFor(a) }).total * 2.5 ? 0.6 : 0.9; }
    case 'fly': return (eng >= 1 ? 0.85 : 0.6) - (h.regions > 2 && a < 500 ? 0.2 : 0);
    case 'porter': return a >= 300 || aws >= 2000 ? 0.95 : 0.4;
    case 'aws': return a >= 1500 && eng >= 2 ? 0.9 : eng >= 1 && aws >= 2000 ? 0.65 : 0.2;
    case 'heroku': return 0.45;
    default: return 0.5;
  }
}

export const hostingSummary = (state) => {
  const h = hostingSlice(prodSlice(state));
  const id = effectivePlatform(state);
  return { platform: id, chosen: Boolean(h.platform), bill: id ? hostBill(id, loadOf(state, h)) : null, fit: hostFit(state, id), opsDebt: h.opsDebt, incidents: h.incidents, spikes: h.spikes, wasted: h.wasted, moves: h.moves.length, mrr: state.stripe ? mrr(state) : 0 };
};
