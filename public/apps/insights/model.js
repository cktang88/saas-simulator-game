// Product analytics + ops model. Pure. Numbers: public/data/world.js PRODUCT_ANALYTICS / OPS
// (docs/research/world-ops-support-life.md §3). Rates marked [design] there are game estimates.

import { PRODUCT_ANALYTICS as PA, OPS } from '../../data/world.js';
import { clamp, lerp } from '../../core/util.js';

const mid = ([lo, hi]) => (lo + hi) / 2;

// Onboarding mode effect on activation [design]: a human walkthrough gets more trials to the aha.
export const ONBOARDING_ACTIVATION = { self: 1, call: 1.25, concierge: 1.6 };
export const AHA_SHARE = 0.7; // [design] share of activated accounts that reach the deeper "aha" event in week 1
export const SESSIONS_PER_ACCOUNT_WEEK = { b2c: 3, smb: 8, ent: 40 }; // [design] (B2B accounts have several users)

// Activation rate conditioned on product fit (0..1, default 0.3) and onboarding. Benchmark avg 37.5% (Userpilot [V]).
export function activationRate({ fit = null, onboarding = 'self', ttvDays = 1.5 }) {
  const f = fit ?? 0.3;
  const extraDays = Math.max(0, ttvDays - PA.activation.timeToValueHours / 24);
  const ttv = Math.pow(1 - mid(PA.ttvActivationPenaltyPerExtraDay), extraDays);
  return clamp(PA.activation.avgB2B * (0.4 + 2 * f) * (ONBOARDING_ACTIVATION[onboarding] ?? 1) * ttv, 0.03, 0.85);
}

// 90-day adoption of a shipped feature among active accounts [design from PA.featureAdoption].
export function featureAdoption({ daysLive, usefulShare = 0.4, core = false }) {
  const [lo, hi] = PA.featureAdoption.newFeature90DayAdoption;
  const target = core ? lerp(0.4, 0.8, usefulShare) : lerp(lo, hi, usefulShare);
  return clamp(target * Math.min(1, Math.max(0, daysLive) / 90), 0, 1);
}

// Split an observed overall retention curve R(w) into activated vs not, given activation share a and the
// benchmark month-3 ratio k (2–3×) ramping in over 13 weeks: a·RA + (1−a)·RN = R and RA = k(w)·RN.
export function splitRetention(curve, a) {
  const kMax = mid(PA.retention.activatedVsNotM3RetentionMult);
  return curve.map((R, w) => {
    const k = 1 + (kMax - 1) * Math.min(1, w / 13);
    const RN = R / (a * k + (1 - a));
    return { w, all: R, activated: Math.min(1, k * RN), notActivated: RN };
  });
}

// Weekly cohort retention from subscriptions: share of subs started ≥ w weeks ago still active at week w.
export function cohortCurve(subs, today, weeks = 13) {
  const out = [];
  for (let w = 0; w <= weeks; w++) {
    const eligible = subs.filter((s) => today - s.startDay >= w * 7);
    if (eligible.length < 3) { out.push(null); continue; }
    const alive = eligible.filter((s) => s.status !== 'canceled' || (s.canceledDay ?? Infinity) - s.startDay > w * 7);
    out.push(alive.length / eligible.length);
  }
  return out;
}

// ---- Ops ----

export const SECURITY_TOGGLES = {
  statusPage: { label: 'Public status page', hours: 1, note: 'Post updates during incidents: support spike ×0.6 vs silence.' },
  paging: { label: 'Uptime monitoring with phone alerts', hours: 1, monthly: 25, note: 'Overnight incidents get noticed in minutes, not at breakfast.' },
  captcha: { label: 'Checkout CAPTCHA, rate limits & Radar rules', hours: 2, note: 'Card-testing attacks ~0.3–1.0/yr → 0.1–0.3/yr.' },
  secretScanning: { label: 'Secret scanning + key rotation', hours: 1, note: 'Fewer leaked API keys (0.2 → 0.05/yr).' },
  spendCaps: { label: 'Cloud/LLM spend caps & billing alerts', hours: 0.5, note: 'Surprise bills 0.15–0.4/yr → 0.03–0.08/yr.' },
  adminMFA: { label: 'MFA on every admin account', hours: 0.5, note: 'Halves the chance of a material breach.' },
  testedBackups: { label: 'Tested restore from backup', hours: 3, note: 'Untested backups are the common failure.' },
};

// Expected events per year given flags. bugHours: open bug backlog; ai: AI features in production.
export function opsRates({ flags = {}, bugHours = 0, ai = false, selfServeCheckout = true, launched = true }) {
  if (!launched) return { incident: 0, upstream: 0, llm: 0, cardTesting: 0, leakedKey: 0, surpriseBill: 0, breach: 0, dataLoss: 0 };
  const debt = 1 + Math.min(2, bugHours / 100); // [design] buggy, rushed code → more bad deploys
  const ct = OPS.cardTesting.attacksPerYear;
  return {
    incident: mid(OPS.incidents.userVisiblePerYear) * debt,
    upstream: mid(OPS.incidents.upstreamPerYear),
    llm: ai ? mid(OPS.incidents.llmProviderPerYear) : 0,
    cardTesting: !selfServeCheckout ? ct.invoiceOnly : flags.captcha ? mid(ct.protected) : mid(ct.exposedCheckout),
    leakedKey: flags.secretScanning ? OPS.security.leakedKeyPerYear[0] : OPS.security.leakedKeyPerYear[1],
    surpriseBill: flags.spendCaps ? mid(OPS.costs.surpriseBillPerYear.withCaps) : mid(OPS.costs.surpriseBillPerYear.noCaps),
    breach: mid(OPS.security.breachPerYearTinySaaS) * (flags.adminMFA ? 1 : 2),
    dataLoss: flags.testedBackups ? 0 : 0.02,
  };
}

// Draw an incident. kind: 'own' | 'upstream' | 'llm'. rand: () => [0,1).
export function drawIncident(rand, kind, { paging = false } = {}) {
  const causes = OPS.incidents.typicalCauses;
  const startHour = Math.floor(rand() * 24);
  const overnight = startHour >= 22 || startHour < 7;
  const major = kind === 'own' ? rand() < mid(OPS.incidents.majorPerYear) / mid(OPS.incidents.userVisiblePerYear) : rand() < 0.3;
  let minutes;
  if (kind === 'own') {
    const [a, b] = OPS.mttr.soloAwakeMinutes;
    const [c, d] = OPS.mttr.soloOvernightHours;
    minutes = overnight && !paging ? lerp(c, d, rand()) * 60 : lerp(a, b, rand());
    if (major) minutes *= 2;
  } else minutes = lerp(60, kind === 'llm' ? 180 : 360, rand()); // upstream outages: you wait it out [design]
  const severity = clamp((major ? 0.6 : 0.2) + minutes / 1200, 0.1, 1);
  const founderHours = kind === 'own' ? minutes / 60 + 0.5 : 0.5; // fix + postmortem; upstream = comms only
  const cause = kind === 'upstream' ? 'cloud/CDN provider outage' : kind === 'llm' ? 'LLM provider errors' : causes[Math.floor(rand() * causes.length)];
  return { kind, startHour, overnight, major, minutes: Math.round(minutes), severity: Math.round(severity * 100) / 100, founderHours: Math.round(founderHours * 100) / 100, cause };
}

export function drawCardTesting(rand) {
  const [a0, a1] = OPS.cardTesting.attemptsPerAttack, [c0, c1] = OPS.cardTesting.costUSD, [h0, h1] = OPS.cardTesting.founderHours;
  const t = rand();
  return { attempts: Math.round(a0 * Math.pow(a1 / a0, t)), cost: Math.round(c0 * Math.pow(c1 / c0, t)), hours: Math.round(lerp(h0, h1, t) * 10) / 10, disputes: Math.floor(t * 6) };
}

export const uptimePct = (downMinutes, days = 30) => 1 - downMinutes / (days * 24 * 60);
