// Lifecycle email engine (Loops / Customer.io style). Pure, deterministic (rng(state) only), no DOM.
//
// What it models (docs/research/tools/deep/d08-lifecycle-email-social.md, docs/research/operators/o2 §6,
// docs/review/tool-gap-analysis.md item 3, operator-tiers-audit item 11):
//  - Contacts are created from real game signups (Stripe customers). Each contact carries a hidden engagement
//    draw `u`; it activates on its own (the existing insights activation model) when u < p, a few days in.
//  - The player picks ONE activation event. Each candidate has a hidden predictiveness `rho` (how often reaching
//    it means the user really got value). Vanity events ("logged in again") are easy to reach and barely move
//    real activation; the core-action-on-own-data event moves it one for one.
//  - Flows: trigger -> nodes (email, delay, branch "has activated? exit") with filters and a goal exit. Every
//    send draws delivery, open, click, goal conversion, unsubscribe and spam complaint at the rates below.
//  - Real activation lift (points) is measured from contact cohorts and fed back into Insights' activation
//    model (insights/model.js activationRate({lift})) and into trial conversion / churn via market modifiers.
//  - Doing it badly costs: blasts and irrelevant mail raise unsubscribes and complaints; above Gmail's 0.3%
//    spam-rate line the sending domain's reputation falls and transactional mail (magic links, password
//    resets) starts landing in spam, which lowers activation for every new signup. Annoyed new users tune out.
//
// Number tags: [official] vendor page/docs, [secondary] vendor blog or aggregator, [design] game estimate.

import { clamp, rng, chance, uid, round2 } from '../../core/util.js';
import { authFactor } from '../sales/deliverability.js';
import { BUZZWORDS, SPAM_WORDS, AI_SLOP } from '../sales/copy.js';

// ---- Vendors and plans (d08 §1-2) ----
export const ESP = {
  loops: {
    label: 'Loops', url: 'loops.so',
    // Free: 1,000 subscribed contacts and 4,000 marketing + transactional sends per rolling 30 days [official].
    // Growth $49 up to 5,000 contacts [official]. Above 5,000 the page says "contact" / scales; steps are [design].
    tiers: [{ max: 1000, price: 0, sendCap: 4000, name: 'Free' }, { max: 5000, price: 49, name: 'Growth' }, { max: 10000, price: 99, name: 'Growth 10k [design]' }, { max: 25000, price: 199, name: 'Growth 25k [design]' }, { max: Infinity, price: 399, name: 'Growth 50k [design]' }],
    countsUnsubscribed: false, // unsubscribed contacts do not count on paid plans [official]
  },
  customerio: {
    label: 'Customer.io', url: 'customer.io',
    // Essentials $100 at 5k profiles, $145 10k, $235 20k, $325 30k, $415 40k, $505 50k+; $0.009/extra profile [official].
    tiers: [{ max: 5000, price: 100, name: 'Essentials 5k' }, { max: 10000, price: 145, name: 'Essentials 10k' }, { max: 20000, price: 235, name: 'Essentials 20k' }, { max: 30000, price: 325, name: 'Essentials 30k' }, { max: 40000, price: 415, name: 'Essentials 40k' }, { max: 50000, price: 505, name: 'Essentials 50k' }],
    overagePerProfile: 0.009,
    countsUnsubscribed: true, // every identified profile counts, including unsubscribed and stale ones [design from per-profile pricing]
  },
};

// ---- Base engagement rates per email (of delivered). d08 §6. ----
// welcome 1: opens >50%, clicks >20% [secondary, unverified]; later welcome emails 40-50% opens; nudges 25-35% opens,
// 2-5% clicks [design]; trial ending 35-50% opens [design]; win-back 14-22% opens [secondary]; all-email average
// 31.4% opens / 3.8% clicks [secondary]. Apple Mail Privacy Protection inflates opens 10-15% in B2B [secondary].
export const RATES = {
  welcome: { open: [0.55, 0.45], click: [0.2, 0.08] },
  nudge: { open: [0.32, 0.28], click: [0.045, 0.035] },
  trial_ending: { open: [0.45, 0.4], click: [0.09, 0.07] },
  winback: { open: [0.2, 0.16], click: [0.03, 0.02] },
  custom: { open: [0.35, 0.3], click: [0.05, 0.04] },
  broadcast: { open: [0.3, 0.3], click: [0.035, 0.035] },
};
export const MPP_INFLATION = { b2c: 0.3, smb: 0.12, ent: 0.12 }; // share of unopened delivered mail that "opens" via Apple MPP [secondary]
export const ACT_PER_CLICK = 0.45; // [design] a click on a one-action email leads to the activation action
export const UNSUB_BASE = 0.003; // [design] 0.1-0.5% unsubscribes per delivered email is typical
export const COMPLAINT_BASE = 0.0004; // [design] spam complaints per delivered; Gmail asks bulk senders to stay < 0.1%
export const SPAM_LINE = 0.003; // Gmail/Yahoo bulk-sender rule (2024): spam rate must never reach 0.3% [official, Google sender guidelines]
export const WINBACK_REACT_PER_CLICK = 0.4; // [design] ~1.2% per delivered win-back email to a previously activated user, 2-5% per campaign (d08 §6.5)
export const TRIAL_ENDING_MAX_LIFT = 0.15; // [design] trial drips +10-20% relative; the 22% vendor claim is [unverified]
export const ACTIVATED_CONV_MULT = 4; // [design] activated trials convert ~3-4x non-activated
export const ACTIVATED_RET_MULT = 2.5; // activated accounts retain 2-3x better by month 3 (Amplitude via world.js PRODUCT_ANALYTICS)
export const HOURS = { setup: 1, dns: 0.5, email: 0.4, aiDraft: 0.1, flowOther: 0.25, broadcast: 0.5, analysis: 1, intent: 1, weeklyReview: 0.5 }; // [design] d08: build 4-6 h for a full set
const TRANSACTIONAL_PER_SIGNUP = 2; // [design] verification / magic link + receipt
const TRANSACTIONAL_PER_ACCOUNT_DAY = 0.03; // [design] password resets, notifications

// ---- Activation event candidates ----
// natural(p): share of signups who reach the event on their own in week 1, given the true activation share p.
// rho: share of email-driven event completions that are real activation (value reached).
export function candidateEvents(state) {
  const feats = (state.apps.product?.features ?? []).filter((f) => f.status === 'shipped').sort((a, b) => (a.shippedDay ?? 0) - (b.shippedDay ?? 0));
  const core = feats[0]?.title ?? 'the main feature';
  const second = feats[1]?.title ?? null;
  const b2c = state.company.model === 'b2c';
  const list = [
    { id: 'logged_in', label: 'Logged in again (second session)', rho: 0.15, natural: (p) => Math.min(0.92, p + 0.45) },
    { id: 'profile_completed', label: 'Completed profile and settings', rho: 0.25, natural: (p) => Math.min(0.85, p + 0.25) },
    { id: 'viewed_dashboard', label: 'Viewed the dashboard 3 times', rho: 0.3, natural: (p) => Math.min(0.8, p + 0.2) },
    { id: 'core_once', label: `Tried "${core}" once (sample data allowed)`, rho: 0.6, natural: (p) => Math.min(0.85, p * 1.3) },
    { id: 'core_own_data', label: `Used "${core}" on their own data, 3 times in week 1`, rho: 1, natural: (p) => p, core: true },
    { id: 'invited', label: b2c ? 'Shared something with a friend' : 'Invited a teammate', rho: b2c ? 0.45 : 0.75, natural: (p) => p * 0.5 },
  ];
  if (second) list.push({ id: 'second_feature', label: `Set up "${second}"`, rho: 0.55, natural: (p) => p * 0.6 });
  return list;
}
export const eventById = (state, id) => candidateEvents(state).find((e) => e.id === id) ?? null;

export const TRIGGERS = {
  signup: { label: 'Contact created (signed up / trial started)', kinds: ['welcome', 'custom'] },
  not_activated: { label: 'Has not reached the activation event N days after signup', needsEvent: true, kinds: ['nudge', 'custom'] },
  activated: { label: 'Reached the activation event (goal)', needsEvent: true, kinds: ['custom'] },
  trial_will_end: { label: 'Stripe trial_will_end (N days before the trial ends)', kinds: ['trial_ending', 'custom'] },
  canceled: { label: 'Subscription canceled (churned)', kinds: ['winback', 'custom'] },
  payment_failed: { label: 'Payment failed (dunning: owned by Payments → Billing)', disabled: true, kinds: [] },
};
export const INTENTS = { b2c: ['personal', 'household', 'work'], smb: ['solo', 'team', 'evaluating'], ent: ['team', 'evaluating', 'it_admin'] };

// ---- Slice ----
export function ensureLifecycle(state) {
  state.apps ??= {};
  const L = (state.apps.lifecycle ??= {});
  L.salt ??= String(state.seed ?? 0); // per-game salt for contact draws (reading the seed does not advance it)
  L.vendor ??= null; // 'loops' | 'customerio'
  L.domain ??= { spf: false, dkim: false, dmarc: false, reputation: 70 };
  L.activationEvent ??= null; // { id, day, validated }
  L.eventHistory ??= [];
  L.analyses ??= [];
  L.contacts ??= [];
  L.flows ??= [];
  L.broadcasts ??= [];
  L.daily ??= []; // { day, sent, delivered, complaints, unsub, transactional, blocked }
  L.events ??= []; // automation events (contact_entered_flow, goal_reached, unsubscribed, complaint)
  L.settings ??= { intentField: false };
  L.lastSyncCustomer ??= 0;
  L.mistakeDays ??= {};
  L.stats ??= { emailActivations: 0, lostActivations: 0, reactivations: 0, spamDays: 0 };
  return L;
}

const today = (state) => state.day ?? 0;
const eventOf = (state, L) => (L.activationEvent ? eventById(state, L.activationEvent.id) : null);

// ---- Contacts ----
// Per-contact hidden draws come from a hash of the customer id, not rng(state): syncing contacts must not shift the
// shared random stream other apps draw from (a player who never opens Lifecycle sees the same world).
export function h01(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function makeContact(state, { customerId = null, subId = null, email = '', name = '', p = 0.375, status = 'trial' }) {
  const intents = INTENTS[state.company.model] ?? INTENTS.smb;
  const id = uid('lc');
  const k = `${state.apps?.lifecycle?.salt ?? ''}|${customerId ?? id}`;
  return {
    id, cid: customerId, sub: subId, email, name, d: today(state),
    u: h01(`${k}|u`), p: round2(p), o: Math.floor(h01(`${k}|o1`) * h01(`${k}|o2`) * 7), // self-activation 0-6 days in, front-loaded
    intent: intents[Math.floor(h01(`${k}|i`) * intents.length)],
    status, enr: {}, s7: [], unsub: false, comp: false,
    em: null, emEv: null, ea: null, lostDay: null, churnDay: null,
  };
}

const selfDay = (c) => c.d + c.o;
const lostBeforeSelf = (c) => c.lostDay != null && c.lostDay < selfDay(c);
export function isActivated(c, t) {
  if (c.ea != null && c.ea <= t) return true;
  return !lostBeforeSelf(c) && c.u < c.p && t >= selfDay(c);
}
export function reachedEvent(c, ev, t) {
  if (!ev) return false;
  if (ev.core && isActivated(c, t)) return true;
  if (c.em != null && c.emEv === ev.id && c.em <= t) return true;
  return !lostBeforeSelf(c) && c.u < ev.natural(c.p) && t >= selfDay(c);
}

// Sync contacts from Stripe customers created since the last sync.
export function syncContacts(state, L, baseP) {
  const st = state.stripe;
  if (!st) return 0;
  let n = 0;
  for (let i = L.lastSyncCustomer; i < st.customers.length; i++) {
    const cu = st.customers[i];
    const sub = st.subscriptions.find((s) => s.customerId === cu.id && s.startDay >= cu.createdDay - 1) ?? null;
    L.contacts.push(makeContact(state, { customerId: cu.id, subId: sub?.id ?? null, email: cu.email, name: cu.name, p: baseP, status: sub?.status === 'trialing' ? 'trial' : 'paid' }));
    n++;
  }
  L.lastSyncCustomer = st.customers.length;
  return n;
}

// ---- Copy heuristics (offline judge; shrunk toward the median before use) ----
const DISCOUNT_RE = /(\d+\s*%\s*off|discount|coupon|promo code|upgrade now|limited[- ]time|flash sale|\bdeal\b|save \d+%|special offer|last chance to save)/i;
const MISS_YOU_RE = /(we miss you|miss you|come back|it'?s been a while)/i;
const KNOWN_VARS = ['firstName', 'lastName', 'company', 'email', 'myCompany', 'senderName', 'trialEndDate', 'ctaUrl'];
const tokens = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);

export function lintEmail({ subject = '', body = '' }, { kind = 'custom', event = null, featureTitles = [] } = {}) {
  const text = `${subject}\n${body}`;
  const lower = text.toLowerCase();
  const plain = body.replace(/\{\{[^}]+\}\}/g, 'X');
  const w = plain.trim().split(/\s+/).filter(Boolean).length;
  const links = (body.match(/https?:\/\/|www\.|\{\{\s*ctaUrl\s*\}\}|\[[^\]]+\]\([^)]+\)/gi) ?? []).length;
  const bullets = (body.match(/^\s*([-*•]|\d+\.)\s+/gm) ?? []).length;
  const vars = [...body.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]);
  const badVars = vars.filter((v) => !KNOWN_VARS.includes(v));
  const buzz = BUZZWORDS.filter((b) => lower.includes(b));
  const slop = AI_SLOP.filter((b) => lower.includes(b));
  const spam = SPAM_WORDS.filter((b) => lower.includes(b));
  const discount = DISCOUNT_RE.test(text);
  const missYou = MISS_YOU_RE.test(text);
  const evTok = event ? tokens(event.label).filter((t) => !['used', 'their', 'times', 'week', 'once', 'data', 'sample', 'allowed'].includes(t)) : [];
  const featTok = featureTitles.flatMap(tokens);
  const stem = (t) => t.slice(0, 6);
  const namesAction = (evTok.length ? evTok.filter((t) => lower.includes(stem(t))).length >= Math.min(2, evTok.length) : false) || featTok.some((t) => lower.includes(stem(t)));
  const toks = tokens(plain);
  const repetitive = toks.length >= 8 && new Set(toks).size / toks.length < 0.5;
  const issues = [];
  let s = 0.75;
  if (w < 25) { s -= 0.15; issues.push('Too short to give one concrete next step.'); }
  if (w > 160) { s -= Math.min(0.3, (w - 160) / 300); issues.push(`${w} words: lifecycle emails that work are short (60-150 words) with one job.`); }
  if (links === 0) { s -= 0.12; issues.push('No call to action link ({{ctaUrl}} or a URL): the reader has nothing to click.'); }
  if (repetitive) { s -= 0.3; issues.push('Repeats the same words: reads as spam, not as a person.'); }
  if (links > 2 || bullets > 4) { s -= 0.15; issues.push('Several links or a list of things to try reads as a newsletter. One email, one action.'); }
  if (!namesAction && ['welcome', 'nudge', 'trial_ending'].includes(kind)) { s -= 0.15; issues.push(event ? `Doesn't point at your activation event ("${event.label}").` : 'No specific action named. Define an activation event and point at it.'); }
  if (discount && ['welcome', 'nudge'].includes(kind)) { s -= 0.2; issues.push('Discount or upgrade pitch to people who have not activated yet. Get them to the first useful action first.'); }
  else if (discount) { s -= 0.05; issues.push('Discounts train people to wait for the next one.'); }
  if (missYou && kind === 'winback') issues.push('"We miss you" only lands with people who got value before. Filter win-back to previously activated users.');
  s -= Math.min(0.25, buzz.length * 0.05) + Math.min(0.3, slop.length * 0.08) + Math.min(0.3, spam.length * 0.1);
  if (buzz.length) issues.push(`Buzzwords: ${buzz.join(', ')}`);
  if (slop.length) issues.push(`Reads like AI filler: "${slop.join('", "')}"`);
  if (spam.length) issues.push(`Spam-filter words: ${spam.join(', ')}`);
  if (badVars.length) { s -= 0.15; issues.push(`Unknown merge field ${badVars.map((v) => `{{${v}}}`).join(', ')}: it renders blank or literally. Known: ${KNOWN_VARS.join(', ')}.`); }
  const sw = subject.trim().split(/\s+/).filter(Boolean).length;
  if (!subject.trim()) { s -= 0.2; issues.push('No subject line.'); }
  else if (sw > 9) { s -= 0.05; issues.push('Long subject: 3-7 plain words.'); }
  if (/[A-Z]{5,}/.test(subject) || /!{1,}/.test(subject)) { s -= 0.08; issues.push('Shouty subject line.'); }
  const spamminess = clamp(spam.length * 0.25 + buzz.length * 0.05 + (discount ? 0.2 : 0) + (links > 2 ? 0.1 : 0), 0, 1);
  return { score: clamp(s, 0.05, 1), words: w, links, discount, missYou, namesAction, spamminess, issues };
}

// The quality actually used for a node: the LLM judge if it ran, else the shrunk heuristic. Unedited AI drafts read
// as AI and are capped [design, gap item 3: "AI drafts are generic by default and carry a reads-as-AI penalty"].
export function nodeQuality(node) {
  let q = node.judge?.score ?? (0.2 + 0.6 * (node.lint?.score ?? 0.5)); // offline: shrink(h, n=3, 0.5, k=2) = 0.6h + 0.2
  if (node.aiDraft && !node.edited) q = Math.min(q, 0.42);
  return clamp(q, 0.05, 1);
}
export const nodeClarity = (node, ev) => (node.judge ? (node.judge.pointsToActivation ? 1 : 0.5) : node.lint?.namesAction ? 1 : 0.5) * (ev ? 1 : 0.5);

// ---- Flow structure ----
export function newFlow(kind = 'custom', name = '') {
  const t = { welcome: 'signup', nudge: 'not_activated', trial_ending: 'trial_will_end', winback: 'canceled', custom: 'signup' }[kind] ?? 'signup';
  return { id: uid('flow'), name: name || kind, kind, trigger: t, triggerDays: t === 'not_activated' ? 2 : t === 'trial_will_end' ? 7 : 0, filter: { status: 'any', activation: 'any', intent: 'any' }, exitOnGoal: false, nodes: [], status: 'draft', stats: {}, createdDay: null, publishedDay: null };
}

// Templates give the standard timing skeleton (d08 §6); the copy is left for the player.
export function templateFlow(kind) {
  const f = newFlow(kind, { welcome: 'Welcome', nudge: 'Activation nudges', trial_ending: 'Trial ending', winback: 'Win-back' }[kind]);
  const E = (subject = '') => ({ id: uid('n'), type: 'email', subject, body: '' });
  const D = (days) => ({ id: uid('n'), type: 'delay', days });
  if (kind === 'welcome') f.nodes = [E(), D(1), E(), D(2), E(), D(4), E()];
  if (kind === 'nudge') f.nodes = [E(), D(3), E(), D(5), E()];
  if (kind === 'trial_ending') { f.triggerDays = 7; f.nodes = [E(), D(4), E(), D(2), E()]; }
  if (kind === 'winback') f.nodes = [E(), D(7), E(), D(23), E(), D(30), E()];
  return f;
}

// Structural review of a flow: what a stellar operator would fix before publishing. Returns { score 0..1, issues }.
export function reviewFlow(state, L, f) {
  const ev = eventOf(state, L);
  const emails = f.nodes.filter((n) => n.type === 'email');
  const issues = [];
  let s = 1;
  if (!emails.length) return { score: 0, issues: ['No emails in this flow.'] };
  const T = TRIGGERS[f.trigger];
  if (T?.disabled) { s -= 1; issues.push('Dunning is owned by Payments → Billing.'); }
  if (T?.needsEvent && !ev) { s -= 0.6; issues.push('This trigger needs an activation event. Pick one on the Activation tab.'); }
  const nudgeLike = ['welcome', 'nudge'].includes(f.kind) || ['signup', 'not_activated'].includes(f.trigger);
  if (nudgeLike && !f.exitOnGoal && !f.nodes.some((n) => n.type === 'branch')) { s -= 0.3; issues.push('No goal exit or "has activated?" branch: users who already activated keep getting "get started" mail.'); }
  if (nudgeLike && f.exitOnGoal && !ev) issues.push('Goal exit does nothing until an activation event is defined.');
  if (f.kind === 'winback' && f.filter.activation !== 'activated') { s -= 0.2; issues.push('Win-back goes to never-activated users too. "We miss you" to someone who never got value reads as spam.'); }
  if (f.kind === 'trial_ending' && f.trigger !== 'trial_will_end') { s -= 0.3; issues.push('Trial-ending mail should hang off Stripe trial_will_end (T-7/T-3/T-1).'); }
  if (f.kind === 'welcome' && f.trigger !== 'signup') { s -= 0.2; issues.push('Welcome should start at signup (within 5 minutes).'); }
  // cadence: emails in the first 7 days
  let day = 0, first7 = 0, sameDay = 0, prevEmailDay = -1;
  for (const n of f.nodes) {
    if (n.type === 'delay') day += Number(n.days) || 0;
    if (n.type === 'email') { if (day < 7) first7++; if (day === prevEmailDay) sameDay++; prevEmailDay = day; }
  }
  if (sameDay) { s -= 0.15; issues.push('Two emails on the same day. Space them out.'); }
  if (first7 > 5) { s -= 0.2; issues.push(`${first7} emails in the first week: unsubscribes and complaints climb above ~3 a week.`); }
  if (emails.length > 7) { s -= 0.1; issues.push('Long flow: more than 7 emails, and each extra one adds unsubscribes.'); }
  const disc = emails.filter((n) => n.lint?.discount).length;
  if (disc && nudgeLike && f.filter.activation !== 'activated') issues.push('Upsell/discount email inside an onboarding flow for non-activated users.');
  return { score: clamp(s, 0, 1), issues };
}

// ---- Sending ----
function placement(state, L) {
  const auth = authFactor({ auth: L.domain });
  return clamp(0.97 * auth * (0.35 + 0.65 * (L.domain.reputation ?? 70) / 100), 0.05, 0.99);
}
export function inboxPlacement(state) { return placement(state, ensureLifecycle(state)); }
export function sendCap(state, L) {
  if (!L.vendor) return 0;
  const t = planTier(state, L);
  return t.sendCap ?? Infinity;
}
const sentLast30 = (L, day) => L.daily.filter((d) => d.day > day - 30).reduce((a, d) => a + d.sent + (L.txn?.external ? 0 : d.transactional), 0); // a separate transactional provider no longer shares the marketing quota

function stat(f, node) { return (f.stats[node.id] ??= { sent: 0, delivered: 0, opened: 0, mpp: 0, clicked: 0, goal: 0, unsub: 0, complaints: 0, react: 0 }); }
function dayRow(state, L) {
  let r = L.daily.at(-1);
  if (!r || r.day !== today(state)) { r = { day: today(state), sent: 0, delivered: 0, complaints: 0, unsub: 0, transactional: 0, blocked: 0, goal: 0 }; L.daily.push(r); if (L.daily.length > 400) L.daily.shift(); }
  return r;
}
function pushEvent(L, e) { L.events.push(e); if (L.events.length > 600) L.events.splice(0, L.events.length - 600); }

/**
 * Send one email (flow node or broadcast) to contact c. Returns the outcome flags.
 * ctx: { kind, pos (0 first email, 1 later), q quality, clarity, discount, spamminess, relevant, intentMatch }
 */
export function sendEmail(state, L, c, ctx, st) {
  const t = today(state);
  const row = dayRow(state, L);
  if (c.unsub || c.comp) return { skipped: true };
  const cap = sendCap(state, L);
  if (Number.isFinite(cap) && sentLast30(L, t) >= cap) { row.blocked++; return { blocked: true }; }
  const ev = eventOf(state, L);
  row.sent++; if (st) st.sent++;
  c.s7 = c.s7.filter((d) => d > t - 7); c.s7.push(t);
  const n7 = c.s7.length;
  if (!chance(state, placement(state, L))) return { spam: true }; // landed in spam / bounced
  row.delivered++; if (st) st.delivered++;
  const R = RATES[ctx.kind] ?? RATES.custom;
  const pos = ctx.pos ? 1 : 0;
  const fatigueOpen = n7 > 3 ? Math.pow(0.85, n7 - 3) : 1;
  const rel = ctx.relevant === false ? 0 : ctx.relevant === true || ctx.relevant == null ? 1 : clamp(ctx.relevant, 0, 1);
  const opened = chance(state, clamp(R.open[pos] * (0.75 + 0.5 * ctx.q) * fatigueOpen * (0.7 + 0.3 * rel), 0, 0.9));
  if (opened && st) st.opened++;
  else if (st && chance(state, MPP_INFLATION[state.company.model] ?? 0.12)) st.mpp++;
  let out = { delivered: true, opened };
  // click (relative to delivered, so divide by open share)
  if (opened) {
    const clickGivenOpen = R.click[pos] / R.open[pos];
    const pClick = clamp(clickGivenOpen * (0.4 + 1.2 * ctx.q) * (0.3 + 0.7 * rel) * (ctx.intentMatch ? 1.2 : 1), 0, 0.8);
    if (chance(state, pClick)) {
      out.clicked = true; if (st) st.clicked++;
      // goal: activation action (welcome/nudge/custom) for contacts not yet at the event
      if (['welcome', 'nudge', 'custom', 'broadcast', 'trial_ending'].includes(ctx.kind) && !isActivated(c, t)) {
        const target = ev;
        const already = target ? reachedEvent(c, target, t) : false;
        if (!already && chance(state, ACT_PER_CLICK * ctx.clarity * (ctx.discount ? 0.5 : 1))) {
          if (target) { c.em = t; c.emEv = target.id; }
          const rho = target ? target.rho : 0.45; // no defined event: a generic "try the product" click
          if (chance(state, rho)) { c.ea = t; L.stats.emailActivations++; out.activated = true; }
          out.goal = true; if (st) st.goal++; row.goal++;
          pushEvent(L, { id: `goal:${c.id}:${t}`, type: 'goal_reached', day: t, contactId: c.id, email: c.email, flowId: ctx.flowId ?? null });
        }
      }
      if (ctx.kind === 'winback' && c.status === 'churned' && !c.reactivated) {
        const everAct = isActivated(c, c.churnDay ?? t);
        if (chance(state, WINBACK_REACT_PER_CLICK * (everAct ? 1 : 0.25))) { out.reactivate = true; c.reactivated = true; if (st) st.react++; }
      }
    }
  }
  // unsubscribe / complaint
  const freq = n7 > 3 ? 1 + 0.6 * (n7 - 3) : 1;
  const irr = 1 + 3 * (1 - rel);
  const spamCopy = 1 + 2 * (ctx.spamminess ?? 0);
  if (chance(state, clamp(COMPLAINT_BASE * freq * (1 + 5 * (1 - rel) * (1 - rel)) * spamCopy * (ctx.blast ? 2 : 1), 0, 0.2))) {
    c.comp = true; c.unsub = true; row.complaints++; if (st) st.complaints++; out.complaint = true;
    pushEvent(L, { id: `comp:${c.id}`, type: 'complaint', day: t, contactId: c.id, email: c.email });
  } else if (chance(state, clamp(UNSUB_BASE * freq * irr * spamCopy * (ctx.blast ? 1.5 : 1), 0, 0.3))) {
    c.unsub = true; row.unsub++; if (st) st.unsub++; out.unsub = true;
    pushEvent(L, { id: `unsub:${c.id}`, type: 'unsubscribed', day: t, contactId: c.id, email: c.email });
  }
  // annoyed new users tune out: a contact who would have activated on their own later may not [design]
  if (!isActivated(c, t) && c.lostDay == null && t < selfDay(c) && c.u < c.p) {
    const pLose = (out.unsub || out.complaint ? 0.5 : 0) + 0.04 * (1 - rel) + (n7 > 3 ? 0.03 * (n7 - 3) : 0) + (ctx.discount && ['welcome', 'nudge', 'broadcast'].includes(ctx.kind) ? 0.03 : 0);
    if (pLose > 0 && chance(state, Math.min(0.8, pLose))) { c.lostDay = t; L.stats.lostActivations++; }
  }
  return out;
}

// ---- Flow engine ----
function passesFilter(state, L, f, c, t) {
  if (c.unsub || c.comp) return false;
  const ev = eventOf(state, L);
  const fl = f.filter ?? {};
  if (fl.status && fl.status !== 'any' && c.status !== fl.status) return false;
  if (fl.activation === 'activated' && !(ev ? reachedEvent(c, ev, t) : false)) return false;
  if (fl.activation === 'not_activated' && ev && reachedEvent(c, ev, t)) return false;
  if (fl.intent && fl.intent !== 'any' && (!L.settings.intentField || c.intent !== fl.intent)) return false;
  return true;
}

function enrol(state, L, f, c, t) {
  if (c.enr[f.id] || c.done?.includes(f.id)) return false;
  c.enr[f.id] = { i: 0, at: t };
  f.enrolled = (f.enrolled ?? 0) + 1;
  pushEvent(L, { id: `enr:${f.id}:${c.id}`, type: 'contact_entered_flow', day: t, contactId: c.id, email: c.email, flowId: f.id });
  return true;
}
function finish(c, f) { delete c.enr[f.id]; (c.done ??= []).push(f.id); }

function runEnrollment(state, L, f, c, t, ev, live) {
  const e = c.enr[f.id];
  let guard = 0;
  while (e && e.at <= t && guard++ < 30) {
    if (f.exitOnGoal && ev && reachedEvent(c, ev, t)) { f.goalExits = (f.goalExits ?? 0) + 1; return finish(c, f); }
    const node = f.nodes[e.i];
    if (!node) return finish(c, f);
    if (node.type === 'delay') { e.i++; e.at = t + Math.max(0, Number(node.days) || 0); if (e.at > t) return; continue; }
    if (node.type === 'branch') {
      const act = ev ? reachedEvent(c, ev, t) : false;
      if ((node.cond ?? 'activated') === 'activated' ? act : !act) return finish(c, f);
      e.i++; continue;
    }
    if (node.type === 'email') {
      const firstEmail = f.nodes.findIndex((n) => n.type === 'email') === e.i;
      const kind = f.kind === 'custom' ? 'custom' : f.kind;
      const evNow = ev && reachedEvent(c, ev, t);
      const actNow = isActivated(c, t);
      // relevance: onboarding mail to someone already activated, win-back to someone who never got value, upsell to non-activated
      // 1 = relevant, 0.5 = stale (onboarding mail to someone who already activated), 0 = wrong audience
      let relevant = 1;
      if (['welcome', 'nudge'].includes(kind) && !firstEmail && (ev ? evNow : actNow)) relevant = 0.5;
      if (kind === 'winback' && !isActivated(c, c.churnDay ?? t)) relevant = 0;
      if (node.lint?.discount && !actNow && ['welcome', 'nudge'].includes(kind)) relevant = 0;
      const ctx = { kind, pos: firstEmail ? 0 : 1, q: nodeQuality(node), clarity: nodeClarity(node, ev), discount: node.lint?.discount, spamminess: node.lint?.spamminess ?? 0, relevant, intentMatch: L.settings.intentField && f.filter?.intent && f.filter.intent !== 'any' && f.filter.intent === c.intent, flowId: f.id };
      const out = sendEmail(state, L, c, ctx, stat(f, node));
      if (out.reactivate) live.push(c);
      if (relevant < 1 && !out.skipped) f.irrelevantSends = (f.irrelevantSends ?? 0) + 1;
      e.i++;
      e.at = t;
      // one email per flow per day
      if (f.nodes[e.i]?.type === 'email') e.at = t + 1;
      if (e.at > t) return;
      continue;
    }
    e.i++;
  }
}

export function planTier(state, L = ensureLifecycle(state)) {
  const v = ESP[L.vendor];
  if (!v) return { price: 0, name: 'none', max: 0 };
  const n = billableContacts(L);
  const t = v.tiers.find((x) => n <= x.max) ?? v.tiers.at(-1);
  const over = n > t.max && v.overagePerProfile ? Math.round((n - t.max) * v.overagePerProfile) : 0;
  return { ...t, price: t.price + over, contacts: n };
}
export const billableContacts = (L) => L.contacts.filter((c) => (ESP[L.vendor]?.countsUnsubscribed ? true : !c.unsub)).length;

function bill(state, L) {
  if (!L.vendor) return;
  const t = planTier(state, L);
  const r = state.recurring?.find((x) => x.id === L.billId);
  if (!r) return;
  if (r.amount !== t.price) {
    r.amount = t.price;
    r.note = `${ESP[L.vendor].label} ${t.name} (${t.contacts.toLocaleString('en-US')} billable contacts)`;
    if (t.price > 0) r.active = true;
  }
  if (t.price === 0 && r.active) r.active = false;
}

/** The daily engine (called from lifecycle.onDay). baseP: the insights activation rate with no lift. */
export function lifecycleDay(state, { baseP = 0.375, logMistake = null } = {}) {
  const L = ensureLifecycle(state);
  const t = today(state);
  const created = syncContacts(state, L, baseP);
  const row = dayRow(state, L);
  // yesterday's sending reputation decides whether today's magic links / verification mail reach the inbox
  // A transactional provider configured in apps/emailops (L.txn) sends login mail without a lifecycle ESP, so its
  // losses apply even when no lifecycle vendor is picked.
  const tLoss = L.vendor || L.txn ? transactionalLoss(state, L) : 0;
  if (tLoss > 0) for (let i = L.contacts.length - created; i < L.contacts.length; i++) { const c = L.contacts[i]; if (c.u < c.p && chance(state, tLoss)) { c.lostDay = t; L.stats.lostActivations++; L.stats.transactionalLost = (L.stats.transactionalLost ?? 0) + 1; } }
  // transactional mail goes through the same ESP account and domain (Loops shares the free quota)
  const st = state.stripe;
  const accounts = st ? st.subscriptions.filter((s) => s.status === 'active' || s.status === 'trialing' || s.status === 'past_due').length : 0;
  row.transactional += Math.round(created * TRANSACTIONAL_PER_SIGNUP + accounts * TRANSACTIONAL_PER_ACCOUNT_DAY);
  // Stripe status sync for recent and enrolled contacts
  const subIdx = new Map((st?.subscriptions ?? []).map((s) => [s.id, s]));
  const churnedToday = [];
  for (const c of L.contacts) {
    if (c.status === 'churned' && !c.reactivated) continue;
    const s = c.sub ? subIdx.get(c.sub) : null;
    if (!s) continue;
    if (s.status === 'canceled' || s.status === 'incomplete_expired') { if (c.status !== 'churned') { c.status = 'churned'; c.churnDay = t; churnedToday.push(c); } }
    else if (s.status === 'trialing') c.status = 'trial';
    else c.status = 'paid';
  }
  const ev = eventOf(state, L);
  const live = L.flows.filter((f) => f.status === 'live');
  const reactivate = [];
  if (L.vendor) {
    // triggers
    for (const f of live) {
      const days = Number(f.triggerDays) || 0;
      if (f.trigger === 'signup') { for (let i = L.contacts.length - created; i < L.contacts.length; i++) { const c = L.contacts[i]; if (passesFilter(state, L, f, c, t)) enrol(state, L, f, c, t); } }
      else if (f.trigger === 'not_activated' && ev) {
        for (let i = L.contacts.length - 1; i >= 0; i--) { const c = L.contacts[i]; if (c.d < t - days - 1) break; if (c.d + days === t && !reachedEvent(c, ev, t) && passesFilter(state, L, f, c, t)) enrol(state, L, f, c, t); }
      } else if (f.trigger === 'activated' && ev) {
        for (let i = L.contacts.length - 1; i >= 0; i--) { const c = L.contacts[i]; if (c.d < t - 30) break; if (reachedEvent(c, ev, t) && !reachedEvent(c, ev, t - 1) && passesFilter(state, L, f, c, t)) enrol(state, L, f, c, t); }
      } else if (f.trigger === 'trial_will_end') {
        for (const s of st?.subscriptions ?? []) {
          if (s.status !== 'trialing' || s.trialEndDay == null || s.trialEndDay - (days || 3) !== t) continue;
          const c = L.contacts.find((x) => x.sub === s.id);
          if (c && passesFilter(state, L, f, c, t)) { enrol(state, L, f, c, t); f.trialsReached = (f.trialsReached ?? 0) + 1; }
        }
      } else if (f.trigger === 'canceled') { for (const c of churnedToday) if (passesFilter(state, L, f, c, t)) enrol(state, L, f, c, t); }
    }
    // run enrollments
    const byId = new Map(live.map((f) => [f.id, f]));
    for (const c of L.contacts) {
      const ids = Object.keys(c.enr);
      if (!ids.length) continue;
      for (const id of ids) {
        const f = byId.get(id);
        if (!f) continue; // paused/archived flows hold their enrollments
        runEnrollment(state, L, f, c, t, ev, reactivate);
      }
    }
  }
  // reputation: 30-day complaint rate vs Gmail's 0.3% line [official]; recover slowly when clean
  const last30 = L.daily.filter((d) => d.day > t - 30);
  const del = last30.reduce((a, d) => a + d.delivered, 0);
  const comp = last30.reduce((a, d) => a + d.complaints, 0);
  const rate = del ? comp / del : 0;
  const rep = L.domain.reputation ?? 70;
  let target = 85;
  if (del >= 500 && rate >= SPAM_LINE) target = Math.min(target, 20);
  else if (del >= 500 && rate >= 0.001) target = Math.min(target, 55);
  L.domain.reputation = round2(rep + (target - rep) * (target < rep ? 0.12 : 0.03));
  L.complaintRate30 = rate;
  // mistakes: crossing the spam line, Loops free quota blocking transactional mail
  const mistake = (id, payload) => {
    if (!logMistake) return;
    if (L.mistakeDays[id] != null && t - L.mistakeDays[id] < 30) return;
    L.mistakeDays[id] = t;
    logMistake(state, { functionId: 'lifecycle_activation', id, app: 'lifecycle', ...payload });
  };
  if (L.domain.reputation < 40) {
    L.stats.spamDays++;
    const lost = Math.round(created * 0.15 * 10) / 10;
    mistake('spam_placement', { label: 'Sending domain in spam (complaints over 0.3%)', cost: { reputation: 1, customers: lost }, delayed: true, detail: `Complaint rate ${(rate * 100).toFixed(2)}% over 30 days. Magic links and password resets now land in spam too; new signups fail to log in.` });
  }
  const blockedToday = L.daily.filter((d) => d.day >= t - 1).reduce((a, d) => a + d.blocked, 0);
  if (blockedToday > 0) mistake('quota_blocked', { label: 'Free-tier send quota hit: transactional mail blocked', cost: { hours: 1, customers: Math.max(1, Math.round(created * 0.3)) }, detail: `${blockedToday} sends blocked by the 4,000/30-day Loops Free quota, shared with password resets and receipts.` });
  bill(state, L);
  if (L.contacts.length > 25000) L.contacts.splice(0, L.contacts.length - 25000);
  return { created, reactivate, churnedToday };
}

// Transactional damage: share of today's signups whose login/verification mail lands in spam or is blocked.
export function transactionalLoss(state, L = ensureLifecycle(state)) {
  if (L.txn) return clamp(L.txn.loss ?? 0, 0, 0.6); // set by apps/emailops (transactional provider, own domain, required emails)
  const row = L.daily.at(-1);
  const blocked = row && row.day === today(state) && row.blocked > 0 ? 0.3 : 0;
  const rep = L.domain.reputation ?? 70;
  const spam = rep < 40 ? 0.15 * (40 - rep) / 40 + 0.05 : 0;
  return clamp(blocked + spam, 0, 0.5);
}

// ---- Measured outcomes ----
// True activation lift (fraction, e.g. 0.12 = +12 points) from cohorts created 3-63 days ago: activations caused by
// email minus self-activations lost to annoyance, shrunk toward 0 on small samples.
export function measureLift(state, L = ensureLifecycle(state), { from = 63, to = 3 } = {}) {
  const t = today(state);
  let n = 0, gained = 0, lost = 0, act = 0, base = 0, evReach = 0;
  const ev = eventOf(state, L);
  for (let i = L.contacts.length - 1; i >= 0; i--) {
    const c = L.contacts[i];
    if (c.d > t - to) continue;
    if (c.d < t - from) break;
    n++;
    base += c.p;
    const selfWould = c.u < c.p;
    const actNow = isActivated(c, t);
    if (actNow) act++;
    if (actNow && !(selfWould && !lostBeforeSelf(c))) gained++;
    if (selfWould && lostBeforeSelf(c) && !actNow) lost++;
    if (ev && reachedEvent(c, ev, t)) evReach++;
  }
  const raw = n ? (gained - lost) / n : 0;
  return { n, lift: n ? raw * n / (n + 15) : 0, raw, gained, lost, activation: n ? act / n : null, base: n ? base / n : null, eventRate: n && ev ? evReach / n : null };
}

export function lifecycleLift(state) {
  const L = state.apps?.lifecycle;
  if (!L || !L.contacts?.length) return 0;
  return L.liftCache?.day === state.day ? L.liftCache.lift : measureLift(state, L).lift;
}

// Coverage-weighted trial-ending quality -> conversion multiplier.
export function trialEndingMult(state, L = ensureLifecycle(state)) {
  const f = L.flows.find((x) => x.status === 'live' && x.trigger === 'trial_will_end');
  if (!f || !L.vendor) return 1;
  const emails = f.nodes.filter((n) => n.type === 'email');
  if (!emails.length) return 1;
  const q = emails.reduce((a, n) => a + nodeQuality(n), 0) / emails.length;
  const structure = clamp(emails.length / 3, 0, 1) * (f.filter.status === 'any' || f.filter.status === 'trial' ? 1 : 0.5);
  const disc = emails.some((n) => n.lint?.discount) ? 0.7 : 1;
  return round2(1 + TRIAL_ENDING_MAX_LIFT * clamp((q - 0.3) / 0.6, 0, 1) * structure * disc * placementOrOne(L));
}
const placementOrOne = (L) => clamp(authFactor({ auth: L.domain }) * (0.35 + 0.65 * (L.domain.reputation ?? 70) / 100), 0, 1);

// Market multipliers from the lift: activated trials convert ~3x and retain ~2.5x [design / Amplitude].
export function liftMultipliers(baseRate, lift) {
  const a = clamp(baseRate, 0.01, 0.95), b = clamp(baseRate + lift, 0.01, 0.97);
  const k = ACTIVATED_CONV_MULT, r = ACTIVATED_RET_MULT;
  return {
    conversion: round2((1 + (k - 1) * b) / (1 + (k - 1) * a)),
    churn: round2(((1 - b) + b / r) / ((1 - a) + a / r)),
  };
}

// ---- Broadcasts ----
export const SEGMENTS = {
  all: 'Everyone (all subscribed contacts)',
  activated: 'Activated users',
  not_activated: 'Not activated yet',
  trial: 'In trial',
  paid: 'Paying customers',
  churned_activated: 'Churned, had activated',
};
export function segmentContacts(state, L, seg) {
  const t = today(state);
  const ev = eventOf(state, L);
  const act = (c) => (ev ? reachedEvent(c, ev, t) : isActivated(c, t));
  return L.contacts.filter((c) => !c.unsub && !c.comp && (
    seg === 'all' || (seg === 'activated' && act(c)) || (seg === 'not_activated' && !act(c) && c.status !== 'churned')
    || (seg === 'trial' && c.status === 'trial') || (seg === 'paid' && c.status === 'paid') || (seg === 'churned_activated' && c.status === 'churned' && isActivated(c, c.churnDay ?? t))));
}

export function sendBroadcastNow(state, { subject, body, segment = 'all', lint = null, judge = null, logMistake = null }) {
  const L = ensureLifecycle(state);
  if (!L.vendor) return { ok: false, error: 'Pick an email tool first (Setup).' };
  const t = today(state);
  const lt = lint ?? lintEmail({ subject, body }, { kind: 'custom', event: eventOf(state, L) });
  const node = { lint: lt, judge };
  const list = segmentContacts(state, L, segment);
  const b = { id: uid('bc'), day: t, subject, segment, recipients: list.length, stats: { sent: 0, delivered: 0, opened: 0, mpp: 0, clicked: 0, goal: 0, unsub: 0, complaints: 0, react: 0 }, discount: lt.discount, q: nodeQuality(node) };
  const ev = eventOf(state, L);
  for (const c of list) {
    const actNow = ev ? reachedEvent(c, ev, t) : isActivated(c, t);
    const relevant = !(lt.discount && !actNow) && !(segment === 'all' && lt.missYou && !isActivated(c, t));
    sendEmail(state, L, c, { kind: 'broadcast', pos: 0, q: b.q, clarity: nodeClarity(node, ev) * 0.6, discount: lt.discount, spamminess: lt.spamminess, relevant, blast: segment === 'all', flowId: null }, b.stats);
  }
  L.broadcasts.unshift(b);
  if (L.broadcasts.length > 100) L.broadcasts.length = 100;
  const recentAll = L.broadcasts.filter((x) => x.segment === 'all' && x.day > t - 30).length;
  if (logMistake && segment === 'all' && (lt.discount || recentAll >= 3)) {
    logMistake(state, { functionId: 'lifecycle_activation', id: lt.discount ? 'discount_blast' : 'list_blasts', label: lt.discount ? 'Discount blast to the whole list' : `${recentAll} blasts to everyone in 30 days`, app: 'lifecycle', cost: { customers: round2((b.stats.unsub + b.stats.complaints) * 0.05), reputation: b.stats.complaints ? 1 : 0 }, detail: `${b.stats.unsub} unsubscribed and ${b.stats.complaints} marked it as spam out of ${b.recipients}. Unsubscribed contacts never get onboarding mail again.` });
  }
  return { ok: true, broadcast: b };
}

// ---- Automations exposure (gap analysis §4: Lifecycle triggers and actions) ----
/** Events since a day: contact_entered_flow, goal_reached, unsubscribed, complaint. Each has a stable id. */
export function lifecycleEvents(state, sinceDay = (state.day ?? 0) - 1, types = null) {
  const L = state.apps?.lifecycle;
  if (!L) return [];
  return L.events.filter((e) => e.day >= sinceDay && (!types || types.includes(e.type)));
}
/** Action: enrol a contact (by contactId or email) in a live flow. dryRun supported. Returns { ok, error?, hoursCost, usdCost }. */
export function enrolContact(state, { contactId = null, email = null, flowId, dryRun = false } = {}) {
  const L = ensureLifecycle(state);
  const f = L.flows.find((x) => x.id === flowId);
  const c = L.contacts.find((x) => (contactId && x.id === contactId) || (email && x.email === email));
  const res = (ok, error) => ({ ok, ...(error ? { error } : {}), hoursCost: 0, usdCost: 0 });
  if (!f) return res(false, 'flow not found');
  if (f.status !== 'live') return res(false, 'flow is not live');
  if (!c) return res(false, 'contact not found (the event never reached the email tool)');
  if (c.unsub || c.comp) return res(false, 'contact unsubscribed');
  if (c.enr[f.id] || c.done?.includes(f.id)) return res(false, 'already enrolled');
  if (!dryRun) enrol(state, L, f, c, today(state));
  return res(true);
}
/** Action: send a broadcast. Customer-facing, so it requires approved: true unless dryRun. */
export function sendBroadcast(state, { subject, body, segment = 'all', dryRun = false, approved = false } = {}) {
  const L = ensureLifecycle(state);
  if (!L.vendor) return { ok: false, error: 'no email tool', hoursCost: 0, usdCost: 0 };
  if (!subject || !body) return { ok: false, error: 'subject and body required', hoursCost: 0, usdCost: 0 };
  if (dryRun) return { ok: true, recipients: segmentContacts(state, L, segment).length, hoursCost: 0, usdCost: 0 };
  if (!approved) return { ok: false, error: 'needs approval (customer-facing send)', hoursCost: 0, usdCost: 0 };
  const r = sendBroadcastNow(state, { subject, body, segment });
  return { ...r, hoursCost: 0, usdCost: 0 };
}

// ---- Operator read (functionId lifecycle_activation) ----
export function lifecycleOperatorRead(state) {
  const L = state.apps?.lifecycle;
  if (!L || (!L.flows.some((f) => f.status === 'live') && !L.broadcasts.length && !L.activationEvent)) return { tier: 'unknown', evidence: [], coaching: ['Pick the one action that predicts a user staying and measure it weekly.'] };
  const ev = L.activationEvent ? eventById(state, L.activationEvent.id) : null;
  const m = measureLift(state, L);
  const evidence = [], coaching = [];
  const blasts = L.broadcasts.filter((b) => b.segment === 'all' && b.day > state.day - 30).length;
  const discBlast = L.broadcasts.some((b) => b.discount && b.segment === 'all' && b.day > state.day - 90);
  const live = L.flows.filter((f) => f.status === 'live');
  const behaviour = live.filter((f) => ['not_activated', 'activated', 'trial_will_end'].includes(f.trigger) || f.exitOnGoal).length;
  const irrelevant = live.reduce((a, f) => a + (f.irrelevantSends ?? 0), 0);
  if (ev) evidence.push(`Activation event: ${ev.label}${L.activationEvent.validated ? ' (checked against retention first)' : ''}`);
  if (m.n) evidence.push(`Activation lift from email: ${(m.lift * 100).toFixed(1)} points on ${m.n} signups (${m.gained} activated by email, ${m.lost} lost to annoyance)`);
  evidence.push(`${live.length} live flows, ${behaviour} behaviour-triggered or goal-exiting; ${blasts} blasts to everyone in 30 days; complaint rate ${((L.complaintRate30 ?? 0) * 100).toFixed(2)}%`);
  let tier;
  if (m.n >= 40) tier = m.lift >= 0.09 ? 'stellar' : m.lift >= 0.03 ? 'good' : m.lift >= -0.005 ? 'average' : 'mediocre';
  else {
    const s = (ev ? 0.25 + 0.25 * ev.rho : 0) + Math.min(0.3, behaviour * 0.1) - (blasts >= 3 ? 0.3 : 0) - (discBlast ? 0.2 : 0);
    tier = s >= 0.7 ? 'good' : s >= 0.35 ? 'average' : 'mediocre'; // no stellar read without a measured cohort
    evidence.push('Early read: fewer than 40 signups measured.');
  }
  const down = { stellar: 'good', good: 'average', average: 'mediocre', mediocre: 'mediocre' };
  if ((L.complaintRate30 ?? 0) >= 0.001 || blasts >= 3) tier = down[tier];
  if (!ev) coaching.push('Pick the one action that predicts a user staying and measure it weekly.');
  else if (ev.rho < 0.7) coaching.push('Your activation event is easy to hit but barely predicts retention. Compare retention by event (Activation tab) and pick the core action on real data.');
  if (discBlast) coaching.push('Get them to the first useful action first. Discounts to non-activated users burn the list.');
  if (blasts >= 3) coaching.push('Weekly blasts to everyone raise unsubscribes and complaints. Trigger on behaviour instead.');
  if (irrelevant > 20) coaching.push('Flows keep emailing people who already activated (or never did, for win-back). Add a goal exit or a "has activated?" branch.');
  if (L.settings.intentField === false && live.length >= 2) coaching.push('Split signup by intent on the form and give each use case its own first email.');
  if (tier !== 'stellar') coaching.push('What a stellar operator does: defines one activation event and measures time-to-activation weekly; 4-6 onboarding emails, each with one action, triggered by behaviour not the clock.');
  if (!coaching.length) coaching.push('Keep reading cohort activation monthly and change the flow at the drop-off step, not the subject line.');
  return { tier, score: m.n ? clamp(0.5 + m.lift * 3, 0, 1) : null, n: m.n, evidence, coaching };
}

// ---- Activation-event validation (PostHog "correlation" / retention by cohort) ----
// For each candidate event: share of signups (14-104 days old) who reached it in week 1 and their week-4 retention vs
// those who didn't. Retention comes from the hidden truth (did they really activate?) plus sampling noise, so the
// read is only as good as the sample. Activated accounts retain ~2.5x better (world.js PRODUCT_ANALYTICS).
export const RET_ACTIVATED_W4 = 0.6; // [design] week-4 retention of truly activated signups
export function eventRetentionAnalysis(state, L = ensureLifecycle(state)) {
  const t = today(state);
  const pool = L.contacts.filter((c) => c.d <= t - 14 && c.d > t - 104);
  const n = pool.length;
  const rows = candidateEvents(state).map((ev) => {
    let did = 0, didAct = 0, notAct = 0;
    for (const c of pool) {
      const wk1 = c.d + 7;
      const r = reachedEvent(c, ev, wk1), a = isActivated(c, wk1);
      if (r) { did++; if (a) didAct++; } else if (a) notAct++;
    }
    const not = n - did;
    const ret = (k, m) => {
      if (!m) return null;
      const share = k / m;
      const p = RET_ACTIVATED_W4 / ACTIVATED_RET_MULT + (RET_ACTIVATED_W4 - RET_ACTIVATED_W4 / ACTIVATED_RET_MULT) * share;
      const se = Math.sqrt(p * (1 - p) / m);
      return clamp(p + se * (rng(state) + rng(state) + rng(state) - 1.5) * 2, 0, 1);
    };
    const retDid = ret(didAct, did), retNot = ret(notAct, not);
    return { id: ev.id, label: ev.label, reach: n ? did / n : null, retDid, retNot, ratio: retDid != null && retNot ? retDid / retNot : null, did, not };
  });
  return { day: t, n, lowSample: n < 50, rows };
}
