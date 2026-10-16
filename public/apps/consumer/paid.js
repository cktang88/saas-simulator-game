// Meta ads for apps: app-install and in-app-purchase campaigns by country tier, Advantage+ app campaigns, the learning phase
// (~50 optimisation events per ad set per week), creative fatigue (winners fade after ~36 days, CPA x1.8 after), saturation, and
// iOS attribution that arrives late and low (SKAN / AEM). The payback view reads the shared cohort ledger so the player can tell,
// with true numbers, whether paid scales. Creatives come from the Ads creatives library, so a hook proven by organic creators
// (promoteToAds) is the same asset here.
// Research: docs/research/consumer-apps/paywall-mobile-playbook.md section 3; ugc-clipping.md section 4. Numbers: ./params.js.

import { PAID, CTR_CURVE, SATURATION, INTENT, MISTAKE_FN } from './params.js';
import { ensureConsumer, samplePoisson, cnormal, saturation, pushEvent, crand, binomial } from './state.js';
import { convertInstalls, currentCommission } from './monetize.js';
import { mobileLive, mobileOn } from './store.js';
import { roasView, deliverVisits } from './funnel.js';
import { ensureAds, addCreative } from '../growth/adsEngine.js';
import { ledgerAdd } from '../growth/acquire.js';
import { hookSkill } from './creators.js';
import { post, balance } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { clamp, round2 } from '../../core/util.js';
import { worldEffect } from '../marketworld/engine.js';

const FN = MISTAKE_FN;
const interp = (curve, x) => {
  for (let i = 1; i < curve.length; i++) if (x <= curve[i][0]) { const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return curve.at(-1)[1];
};
export const ctrAt = (q) => interp(CTR_CURVE, clamp(q, 0, 1));

/** Add a self-made creative to the Ads library for use in app campaigns; its quality draw is hidden, the hook judge nudges it. */
export function addAppCreative(state, { hook, message = '', format = 'ugc_video' } = {}) {
  if (!String(hook ?? '').trim()) return { ok: false, error: 'Write the hook.' };
  const skill = hookSkill(state, hook, message);
  const cr = addCreative(state, { name: `App: ${hook.slice(0, 32)}`, format, hook, primaryText: message, headline: '', cta: 'Install now', source: 'self', skill });
  cr.status = 'approved';
  return { ok: true, hours: PAID.hoursPerCreative, creative: cr, skill };
}

function creativeList(state, c) {
  const A = ensureAds(state);
  return c.creatives.map((x) => ({ ...x, cr: A.creatives.find((k) => k.id === x.id) })).filter((x) => x.cr);
}
const fatigueMult = (x) => {
  const F = PAID.fatigue;
  const over = x.days - x.fatigueAt;
  if (over <= 0) return 1;
  return Math.min(F.cap, 1 + (F.mult - 1) * clamp(over / F.ramp, 0, 1) + 0.01 * Math.max(0, over - F.ramp));
};

export function learningState(c, state) {
  const L = PAID.learning;
  const events = c.events7.reduce((a, b) => a + b, 0);
  if (state.day - c.startDay < L.days || (c.relearnDay != null && state.day - c.relearnDay < L.days)) return { status: 'learning', mult: L.learningCpi, events };
  if (events < L.threshold) return { status: 'limited', mult: L.limitedCpi, events };
  return { status: 'active', mult: 1, events };
}

/** Today's expected CPI of a campaign (pure; the daily sim samples around it). */
export function expectedCpi(state, c) {
  const G = PAID.geo[c.geo];
  const list = creativeList(state, c);
  const sat = saturation(state);
  const C = ensureConsumer(state);
  let wsum = 0, ctr = 0, fat = 0;
  for (const x of list) { const w = Math.pow((x.cr.q ?? 0.3) + 0.05, 2); wsum += w; ctr += w * ctrAt(x.cr.q ?? 0.3); fat += w * fatigueMult(x); }
  const q = list.length ? ctr / wsum : ctrAt(0.2);
  const fatigue = list.length ? fat / wsum : 1;
  const ctrFactor = clamp(ctrAt(PAID.qualityRef) / q, 0.5, 2.4);
  const adv = c.advantage ? (list.length >= PAID.advantage.minCreatives ? PAID.advantage.cpi : PAID.advantage.fewCreativesCpi) : 1;
  const scale = c.budget > PAID.scale.ref ? Math.pow(c.budget / PAID.scale.ref, PAID.scale.exponent) : 1;
  const L = learningState(c, state);
  const world = (() => { try { return worldEffect(state, 'paidCpcMult') || 1; } catch { return 1; } })();
  const cpi = G.cpi * PAID.objective[c.objective].cpi * adv * (1 + SATURATION.cpiMult * sat) * ctrFactor * fatigue * L.mult * scale * world * (C.app.copycat ? 1.15 : 1);
  return { cpi: round2(cpi), parts: { geo: G.cpi, objective: PAID.objective[c.objective].cpi, adv, saturation: 1 + SATURATION.cpiMult * sat, ctr: ctrFactor, fatigue, learning: L.mult, scale, world }, learning: L };
}

export function launchCampaign(state, { name = 'App campaign', objective = 'install', geo = 't1', advantage = false, budget = 50, creativeIds = [] } = {}) {
  const C = ensureConsumer(state);
  if (!PAID.objective[objective] || !PAID.geo[geo]) return { ok: false, error: 'Unknown objective or country tier.' };
  budget = Math.max(5, Math.round(+budget || 0));
  const A = ensureAds(state);
  const creatives = creativeIds.map((id) => A.creatives.find((x) => x.id === id)).filter(Boolean);
  if (!creatives.length) return { ok: false, error: 'Add at least one creative from the Ads library.' };
  const c = {
    id: `mc_${++C.paid.seq}`, name, objective, geo, advantage, budget, status: 'active', startDay: state.day, relearnDay: null, spend: 0, installs: 0, purchases: 0, events7: [], reportedInstalls: 0, reportedPurchases: 0, edits: [],
    creatives: creatives.map((cr) => ({ id: cr.id, days: 0, fatigueAt: Math.max(8, Math.round(PAID.fatigue.meanDays * Math.exp(PAID.fatigue.spread * cnormal(state)))) })), daily: [],
  };
  C.paid.campaigns.push(c);
  const mature = roasView(state, 'ads:meta');
  const hasHistory = C.paid.campaigns.length > 1 || (mature.d7.weeks > 0);
  if (!hasHistory && budget >= 300) scaleCheck(state, c, 0, budget, 'launch');
  return { ok: true, hours: PAID.hoursPerCampaign, campaign: c };
}

/** Change a daily budget. A big raise before payback is proven is the classic trap; a change over 50% restarts learning. */
export function setBudget(state, id, budget) {
  const C = ensureConsumer(state);
  const c = C.paid.campaigns.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'No such campaign.' };
  budget = Math.max(5, Math.round(+budget || 0));
  const old = c.budget;
  c.edits.push({ day: state.day, from: old, to: budget });
  c.budget = budget;
  if (budget > old * 1.2 || budget < old * 0.8) { if (Math.abs(budget - old) / old > PAID.scaleStep) c.relearnDay = state.day; }
  if (budget > old * (1 + PAID.scaleStep)) scaleCheck(state, c, old, budget, 'raise');
  return { ok: true, hours: 0.15, relearn: c.relearnDay === state.day };
}

function scaleCheck(state, c, old, budget, why) {
  const C = ensureConsumer(state);
  const t = C.paid.target;
  const r = roasView(state, 'ads:meta');
  const gross = r.d7.roas, net = r.d7.netRoas;
  const have = gross != null;
  const measured = have ? (t.basis === 'gross' ? gross : net) : null;
  const atRisk = round2((budget - old) * 14);
  if (have && t.basis === 'gross' && gross >= t.d7Roas && net < t.d7Roas) {
    logMistake(state, { functionId: FN, id: 'store_fee_not_in_model', label: 'Scaled on gross revenue: the store commission was not in the model', cost: { usd: round2(atRisk * (1 - net / t.d7Roas)), days: 14 }, delayed: true, app: 'launch', detail: `D7 ROAS looked like ${gross.toFixed(2)}x gross but only ${net.toFixed(2)}x after the ${Math.round((1 - r.net) * 100)}% store commission (target ${t.d7Roas}x). Raising ${c.name} from $${old}/day to $${budget}/day pays the difference every day.`, key: `fee_model:${c.id}:${state.day}` });
  } else if (!have || measured < t.d7Roas) {
    const shortfall = have ? 1 - Math.min(1, measured / t.d7Roas) : 0.6;
    logMistake(state, { functionId: FN, id: 'scaled_ads_before_payback', label: have ? 'Scaled ad spend before payback was proven' : 'Scaled ad spend before any payback data existed', cost: { usd: round2(atRisk * shortfall), days: 14 }, delayed: true, app: 'launch', detail: `${why === 'launch' ? 'Launched' : 'Raised'} ${c.name} to $${budget}/day with ${have ? `D7 ROAS ${measured.toFixed(2)}x (${t.basis}) against a ${t.d7Roas}x target` : 'no mature D7 cohort to read'}. Two weeks of the extra spend ($${atRisk}) is committed before the first read arrives.`, key: `scale:${c.id}:${state.day}` });
  }
}

export function pauseCampaign(state, id, on = false) {
  const c = ensureConsumer(state).paid.campaigns.find((x) => x.id === id);
  if (!c) return { ok: false };
  c.status = on ? 'active' : 'paused';
  return { ok: true, hours: 0.05 };
}
export function addCreativeTo(state, id, creativeId) {
  const C = ensureConsumer(state);
  const c = C.paid.campaigns.find((x) => x.id === id);
  if (!c || c.creatives.some((x) => x.id === creativeId)) return { ok: false };
  c.creatives.push({ id: creativeId, days: 0, fatigueAt: Math.max(8, Math.round(PAID.fatigue.meanDays * Math.exp(PAID.fatigue.spread * cnormal(state)))) });
  return { ok: true, hours: 0.1 };
}
export function setTarget(state, { d7Roas, basis }) {
  const C = ensureConsumer(state);
  if (d7Roas) C.paid.target.d7Roas = clamp(+d7Roas, 0.1, 3);
  if (basis) C.paid.target.basis = basis === 'gross' ? 'gross' : 'net';
  return { ok: true, hours: 0.1 };
}

export function paidDay(state) {
  const C = ensureConsumer(state);
  // Delayed attribution reports arrive.
  const keep = [];
  for (const r of C.paid.reports) {
    if (r.day > state.day) { keep.push(r); continue; }
    const c = C.paid.campaigns.find((x) => x.id === r.campaignId);
    if (c) { c.reportedInstalls += r.installs; c.reportedPurchases += r.purchases; }
  }
  C.paid.reports = keep;
  for (const c of C.paid.campaigns) {
    if (c.status !== 'active') continue;
    const G = PAID.geo[c.geo];
    const e = expectedCpi(state, c);
    const spend = c.budget;
    if (balance(state) < spend) { c.status = 'paused'; pushEvent(state, 'platform_policy_strike', { kind: 'ad_payment', campaignId: c.id, label: `Meta paused ${c.name}: payment declined` }); continue; }
    const installs = samplePoisson(state, spend / e.cpi);
    post(state, { amount: -spend, counterparty: 'Meta Ads', description: `FACEBK *ADS ${c.name}`, category: 'advertising', method: 'card' });
    ledgerAdd(state, state.day, 'ads:meta', 'sp', spend);
    c.spend = round2(c.spend + spend); c.installs += installs;
    for (const x of c.creatives) x.days++;
    let purchases = 0;
    if (mobileOn(state)) {
      if (mobileLive(state)) {
        const r = convertInstalls(state, { source: 'ads:meta', n: installs, intent: INTENT['ads:meta'] * PAID.objective[c.objective].conv, geoArppu: G.arppu });
        purchases = r.starts;
        if (r.subs.length) ledgerAdd(state, state.day, 'ads:meta', 'tr', r.subs.length); // same cohort ledger every other channel writes
      } else if (installs) {
        // Paying for installs with no live listing: they cannot happen, the money is gone.
        logMistake(state, { functionId: FN, id: 'spent_before_store_live', label: 'Paid for traffic before the app was live in a store', cost: { usd: spend, days: 7 }, app: 'launch', detail: `${c.name} spent $${spend} with no app to install.`, key: 'spent_before_live' });
      }
    } else if (installs) {
      // Web / PWA (no store stack): the clicks land on the website and convert like any other web channel, instead of vanishing.
      purchases = deliverVisits(state, { source: 'ads:meta', installs }).subs?.length ?? 0;
    }
    c.events7.push(c.objective === 'purchase' ? purchases : installs);
    if (c.events7.length > 7) c.events7.shift();
    // iOS attribution is late, modeled and low; Android is close to real.
    const ios = binomial(state, installs, G.iosShare);
    const repIos = binomial(state, ios, PAID.skan.iosReport), repAnd = binomial(state, installs - ios, PAID.skan.androidReport);
    const [d0, d1] = PAID.skan.delay;
    const [p0, p1] = PAID.skan.purchaseDelay;
    C.paid.reports.push({ day: state.day + d0 + Math.floor(crand(state) * (d1 - d0 + 1)), campaignId: c.id, installs: repIos, purchases: 0 });
    // Android installs report near real time (next day's dashboard); purchases come in later through SKAN/AEM postbacks.
    C.paid.reports.push({ day: state.day + 1, campaignId: c.id, installs: repAnd, purchases: 0 });
    C.paid.reports.push({ day: state.day + (p0 + Math.floor(crand(state) * (p1 - p0 + 1))), campaignId: c.id, installs: 0, purchases: Math.round(purchases * (G.iosShare * PAID.skan.iosReport + (1 - G.iosShare) * PAID.skan.androidReport)) });
    c.daily.push({ d: state.day, spend, installs, purchases, cpi: e.cpi, status: e.learning.status });
    if (c.daily.length > 120) c.daily.shift();
  }
  if (C.paid.reports.length > 1200) C.paid.reports.splice(0, C.paid.reports.length - 1200); // only pending reports (≤ 8 days) stay in the list
}

/** Aggregate paid view: spend, installs, true CPI vs reported, true D7 ROAS vs reported, learning status per campaign. */
export function paidStats(state) {
  const C = ensureConsumer(state);
  const cs = C.paid.campaigns;
  const spend = cs.reduce((a, c) => a + c.spend, 0), installs = cs.reduce((a, c) => a + c.installs, 0), rep = cs.reduce((a, c) => a + c.reportedInstalls, 0);
  const roas = roasView(state, 'ads:meta');
  return { spend: round2(spend), installs, reportedInstalls: rep, cpi: installs ? round2(spend / installs) : null, reportedCpi: rep ? round2(spend / rep) : null, roas, target: C.paid.target, commission: currentCommission(state) };
}
export const campaignRows = (state) => ensureConsumer(state).paid.campaigns.map((c) => ({ ...c, e: expectedCpi(state, c) }));
