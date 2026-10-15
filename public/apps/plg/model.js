// Product-led growth engine ("Growth loops"). Pure and deterministic: rng(state) / hash draws only, no DOM.
//
// Research: docs/research/plg-email/p1-plg-levers.md. Each lever is a PRODUCT FEATURE built through the Product
// build queue (engineering hours, bugs on ship) and then CONFIGURED by the player (setup hours, quality choices).
// The same structure applies to every lever: hidden quality q in 0..1 from what the player configured, an effect
// that scales with q, a recurring weekly review that decays the effect when skipped, and a traceable cost for each
// bad choice (logMistake, functionId 'plg').
//
//  - limits:        trial/free to paid conversion lift (relative), annoyance churn, hard-paywall landing drop
//  - pql:           product-qualified leads handed to the CRM inbound queue with a hidden true fit
//  - invites/sharing/referral_prompt: viral K with a cycle time by product type, signups via acquire()
//  - templates/pseo/free_tool: slow organic traffic from pages, with a Google scaled-content demotion risk
//  - expansion:     extra monthly seat/tier expansion (NRR) with bill-shock risk
//  - instrument:    the dashboard; without it Insights shows only totals

import { clamp, rng, chance, round2, hash, poisson } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { hasProduct, landingConversion, trialConversion, ensureMarket, setModifier, marketDemand, productFactor } from '../../core/market.js';
import { activeSubs, trialingSubs, customerById, changePrice, cancel, ensureStripe } from '../../core/stripe.js';
import { logMistake, shrink, tierFromScore } from '../../core/operator.js';
import { productSlice, newFeature } from '../product/store.js';
import { VELOCITY, newFoundation } from '../product/build.js';
import { acquire, addVisitors, sampleCount } from '../growth/acquire.js';
import { addInboundLead } from '../sales/crm-api.js';
import { ORGANIC } from '../growth/params.js';
import { currentK } from '../growth/organicEngine.js';
import { ensureOrganic } from '../growth/organicEngine.js';
import { h01 } from '../lifecycle/model.js';
import { accessDay, accessK } from './access.js';
import { LEVERS, LEVER_ORDER, METERS, PQL_SIGNALS, PRODUCT_TYPES, PLG_PARAMS as PP, productType, clientFacing } from './params.js';

// ---- Slice ----
export function ensurePlg(state) {
  state.apps ??= {};
  const P = (state.apps.plg ??= {});
  P.levers ??= {};      // id -> { id, status: 'building'|'built'|'live', featureId, cfg, q, issues, liveDay, builtDay, missed, copy }
  P.pages ??= [];       // content pages (templates, pseo): { id, kind, born, unique, vol, top10, rate }
  P.seq ??= 0;
  P.seo ??= { until: null, siteMult: 1, pseoMult: 1, startDay: null, hits: 0, passed: 0 };
  P.pqls ??= [];        // { id, subId, customerId, email, contactId, companyId, inboundId, day, intent, fit, status }
  P.pqlSeen ??= {};
  P.validations ??= []; // { day, n, matchRate, closeRate, ... }
  P.events ??= [];
  P.daily ??= [];       // { day, viral, content, tool, pql, expansion }
  P.stats ??= { viral: 0, content: 0, tool: 0, pql: 0, expansionMrr: 0, expanded: 0, emails: 0, inviteComplaints: 0, toolUntil: null };
  P.mistakeDays ??= {};
  P.lastWeek ??= -1;
  return P;
}

const today = (state) => state.day ?? 0;
const pushEvent = (P, e) => { P.events.push(e); if (P.events.length > 300) P.events.splice(0, P.events.length - 300); };
export const leverDef = (id) => LEVERS[id];
export const getLever = (state, id) => ensurePlg(state).levers[id] ?? null;
const isLive = (state, id) => getLever(state, id)?.status === 'live';
const modelOk = (state, id) => LEVERS[id].models.includes(state.company?.model ?? 'smb');

/** Effect multiplier of a live lever: 0 when not live or killed by its feature flag, decays with skipped weekly reviews. */
export function leverFactor(state, id) {
  const l = getLever(state, id);
  if (!l || l.status !== 'live') return 0;
  const flag = (state.apps?.insights?.featureFlags ?? []).find((f) => f.key === `plg-${id}` && !f.removed);
  if (flag?.killed) return 0;
  return Math.max(PP.neglectFloor, Math.pow(PP.neglectDecay, l.missed ?? 0));
}

export function meterOptions(state) {
  return METERS[state.company?.model] ?? METERS.smb;
}

// ---- Copy lint (offline judge for the upgrade prompt; the UI may blend in an LLM read) ----
const PRESSURE = /(hurry|last chance|only today|expires? (in|soon)|don'?t miss|act now|limited[- ]time|countdown|\d+\s*(hours?|minutes?|mins?) left|final (hours|warning))/i;
const UNLOCK = /\b(unlock|includes?|adds?|get|gets|lets? you|raises?)\b/i;
const LIMIT_STATE = /(you'?ve (used|reached|hit)|reached (your|the)|hit (your|the)|of your \d|\d+ of \d+|out of credits|limit)/i;
const tokens = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4));
export function lintUpgradeCopy(text, state = null) {
  const t = String(text ?? '').trim();
  const w = t ? t.split(/\s+/).length : 0;
  const issues = [];
  let s = 0.3;
  if (!t) return { score: 0.1, words: 0, issues: ['No copy written: the default "Upgrade to Pro" screen converts like an average prompt at best.'] };
  if (w < 10) { s -= 0.15; issues.push('Too short to say what the next tier unlocks.'); }
  if (w > 70) { s -= 0.15; issues.push(`${w} words: an upgrade prompt is one screen, one reason, one button.`); }
  const feats = state ? (state.apps?.product?.features ?? []).filter((f) => f.status === 'shipped' && !f.system).flatMap((f) => [...tokens(f.title)]) : [];
  const lower = t.toLowerCase();
  const names = UNLOCK.test(t) && (/\d/.test(t) || feats.some((x) => lower.includes(x.slice(0, 6))));
  if (names) s += 0.3; else issues.push('Say exactly what the next tier unlocks, with a number or the feature name.');
  if (LIMIT_STATE.test(t)) s += 0.15; else issues.push('Say where they are against the limit ("You have used 9 of 10 projects").');
  if (PRESSURE.test(t)) { s -= 0.3; issues.push('Countdown or pressure language: it reads as a dark pattern and invites complaints.'); }
  if ((t.match(/upgrade/gi) ?? []).length > 3) { s -= 0.1; issues.push('"Upgrade" four times is a banner, not an explanation.'); }
  return { score: clamp(s + 0.2, 0.05, 1), words: w, issues };
}

// ---- PQL rule statistics (quadrature over a hidden intent distribution Beta(1,2): most accounts have low intent) ----
const intentGrid = Array.from({ length: 21 }, (_, i) => (i + 0.5) / 21);
const intentW = intentGrid.map((x) => 2 * (1 - x));
const intentWSum = intentW.reduce((a, b) => a + b, 0);
export function ruleStats(signals, minSignals = 1, { limitsLive = true } = {}) {
  const sigs = PQL_SIGNALS.filter((s) => signals.includes(s.id));
  if (!sigs.length) return { rate: 0, meanIntent: 0 };
  const need = clamp(minSignals, 1, sigs.length);
  let mass = 0, imass = 0;
  intentGrid.forEach((x, i) => {
    const ps = sigs.map((s) => (s.needs === 'limits' && !limitsLive ? 0 : s.p(x)));
    // P(at least `need` signals fire), independent given intent: dynamic programming over the count
    let dp = [1];
    for (const p of ps) { const nx = Array(dp.length + 1).fill(0); dp.forEach((v, k) => { nx[k] += v * (1 - p); nx[k + 1] += v * p; }); dp = nx; }
    const pm = dp.slice(need).reduce((a, b) => a + b, 0);
    mass += intentW[i] * pm; imass += intentW[i] * pm * x;
  });
  return { rate: mass / intentWSum, meanIntent: mass > 0 ? imass / mass : 0 };
}
export const meanIntentAll = intentGrid.reduce((a, x, i) => a + x * intentW[i], 0) / intentWSum; // ~0.33

// ---- Quality of each lever from its configuration (hidden effect driver) ----
function measuredBonus(state) { return isLive(state, 'instrument') ? 0.1 : 0; }

export function scoreLever(state, id, cfg = {}) {
  const issues = [], good = [];
  let q = 0;
  const add = (v, ok, goodText, badText) => { if (ok) { q += v; if (goodText) good.push(goodText); } else if (badText) issues.push(badText); };
  if (id === 'limits') {
    const m = meterOptions(state).find((x) => x[0] === cfg.meter);
    add(0.22, m?.[2], 'The meter tracks value, so paying more feels fair.', 'The meter is a cost proxy (storage, raw API calls) or unset: people pay for value, not for your bill.');
    if (!m?.[2]) q += 0.04;
    const w = Number(cfg.weeksToLimit) || 0;
    q += w >= 2 && w <= 4 ? 0.2 : w === 1 ? 0 : w <= 6 ? 0.1 : 0.02;
    if (w >= 2 && w <= 4) good.push('Active users hit the limit in weeks 2-4, after they have seen value.'); else if (w === 1) issues.push('A limit hit in week 1 asks for money before value is delivered.'); else issues.push('A limit most users never reach creates no upgrade pressure.');
    const pl = { after_success: 0.2, on_limit_hit: 0.16, on_signup: 0.06, every_login: 0 }[cfg.placement] ?? 0;
    q += pl;
    if (cfg.placement === 'every_login') issues.push('A prompt on every login trains people to dismiss it.');
    if (cfg.placement === 'after_success') good.push('The prompt follows a delivered outcome.');
    add(0.1, cfg.warn, 'Warns at 75% and 100% of the limit.', 'No warning before the limit: the block feels like a surprise.');
    add(0.1, cfg.smallerStep, 'Offers a smaller step next to the upgrade.', null);
    add(0.06, cfg.holdout, 'Holds out 10% so the lift is measured, not assumed.', 'No holdout: you cannot tell the prompt from seasonality.');
    const c = cfg.copyScore ?? lintUpgradeCopy(cfg.copy, state).score;
    q += 0.16 * c;
    if (c < 0.5) issues.push(...lintUpgradeCopy(cfg.copy, state).issues.slice(0, 2));
    if (cfg.exportBlocked) { q -= 0.3; issues.push('Blocking export or data access at the limit creates lock-in complaints and churn (GDPR Art. 20 covers data you provided).'); }
    if (cfg.countdown) { q -= 0.25; issues.push('Countdown timers and stacked promos are dark patterns and get reported.'); }
  } else if (id === 'pql') {
    const sigs = (cfg.signals ?? []).filter(Boolean);
    const rs = ruleStats(sigs, Number(cfg.minSignals) || 1, { limitsLive: isLive(state, 'limits') });
    const qrule = sigs.length ? clamp((rs.meanIntent - meanIntentAll) / 0.35, 0, 1) : 0;
    q += 0.5 * qrule;
    if (qrule > 0.6) good.push('The rule picks accounts that behave like buyers.'); else issues.push('The rule mostly picks accounts that look like everyone else (company domain, any signup). Reps burn time on students and hobbyists.');
    if (rs.rate > 0.6) issues.push('The rule matches most signups: a PQL queue that is everyone is not a queue.');
    q += { same_day: 0.2, two_day: 0.12, weekly: 0.03 }[cfg.sla] ?? 0;
    if (cfg.sla === 'weekly') issues.push('A weekly batch cools the lead: high-intent accounts need a same-day touch.');
    q += { offer: 0.15, pitch: 0.05, instant_all: 0 }[cfg.firstTouch] ?? 0;
    if (cfg.firstTouch === 'instant_all') issues.push('Every free user emailed within an hour feels like surveillance.');
    add(0.08, cfg.noticeDisclosed, 'The privacy notice covers usage-based outreach.', 'Contacting people from their product data needs a privacy notice (GDPR transparency).');
    const P = ensurePlg(state);
    const val = P.validations.at(-1);
    add(0.12, val && today(state) - val.day <= 45, 'Rule validated against closed deals recently.', 'The rule was never checked against which accounts actually closed.');
  } else if (id === 'invites') {
    q += { collab_moment: 0.35, settings: 0.1, contacts_import: 0.2 }[cfg.placement] ?? 0;
    if (cfg.placement === 'collab_moment') good.push('The invite appears where a second person is needed.'); else if (cfg.placement === 'settings') issues.push('An "invite friends" button in settings is reported as referrals and used by no one.'); else issues.push('Importing contacts and inviting automatically is the classic spam failure.');
    add(0.25, cfg.inviteeValue, 'The invitee gets value in the first session.', 'Invitees land on an empty signup: low accept rate and a longer cycle.');
    add(0.15, cfg.optIn, 'Each invite is a deliberate send.', 'Invites go out without per-recipient confirmation.');
    q += 0.15 * clamp(measuredBonus(state) / 0.1, 0, 1) + 0.1;
  } else if (id === 'sharing') {
    add(0.35, cfg.publicLinks, 'Shared outputs link back to the product.', 'No public pages: nothing for a viewer to follow.');
    add(0.25, cfg.cta, 'A signup call to action sits on shared pages.', 'Viewers see the output but have no next step.');
    q += { off: 0.05, subtle: 0.3, loud: 0.1 }[cfg.badge] ?? 0;
    if (cfg.badge === 'loud') issues.push(clientFacing(state) ? 'A large banner on client-facing work damages agency credibility; they leave.' : 'A loud banner trades goodwill for views.');
    add(0.1, cfg.removableOnPaid, 'The badge can be removed on paid plans.', null);
  } else if (id === 'referral_prompt') {
    q += { post_aha: 0.6, every_login: 0.2, on_failure: 0 }[cfg.trigger] ?? 0;
    if (cfg.trigger === 'on_failure') issues.push('Asking for referrals during a failed action or an outage earns one-star reviews.');
    if (cfg.trigger === 'every_login') issues.push('A prompt on every login annoys the people most likely to refer.');
    add(0.2, cfg.fraudChecks, 'Self-referrals are blocked.', 'No fraud checks: expect farmed rewards.');
    const O = state.apps?.organic?.referral;
    add(0.2, O?.enabled && O?.twoSided, 'Two-sided reward from the Organic program.', 'A one-sided or missing reward weakens the ask.');
  } else if (id === 'templates') {
    add(0.45, cfg.curated, 'Hand-made templates tied to real use cases.', 'Near-duplicate templates are thin pages.');
    q += 0.25 * clamp((Number(cfg.count) || 10) / 30, 0, 1.2);
    add(0.15, !cfg.community || cfg.moderation, null, 'Community templates auto-publish with no review: phishing, malware and trademark claims.');
    add(0.15, true);
  } else if (id === 'pseo') {
    q += { product_data: 0.5, public_data: 0.2, swapped_names: 0 }[cfg.dataSource] ?? 0;
    if (cfg.dataSource === 'swapped_names') issues.push('The same text with swapped keywords is the textbook scaled-content-abuse pattern.');
    add(0.2, cfg.review, 'A sample of pages was reviewed before publishing.', 'Nothing was reviewed before 100s of pages went live.');
    add(0.2, cfg.dataSource !== 'product_data' || cfg.anonymised, null, 'Publishing product data without aggregation and anonymisation is a privacy incident.');
    q += 0.1;
  } else if (id === 'free_tool') {
    add(0.2, cfg.methodShown, 'Shows its method and assumptions.', null);
    add(0.25, cfg.proprietaryData, 'Uses data nobody else has.', 'A generic calculator earns 2-3x less repeat traffic.');
    q += { detail_report: 0.25, none: 0.15, result: 0 }[cfg.gate] ?? 0;
    if (cfg.gate === 'result') issues.push('Gating the result kills the traffic SEO depends on.');
    add(0.2, cfg.mathReviewed, 'Formulas tested before launch.', 'Untested formulas: a wrong answer is a public correction.');
    add(0.1, cfg.disclaimer, null, 'No disclaimer on a tool that answers money questions.');
  } else if (id === 'expansion') {
    q += 0.06 * (cfg.triggers ?? []).length;
    add(0.2, cfg.showROI, 'The upgrade screen shows ROI in the customer\'s terms.', null);
    add(0.1, cfg.alertsToSales, 'Strong expansion signals alert a person.', null);
    add(0.15, cfg.oneClickDowngrade, 'One-click downgrade keeps trust.', 'Hiding the downgrade creates cancellations.');
    add(0.1, cfg.prorateAnnual, 'Annual upgrades are prorated.', null);
    if (cfg.surpriseOverage) { q -= 0.3; issues.push('Overages billed without a warning cause chargebacks and churn.'); }
    q += measuredBonus(state);
  } else if (id === 'instrument') {
    q = 1;
  }
  return { q: clamp(q, 0, 1), issues, good };
}

// ---- Product build: levers are features in the Product build queue ----
export function queueBuild(state, id) {
  const def = LEVERS[id];
  const P = ensurePlg(state);
  const fail = (error) => ({ ok: false, error, hoursCost: 0, usdCost: 0 });
  if (!def) return fail('unknown lever');
  if (!modelOk(state, id)) return fail(`${def.label} does not fit a ${state.company.model.toUpperCase()} product`);
  if (!hasProduct(state)) return fail('Ship a product first: growth loops amplify a product, they do not replace one.');
  if (P.levers[id]) return fail('already queued or built');
  for (const n of def.needs) if (!isLive(state, n)) return fail(`Needs ${LEVERS[n].label} first`);
  const slice = productSlice(state);
  const agentHours = Math.max(2, Math.round(def.effort / VELOCITY.estimateRef));
  const f = {
    ...newFeature(state), title: def.label.slice(0, 90), problem: def.blurb, solution: def.blurb, user: 'Trial and free users', status: 'queued',
    effortHours: def.effort, agentHours, progressHours: 0, system: true, plgLever: id, source: 'plg',
    grade: { pass: true, verdict: 'system', agentHours, day: state.day, source: 'growth lever' },
  };
  slice.features.push(f);
  slice.buildQueue.push(f.id);
  if (!slice.foundation && !slice.features.some((x) => x.status === 'shipped')) slice.foundation = newFoundation();
  P.levers[id] = { id, status: 'building', featureId: f.id, cfg: {}, q: null, issues: [], good: [], liveDay: null, builtDay: null, missed: 0, queuedDay: state.day };
  return { ok: true, featureId: f.id, hoursCost: 0, usdCost: 0 };
}

/** Called daily: a shipped feature turns its lever from 'building' into 'built' (ready to configure). */
export function syncBuilds(state) {
  const P = ensurePlg(state);
  const feats = productSlice(state).features;
  for (const l of Object.values(P.levers)) {
    if (l.status !== 'building') continue;
    const f = feats.find((x) => x.id === l.featureId);
    if (f?.status === 'shipped') {
      l.status = 'built'; l.builtDay = today(state);
      notify(state, `${LEVERS[l.id].label} is built. It does nothing until you configure and launch it in Growth loops.`, { type: 'good', app: 'plg' });
    }
  }
}

// ---- Configure and launch ----
export function setupHoursFor(state, id) {
  const def = LEVERS[id];
  const l = getLever(state, id);
  return l?.status === 'live' ? 0.5 : def.setup;
}

const FLAG_KEY = (id) => `plg-${id}`;
function registerFlag(state, id) {
  const ins = (state.apps.insights ??= {});
  ins.featureFlags ??= [];
  if (!ins.featureFlags.some((f) => f.key === FLAG_KEY(id))) ins.featureFlags.unshift({ id: `flag_plg_${id}`, key: FLAG_KEY(id), rollout: 100, status: 'released', experimentId: null, createdDay: today(state), releasedDay: today(state), removed: false, plg: true });
}

function maybePages(state, P, id, cfg) {
  if (id === 'templates' || id === 'pseo') {
    const kind = id;
    const want = Number(cfg.count ?? cfg.pages) || 0;
    const have = P.pages.filter((p) => p.kind === kind && !p.pruned).length;
    for (let i = have; i < want; i++) {
      const pid = `${kind}_${P.seq++}`;
      const baseUnique = kind === 'templates' ? (cfg.curated ? 0.85 : 0.25) : { product_data: 0.9, public_data: 0.5, swapped_names: 0.12 }[cfg.dataSource] ?? 0.3;
      const jitter = 0.9 + 0.2 * h01(`${state.seed}|${pid}|u`);
      const unique = clamp(baseUnique * jitter + (kind === 'pseo' && cfg.review ? 0.05 : 0), 0, 1);
      const [vmin, vmax] = kind === 'pseo' ? PP.pseoVol : [PP.page.volMin, PP.page.volMax];
      const vol = Math.exp(Math.log(vmin) + (Math.log(vmax) - Math.log(vmin)) * h01(`${state.seed}|${pid}|v`));
      const dr = Math.min(0.1, (state.apps?.organic?.dr ?? 2) * 0.01);
      const p10 = clamp(PP.page.p10Base + PP.page.p10Unique * unique * unique + dr, 0.02, 0.7);
      const top10 = h01(`${state.seed}|${pid}|t`) < p10;
      const ctr = top10 ? PP.page.ctrTop10 * (0.5 + h01(`${state.seed}|${pid}|c`)) : PP.page.ctrTail;
      P.pages.push({ id: pid, kind, born: today(state), unique: round2(unique), vol: Math.round(vol), top10, rate: (vol * ctr) / 30 });
    }
  }
}

/** Configure and launch (or edit) a lever. cfg is the form content. Returns { ok, error?, hoursCost, usdCost, quality }. */
export function configureLever(state, id, cfg = {}) {
  const P = ensurePlg(state);
  const l = P.levers[id];
  const def = LEVERS[id];
  const fail = (error) => ({ ok: false, error, hoursCost: 0, usdCost: 0 });
  if (!def) return fail('unknown lever');
  if (!l || l.status === 'building') return fail('Not built yet: queue the build in Product and ship it first.');
  if (def.requiresReferral && !state.apps?.organic?.referral?.enabled) return fail('Turn on the referral program in Organic first: prompts need a program to point at.');
  if (id === 'pql' && !(cfg.signals ?? []).length) return fail('Pick at least one signal.');
  const first = l.status === 'built';
  const hours = setupHoursFor(state, id) + (id === 'free_tool' && cfg.mathReviewed ? 3 : 0) + (id === 'templates' ? (cfg.curated ? 0.8 : 0.15) * (Number(cfg.count) || 10) : 0) + (id === 'pseo' && cfg.review ? Math.max(1, (Number(cfg.pages) || 50) / 100) : 0);
  const clean = { ...cfg };
  if (id === 'limits') clean.copyScore = cfg.copyScore ?? null;
  const sc = scoreLever(state, id, clean);
  Object.assign(l, { cfg: clean, q: round2(sc.q), issues: sc.issues, good: sc.good, status: 'live' });
  if (first) { l.liveDay = today(state); l.missed = 0; registerFlag(state, id); pushEvent(P, { id: `lever_live:${id}:${today(state)}`, type: 'lever_live', day: today(state), leverId: id }); }
  maybePages(state, P, id, clean);
  // Traceable trap logging: each bad choice has a cost the Scorecard can show.
  const trap = (tid, label, cost, detail, extra = {}) => logMistake(state, { functionId: 'plg', id: tid, label, app: 'plg', cost, detail, key: `${tid}:${id}:${today(state)}`, ...extra });
  if (id === 'limits') {
    if (clean.exportBlocked) trap('export_blocked', 'Export blocked at the usage limit', { reputation: 1, customers: 1, hours: 2 }, 'Users hit the limit and could not export their own data. Expect lock-in complaints, 90-day churn up 3-8% and a regulatory angle (GDPR Art. 20).', { delayed: true });
    if (clean.countdown) trap('countdown_dark_pattern', 'Countdown timers on the out-of-credits screen', { reputation: 1, hours: 1 }, 'Countdown and stacked-promo screens get screenshotted and reported.', { delayed: true });
    if (clean.placement === 'every_login') trap('prompt_every_login', 'Upgrade prompt on every login', { customers: 1 }, 'Prompting on every login trains people to dismiss it and annoys the accounts that would have upgraded.', { delayed: true });
  }
  if (id === 'invites' && (clean.placement === 'contacts_import' || clean.optIn === false)) trap('contact_import_invites', 'Invites sent from imported contacts without confirmation', { reputation: 1.5, hours: 2 }, 'Contact-import invite spam: signups jump, then complaints, a flagged sending domain and bad reviews follow.', { delayed: true });
  if (id === 'sharing' && clean.badge === 'loud' && clientFacing(state)) trap('loud_badge_client_work', 'Large banner on client-facing outputs', { customers: 1, reputation: 0.5 }, 'Agencies and consultants will not ship client work with your banner on it.', { delayed: true });
  if (id === 'pseo' && clean.dataSource === 'swapped_names') trap('thin_pseo_published', `Published ${clean.pages} near-identical pages`, { hours: 3, reputation: 0.5 }, 'Swapped-keyword pages are the pattern the next Google core update targets.', { delayed: true });
  if (id === 'pseo' && clean.dataSource === 'product_data' && !clean.anonymised) trap('pseo_privacy', 'Published product data without anonymising it', { usd: 1500, hours: 6, reputation: 1 }, 'Aggregated data must be anonymised with a privacy notice, or it becomes a GDPR incident.', { delayed: true, charge: true });
  if (id === 'pql' && clean.firstTouch === 'instant_all') trap('pql_instant_all', 'Sales email to every free user within an hour', { reputation: 1, customers: 1 }, 'Free users read an instant sales email as surveillance. Complaints hit the sending domain.', { delayed: true });
  if (id === 'templates' && clean.community && !clean.moderation) trap('unmoderated_templates', 'Community templates publish without review', { hours: 1 }, 'Auto-published user templates attract phishing and trademark claims.', { delayed: true });
  if (id === 'free_tool' && !clean.mathReviewed) trap('untested_tool_math', 'Free tool launched without testing the formulas', { hours: 1 }, 'A wrong answer on a public calculator becomes a public correction.', { delayed: true });
  return { ok: true, hoursCost: hours, usdCost: 0, quality: l.q, issues: l.issues, good: l.good };
}

/** Retire a live lever (removes its effect; the build stays shipped). */
export function retireLever(state, id) {
  const l = getLever(state, id);
  if (!l) return { ok: false, error: 'not found', hoursCost: 0, usdCost: 0 };
  l.status = 'built';
  return { ok: true, hoursCost: 0, usdCost: 0 };
}

// ---- Effects ----
export function limitsEffects(state) {
  const f = leverFactor(state, 'limits');
  const l = getLever(state, 'limits');
  if (!f || !l) return { conversion: 1, churn: 1, landing: 1, lift: 0 };
  const c = l.cfg ?? {};
  const q = clamp(l.q ?? 0, 0, 1);
  const L = PP.limitsLift;
  const hold = c.holdout ? 0.9 : 1;
  const lift = clamp(L.slope * (q - L.offset), L.min, L.max) * hold * f;
  const C = PP.limitsChurn;
  const churn = 1 + (c.exportBlocked ? C.exportBlocked : 0) + (c.countdown ? C.countdown : 0) + (c.placement === 'every_login' ? C.everyLogin : 0) + (Number(c.weeksToLimit) === 1 ? C.week1 : 0);
  const hard = c.placement === 'on_signup';
  return { conversion: round2((1 + lift) * (hard ? PP.hardPaywall.conversion : 1) * 1000) / 1000 || 1, churn: round2(churn * 1000) / 1000, landing: hard ? PP.hardPaywall.landing : 1, lift };
}

export function viralCycleDays(state) {
  const t = PRODUCT_TYPES[productType(state)];
  const c = getLever(state, 'invites')?.cfg ?? {};
  return Math.round(t.cycleDays * (c.inviteeValue ? 0.7 : 1) * (c.placement === 'settings' ? 1.3 : 1) * (c.placement === 'contacts_import' ? 0.8 : 1));
}

/** Viral K breakdown (lifetime paying customers per paying customer from invites, shared outputs and referral prompts). */
export function plgK(state) {
  const type = PRODUCT_TYPES[productType(state)];
  const pf = clamp(productFactor(state), 0.5, 1.4);
  const out = { invites: 0, sharing: 0, referral: 0, access: 0, total: 0, capped: 0, cycleDays: viralCycleDays(state), type: productType(state) };
  const inv = getLever(state, 'invites');
  const fi = leverFactor(state, 'invites');
  if (inv && fi) {
    const q = inv.q ?? 0;
    out.invites = (type.invitesK[0] + (type.invitesK[1] - type.invitesK[0]) * q) * pf * fi * (inv.cfg?.placement === 'contacts_import' ? PP.contactImportK : 1);
  }
  const sh = getLever(state, 'sharing');
  const fs = leverFactor(state, 'sharing');
  if (sh && fs) {
    const c = sh.cfg ?? {};
    const share = c.publicLinks ? type.shareK * (c.cta ? 1 : 0.4) : 0;
    const badge = { off: 0, subtle: type.badgeK, loud: type.badgeK * PP.badge.loudMult }[c.badge] ?? 0;
    out.sharing = (share + badge) * pf * fs;
  }
  const rp = getLever(state, 'referral_prompt');
  const fr = leverFactor(state, 'referral_prompt');
  const O = state.apps?.organic?.referral;
  if (rp && fr && O?.enabled) {
    const r = ORGANIC.referral[O.reward] ?? ORGANIC.referral.credit;
    const boost = r.boost * (O.twoSided ? 1 : ORGANIC.referral.oneSidedFactor) * Math.sqrt(clamp(productFactor(state), 0.2, 1.75));
    const mult = (PP.referralPrompt[rp.cfg?.trigger] ?? 1) * (0.85 + 0.15 * (rp.q ?? 0.5) / 0.6);
    out.referral = Math.max(0, boost * (mult - 1)) * fr;
  }
  out.access = accessK(state);
  out.total = out.invites + out.sharing + out.referral + out.access;
  out.capped = Math.max(0, Math.min(out.total, PP.K_TOTAL_CAP - currentK(state)));
  return out;
}

export function expansionRate(state) {
  const l = getLever(state, 'expansion');
  const f = leverFactor(state, 'expansion');
  if (!l || !f) return 0;
  return (PP.expansionBase + PP.expansionPerQ * (l.q ?? 0)) * f;
}

// ---- Daily engine ----
function chargeWeekly(state, hours) {
  const f = state.founder;
  const left = Math.max(0, f.hoursPerWeek - f.hoursUsed);
  const h = round2(Math.min(hours, left));
  if (h <= 0) return false;
  f.hoursUsed += h;
  (f.timeLog ??= []).push({ day: today(state), hours: h, label: 'Growth loops weekly review' });
  return h >= hours - 1e-9;
}

function weeklyReview(state, P) {
  for (const l of Object.values(P.levers)) {
    if (l.status !== 'live') continue;
    const ok = chargeWeekly(state, LEVERS[l.id].weekly);
    if (ok) l.missed = Math.max(0, (l.missed ?? 0) - 1);
    else {
      l.missed = (l.missed ?? 0) + 1;
      if (l.missed === 4) logMistake(state, { functionId: 'plg', id: 'lever_unreviewed', label: `${LEVERS[l.id].label} left unreviewed for a month`, app: 'plg', cost: { usd: 0, customers: 1 }, delayed: true, detail: 'Live levers decay without the weekly review: stale prompts, unmoderated templates, dead pages and drifting PQL rules.', key: `unreviewed:${l.id}:${Math.floor(today(state) / 60)}` });
    }
  }
}

function monday(state) { return (today(state) % 7) === 1 || (state.startDate && new Date(Date.parse(state.startDate + 'T12:00:00Z') + today(state) * 86400000).getUTCDay() === 1); }

function convertVisits(state, source, visits, mult) {
  const v = sampleCount(state, visits);
  if (!v) return 0;
  addVisitors(state, v);
  const n = Math.min(v, sampleCount(state, v * landingConversion(state) * mult));
  if (n) acquire(state, { source, n });
  return n;
}

function pageVisits(state, P, kinds) {
  const seoDemand = Math.pow(marketDemand(state), 0.8);
  const penalty = P.seo.until != null && today(state) < P.seo.until ? P.seo : null;
  let total = 0;
  for (const p of P.pages) {
    if (p.pruned || !kinds.includes(p.kind)) continue;
    const age = today(state) - p.born;
    const ramp = clamp(age / PP.page.rampDays, 0, 1);
    const k = p.kind === 'pseo' ? (penalty?.pseoMult ?? 1) : (penalty?.siteMult ?? 1);
    total += p.rate * ramp * seoDemand * k;
  }
  const lv = kinds.includes('templates') ? leverFactor(state, 'templates') : 1;
  const lp = kinds.includes('pseo') ? leverFactor(state, 'pseo') : 1;
  return total * Math.max(kinds.length === 1 ? (kinds[0] === 'templates' ? lv : lp) : 1, 0);
}

function toolVisits(state, P) {
  const l = getLever(state, 'free_tool');
  const f = leverFactor(state, 'free_tool');
  if (!l || !f) return { visits: 0, signupRate: 0 };
  const q = l.q ?? 0;
  const ramp = clamp((today(state) - (l.liveDay ?? today(state))) / PP.tool.rampDays, 0, 1);
  const broken = P.stats.toolUntil != null && today(state) < P.stats.toolUntil ? 0.5 : 1;
  const penalty = P.seo.until != null && today(state) < P.seo.until ? P.seo.siteMult : 1;
  const visits = (PP.tool.baseVisits + PP.tool.qualityVisits * q) * ramp * Math.pow(marketDemand(state), 0.8) * f * broken * penalty;
  return { visits, signupRate: PP.tool.signupBase + PP.tool.signupQuality * q };
}

function tutorialsCoreUpdate(state, P) {
  // Exogenous Google core updates: hash schedule from the seed, so every player of a seed meets the same updates (no rng draw).
  const rate = PP.core.updatesPerYear / 365;
  if (h01(`gcore|${state.seed}|${today(state)}`) >= rate) return;
  const pseo = P.pages.filter((p) => p.kind === 'pseo' && !p.pruned);
  P.seo.lastUpdate = today(state);
  if (pseo.length < 50) return;
  const thin = pseo.filter((p) => p.unique < PP.page.thinBelow).length / pseo.length;
  const unique = pseo.reduce((a, p) => a + p.unique, 0) / pseo.length;
  if (thin >= 0.4 || (pseo.length >= 500 && unique < 0.5)) {
    if (h01(`gpen|${state.seed}|${today(state)}`) < PP.core.thinPenaltyChance) {
      P.seo = { ...P.seo, startDay: today(state), until: today(state) + PP.core.penaltyDays, siteMult: PP.core.penaltySite, pseoMult: PP.core.penaltyPseo, hits: (P.seo.hits ?? 0) + 1 };
      const monthlyVisits = pageVisits(state, { ...P, seo: { until: null } }, ['pseo', 'templates']) * 30;
      pushEvent(P, { id: `seo_penalty:${today(state)}`, type: 'seo_penalty', day: today(state), pages: pseo.length, thinShare: round2(thin) });
      notify(state, `A Google core update demoted your programmatic pages (${Math.round(thin * 100)}% thin). Programmatic traffic is down ~90% and the whole site's organic traffic ~40% for months. Prune the thin pages.`, { type: 'bad', app: 'plg' });
      logMistake(state, { functionId: 'plg', id: 'thin_pseo_demoted', label: 'Thin programmatic pages demoted by a Google core update', app: 'plg', cost: { usd: Math.round(monthlyVisits * 0.02 * 40 * 5), customers: Math.round(monthlyVisits * 0.02 * 5), hours: 12, reputation: 1, days: PP.core.penaltyDays }, circles: true, delayed: true, detail: `${pseo.length} pages, ${Math.round(thin * 100)}% below the uniqueness bar. Cleanup means pruning and rewriting, and the organic recovery waits for a later update.`, charge: true, key: `thin_pseo:${today(state)}` });
      return;
    }
  }
  P.seo.passed = (P.seo.passed ?? 0) + 1;
}

/** Remove the weakest half of programmatic pages (spot the thin ones). Returns { ok, removed, hoursCost }. */
export function prunePages(state, { kind = 'pseo', dryRun = false } = {}) {
  const P = ensurePlg(state);
  const pages = P.pages.filter((p) => p.kind === kind && !p.pruned).sort((a, b) => (a.rate * (a.unique + 0.1)) - (b.rate * (b.unique + 0.1)));
  const n = Math.floor(pages.length / 2);
  if (!n) return { ok: false, error: 'nothing to prune', hoursCost: 0, usdCost: 0 };
  if (!dryRun) {
    for (const p of pages.slice(0, n)) p.pruned = true;
    if (P.seo.until != null && today(state) < P.seo.until) P.seo.until = today(state) + Math.round((P.seo.until - today(state)) * 0.6);
  }
  return { ok: true, removed: n, hoursCost: 1.5, usdCost: 0 };
}

function viralDay(state, P) {
  const k = plgK(state);
  if (k.capped <= 0) return 0;
  const subs = activeSubs(state);
  if (!subs.length) return 0;
  const early = Math.max(14, 2 * k.cycleDays);
  let weighted = 0;
  for (const s of subs) { const t = today(state) - s.startDay; weighted += t < early ? 1 / early : 0.1 / 365; }
  const mean = (weighted * k.capped * Math.pow(marketDemand(state), 0.3)) / Math.max(0.15, trialConversion(state));
  const n = sampleCount(state, mean);
  if (n > 0) {
    const g = acquire(state, { source: 'organic:viral', n, convMult: PP.viralConvMult });
    P.stats.viral += g.subs.length + g.leads;
    // invites are product email: complaints hit the sending stream (see emailops)
    const inv = getLever(state, 'invites');
    if (inv?.cfg && (inv.cfg.placement === 'contacts_import' || inv.cfg.optIn === false)) {
      const sent = n / 0.1;
      const complaints = sent * PP.contactImportComplaint;
      P.stats.inviteComplaints += complaints;
      P.stats.emails += sent;
      P.inviteComplaintWindow = (P.inviteComplaintWindow ?? []).filter((x) => x.day > today(state) - 30);
      P.inviteComplaintWindow.push({ day: today(state), sent, complaints });
      state.apps.transactional ??= null;
      const T = state.apps.transactional;
      if (T) { T.pendingStream = T.pendingStream ?? []; T.pendingStream.push({ stream: 'transactional', sent, complaints, bounces: 0 }); }
      const c30 = P.inviteComplaintWindow.reduce((a, x) => a + x.complaints, 0);
      if (c30 >= 3) logMistake(state, { functionId: 'plg', id: 'invite_spam', label: 'Invite emails marked as spam', app: 'plg', cost: { reputation: 1.5, hours: 2, customers: 1 }, delayed: true, charge: true, detail: `About ${Math.round(c30)} complaints in 30 days from invites sent to people who did not ask. Complaints land on the product's sending domain, next to login codes.`, key: `invite_spam:${Math.floor(today(state) / 30)}` });
    }
  }
  return n;
}

function pqlDay(state, P) {
  const l = getLever(state, 'pql');
  const f = leverFactor(state, 'pql');
  if (!l || !f || state.company.model === 'b2c') return;
  const c = l.cfg ?? {};
  const st = ensureStripe(state);
  const sigs = c.firstTouch === 'instant_all' ? ['any_signup'] : (c.signals ?? []);
  const need = c.firstTouch === 'instant_all' ? 1 : (Number(c.minSignals) || 1);
  let touched = 0;
  for (const s of st.subscriptions) {
    if (s.startDay > today(state) - 4 || s.startDay < today(state) - 14 || P.pqlSeen[s.id]) continue;
    if (s.status === 'canceled' && !s.firstPaidDay) continue;
    P.pqlSeen[s.id] = 1;
    const intent = Math.pow(h01(`${state.seed}|${s.id}|intent`), 2); // skewed low: most accounts will never buy a team plan
    const fired = PQL_SIGNALS.filter((sg) => sigs.includes(sg.id) && !(sg.needs === 'limits' && !isLive(state, 'limits')) && h01(`${state.seed}|${s.id}|${sg.id}`) < sg.p(intent)).length;
    if (c.firstTouch === 'instant_all') touched++;
    if (fired < Math.min(need, sigs.length)) continue;
    const cu = customerById(state, s.customerId);
    if (!cu) continue;
    const domain = (cu.email ?? '').split('@')[1] ?? '';
    const fit = clamp((0.2 + 0.7 * intent) * (PP.slaMult[c.sla] ?? 1) * f, 0.03, 0.95);
    const contact = addInboundLead(state, { name: cu.name, email: cu.email, company: cu.company || domain.split('.')[0] || 'Unknown', domain, title: state.company.model === 'ent' ? 'Team lead' : 'Owner', source: 'plg:pql', fit, note: `Product-qualified lead (${sigs.map((x) => PQL_SIGNALS.find((y) => y.id === x)?.label).filter(Boolean).slice(0, 3).join('; ')}). On a ${s.status === 'trialing' ? 'trial' : 'paid plan'} since day ${s.startDay}. Team or annual upgrade opportunity.` });
    if (!contact) continue;
    const queued = state.apps.crm?.inboundQueue?.find((q) => q.contactId === contact.id && q.status === 'new');
    P.pqls.push({ id: `pql_${P.pqls.length}`, subId: s.id, customerId: s.customerId, email: cu.email, contactId: contact.id, companyId: contact.companyId, inboundId: queued?.id ?? null, day: today(state), intent: round2(intent), fit: round2(fit), status: 'open' });
    P.stats.pql++;
    pushEvent(P, { id: `pql_created:${s.id}`, type: 'pql_created', day: today(state), subId: s.id, customerId: s.customerId, inboundId: queued?.id ?? null, contactId: contact.id, companyId: contact.companyId, email: cu.email, fit: round2(fit) });
  }
  if (c.firstTouch === 'instant_all' && touched >= 5) {
    P.stats.surveil = (P.stats.surveil ?? 0) + touched;
    setModifier(state, 'conversion', 'plg-pql-surveillance', PP.pqlSurveillanceConv);
    logMistake(state, { functionId: 'plg', id: 'pql_blanket_email', label: 'Sales emailed every free user', app: 'plg', cost: { reputation: 0.5, customers: touched * 0.03, hours: touched * 0.05 }, delayed: true, charge: true, detail: `${touched} free users got a sales email within an hour of signing up; a few replied angrily and some stopped using the product.`, key: `blanket:${Math.floor(today(state) / 14)}` });
  }
  // close tracking from the CRM
  const crm = state.apps.crm;
  if (crm) {
    for (const p of P.pqls) {
      if (p.status !== 'open') continue;
      const deal = (crm.deals ?? []).find((d) => d.companyId === p.companyId && (d.stage === 'won' || d.stage === 'lost'));
      if (!deal) continue;
      p.status = deal.stage; p.closedDay = today(state);
      if (deal.stage === 'won') {
        const sub = st.subscriptions.find((x) => x.id === p.subId);
        if (sub && sub.status === 'trialing') { try { cancel(state, sub.id, { atPeriodEnd: false, reason: 'upgraded_by_sales' }); } catch { /* already gone */ } }
      }
    }
  }
}

function incidents(state, P) {
  const mk = (id, payload) => {
    if (P.mistakeDays[id] != null && today(state) - P.mistakeDays[id] < 30) return;
    P.mistakeDays[id] = today(state);
    logMistake(state, { functionId: 'plg', app: 'plg', id, ...payload });
  };
  const monthStart = today(state) % 30 === 0;
  // free tool with untested maths: a public correction
  const tool = getLever(state, 'free_tool');
  if (tool?.status === 'live' && !tool.cfg?.mathReviewed && monthStart && chance(state, PP.tool.wrongMathPerMonth)) {
    P.stats.toolUntil = today(state) + 60;
    mk('wrong_tool_math', { label: 'The free tool gave wrong answers in public', cost: { usd: tool.cfg?.disclaimer ? 400 : 1600, reputation: 1, hours: 3 }, charge: true, delayed: true, detail: tool.cfg?.disclaimer ? 'A user posted a worked counterexample. You corrected the formula; traffic fell while the thread was live.' : 'A user posted a wrong result and a lawyer-ish reply. No disclaimer on a tool that answers money questions.' });
  }
  // community templates with no review: phishing/trademark
  const tp = getLever(state, 'templates');
  if (tp?.status === 'live' && tp.cfg?.community && !tp.cfg?.moderation && monthStart && chance(state, 0.15)) mk('template_abuse', { label: 'A community template was a phishing page', cost: { usd: 1200, reputation: 2, hours: 4 }, charge: true, delayed: true, detail: 'An auto-published user template impersonated a bank login. Takedown, a registrar complaint and a public thread.' });
  // limits: export blocked -> billing/lock-in tickets
  const lim = getLever(state, 'limits');
  const sup = state.apps.support;
  if (lim?.status === 'live' && sup?.active && Array.isArray(sup.queue)) {
    const trials = trialingSubs(state).length;
    const n = lim.cfg?.exportBlocked ? trials * 0.04 : lim.cfg?.countdown || lim.cfg?.placement === 'every_login' ? trials * 0.015 : 0;
    const t = sampleCount(state, n);
    if (t > 0) sup.queue.push({ day: today(state), n: t, source: 'plg_prompt' });
  }
  // expansion: surprise overage -> billing tickets and chargebacks
  const ex = getLever(state, 'expansion');
  if (ex?.status === 'live' && ex.cfg?.surpriseOverage && sup?.active && Array.isArray(sup.queue)) {
    const t = sampleCount(state, activeSubs(state).length * 0.006);
    if (t > 0) sup.queue.push({ day: today(state), n: t, source: 'plg_overage' });
  }
}

/** The daily engine (called from the Growth loops app's onDay). */
export function plgDay(state) {
  const P = ensurePlg(state);
  syncBuilds(state);
  accessDay(state);
  if (!Object.keys(P.levers).length) return;
  if (monday(state) && P.lastWeek !== Math.floor(today(state) / 7)) { P.lastWeek = Math.floor(today(state) / 7); weeklyReview(state, P); }
  if (!hasProduct(state)) return;
  ensureMarket(state);
  // limits: conversion lift, annoyance churn, hard-paywall landing drop
  const e = limitsEffects(state);
  setModifier(state, 'conversion', 'plg-limits', Math.abs(e.conversion - 1) > 0.002 ? e.conversion : null);
  setModifier(state, 'churn', 'plg-limits', e.churn > 1.002 ? e.churn : null);
  setModifier(state, 'landing', 'plg-limits', e.landing !== 1 ? e.landing : null);
  const sh = getLever(state, 'sharing');
  setModifier(state, 'churn', 'plg-badge', sh?.status === 'live' && sh.cfg?.badge === 'loud' && leverFactor(state, 'sharing') ? (clientFacing(state) ? PP.badge.loudChurn * 1.03 : PP.badge.loudChurn) : null);
  const pq = getLever(state, 'pql');
  if (!(pq?.status === 'live' && pq.cfg?.firstTouch === 'instant_all')) setModifier(state, 'conversion', 'plg-pql-surveillance', null);
  const row = { day: today(state), viral: 0, content: 0, tool: 0, pql: P.pqls.length };
  // viral loop
  row.viral = viralDay(state, P);
  // content traffic
  const tv = pageVisits(state, P, ['templates']);
  if (tv > 0) row.content += convertVisits(state, 'organic:template', tv, PP.convVisitMult.templates);
  const pv = pageVisits(state, P, ['pseo']);
  if (pv > 0) row.content += convertVisits(state, 'organic:pseo', pv, PP.convVisitMult.pseo);
  P.stats.content += row.content;
  // free tool: visitors to signups; the gated report also feeds the owned list
  const t = toolVisits(state, P);
  if (t.visits > 0) {
    const v = sampleCount(state, t.visits);
    if (v) {
      addVisitors(state, v);
      const n = Math.min(v, sampleCount(state, v * t.signupRate * Math.min(1.5, landingConversion(state) / 0.04)));
      if (n) { acquire(state, { source: 'organic:tool', n }); row.tool = n; P.stats.tool += n; }
      const gate = getLever(state, 'free_tool')?.cfg?.gate;
      if (gate === 'detail_report' || gate === 'result') {
        const subs = Math.round(v * (gate === 'result' ? PP.tool.gatedCapture * 2 : PP.tool.gatedCapture));
        if (subs > 0) P.toolEmails = (P.toolEmails ?? 0) + subs;
      }
    }
  }
  pqlDay(state, P);
  incidents(state, P);
  tutorialsCoreUpdate(state, P);
  P.daily.push(row);
  if (P.daily.length > 400) P.daily.shift();
}

/** Monthly expansion on top of the Pricing app's model. */
export function plgMonthEnd(state) {
  const P = ensurePlg(state);
  const rate = expansionRate(state);
  if (!rate) return;
  const pricingModel = state.apps?.pricing?.model ?? 'flat';
  const surprise = getLever(state, 'expansion')?.cfg?.surpriseOverage;
  for (const sub of activeSubs(state)) {
    if (sub.interval !== 'month' || !chance(state, rate)) continue;
    const before = (sub.price ?? 0) * (sub.quantity ?? 1);
    try {
      if (pricingModel === 'flat' && !sub.plgUpgraded) { changePrice(state, sub.id, { price: round2((sub.price ?? 0) * 1.4) }); sub.plgUpgraded = true; }
      else changePrice(state, sub.id, { quantity: (sub.quantity ?? 1) + 1 });
    } catch { continue; }
    P.stats.expanded++;
    P.stats.expansionMrr = round2(P.stats.expansionMrr + Math.max(0, (sub.price ?? 0) * (sub.quantity ?? 1) - before));
  }
  if (surprise) {
    const shock = Math.round(activeSubs(state).length * 0.02);
    if (shock > 0) logMistake(state, { functionId: 'plg', id: 'bill_shock', label: 'Overage billed without a warning', app: 'plg', cost: { usd: shock * 30, customers: shock * 0.5, reputation: 0.5 }, delayed: true, detail: `${shock} accounts were charged overage with no warning: refunds, chargebacks and cancellations.`, key: `bill_shock:${Math.floor(today(state) / 30)}` });
    setModifier(state, 'churn', 'plg-expansion', 1.04);
  } else setModifier(state, 'churn', 'plg-expansion', null);
}

// ---- Validation of the PQL rule against closed deals (the stellar habit) ----
export function validatePql(state) {
  const P = ensurePlg(state);
  const closed = P.pqls.filter((p) => p.status !== 'open');
  const won = closed.filter((p) => p.status === 'won').length;
  const closeRate = P.pqls.length ? won / P.pqls.length : null;
  const intentWon = closed.filter((p) => p.status === 'won').map((p) => p.intent);
  const v = { day: today(state), n: P.pqls.length, closed: closed.length, won, closeRate, meanIntentWon: intentWon.length ? round2(intentWon.reduce((a, b) => a + b, 0) / intentWon.length) : null, lowSample: closed.length < 8 };
  P.validations.push(v);
  return { ok: true, validation: v, hoursCost: 1, usdCost: 0 };
}

// ---- Metrics (Insights shows these) ----
export function plgMetrics(state) {
  const P = ensurePlg(state);
  const st = ensureStripe(state);
  const t = today(state);
  const instrumented = isLive(state, 'instrument');
  const subs30 = st.subscriptions.filter((s) => s.startDay > t - 30);
  const PLG_SRC = /^(organic:(viral|template|pseo|tool)|referral|plg)/;
  const plgSubs = subs30.filter((s) => PLG_SRC.test(String(s.source)));
  const trialCohort = st.subscriptions.filter((s) => s.trialEndDay != null && s.trialEndDay <= t - 1 && s.startDay > t - 90);
  const converted = trialCohort.filter((s) => s.firstPaidDay != null);
  const ins = state.apps?.insights?.daily?.filter((d) => d.day > t - 30) ?? [];
  const signups = ins.reduce((a, d) => a + d.signups, 0), activated = ins.reduce((a, d) => a + d.activated, 0);
  const k = plgK(state);
  const comp = state.apps?.lifecycle?.complaintRate30 ?? null;
  const pqlStats = { handed: P.pqls.length, open: P.pqls.filter((p) => p.status === 'open').length, won: P.pqls.filter((p) => p.status === 'won').length, lost: P.pqls.filter((p) => p.status === 'lost').length };
  const lim = getLever(state, 'limits');
  const ee = limitsEffects(state);
  return {
    instrumented,
    signups30: subs30.length,
    activation: instrumented && signups ? activated / signups : null,
    freeToPaid: instrumented && trialCohort.length >= 10 ? converted.length / trialCohort.length : null,
    freeToPaidN: trialCohort.length,
    pqlRate: instrumented && subs30.length ? P.pqls.filter((p) => p.day > t - 30).length / subs30.length : null,
    pql: pqlStats,
    pqlCloseRate: pqlStats.won + pqlStats.lost >= 5 ? pqlStats.won / (pqlStats.won + pqlStats.lost) : null,
    plgShare: instrumented && subs30.length ? plgSubs.length / subs30.length : null,
    kModel: k, kMeasured: instrumented ? measuredK(state) : null,
    spamRate: comp,
    limitsLiftMeasured: instrumented && lim?.status === 'live' && lim.cfg?.holdout ? round2((ee.lift + (h01(`${state.seed}|holdout|${Math.floor(t / 14)}`) - 0.5) * 0.08) * 1000) / 1000 : null,
    expansionMrr: P.stats.expansionMrr, viral: P.stats.viral, content: P.stats.content, tool: P.stats.tool,
    seoPenalty: P.seo.until != null && t < P.seo.until ? { until: P.seo.until } : null,
  };
}
function measuredK(state) {
  const st = ensureStripe(state);
  const t = today(state);
  const viral = st.subscriptions.filter((s) => s.startDay > t - 90 && /^organic:viral|^referral/.test(String(s.source)) && s.firstPaidDay != null).length;
  const base = Math.max(1, activeSubs(state).length);
  return round2(viral / base * (30 / 90) * Math.max(1, viralCycleDays(state) / 30) * 3);
}

// ---- Automations exposure ----
export function plgEvents(state, sinceDay = today(state) - 1) {
  return (state.apps?.plg?.events ?? []).filter((e) => e.day >= sinceDay);
}
export const PLG_ACTIONS = {
  queue_lever_build(state, { leverId } = {}, { dryRun = false } = {}) {
    if (dryRun) { const l = LEVERS[leverId]; return l ? { ok: true, hoursCost: 0, usdCost: 0 } : { ok: false, error: 'unknown lever', hoursCost: 0, usdCost: 0 }; }
    return queueBuild(state, leverId);
  },
  prune_pages(state, { kind = 'pseo' } = {}, { dryRun = false } = {}) {
    const r = prunePages(state, { kind, dryRun });
    return r.ok ? { ok: true, hoursCost: r.hoursCost, usdCost: 0, removed: r.removed } : r;
  },
  toggle_lever(state, { leverId, on = true } = {}, { dryRun = false } = {}) {
    const f = (state.apps?.insights?.featureFlags ?? []).find((x) => x.key === `plg-${leverId}` && !x.removed);
    if (!f) return { ok: false, error: 'lever has no flag (not live)', hoursCost: 0, usdCost: 0 };
    if (!dryRun) { f.rollout = on ? 100 : 0; f.killed = !on; }
    return { ok: true, hoursCost: 0, usdCost: 0 };
  },
  validate_pql_rule(state, _a, { dryRun = false } = {}) {
    if (!isLive(state, 'pql')) return { ok: false, error: 'PQL lever is not live', hoursCost: 0, usdCost: 0 };
    return dryRun ? { ok: true, hoursCost: 1, usdCost: 0 } : validatePql(state);
  },
};

// ---- Operator read (functionId 'plg') ----
export function plgOperatorRead(state) {
  const P = state.apps?.plg;
  const live = P ? Object.values(P.levers).filter((l) => l.status === 'live') : [];
  if (!live.length) return { tier: 'unknown', evidence: [], coaching: ['Pick the lever that matches your time-to-aha and build one at a time. Define the activation event before you add prompts.'] };
  const m = plgMetrics(state);
  const q = live.reduce((a, l) => a + (l.q ?? 0), 0) / live.length;
  const evidence = [`${live.length} lever(s) live, mean configuration quality ${Math.round(q * 100)}%`];
  let raw = q;
  const mistakes = (state.mistakes ?? []).filter((x) => x.functionId === 'plg');
  raw -= Math.min(0.3, mistakes.length * 0.06);
  const neglected = live.filter((l) => (l.missed ?? 0) >= 2).length;
  if (neglected) { raw -= 0.08 * neglected; evidence.push(`${neglected} lever(s) skipped their weekly review`); }
  if (m.instrumented) { raw += 0.06; evidence.push('Instrumented: you can read activation, free-to-paid and K'); } else { raw -= 0.08; evidence.push('No instrumentation: you steer by total signups'); }
  if (getLever(state, 'limits')?.cfg?.holdout) { raw += 0.05; evidence.push('Limit prompts measured against a holdout'); }
  const val = P.validations.at(-1);
  if (live.some((l) => l.id === 'pql')) evidence.push(val ? `PQL rule validated on day ${val.day}` : 'PQL rule never validated against closed deals');
  if (mistakes.length) evidence.push(`${mistakes.length} growth mistake(s) logged: ${[...new Set(mistakes.map((x) => x.label))].slice(0, 2).join('; ')}`);
  const score = shrink(clamp(raw, 0, 1), live.length * 3, 0.5, 3);
  const tier = tierFromScore(score);
  const coaching = [];
  for (const l of live) for (const i of (l.issues ?? []).slice(0, 1)) coaching.push(`${LEVERS[l.id].label}: ${i}`);
  if (!m.instrumented) coaching.push('Build the instrumentation first: activation, PQL rate, free-to-paid by cohort and K. Opens and total signups mislead.');
  if (tier !== 'stellar') coaching.push('What a stellar operator does: finds the activation event, sets the limit where active users hit it in weeks 2-4, prompts after a success moment, measures lift with a holdout, and validates the PQL rule against closed deals.');
  return { tier, score: round2(score), raw: round2(clamp(raw, 0, 1)), n: live.length, evidence, coaching: [...new Set(coaching)] };
}

export { LEVERS, LEVER_ORDER };
