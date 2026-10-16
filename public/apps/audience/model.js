// Owned audience: waitlist, newsletter, signup forms and lead magnets, consent, hygiene, growth tactics, conversion to
// customers and sponsorship revenue. Cohort-level (no per-person records), deterministic (rng(state) / hashes).
// founder.network.newsletter is kept equal to the active list size, so every channel that reads the founder's email
// audience (Organic network launch, Channels, inbound archetypes) sees the list you actually built.
//
// Research: docs/research/plg-email/p3-lists-newsletters.md. Tags: [design] game estimate, [vendor] vendor claim.

import { clamp, rng, chance, round2, poisson } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake, shrink, tierFromScore } from '../../core/operator.js';
import { hasProduct, landingConversion, productFactor } from '../../core/market.js';
import { acquire, visitors30, sampleCount } from '../growth/acquire.js';
import { h01 } from '../lifecycle/model.js';

// ---- Platforms (prices are [design] placeholders around public creator-tool pricing; the game says "check the vendor") ----
export const PLATFORMS = {
  kit: { label: 'Kit (creator email)', referrals: false, tiers: [{ max: 1000, price: 0 }, { max: 3000, price: 39 }, { max: 5000, price: 79 }, { max: 10000, price: 119 }, { max: 25000, price: 199 }, { max: Infinity, price: 399 }], note: 'Free to 1,000. Forms, sequences and tagging built in. [design] prices' },
  beehiiv: { label: 'beehiiv', referrals: true, referralFee: 39, tiers: [{ max: 2500, price: 0 }, { max: 10000, price: 49 }, { max: 25000, price: 99 }, { max: Infinity, price: 199 }], note: 'Referral program and recommendations network; the referral program sits on a paid plan (about $39 a month [unverified]).' },
  substack: { label: 'Substack', referrals: true, tiers: [{ max: Infinity, price: 0 }], note: 'Free to publish; takes a cut of paid subscriptions. Little control over segmentation and forms.' },
};

export const AUD = {
  open: { b2c: 0.3041, other: 0.3041 }, click: 0.0074, unsub: 0.002, // Omnisend 2025 cross-industry: 30.41% open, 0.74% click, 0.20% unsubscribe [secondary]
  engagedOpen: 0.55, coldOpen: 0.04, engagedClick: 0.035, // [design] a clicking list: 2-4% for a good issue
  complaintBase: 0.0003, spamLine: 0.003, spamWatch: 0.001, // Gmail/Yahoo: stay under 0.10%, never reach 0.30% [official]
  geo: { eu: 0.25, canada: 0.03 }, // [design] share of a list that sits under GDPR / CASL
  decayPerDay: 0.0035, gapForgetDays: 21, // engagement slips without content; after three quiet weeks subscribers forget you [design]
  formExposure: { footer: 0.25, popup: 0.7, landing: 0.5, exit: 0.3 }, formMult: { footer: 0.5, popup: 0.9, landing: 1.3, exit: 0.6 },
  fieldsMult: { 1: 1, 2: 0.8, 3: 0.42 }, // one-field popup 4.41% vs three fields 1.83% (Sleeknote via Komo, [unverified]) => 0.42
  doiMult: 0.4, doiEngaged: 0.1, doiBounce: 0.4, // GetResponse: subscription rate 0.33% double vs 1.28% single (x0.26); softened because definitions differ [design]
  genericOptin: 0.01, magnetOptin: [0.04, 0.16], // generic ask 0.5-1.5%, specific asset 5-15% [unverified]
  landing: { median: 0.066, p75: 0.114 }, // Unbounce Q4 2024 via ClickMinded: 6.6% median, 11.4% p75
  sponsor: { cpm: { b2c: [15, 35], other: [50, 100] }, minEngaged: 1000, hours: 4, trustHit: 0.8 }, // beehiiv guide: $15-35 consumer, $50-100+ B2B CPM [vendor]
  paidCac: { b2c: [1, 5], other: [10, 50] }, // [design] p3 §5
  swap: { perSub: [0.5, 5], hours: 1.5 },
  waitlistPay: [0.03, 0.12], // median 3-5% within 30 days, top quartile 10-15% with a deposit or founding price [design]
  nurture: { base: 0.01, perQ: 0.05 }, // nurture and onboarding flows convert 3-8% of new subscribers to paid (p3 §6, [design] for a consumer product with a clear trial)
  hours: { setup: 2, form: 1.5, magnet: { template: 10, calculator: 20, checklist: 8, teardown: 14, course: 16 }, issue: 6, sunset: 2, promote: 1.5, compliance: 1, referrals: 4, nurture: 6, launch: 5, unsubs: 0.5 },
  fine: 5000, // [design] cost of a CAN-SPAM enforcement letter; the statute allows up to $53,088 per email (FTC)
};

export function ensureAudience(state) {
  state.apps ??= {};
  const A = (state.apps.audience ??= {});
  A.seed ??= state.seed | 0;
  A.platform ??= null; A.billId ??= null;
  A.rep ??= 75; A.fromProductDomain ??= true; A.suspendedUntil ??= null;
  A.compliance ??= { address: false, consent: 'none', oneClick: false, preference: false, honor: 'auto', suppressionSync: false, privacy: false };
  A.cohorts ??= []; A.forms ??= []; A.magnets ??= []; A.issues ??= [];
  A.waitlist ??= { enabled: false, question: '', offer: 'none', referral: false };
  A.cadence ??= { perWeek: 1 };
  A.referrals ??= { enabled: false, qualityCheck: false, reward: 'feature' };
  A.nurture ??= { enabled: false, q: 0 };
  A.pendingConv ??= []; A.pendingUnsubs ??= 0; A.violations ??= 0;
  A.sponsors ??= { trust: 1, queued: [], earned: 0 };
  A.stats ??= { subs: 0, unsubs: 0, complaints: 0, sent: 0, delivered: 0, clicks: 0, signups: 0, removed: 0, revenue: 0 };
  A.daily ??= []; A.events ??= []; A.mistakeDays ??= {};
  A.lastWritten ??= null; A.lastSunset ??= null; A.lastIssue ??= null; A.legacyDone ??= false; A.sends30 ??= [];
  return A;
}
const today = (s) => s.day ?? 0;
const pushEvent = (A, e) => { A.events.push(e); if (A.events.length > 200) A.events.shift(); };
const isB2c = (s) => s.company?.model === 'b2c';
const R = (ok, extra = {}) => ({ ok, hoursCost: 0, usdCost: 0, ...extra });

// ---- Cohorts ----
export function totalActive(A) { return A.cohorts.reduce((a, c) => a + c.n, 0); }
export function engagedCount(A) { return A.cohorts.reduce((a, c) => a + c.n * c.engaged, 0); }
export function addSubscribers(state, n, { key, source, engaged = 0.75, fit = 0.5, consent = 'express', doi = false, bounce = 0.02, trap = 0, label = '' }) {
  const A = ensureAudience(state);
  if (!(n > 0)) return 0;
  let c = A.cohorts.find((x) => x.key === key);
  if (!c) { c = { id: `aud_${A.cohorts.length + 1}`, key, source, day: today(state), n: 0, engaged, fit, consent, doi, bounce, trap, label: label || source }; A.cohorts.push(c); }
  const t = c.n + n;
  c.engaged = (c.engaged * c.n + engaged * n) / t; c.fit = (c.fit * c.n + fit * n) / t; c.bounce = (c.bounce * c.n + bounce * n) / t;
  c.n = t;
  A.stats.subs += n;
  const p = A.nurture.enabled ? AUD.nurture.base + AUD.nurture.perQ * A.nurture.q : AUD.nurture.base;
  A.pendingConv.push({ due: today(state) + 10, n: n * p * (0.5 + c.fit) * clamp(productFactor(state), 0.4, 1.4) / 1.0 });
  return n;
}
function syncLegacy(state, A) {
  const nw = state.founder.network;
  if (!A.legacyDone) {
    A.legacyDone = true;
    if ((nw.newsletter ?? 0) > 0) addSubscribers(state, nw.newsletter, { key: 'legacy', source: 'legacy', engaged: 0.3, fit: 0.5, consent: 'unknown', bounce: 0.04, label: 'The list you brought' });
    A.lastWritten = totalActive(A);
    return;
  }
  const diff = (nw.newsletter ?? 0) - (A.lastWritten ?? 0);
  if (Math.abs(diff) >= 1) { // edited in Settings
    if (diff > 0) addSubscribers(state, diff, { key: 'legacy', source: 'legacy', engaged: 0.3, fit: 0.5, consent: 'unknown', bounce: 0.04, label: 'The list you brought' });
    else { let rem = -diff; for (const c of A.cohorts) { const k = Math.min(c.n, rem); c.n -= k; rem -= k; } }
  }
}
const writeBack = (state, A) => { const n = Math.round(totalActive(A)); state.founder.network.newsletter = n; A.lastWritten = n; };

// ---- Quality heuristics for lead magnets and issues (offline judge; the UI may add an LLM read) ----
const GENERIC = /(ultimate guide|everything you need|complete guide|best practices|top \d+ tips|secrets|hacks)/i;
const toks = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4));
export function lintMagnet(state, { title = '', body = '', kind = 'template' }) {
  const issues = []; let q = 0.35;
  const buyer = toks(`${state.company?.icp ?? ''} ${state.company?.oneLiner ?? ''}`);
  const prod = new Set((state.apps?.product?.features ?? []).filter((f) => f.status === 'shipped' && !f.system).flatMap((f) => [...toks(f.title)]));
  const t = toks(`${title} ${body}`);
  const overlap = [...t].filter((w) => buyer.has(w) || prod.has(w)).length;
  if (overlap >= 2) q += 0.3; else issues.push('The magnet does not name your buyer\'s job or your product\'s problem: it attracts students and competitors, not buyers.');
  if (GENERIC.test(`${title} ${body}`)) { q -= 0.2; issues.push('"Ultimate guide" PDFs attract the wrong audience. Make one specific asset for one job.'); }
  if (['template', 'calculator', 'checklist', 'teardown'].includes(kind)) q += 0.15; else if (kind === 'course') q += 0.1;
  if (String(body).trim().split(/\s+/).length < 20) { q -= 0.15; issues.push('Describe what the asset contains in a sentence or two.'); }
  if (/\d/.test(title)) q += 0.05;
  return { q: clamp(q + 0.1, 0.05, 1), issues };
}
const PITCH = /(buy now|upgrade|sign up for|start your free trial|try \w+ free|book a demo|% off|discount|limited)/ig;
export function lintIssue(state, { subject = '', body = '' }) {
  const issues = []; let q = 0.35;
  const w = body.trim() ? body.trim().split(/\s+/).length : 0;
  if (w < 120) { q -= 0.15; issues.push('Under 120 words is a note, not an issue: readers need one idea with a real example.'); }
  if (w > 1400) { q -= 0.1; issues.push('Over 1,400 words: trim it to one idea.'); }
  const nums = (body.match(/\d[\d,.%$]*/g) ?? []).length;
  if (nums >= 3) q += 0.25; else issues.push('Add real numbers, a screenshot-worthy detail or a teardown: build-in-public issues work when they are specific.');
  const pitches = (body.match(PITCH) ?? []).length;
  const pitchRatio = clamp(pitches / Math.max(1, w / 150), 0, 3);
  if (pitchRatio > 1) { q -= 0.25; issues.push('Selling the product in every issue trains readers to skip you: one soft call to action at the end.'); } else if (pitches === 1) q += 0.05;
  if (/\b(sorry we haven'?t|it'?s been a while|apologi[sz]e for the silence)\b/i.test(body)) { q -= 0.05; issues.push('Apologising for gaps is a sign the cadence broke: keep the schedule instead.'); }
  const sw = subject.trim().split(/\s+/).filter(Boolean).length;
  if (!sw) { q -= 0.2; issues.push('No subject line.'); } else if (sw > 9 || /[A-Z]{5,}|!!/.test(subject)) { q -= 0.05; issues.push('Subject: plain, under nine words, no shouting.'); }
  if (/(first name|\{\{)/i.test(body) && !/\{\{\s*firstName\s*\}\}/.test(body)) q -= 0.05;
  return { q: clamp(q + 0.2, 0.05, 1), pitchRatio, pitches, words: w, issues };
}

// ---- Setup and configuration actions ----
export function setupList(state, platform) {
  const A = ensureAudience(state);
  if (!PLATFORMS[platform]) return R(false, { error: 'unknown platform' });
  const first = !A.platform;
  A.platform = platform;
  if (first) A.billId = null;
  billPlatform(state, A);
  syncLegacy(state, A);
  return R(true, { hoursCost: first ? AUD.hours.setup : AUD.hours.setup * 1.5 });
}
export function setCompliance(state, patch) {
  const A = ensureAudience(state);
  Object.assign(A.compliance, patch);
  if (patch.fromProductDomain != null) A.fromProductDomain = Boolean(patch.fromProductDomain);
  return R(true, { hoursCost: AUD.hours.compliance });
}
export function addForm(state, { type = 'footer', fields = 1, optin = 'single', magnetId = null }) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  if (magnetId && !A.magnets.some((m) => m.id === magnetId)) return R(false, { error: 'unknown magnet' });
  A.forms.push({ id: `form_${A.forms.length + 1}`, type, fields: clamp(Math.round(fields), 1, 3), optin, magnetId, day: today(state), n: 0 });
  return R(true, { hoursCost: AUD.hours.form });
}
export function createMagnet(state, { title, kind = 'template', body = '' }) {
  const A = ensureAudience(state);
  if (!String(title).trim()) return R(false, { error: 'Name the asset.' });
  const l = lintMagnet(state, { title, body, kind });
  A.magnets.push({ id: `mag_${A.magnets.length + 1}`, title: String(title).slice(0, 90), kind, body: String(body).slice(0, 600), q: round2(l.q), issues: l.issues, day: today(state), signups: 0, buyers: 0 });
  return R(true, { hoursCost: AUD.hours.magnet[kind] ?? 10, magnet: A.magnets.at(-1) });
}
export function setWaitlist(state, patch) { const A = ensureAudience(state); Object.assign(A.waitlist, patch, { enabled: true }); return R(true, { hoursCost: 3 }); }
export function setReferrals(state, patch) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  if (!PLATFORMS[A.platform].referrals) return R(false, { error: `${PLATFORMS[A.platform].label} has no referral program: switch platform.` });
  Object.assign(A.referrals, patch, { enabled: true });
  return R(true, { hoursCost: AUD.hours.referrals });
}
export function setNurture(state, { q }) { const A = ensureAudience(state); A.nurture = { enabled: true, q: clamp(q, 0, 1) }; return R(true, { hoursCost: AUD.hours.nurture }); }

function billPlatform(state, A) {
  const p = PLATFORMS[A.platform];
  if (!p) return;
  const n = totalActive(A);
  const tier = p.tiers.find((x) => n <= x.max) ?? p.tiers.at(-1);
  const price = tier.price + (A.referrals.enabled && p.referralFee ? p.referralFee : 0);
  let r = state.recurring?.find((x) => x.id === A.billId);
  if (!r) { r = addRecurring(state, { vendor: p.label.split(' (')[0], amount: 0, category: 'software', dayOfMonth: 9, note: 'Newsletter platform' }); A.billId = r.id; }
  r.amount = price; r.active = price > 0; r.note = `${p.label} (${Math.round(n).toLocaleString('en-US')} subscribers)`;
}

// ---- Growth ----
/** Founder posts / emails the waitlist or form page to their network. */
export function promote(state, { channel = 'network' } = {}) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  const form = A.forms.find((f) => f.type === 'landing') ?? A.forms[0];
  if (!form) return R(false, { error: 'Add a signup form first.' });
  const nw = state.founder.network;
  const reach = (nw.x ?? 0) * 0.12 + (nw.linkedin ?? 0) * 0.18 + (nw.friends ?? 0) * 0.5;
  const clicks = reach * 0.05 * (channel === 'network' ? 1 : 0.8);
  return doSignups(state, A, form, clicks, `promote:${channel}`, 1);
}
function formRate(A, f) {
  const m = f.magnetId ? A.magnets.find((x) => x.id === f.magnetId) : null;
  const base = m ? AUD.magnetOptin[0] + (AUD.magnetOptin[1] - AUD.magnetOptin[0]) * m.q : AUD.genericOptin;
  return base * AUD.formMult[f.type] * AUD.fieldsMult[f.fields] * (f.optin === 'double' ? AUD.doiMult : 1);
}
function doSignups(state, A, f, visitors, why, boost = 1) {
  const n = sampleCount(state, visitors * formRate(A, f) * boost);
  if (!n) return R(true, { signups: 0, hoursCost: AUD.hours.promote });
  const m = f.magnetId ? A.magnets.find((x) => x.id === f.magnetId) : null;
  const doi = f.optin === 'double';
  const consent = A.compliance.consent === 'logged' ? 'express+log' : A.compliance.consent === 'checkbox' ? 'express' : 'unknown';
  addSubscribers(state, n, { key: `form:${f.id}`, source: 'form', engaged: 0.75 + (doi ? AUD.doiEngaged : 0), fit: m ? clamp(0.3 + 0.6 * m.q, 0.2, 0.95) : 0.45, consent, doi, bounce: doi ? 0.02 * AUD.doiBounce : 0.03, label: `${m ? m.title : f.type} form` });
  f.n += n; if (m) m.signups += n;
  return R(true, { signups: n, hoursCost: AUD.hours.promote });
}

/** Buy a list: the classic mistake. Cold addresses, spam traps, no consent. */
export function purchaseList(state, { n = 5000 } = {}) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  const cost = Math.round(n * 0.06);
  post(state, { amount: -cost, counterparty: 'ListBroker Inc.', description: `Purchased contact list (${n})`, category: 'marketing', method: 'card' });
  addSubscribers(state, n, { key: `purchased:${today(state)}`, source: 'purchased', engaged: 0.08, fit: 0.2, consent: 'none', bounce: 0.09, trap: 0.015, label: 'Purchased list' });
  logMistake(state, { functionId: 'owned_audience', id: 'purchased_list', label: `Bought a ${n}-address list`, app: 'audience', cost: { usd: cost, hours: 2, reputation: 1 }, delayed: true, charge: true, detail: 'No consent, 8-10% bounces, spam traps. Your platform can suspend the account with the whole list; GDPR and CASL make it unlawful without consent, and under CAN-SPAM you still carry the liability for every send.', key: `bought:${today(state)}` });
  return R(true, { usdCost: cost, hoursCost: 0.5 });
}
/** Paid per-subscriber acquisition (social). Cheap lists of people who never open. */
export function buyAds(state, { budget = 300, audience = 'interest' } = {}) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  budget = Math.round(Number(budget) || 0);
  if (budget < 10) return R(false, { error: 'Set a budget of at least $10.' }); // a negative budget used to post money IN
  const [lo, hi] = AUD.paidCac[isB2c(state) ? 'b2c' : 'other'];
  const cac = lo + (hi - lo) * ({ broad: 0.35, interest: 0.55, lookalike: 0.45 }[audience] ?? 0.5) * (0.8 + 0.4 * h01(`${ensureAudience(state).seed}|ads|${today(state)}`));
  const n = Math.floor(budget / cac);
  post(state, { amount: -budget, counterparty: 'Meta Ads', description: `Newsletter subscriber ads (${n} signups)`, category: 'advertising', method: 'card' });
  addSubscribers(state, n, { key: 'paid', source: 'paid', engaged: audience === 'broad' ? 0.25 : 0.4, fit: isB2c(state) ? 0.4 : 0.25, consent: 'express', bounce: 0.05, label: 'Paid subscribers' });
  return R(true, { signups: n, cac: round2(cac), usdCost: budget, hoursCost: 1.5 });
}
/** Recommendation swap or paid recommendation. partnerFit 0..1 (audience overlap with your buyer). */
export function swap(state, { partnerSize = 3000, partnerFit = 0.6, paid = false } = {}) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  partnerSize = Math.max(0, Number(partnerSize) || 0); partnerFit = clamp(Number(partnerFit) || 0, 0, 1); // negative inputs paid you
  const n = Math.round(partnerSize * 0.012 * (0.4 + partnerFit * 1.2));
  if (n <= 0) return R(false, { error: 'Pick a partner newsletter with subscribers.' });
  let usd = 0;
  if (paid) { usd = Math.round(n * (AUD.swap.perSub[0] + (AUD.swap.perSub[1] - AUD.swap.perSub[0]) * (1 - partnerFit))); post(state, { amount: -usd, counterparty: 'Recommendation network', description: `Paid newsletter recommendation (${n} subs)`, category: 'marketing', method: 'card' }); }
  addSubscribers(state, n, { key: `swap:${paid ? 'paid' : 'swap'}`, source: 'swap', engaged: 0.25 + 0.5 * partnerFit, fit: 0.2 + 0.6 * partnerFit, consent: 'express', bounce: 0.03, label: paid ? 'Paid recommendations' : 'Swaps' });
  if (partnerFit < 0.4) logMistake(state, { functionId: 'owned_audience', id: 'mismatched_swap', label: 'Swapped with a newsletter whose audience is not yours', app: 'audience', cost: { customers: n * 0.05, reputation: 0.3 }, delayed: true, detail: 'Mismatched cross-promotion: unsubscribes rise, and the new subscribers never open.', key: `swap:${today(state)}` });
  return R(true, { signups: n, usdCost: usd, hoursCost: AUD.swap.hours });
}

/** Remove non-engaged subscribers after a re-engagement email (suppress, do not delete). */
export function sunset(state) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  let removed = 0;
  for (const c of A.cohorts) {
    const re = (1 - c.engaged) * c.n * 0.08; // ~8% of the quiet ones answer a re-engagement email [design]
    const dead = (1 - c.engaged) * c.n - re;
    removed += dead;
    c.n -= dead; c.engaged = c.n > 0 ? clamp((c.engaged * (c.n + dead) + re) / c.n, 0, 0.95) : 0.75;
  }
  A.stats.removed += removed; A.lastSunset = today(state);
  writeBack(state, A);
  return R(true, { removed: Math.round(removed), hoursCost: AUD.hours.sunset });
}
export function processUnsubscribes(state) { const A = ensureAudience(state); const n = A.pendingUnsubs; A.pendingUnsubs = 0; return R(true, { processed: Math.round(n), hoursCost: AUD.hours.unsubs }); }

// ---- Sending ----
const repFactor = (rep) => (rep >= 60 ? 0.9 + 0.1 * (rep - 60) / 40 : 0.45 + 0.45 * (rep / 60));
function issuesLast(A, state, days) { return A.issues.filter((i) => i.day > today(state) - days); }
export function cadenceScore(A, state) {
  const weeks = 8; let hit = 0;
  for (let w = 0; w < weeks; w++) if (A.issues.some((i) => i.day > today(state) - 7 * (w + 1) && i.day <= today(state) - 7 * w)) hit++;
  return hit / weeks;
}

/**
 * Send an issue. kind: 'value' | 'launch' | 'sponsor'. segment: 'all' | 'engaged'. judge (optional): { score } from an
 * LLM read; otherwise the offline lint (shrunk toward the median). Returns { ok, issue, hoursCost }.
 */
export function sendIssue(state, { subject, body, kind = 'value', segment = 'all', judge = null, approved = true, dryRun = false, sponsor = null } = {}) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  if (!subject || !body) return R(false, { error: 'subject and body required' });
  if (!approved && !dryRun) return R(false, { error: 'needs approval (customer-facing send)' });
  if (A.suspendedUntil != null && today(state) < A.suspendedUntil) return R(false, { error: `Your list platform suspended the account until day ${A.suspendedUntil}.` });
  if (dryRun) return R(true, { recipients: Math.round(segment === 'engaged' ? engagedCount(A) : totalActive(A)) });
  const t = today(state);
  const lint = lintIssue(state, { subject, body });
  const q = judge?.score != null ? judge.score : 0.2 + 0.6 * lint.q; // offline: shrink(h, n=3, 0.5, k=2) = 0.6h + 0.2
  const sendsWeek = issuesLast(A, state, 7).length + 1;
  const freq = sendsWeek > 2 ? 1 + 0.6 * (sendsWeek - 2) : 1; // three a week took one tech newsletter from steady to 3% unsubscribes [illustrative, Count.co]
  const lastGap = A.lastIssue != null ? t - A.lastIssue : 0;
  const forgot = lastGap > AUD.gapForgetDays ? 1 + Math.min(1.5, (lastGap - AUD.gapForgetDays) / 30) : 1;
  const comp = A.compliance;
  if (!comp.address) logMistake(state, { functionId: 'owned_audience', id: 'no_postal_address', label: 'Newsletter without a postal address', app: 'audience', cost: { usd: 0, hours: 0.5 }, delayed: true, detail: 'CAN-SPAM requires a valid physical postal address in every commercial email. The platform footer does not supply yours.', key: 'noaddr', circles: false });
  const rep = A.rep;
  const place = repFactor(rep) * (A.suspendedUntil ? 0 : 1);
  const b2c = isB2c(state);
  const st = { sent: 0, delivered: 0, opened: 0, mpp: 0, clicked: 0, unsub: 0, complaints: 0, conv: 0 };
  let trapHits = 0, noConsent = 0, euRisk = 0, expectedSignups = 0;
  const pitchHeavy = lint.pitchRatio > 1 || kind === 'launch';
  const sponsored = kind === 'sponsor' && sponsor;
  for (const c of A.cohorts) {
    let n = segment === 'engaged' ? c.n * c.engaged : c.n;
    if (segment === 'engaged' && c.consent === 'none') n = 0;
    if (n <= 0) continue;
    const share = n / Math.max(1, c.n);
    const delivered = n * (1 - c.bounce) * place;
    const e = segment === 'engaged' ? Math.min(0.95, c.engaged / Math.max(0.2, share) * 1) : c.engaged;
    const openRate = (e * AUD.engagedOpen + (1 - e) * AUD.coldOpen) * (0.7 + 0.6 * q) * (lastGap > 14 ? 0.85 : 1);
    const opens = delivered * clamp(openRate, 0, 0.9);
    const clickRate = e * AUD.engagedClick * (0.35 + 1.3 * q) * (pitchHeavy ? 1.15 : 1);
    const clicks = delivered * clamp(clickRate, 0, 0.3);
    const consentMult = { 'express+log': 1, express: 1, implied: 1.2, unknown: 1.6, none: 8 }[c.consent] ?? 1;
    const unsubP = clamp(AUD.unsub * freq * forgot * (1 + (1 - e) * 1.5) * (pitchHeavy ? 1.8 : 1) * (sponsored && sponsor.fit === 'misfit' ? 1.8 : 1) * (A.compliance.preference ? 0.8 : 1) * (c.consent === 'none' ? 2 : 1), 0, 0.3);
    const compP = clamp(AUD.complaintBase * freq * forgot * (1 + 4 * (1 - e) * (1 - e)) * consentMult * (kind === 'launch' ? 1.5 : 1) * (A.compliance.oneClick ? 0.85 : 1.15), 0, 0.2);
    st.sent += n; st.delivered += delivered; st.opened += opens; st.mpp += (delivered - opens) * (b2c ? 0.3 : 0.12); st.clicked += clicks;
    st.unsub += delivered * unsubP; st.complaints += delivered * compP;
    c.n = Math.max(0, c.n - delivered * (unsubP + compP) - n * c.bounce * 0.5);
    c.engaged = clamp(c.engaged + (q - 0.4) * 0.04 + (opens / Math.max(1, delivered) > 0.2 ? 0.01 : 0), 0.02, 0.95);
    trapHits += n * c.trap;
    if (c.consent === 'none' || c.consent === 'unknown') noConsent += n * (c.consent === 'none' ? 1 : 0.3);
    euRisk += n * (AUD.geo.eu + AUD.geo.canada) * (c.consent === 'express+log' || c.consent === 'express' ? 0 : 1);
    const convPerClick = (kind === 'launch' ? 0.14 : kind === 'sponsor' ? 0.02 : 0.05) * (0.4 + c.fit) * clamp(productFactor(state), 0.4, 1.4);
    expectedSignups += clicks * convPerClick;
  }
  // unsubscribes the player handles by hand keep getting mail: CAN-SPAM requires honoring within 10 business days
  if (comp.honor === 'manual') {
    // This issue just went to everyone who opted out earlier and is still waiting to be processed; today's opt-outs
    // only become violations if the next issue reaches them too.
    if (A.pendingUnsubs > 0) A.violations += A.pendingUnsubs;
    A.pendingUnsubs += st.unsub;
  }
  if (comp.honor === 'manual' && A.violations >= 5 && !A.mistakeDays.ignored_unsubs) {
    A.mistakeDays.ignored_unsubs = t;
    post(state, { amount: -AUD.fine, counterparty: 'Consumer counsel', description: 'CAN-SPAM unsubscribe complaint response', category: 'legal', method: 'wire' });
    logMistake(state, { functionId: 'owned_audience', id: 'ignored_unsubscribes', label: 'Kept emailing people who unsubscribed', app: 'audience', cost: { usd: AUD.fine, hours: 6, reputation: 1.5 }, charge: true, delayed: true, detail: `${Math.round(A.violations)} sends went to people who had opted out. CAN-SPAM requires honoring opt-outs within 10 business days (Yahoo asks for 2 days); the statute allows up to $53,088 per violating email.` });
  }
  const signups = sampleCount(state, expectedSignups);
  if (signups > 0 && hasProduct(state)) { acquire(state, { source: 'organic:list', n: signups, convMult: kind === 'launch' ? 1.2 : 1 }); st.conv = signups; }
  const row = { id: `iss_${A.issues.length + 1}`, day: t, subject: String(subject).slice(0, 120), kind, segment, q: round2(q), lintQ: round2(lint.q), pitchRatio: round2(lint.pitchRatio), issues: lint.issues, sponsor: sponsor ? { ...sponsor } : null, stats: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Math.round(v * 10) / 10])), mock: !judge };
  A.issues.push(row); if (A.issues.length > 150) A.issues.shift();
  A.lastIssue = t;
  A.stats.sent += st.sent; A.stats.delivered += st.delivered; A.stats.unsubs += st.unsub; A.stats.complaints += st.complaints; A.stats.clicks += st.clicked; A.stats.signups += st.conv;
  A.sends30.push({ day: t, d: st.delivered, c: st.complaints, u: st.unsub }); A.sends30 = A.sends30.filter((x) => x.day > t - 30);
  // sponsorship revenue
  if (sponsored) {
    const eng = engagedCount(A);
    const [lo, hi] = AUD.sponsor.cpm[b2c ? 'b2c' : 'other'];
    const clickRate = st.delivered ? st.clicked / st.delivered : 0;
    const perf = clamp(clickRate / 0.03, 0.4, 1.4);
    const rev = round2((eng / 1000) * (lo + (hi - lo) * 0.5) * perf * A.sponsors.trust);
    if (eng >= AUD.sponsor.minEngaged && rev > 0) { post(state, { amount: rev, counterparty: sponsor.name ?? 'Sponsor', description: `Newsletter sponsorship (${Math.round(eng)} engaged readers, $${(rev / (eng / 1000)).toFixed(0)} CPM)`, category: 'sponsorship_income', method: 'ach' }); A.sponsors.earned += rev; A.stats.revenue += rev; row.revenue = rev; }
    if (sponsor.fit === 'misfit') A.sponsors.trust = Math.max(0.5, A.sponsors.trust * AUD.sponsor.trustHit);
    if (!sponsor.disclosed) logMistake(state, { functionId: 'owned_audience', id: 'undisclosed_sponsor', label: 'Sponsored placement without a disclosure', app: 'audience', cost: { usd: 3000, reputation: 1.5, hours: 3 }, charge: true, delayed: true, detail: 'Undisclosed sponsorships breach FTC endorsement rules (16 CFR Part 465, not verified in the research) and cost reader trust.', key: `undisc:${row.id}` });
  }
  if (trapHits > 10) { A.rep = Math.max(5, A.rep - Math.min(25, trapHits / 20)); logMistake(state, { functionId: 'owned_audience', id: 'spam_traps', label: 'Mailed spam-trap addresses', app: 'audience', cost: { reputation: 1, hours: 3 }, charge: true, delayed: true, detail: `~${Math.round(trapHits)} sends hit spam traps from a list nobody opted into. The platform flags the sender and Gmail and Outlook downgrade the domain.`, key: `traps:${Math.floor(t / 30)}` }); }
  if (noConsent > 50 && euRisk > 5) logMistake(state, { functionId: 'owned_audience', id: 'no_consent_send', label: 'Mailed people with no consent on record', app: 'audience', cost: { usd: Math.round(Math.min(6000, euRisk * 4)), hours: 4, reputation: 1 }, charge: true, delayed: true, detail: 'GDPR, CASL and PECR need consent (or a documented basis) for marketing email. A list without consent records has none: a complaint to a regulator is a matter of when.', key: `noconsent:${Math.floor(t / 60)}` });
  if (st.sent > 0 && A.lastIssue && forgot > 1.3) logMistake(state, { functionId: 'owned_audience', id: 'cadence_gap', label: `Sent after ${lastGap} quiet days`, app: 'audience', cost: { customers: Math.round(st.unsub * 0.1) }, delayed: true, detail: 'Subscribers forgot who you are: unsubscribes and spam complaints jump on the first issue after a long gap.', key: `gap:${row.id}` });
  if (sendsWeek > 2) logMistake(state, { functionId: 'owned_audience', id: 'blasting', label: `${sendsWeek} issues in 7 days`, app: 'audience', cost: { customers: Math.round(st.unsub * 0.1), reputation: 0.3 }, delayed: true, detail: 'Frequency spikes raise unsubscribes and complaints; change cadence only in a segmented test and watch the spam rate for four weeks.', key: `blast:${row.id}` });
  pushEvent(A, { id: `issue_sent:${row.id}`, type: 'issue_sent', day: t, issueId: row.id, recipients: Math.round(st.sent) });
  writeBack(state, A);
  return R(true, { issue: row, hoursCost: AUD.hours.issue });
}

/** Launch the product to the waitlist (or the whole list). Conversion follows the research bands, not the list size. */
export function launchToList(state, { subject, body, waves = 1, personalTop = false, judge = null, approved = true } = {}) {
  const A = ensureAudience(state);
  if (!A.platform) return R(false, { error: 'Choose a list platform first.' });
  if (!approved) return R(false, { error: 'needs approval (customer-facing send)' });
  if (!hasProduct(state)) return R(false, { error: 'Ship a product before you launch to the list.' });
  if (A.suspendedUntil != null && today(state) < A.suspendedUntil) return R(false, { error: `Your list platform suspended the account until day ${A.suspendedUntil}.` });
  if (A.launchedDay != null && today(state) - A.launchedDay < 30) return R(false, { error: 'You already launched to this list this month. Discount-and-launch blasts every few weeks train the list to wait.' });
  const lint = lintIssue(state, { subject, body });
  const q = judge?.score != null ? judge.score : 0.2 + 0.6 * lint.q;
  const W = A.waitlist;
  const qLaunch = 0.4 * q + (W.offer === 'deposit' ? 0.25 : W.offer === 'founding' ? 0.2 : 0) + (waves > 1 ? 0.15 : 0) + (personalTop ? 0.1 : 0) + (W.question ? 0.1 : 0);
  const [lo, hi] = AUD.waitlistPay;
  let paid = 0, used = 0;
  const gapPenalty = (c) => Math.exp(-Math.max(0, today(state) - (A.lastIssue ?? c.day)) / 120);
  for (const c of A.cohorts) {
    if (c.consent === 'none') continue;
    const pool = c.n * (0.3 + 0.7 * c.engaged);
    used += pool;
    paid += pool * (lo + (hi - lo) * clamp(qLaunch, 0, 1)) * (0.4 + c.fit) * gapPenalty(c) * clamp(productFactor(state), 0.4, 1.4);
  }
  const n = sampleCount(state, paid);
  if (n > 0) acquire(state, { source: 'organic:list', n, convMult: 1.6 });
  // a cold-list blast draws complaints
  const sent = sendIssue(state, { subject, body, kind: 'launch', segment: waves > 1 ? 'engaged' : 'all', judge, approved });
  A.launchedDay = today(state);
  return R(true, { signups: n, rate: used ? n / used : 0, hoursCost: AUD.hours.launch + (waves > 1 ? 2 : 0) + (personalTop ? 3 : 0), issue: sent.issue });
}

export function queueSponsor(state, { name = 'Sponsor', fit = 'relevant', disclosed = true } = {}) {
  const A = ensureAudience(state);
  if (engagedCount(A) < AUD.sponsor.minEngaged) return R(false, { error: `Sponsors want ${AUD.sponsor.minEngaged}+ engaged readers; you have ${Math.round(engagedCount(A))}. Sponsorship alone rarely covers your hours at this size.` });
  A.sponsors.queued.push({ name, fit, disclosed });
  return R(true, { hoursCost: AUD.sponsor.hours });
}

// ---- Daily ----
export function audienceDay(state) {
  const A = state.apps?.audience;
  if (!A?.platform) return;
  const t = today(state);
  syncLegacy(state, A);
  // organic inflow from website forms
  const visitors = visitors30(state) / 30;
  if (visitors > 0 && A.forms.length) {
    let exposure = 0;
    for (const f of A.forms) exposure = Math.min(0.85, exposure + AUD.formExposure[f.type]);
    const per = A.forms.map((f) => ({ f, w: AUD.formExposure[f.type] })); const wsum = per.reduce((a, x) => a + x.w, 0) || 1;
    for (const { f, w } of per) doSignups(state, A, f, visitors * exposure * (w / wsum), 'site', 1);
  }
  // free-tool gated reports feed the list
  const P = state.apps.plg;
  if (P?.toolEmails > 0) { addSubscribers(state, P.toolEmails, { key: 'tool', source: 'tool', engaged: 0.55, fit: 0.65, consent: A.compliance.consent === 'logged' ? 'express+log' : A.compliance.consent === 'checkbox' ? 'express' : 'unknown', bounce: 0.04, label: 'Free-tool report requests' }); P.toolEmails = 0; }
  // referrals: forwarding is free; a program with a quality check multiplies it without gaming
  if (A.referrals.enabled && PLATFORMS[A.platform].referrals) {
    const eng = engagedCount(A);
    const n = sampleCount(state, eng * 0.012 / 30 * 3);
    if (n > 0) {
      const fake = A.referrals.qualityCheck ? 0 : Math.round(n * 0.15);
      addSubscribers(state, n - fake, { key: 'referral', source: 'referral', engaged: 0.7, fit: 0.65, consent: 'express', bounce: 0.02, label: 'Referrals' });
      if (fake) addSubscribers(state, fake, { key: 'referral_fake', source: 'referral', engaged: 0.05, fit: 0.1, consent: 'express', bounce: 0.1, label: 'Gamed referrals' });
      if (A.referrals.reward === 'cash') post(state, { amount: -(n - fake) * 2, counterparty: 'Referral rewards', description: 'Newsletter referral rewards', category: 'marketing', method: 'card' });
    }
  } else if (eng0(A) > 0) {
    const n = sampleCount(state, engagedCount(A) * 0.012 / 30 * 0.5);
    if (n > 0) addSubscribers(state, n, { key: 'forwards', source: 'referral', engaged: 0.65, fit: 0.6, consent: 'express', bounce: 0.02, label: 'Forwards' });
  }
  // engagement decay: quiet lists rot; a dormant sender also loses reputation
  const quiet = A.lastIssue == null ? 0 : t - A.lastIssue;
  for (const c of A.cohorts) c.engaged = Math.max(0.02, c.engaged * (1 - AUD.decayPerDay * (quiet > 14 ? 2.5 : 1)));
  // conversions from nurture and forwards
  const due = A.pendingConv.filter((x) => x.due <= t); A.pendingConv = A.pendingConv.filter((x) => x.due > t);
  if (due.length && hasProduct(state)) { const n = sampleCount(state, due.reduce((a, x) => a + x.n, 0)); if (n) { acquire(state, { source: 'organic:list', n }); A.stats.signups += n; } }
  // reputation vs Gmail/Yahoo line, over a rolling 30 days
  const del = A.sends30.reduce((a, x) => a + x.d, 0), comp = A.sends30.reduce((a, x) => a + x.c, 0);
  A.complaintRate30 = del ? comp / del : 0;
  const target = del >= 500 && A.complaintRate30 >= AUD.spamLine ? 20 : del >= 500 && A.complaintRate30 >= AUD.spamWatch ? 55 : 82;
  A.rep = round2(A.rep + (target - A.rep) * (target < A.rep ? 0.12 : 0.03));
  if (A.complaintRate30 >= AUD.spamLine && del >= 500 && A.cohorts.some((c) => c.consent === 'none') && A.suspendedUntil == null) {
    A.suspendedUntil = t + 21;
    notify(state, 'Your list platform suspended your account: complaint rate over 0.3% on a list with purchased addresses.', { type: 'bad', app: 'audience' });
    logMistake(state, { functionId: 'owned_audience', id: 'platform_suspended', label: 'List platform suspended the account', app: 'audience', cost: { days: 21, hours: 6, customers: 2, reputation: 1.5 }, circles: true, charge: true, delayed: true, detail: 'Complaints above 0.30% on a list with purchased addresses. Terms ban purchased lists; the account and the whole list were frozen.', key: `suspended:${t}` });
  }
  if (A.suspendedUntil != null && t >= A.suspendedUntil) A.suspendedUntil = null;
  if (A.complaintRate30 >= AUD.spamLine && del >= 500 && !A.mistakeDays.spam_rate) { A.mistakeDays.spam_rate = t; logMistake(state, { functionId: 'owned_audience', id: 'spam_over_0_3', label: 'Newsletter spam rate over 0.3%', app: 'audience', cost: { reputation: 1.5, hours: 4, customers: 1 }, charge: true, delayed: true, detail: `${(A.complaintRate30 * 100).toFixed(2)}% complaints over 30 days. Gmail and Yahoo start filtering you, then rejecting.`, key: `spam:${Math.floor(t / 45)}` }); }
  if (A.complaintRate30 < AUD.spamWatch) A.mistakeDays.spam_rate = null;
  if (t % 30 === 0) billPlatform(state, A);
  A.daily.push({ day: t, n: Math.round(totalActive(A)), engaged: Math.round(engagedCount(A)) }); if (A.daily.length > 400) A.daily.shift();
  writeBack(state, A);
}
const eng0 = (A) => engagedCount(A);

// ---- Metrics, events, automations ----
export function audienceMetrics(state) {
  const A = ensureAudience(state);
  const n = totalActive(A), e = engagedCount(A);
  const last = A.issues.at(-1);
  const del = A.sends30.reduce((a, x) => a + x.d, 0), unsub = A.sends30.reduce((a, x) => a + x.u, 0);
  return { size: Math.round(n), engaged: Math.round(e), engagedShare: n ? e / n : null, complaintRate: A.complaintRate30 ?? null, unsubRate: del ? unsub / del : null, cadence: cadenceScore(A, state), lastClickRate: last && last.stats.delivered ? last.stats.clicked / last.stats.delivered : null, lastOpenRate: last && last.stats.delivered ? last.stats.opened / last.stats.delivered : null, consentLogged: A.cohorts.length ? A.cohorts.filter((c) => c.consent === 'express+log' || c.consent === 'express').reduce((a, c) => a + c.n, 0) / Math.max(1, n) : null, revenue: A.stats.revenue, signups: A.stats.signups };
}
export const audienceEvents = (state, sinceDay = today(state) - 1) => (state.apps?.audience?.events ?? []).filter((e) => e.day >= sinceDay);
export const AUDIENCE_ACTIONS = {
  send_issue(state, a, { dryRun = false, approved = false } = {}) { return sendIssue(state, { subject: a.subject, body: a.body, kind: a.kind ?? 'value', segment: a.segment ?? 'engaged', dryRun, approved }); },
  run_sunset(state, _a, { dryRun = false, approved = false } = {}) { if (!approved && !dryRun) return R(false, { error: 'needs approval (removes subscribers)' }); return dryRun ? R(true, { hoursCost: AUD.hours.sunset }) : sunset(state); },
  process_unsubscribes(state, _a, { dryRun = false } = {}) { return dryRun ? R(true) : processUnsubscribes(state); },
};

// ---- Operator read (functionId owned_audience) ----
export function audienceOperatorRead(state) {
  const A = state.apps?.audience;
  if (!A?.platform || (!A.cohorts.length && !A.issues.length)) return { tier: 'unknown', evidence: [], coaching: ['Pick one platform, one cadence and one promise. Collect consent with a stated purpose before the first send.'] };
  const m = audienceMetrics(state);
  const mine = (state.mistakes ?? []).filter((x) => x.functionId === 'owned_audience');
  const iq = A.issues.length ? A.issues.slice(-8).reduce((a, i) => a + i.q, 0) / Math.min(8, A.issues.length) : null;
  const c = A.compliance;
  const consent = (c.address ? 0.25 : 0) + ({ logged: 0.35, checkbox: 0.2, none: 0 }[c.consent] ?? 0) + (c.oneClick ? 0.15 : 0) + (c.honor === 'auto' ? 0.15 : 0) + (c.preference ? 0.1 : 0);
  const hygiene = A.lastSunset != null ? clamp(1 - (today(state) - A.lastSunset) / 270, 0.3, 1) : (m.engagedShare != null ? clamp(m.engagedShare * 1.2, 0, 0.5) : 0.2);
  const clean = A.cohorts.some((x) => x.consent === 'none') ? 0 : 1;
  const raw = 0.08 + 0.2 * consent + 0.2 * (iq ?? 0.3) + 0.15 * (A.issues.length ? m.cadence : 0.2) + 0.2 * hygiene + 0.15 * (m.complaintRate == null ? 0.7 : clamp(1 - m.complaintRate / 0.002, 0, 1)) + 0.1 * clean - 0.07 * Math.min(5, mine.length) - (A.fromProductDomain ? 0.05 : 0);
  const score = shrink(clamp(raw, 0, 1), A.issues.length + 2, 0.5, 3);
  const tier = tierFromScore(score);
  const evidence = [`${m.size.toLocaleString('en-US')} subscribers, ${m.engaged.toLocaleString('en-US')} engaged (${m.engagedShare == null ? '-' : Math.round(m.engagedShare * 100)}%)`, `${A.issues.length} issues, cadence ${Math.round(m.cadence * 100)}% of the last 8 weeks, ${iq == null ? 'no judged issue yet' : `content quality ${Math.round(iq * 100)}%`}`, `Consent: ${c.consent}${c.address ? ', postal address' : ', no postal address'}${c.oneClick ? ', one-click unsubscribe' : ''}`, `${A.lastSunset != null ? `Last list clean-up on day ${A.lastSunset}` : 'No list clean-up yet'}`];
  const coaching = [];
  if (A.cohorts.some((x) => x.consent === 'none')) coaching.push('Purchased lists are the fastest way to a suspended account: spam traps, no consent, complaints.');
  if (c.consent === 'none') coaching.push('Capture consent with a stated purpose and keep a record per subscriber (timestamp, source, wording).');
  if (A.lastSunset == null && m.engagedShare != null && m.engagedShare < 0.45) coaching.push('More than half the list never engages. Run a re-engagement email, then suppress the silent ones: list size is not the product.');
  if (m.cadence < 0.5 && A.issues.length > 3) coaching.push('Irregular sending makes readers forget you; pick one day a week and keep it.');
  if (c.honor === 'manual') coaching.push('Honor unsubscribes automatically: CAN-SPAM allows 10 business days, Yahoo asks for 2.');
  if (tier !== 'stellar') coaching.push('What a stellar operator does: one promise, a fixed day each week, a magnet that solves the job your product solves, explicit consent on record, a sunset flow, and sells on click data rather than list size.');
  return { tier, score: round2(score), raw: round2(clamp(raw, 0, 1)), n: A.issues.length + A.cohorts.length, evidence, coaching: [...new Set(coaching)] };
}
