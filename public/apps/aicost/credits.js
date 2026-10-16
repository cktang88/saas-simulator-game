// Startup credits and perks: programs (data/credit-programs.js), eligibility, applications with an approval delay and
// a deterministic roll, a credits ledger that offsets matching vendor bills before cash (core/bank.js hook), the credit
// cliff, cloud footprint/lock-in, and accounting that treats credits as a contra-expense (never income).
//
// Accounting: a covered bill posts the NET cash amount; txn.meta.gross is the vendor invoice and meta.creditApplied
// what the credit absorbed. No income transaction is ever created, and unused credits are NOT cash or runway.

import { notify } from '../../core/state.js';
import { addRecurring, setCreditOffsetHook, isPreIncorporationAccount, post } from '../../core/bank.js';
import { activeSubs, trialingSubs } from '../../core/stripe.js';
import { hasProduct } from '../../core/market.js';
import { monthKey, round2 } from '../../core/util.js';
import { PROGRAMS, programById, tierById, CREDIT_PARAMS } from '../../data/credit-programs.js';
import { CLOUD } from '../../data/ai-costs.js';
import { perksSlice, aiSlice, hashU, pushEvent, aiMistake, usd0 } from './model.js';

const accountsOf = (state) => activeSubs(state).length + trialingSubs(state).length;
const MONTH = 30.4;

// ---------------------------------------------------------------------------------------------------------
// Context and eligibility
// ---------------------------------------------------------------------------------------------------------

export function fundingFacts(state) {
  const fr = state.apps.fundraising;
  const rounds = fr?.rounds ?? [];
  const raised = rounds.reduce((a, r) => a + (r.amount ?? 0), 0);
  const accelerator = Object.values(fr?.accel ?? {}).some((a) => ['enrolled', 'accepted', 'completed', 'graduated', 'done'].includes(a?.status));
  const institutional = rounds.some((r) => r.instrument === 'priced' || (r.instrument === 'safe' && (r.amount ?? 0) >= 250000));
  return { raised, accelerator, backed: accelerator || institutional };
}

export function perksContext(state) {
  const perks = perksSlice(state);
  const f = fundingFacts(state);
  const aiFirst = Object.values(state.apps.product?.features ?? []).some((x) => x.status === 'shipped' && x.ai?.enabled);
  return {
    website: Boolean(state.company?.website),
    domain: Boolean(state.company?.domain),
    linkedin: Boolean(state.founder?.linkedinText || state.founder?.linkedinFileId || state.apps.fundraising?.linkedin),
    atlas: Boolean(state.company?.incorporated && state.company?.entity === 'ccorp'),
    businessBank: !isPreIncorporationAccount(state),
    ageYears: state.day / 365,
    product: hasProduct(state),
    aiFirst,
    ...f,
    inception: Boolean(perks.flags.inception),
  };
}

const live = (state, c) => c.status === 'active' && c.expiryDay >= state.day;
const allocHeld = (state, alloc, programId, tier) => {
  if (!alloc) return false;
  const perks = perksSlice(state);
  const held = perks.credits.filter((c) => c.alloc === alloc && (c.status !== 'expired' || c.expiryDay > state.day - 365));
  const pend = perks.applications.filter((a) => a.status === 'pending' && programById(a.programId)?.alloc === alloc);
  // The same program's bigger tier is an upgrade, not a duplicate.
  const dup = held.some((c) => !(c.programId === programId && (tier?.amount ?? 0) > c.amount)) || pend.some((a) => !(a.programId === programId && (tier?.amount ?? 0) > (tierById(programById(a.programId), a.tierId)?.amount ?? 0)));
  return dup;
};

/** Checks the player can read before applying: { checks: [{id, label, met}], eligible, failing: [label] }. */
export function eligibility(state, programId, tierId) {
  const p = programById(programId), t = tierById(p, tierId);
  if (!p || !t) return { checks: [], eligible: false, failing: ['Unknown program'] };
  const x = perksContext(state);
  const need = t.needs ?? {};
  const r = p.requires ?? {};
  const checks = [];
  const add = (id, label, met) => checks.push({ id, label, met: Boolean(met) });
  if (r.website) add('website', 'A live company website', x.website);
  if (r.domain) add('domain', 'Your own domain (not a parked page)', x.domain);
  if (r.linkedin) add('linkedin', 'A company or founder LinkedIn profile', x.linkedin);
  if (r.atlas) add('atlas', 'Incorporated as a Delaware C-corp (Atlas-style)', x.atlas);
  if (r.businessBank) add('businessBank', 'A business bank account (not personal checking)', x.businessBank);
  if (need.product) add('product', 'A shipped product to verify', x.product);
  if (need.backed) add('backed', 'A VC, accelerator or partner referral (funded company)', x.backed);
  if (need.accelerator) add('accelerator', 'An accepted or enrolled accelerator', x.accelerator);
  if (need.raisedMin) add('raisedMin', `Raised at least ${usd0(need.raisedMin)}`, x.raised >= need.raisedMin);
  if (need.maxRaised) add('maxRaised', `Raised under ${usd0(need.maxRaised)}`, x.raised < need.maxRaised);
  if (need.maxAgeYears) add('maxAge', `Company founded within ${need.maxAgeYears} years`, x.ageYears <= need.maxAgeYears);
  if (need.aiFirst) add('aiFirst', 'An AI-first product (runtime AI features shipped)', x.aiFirst);
  if (p.alloc) add('noPrior', 'No credits already held or pending from the same allocation', !allocHeld(state, p.alloc, p.id, t));
  const failing = checks.filter((c) => !c.met).map((c) => c.label);
  return { checks, eligible: failing.length === 0, failing };
}

/** Approval probability given the visible signals (hidden from the player). */
export function approvalOdds(state, programId, tierId) {
  const p = programById(programId), t = tierById(p, tierId);
  if (!p || !t) return 0;
  const x = perksContext(state);
  const w = CREDIT_PARAMS.qualityWeights;
  const site = x.website ? Math.max(0.3, Math.min(1, state.market?.fit?.website?.score ?? 0.4) + 0.2) : 0;
  const q = w.website * site + w.product * (x.product ? 1 : 0.3) + w.linkedin * (x.linkedin ? 1 : 0.5);
  let o = t.odds * (0.65 + 0.35 * q);
  if (x.inception && p.kind === 'cloud' && t.route !== 'self') o += CREDIT_PARAMS.inceptionBoost;
  return Math.max(0.03, Math.min(0.97, o));
}

// ---------------------------------------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------------------------------------

/** Apply to a tier. Returns { ok, hours, app } or { ok:false, error }. The caller charges `hours` from the founder's week. */
export function applyToProgram(state, programId, tierId) {
  const p = programById(programId), t = tierById(p, tierId);
  if (!p || !t) return { ok: false, error: 'Unknown program' };
  const perks = perksSlice(state);
  if (perks.applications.some((a) => a.programId === programId && a.tierId === tierId && (a.status === 'pending' || a.status === 'approved'))) return { ok: false, error: 'You already applied to this tier.' };
  const denied = perks.applications.filter((a) => a.programId === programId && a.tierId === tierId && a.status === 'denied').at(-1);
  if (denied && state.day - denied.decisionDay < 60) return { ok: false, error: 'Denied recently: most programs ignore a re-application inside ~60 days. Improve your site, product or referral first.' };
  const el = eligibility(state, programId, tierId);
  const app = {
    id: `app_${++perks.appSeq}_${programId}_${tierId}`, programId, tierId, appliedDay: state.day, hours: t.hours,
    decisionDay: state.day + t.delay[0] + Math.floor(hashU(`${perks.rseed}|d|${perks.appSeq}`) * (t.delay[1] - t.delay[0] + 1)),
    status: 'pending', eligible: el.eligible, failing: el.failing,
    roll: hashU(`${perks.rseed}|r|${perks.appSeq}|${programId}|${tierId}`),
  };
  perks.applications.push(app);
  return { ok: true, hours: t.hours, app };
}

function grantCredit(state, perks, p, t, spec) {
  const c = {
    id: `cr_${perks.credits.length + 1}_${p.id}`, programId: p.id, tierId: t.id, name: `${p.name}${spec ? '' : ` - ${t.label}`}`,
    kind: spec?.kind ?? p.kind, provider: spec?.provider ?? p.provider ?? null, vendor: spec?.vendor ?? p.vendor ?? null,
    covers: spec?.covers ?? p.covers, alloc: spec?.alloc ?? p.alloc ?? null, pct: t.pct ?? null,
    amount: spec?.amount ?? t.amount, balance: spec?.amount ?? t.amount, used: 0, saved: 0,
    grantedDay: state.day, expiryDay: state.day + Math.round((spec?.months ?? t.months) * MONTH), status: 'active', recent: [], warned: [], planned: false,
  };
  if (spec) c.name = `${p.name}: ${spec.provider ?? spec.vendor} credits`;
  perks.credits.push(c);
  return c;
}

function decide(state, perks, app) {
  const p = programById(app.programId), t = tierById(p, app.tierId);
  app.status = 'decided';
  if (!app.eligible) {
    app.status = 'ineligible';
    app.reason = `Not eligible: ${app.failing.join('; ')}.`;
    aiMistake(state, { functionId: 'startup_perks', id: 'applied_ineligible', label: `Applied to ${p.name} while ineligible`, cost: { hours: app.hours }, detail: app.reason, circles: true, key: `applied_ineligible:${app.id}` });
    notify(state, `${p.name}: application rejected. ${app.reason} That was ${app.hours} h of founder time for nothing.`, { type: 'warn', app: 'bank' });
    return;
  }
  const odds = approvalOdds(state, app.programId, app.tierId);
  app.odds = round2(odds);
  if (app.roll >= odds) {
    app.status = 'denied';
    app.reason = 'Declined (no reason given). Programs deny roughly one in three eligible applications.';
    notify(state, `${p.name} (${t.label}): declined. You can re-apply in ~60 days with a stronger site, shipped product or a referral.`, { type: 'warn', app: 'bank' });
    return;
  }
  app.status = 'approved';
  const made = [];
  if (t.perk) { perks.flags[t.perk] = true; }
  if (t.grants) for (const g of t.grants) made.push(grantCredit(state, perks, p, t, g));
  else if (t.amount > 0 || t.pct) made.push(grantCredit(state, perks, p, t, null));
  app.creditIds = made.map((c) => c.id);
  const total = made.reduce((a, c) => a + c.amount, 0);
  pushEvent(perks, state, 'credit_application_approved', { programId: p.id, tierId: t.id, amount: total, text: `${p.name} approved (${t.label}).` });
  notify(state, `${p.name} approved: ${t.pct ? `${Math.round(t.pct * 100)}% off` : usd0(total)} (${t.label}). Credits offset matching bills before cash and expire in ~${t.months} month(s).`, { type: 'good', app: 'bank' });
}

// ---------------------------------------------------------------------------------------------------------
// Applying credits to bills (core/bank.js hook)
// ---------------------------------------------------------------------------------------------------------

const matches = (c, { counterparty, category, meta }) => {
  if (c.kind === 'cloud' || c.kind === 'lab') return meta?.provider === c.provider && (c.covers.includes(category) || meta?.dev === true);
  if (!c.vendor) return false;
  return new RegExp(c.vendor, 'i').test(String(counterparty ?? '')) && c.covers.includes(category);
};

function creditOffset(state, bill) {
  const perks = state.apps.perks;
  if (!perks?.credits?.length) return 0;
  let remaining = -bill.amount;
  let covered = 0;
  const order = perks.credits.filter((c) => live(state, c) && matches(c, bill)).sort((a, b) => a.expiryDay - b.expiryDay);
  for (const c of order) {
    if (remaining <= 0.004) break;
    let take;
    if (c.pct) take = round2(remaining * c.pct);
    else take = round2(Math.min(c.balance, remaining));
    if (take <= 0) continue;
    if (c.pct) c.saved = round2(c.saved + take); else c.balance = round2(c.balance - take);
    c.used = round2(c.used + take);
    c.recent.push({ day: state.day, usd: take });
    if (c.recent.length > 60) c.recent.splice(0, c.recent.length - 60);
    const m = monthKey(state);
    const u = (perks.usage[m] ??= {});
    u[c.id] = round2((u[c.id] ?? 0) + take);
    covered = round2(covered + take);
    remaining = round2(remaining - take);
    if (!c.pct && c.balance <= 0.5) { c.balance = 0; c.status = 'exhausted'; c.endDay = state.day; c.endReason = 'exhausted'; onCliff(state, perks, c, 'exhausted'); }
  }
  return covered;
}
setCreditOffsetHook(creditOffset);

/** Monthly spend the credit has been absorbing (rolling ~60 days). */
export function burnPerMonth(state, c) {
  const from = state.day - 60;
  const sum = c.recent.filter((x) => x.day > from).reduce((a, x) => a + x.usd, 0);
  const span = Math.max(20, Math.min(60, state.day - c.grantedDay + 1));
  return round2((sum / span) * MONTH);
}

function onCliff(state, perks, c, reason) {
  const burn = burnPerMonth(state, c);
  c.cliffBurn = burn;
  if (reason === 'exhausted') pushEvent(perks, state, 'credits_exhausted', { creditId: c.id, name: c.name, monthlyUsd: burn, text: `${c.name} is used up.` });
  else pushEvent(perks, state, 'credits_exhausted', { creditId: c.id, name: c.name, monthlyUsd: burn, expired: true, text: `${c.name} expired.` });
  if (burn >= 30) {
    notify(state, `${c.name} ${reason === 'exhausted' ? 'ran out' : 'expired'}: about ${usd0(burn)}/month that credits were covering now hits your cash.`, { type: 'bad', app: 'bank' });
    if (!c.planned) {
      aiMistake(state, { functionId: 'startup_perks', id: 'credit_cliff_surprise', label: `${c.name} ended with no plan`, cost: { usd: Math.round(burn * 2) }, delayed: true, detail: `The bill jumped by about ${usd0(burn)}/month with no cutover plan, forecast line or right-sizing done ahead of time.`, key: `cliff:${c.id}` });
    }
    const cl = perks.cloud;
    if ((c.kind === 'cloud' || c.kind === 'lab') && cl.provider === c.provider && cl.footprint === 'overbuilt') {
      const f = CLOUD.footprints, accts = accountsOf(state);
      const extra = (f.overbuilt.base + f.overbuilt.perAcct * accts) - (f.standard.base + f.standard.perAcct * accts);
      aiMistake(state, { functionId: 'startup_perks', id: 'overprovisioned_on_credits', label: 'Built big because the cloud was free', cost: { usd: Math.round(extra * 3), hours: 6 }, delayed: true, detail: `The over-provisioned footprint now costs about ${usd0(extra)}/month more than a standard one, in cash.`, key: `overprov:${c.id}` });
    }
  }
  const adopted = burn > 0 ? state.recurring.find((r) => r.perkTool && r.active && c.vendor && new RegExp(c.vendor, 'i').test(r.vendor)) : null;
  if (adopted) aiMistake(state, { functionId: 'startup_perks', id: 'overprovisioned_on_credits', label: `Adopted ${adopted.vendor} only because it was free`, cost: { usd: Math.round(adopted.amount * 3) }, delayed: true, detail: `${adopted.vendor} (${usd0(adopted.amount)}/month) was added for the perk; now it is a cash bill, usually for a tool the team barely uses.`, key: `overprov_tool:${c.id}` });
}

export function creditsDay(state) {
  const perks = state.apps.perks;
  if (!perks) return;
  for (const a of perks.applications) if (a.status === 'pending' && a.decisionDay <= state.day) decide(state, perks, a);
  for (const c of perks.credits) {
    if (c.status !== 'active') continue;
    if (c.expiryDay < state.day) {
      c.status = 'expired'; c.endDay = c.expiryDay; c.endReason = 'expired'; c.wasted = round2(c.balance);
      onCliff(state, perks, c, 'expired');
      continue;
    }
    for (const w of CREDIT_PARAMS.expiryWarnDays) {
      if (c.expiryDay - state.day <= w && !c.warned.includes(w) && (c.balance > 100 || c.pct)) {
        c.warned.push(w);
        pushEvent(perks, state, 'credits_expiring', { creditId: c.id, name: c.name, daysLeft: c.expiryDay - state.day, balance: c.balance, text: `${c.name} expires in ${c.expiryDay - state.day} days with ${c.pct ? 'a discount ending' : `${usd0(c.balance)} left`}.` });
        notify(state, `${c.name} expires in ~${c.expiryDay - state.day} days (${c.pct ? 'discount ends' : `${usd0(c.balance)} unspent`}). Plan the cutover in Money → Perks & credits.`, { type: 'warn', app: 'bank' });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Cliff schedule (Money forecast reads this) and plans
// ---------------------------------------------------------------------------------------------------------

/** Future steps where covered spend turns into cash: [{ creditId, name, day, monthlyUsd, reason }]. */
export function cliffSchedule(state) {
  const perks = state.apps.perks;
  if (!perks) return [];
  const out = [];
  for (const c of perks.credits) {
    if (!live(state, c)) continue;
    const burn = burnPerMonth(state, c);
    if (burn < 5) continue;
    let day = c.expiryDay, reason = 'expires';
    if (!c.pct) {
      const left = Math.round((c.balance / burn) * MONTH);
      if (state.day + left < day) { day = state.day + left; reason = 'runs out'; }
    }
    out.push({ creditId: c.id, name: c.name, day: Math.max(state.day + 1, day), monthlyUsd: burn, reason, planned: c.planned });
  }
  return out.sort((a, b) => a.day - b.day);
}

/** Record a plan for a credit's end: 'forecast' (the cliff is in your forecast and you have a budget), 'rightsize', 'migrate', 'raise'. */
export function planCliff(state, creditId, choice) {
  const perks = perksSlice(state);
  const c = perks.credits.find((x) => x.id === creditId);
  if (!c) return { ok: false, error: 'No such credit' };
  if (!['forecast', 'rightsize', 'migrate', 'raise'].includes(choice)) return { ok: false, error: 'Unknown plan' };
  c.planned = true; c.plan = { choice, day: state.day };
  let hours = CREDIT_PARAMS.cliffPlanHours;
  if (choice === 'rightsize') { perks.cloud.footprint = perks.cloud.footprint === 'overbuilt' ? 'standard' : perks.cloud.footprint; perks.cloud.oversizedSince = null; hours = CREDIT_PARAMS.rightsizeHours; }
  return { ok: true, hours };
}

export const cloudBill = (state) => {
  const c = perksSlice(state).cloud;
  if (c.provider === 'default') return 0;
  const f = CLOUD.footprints[c.footprint];
  return round2(f.base + f.perAcct * accountsOf(state));
};

/** Move production hosting to a provider (the default stack's Vercel/Supabase bills stop). Returns { ok, hours }. */
export function moveCloud(state, provider) {
  const perks = perksSlice(state);
  const cl = perks.cloud;
  if (!CLOUD.providers[provider]) return { ok: false, error: 'Unknown provider' };
  if (cl.provider === provider) return { ok: false, error: 'Already there' };
  const months = cl.sinceDay == null ? 0 : (state.day - cl.sinceDay) / MONTH;
  const lock = 1 + Math.min(1.5, months * CLOUD.lockInPerMonth) * (cl.footprint === 'overbuilt' ? 1.4 : 1);
  const hours = Math.round(CLOUD.moveHours * (cl.provider === 'default' ? 1 : lock) * 10) / 10;
  cl.provider = provider; cl.sinceDay = state.day; cl.moves++;
  for (const r of state.recurring) {
    if (provider === 'default') { if (r.movedToCloud) { r.active = true; r.movedToCloud = false; } }
    else if (r.active && /^(vercel|supabase)$/i.test(r.vendor)) { r.active = false; r.movedToCloud = true; }
  }
  return { ok: true, hours };
}
export function setFootprint(state, footprint) {
  const cl = perksSlice(state).cloud;
  if (!CLOUD.footprints[footprint]) return { ok: false, error: 'Unknown footprint' };
  const was = cl.footprint;
  cl.footprint = footprint;
  cl.oversizedSince = footprint === 'overbuilt' ? state.day : null;
  return { ok: true, hours: was === 'overbuilt' && footprint !== 'overbuilt' ? CLOUD.rightsizeHours : 1 };
}
/** Hours to switch away from a provider now, rising with time on it and an over-built footprint (lock-in). */
export function switchingHours(state) {
  const cl = perksSlice(state).cloud;
  if (cl.provider === 'default') return CLOUD.moveHours;
  const months = cl.sinceDay == null ? 0 : (state.day - cl.sinceDay) / MONTH;
  return Math.round(CLOUD.moveHours * (1 + Math.min(1.5, months * CLOUD.lockInPerMonth) * (cl.footprint === 'overbuilt' ? 1.4 : 1)) * 10) / 10;
}

/** Set up a vendor's tool because a perk exists. The perk offsets it while it lasts; at the cliff it is a cash bill. */
export function adoptTool(state, programId) {
  const p = programById(programId);
  if (!p?.tool) return { ok: false, error: 'Nothing to adopt' };
  if (state.recurring.some((r) => r.active && new RegExp(p.vendor, 'i').test(r.vendor))) return { ok: false, error: `You already run ${p.tool.vendor}.` };
  const r = addRecurring(state, { vendor: p.tool.vendor, amount: p.tool.monthly, category: p.tool.category, dayOfMonth: 9, note: `Adopted for the ${p.name} perk` });
  r.perkTool = programId;
  return { ok: true, hours: CREDIT_PARAMS.adoptToolHours };
}

/** Monthly: cloud hosting bill to the chosen provider and a perks snapshot. */
export function perksMonthEnd(state) {
  const perks = state.apps.perks;
  if (!perks) return;
  const cl = perks.cloud;
  const bill = cloudBill(state);
  if (bill > 0) {
    const prov = CLOUD.providers[cl.provider];
    post(state, { amount: -bill, counterparty: prov.counterparty, description: `Hosting and managed services (${CLOUD.footprints[cl.footprint].label.split(' (')[0].toLowerCase()} footprint)`, category: 'hosting', method: 'card', meta: { provider: cl.provider, app: 'aicost', usage: true } });
    cl.lastBill = bill;
  }
  const m = monthKey(state);
  const used = Object.values(perks.usage[m] ?? {}).reduce((a, x) => a + x, 0);
  perks.hist.push({ month: m, applied: round2(used), balance: round2(totalBalance(state)) });
  if (perks.hist.length > 60) perks.hist.shift();
}

// ---------------------------------------------------------------------------------------------------------
// Accounting views
// ---------------------------------------------------------------------------------------------------------

export const totalBalance = (state) => round2((state.apps.perks?.credits ?? []).filter((c) => live(state, c) && !c.pct).reduce((a, c) => a + c.balance, 0));
export const creditsApplied = (state) => round2((state.apps.perks?.credits ?? []).reduce((a, c) => a + c.used, 0));
/** The gross vendor bill behind a transaction (credits are a contra-expense against it). */
export const grossSpend = (txn) => (txn.meta?.gross != null ? txn.meta.gross : Math.max(0, -txn.amount));
export function creditsLedger(state, sinceDay = 0) {
  const t = (state.bank?.txns ?? []).filter((x) => x.day >= sinceDay && x.meta?.creditApplied > 0);
  return { gross: round2(t.reduce((a, x) => a + x.meta.gross, 0)), credits: round2(t.reduce((a, x) => a + x.meta.creditApplied, 0)), net: round2(t.reduce((a, x) => a - x.amount, 0)), count: t.length };
}

export function perksEvents(state, since = 0) {
  return (state.apps.perks?.events ?? []).filter((e) => e.day >= since);
}

export function perksSummary(state) {
  const perks = perksSlice(state);
  const active = perks.credits.filter((c) => live(state, c));
  return {
    active: active.length, balance: totalBalance(state), applied: creditsApplied(state), pending: perks.applications.filter((a) => a.status === 'pending').length,
    cliffs: cliffSchedule(state), nominal: round2(perks.credits.reduce((a, c) => a + c.amount, 0)),
    captured: round2(perks.credits.reduce((a, c) => a + c.used, 0)),
    wasted: round2(perks.credits.reduce((a, c) => a + (c.wasted ?? 0), 0)),
  };
}
export { PROGRAMS, programById, tierById, aiSlice };
