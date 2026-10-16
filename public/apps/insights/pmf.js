// PMF measurement on top of the hidden market truth (core/truth.js). Pure + deterministic, no DOM.
//
// What it does:
//  - tags every subscription with its TRUE segment (segmentMatch on the customer's company/industry, else a
//    deterministic draw from the segments the ICP actually reaches), a role, an activation flag and a friend flag;
//  - answers Sean Ellis surveys from those real customers using the true very-disappointed share per segment
//    (pmfTruth(state, seg)), with the research biases: non-activated users dilute, recent signups are in a
//    honeymoon, friends/network answer to be kind (docs/research/early-stage/misleading-feedback.md);
//  - cuts survey results by segment / role / source / activation, and retention by segment / source, so PMF that
//    exists in one niche but not overall is findable (Superhuman-style, pmf-process.md);
//  - gives each segment its own retention shape (strong segments flatten, weak ones keep decaying);
//  - detects FALSE PMF signals (concentration, friends, paid-only growth, launch spike, discounts, founder-led
//    sales that do not repeat, design partners) and builds the PMF scorecard.
// Numbers tagged [design] are game assumptions, not statistics.

import { clamp, hash, round2 } from '../../core/util.js';
import { truthOf, icpFocus, segmentMatch, pmfTruth as segmentTruth } from '../../core/truth.js';
import { customerById, monthlyAmount, ensureStripe } from '../../core/stripe.js';
import { cfg } from '../../core/market.js';

export const PMF_LINE = 0.4; // Sean Ellis >= 40% "very disappointed" [secondary]
export const MIN_CUT_N = 10; // [design] below ~10 answers a cut is anecdote, not a read
export const FRIEND_LIFT = 0.45; // [design] share of the not-very-disappointed that a friend/network respondent upgrades out of politeness
export const HONEYMOON = 1.3; // [design] novelty inflates answers of people who signed up in the last 14 days
export const NEVER_ACTIVATED = 0.3; // [design] people who never got value rarely miss it
export const FRIEND_SOURCES = new Set(['network', 'friends', 'family', 'founder_network', 'warm']);
export const ACT_BASE = 0.4; // activation used to tag subs
const LIVE = new Set(['active', 'past_due', 'trialing']);
const PAYING = new Set(['active', 'past_due']);

const U = (...p) => (parseInt(hash(p.join('|')), 36) % 100003) / 100003; // deterministic uniform from ids (never Math.random)
export const hasIdea = (state) => !!String(state.company?.oneLiner ?? '').trim();
// ids come from a process-wide counter (uid), so hash positions in the subscription list instead: same seed, same tags.
const keyOf = (state, sub) => `${state.seed ?? 0}|${subsOf(state).indexOf(sub)}|${sub.startDay}`;
const subsOf = (state) => ensureStripe(state).subscriptions;

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [round2(Math.max(0, c - h)), round2(Math.min(1, c + h))];
}

// ---- Source classes ----
export function sourceClass(src) {
  const s = String(src ?? 'direct');
  if (FRIEND_SOURCES.has(s)) return 'friends / network';
  if (/^ads:|^paid|^ltd|appsumo|sponsorship|affiliate|creator/.test(s)) return 'paid / bought';
  if (/referral|partner|swap/.test(s)) return 'referral';
  if (/^organic|seo|ai_search|directories|product-hunt|plg|free_tools|review_sites|inbound|direct|self|url|waitlist|template|release|marketplace|pr$/.test(s)) return 'organic / inbound';
  if (/outbound|ai_sdr|sequence|cold|sourced|purchased|rfp|events|webinar|direct_mail|real|run|manual/.test(s)) return 'outbound / sales';
  return 'other';
}
const PULL = new Set(['organic / inbound', 'referral']);
const isFriendCustomer = (cus, sub) => FRIEND_SOURCES.has(sub?.source) || FRIEND_SOURCES.has(cus?.source) || ['friend', 'family', 'warm'].includes(cus?.meta?.relationship);

// ---- Segment tags ----
const ROLES = ['end user', 'manager', 'owner / exec'];
const ROLE_W = { user: [0.7, 0.2, 0.1], manager: [0.3, 0.5, 0.2], exec: [0.2, 0.2, 0.6] };

function segmentOfCustomer(state, cus, sub) {
  const t = truthOf(state);
  const ids = new Set(t.segments.map((g) => g.id));
  const explicit = cus?.meta?.truthSegmentId;
  if (explicit && ids.has(explicit)) return explicit;
  const co = cus?.crmCompanyId ? (state.apps?.crm?.companies ?? []).find((x) => x.id === cus.crmCompanyId) : null;
  const text = [cus?.company, co?.name, co?.industry, co?.research?.industry, cus?.meta?.industry].filter(Boolean).join(' ').trim();
  if (text) {
    const m = (segmentMatch(state, text) ?? []).filter((x) => ids.has(x.segmentId)).sort((a, b) => b.score - a.score)[0];
    if (m && m.score >= 0.3) return m.segmentId;
  }
  // Nobody told us: they come from the segments the ICP actually reaches (weights), deterministic per customer.
  const w = Object.entries(icpFocus(state).weights ?? {}).filter(([id]) => ids.has(id));
  if (!w.length) return t.segments[0]?.id ?? null;
  const tot = w.reduce((a, [, x]) => a + x, 0) || 1;
  let u = U(keyOf(state, sub), 'seg') * tot;
  for (const [id, x] of w) { u -= x; if (u <= 0) return id; }
  return w[w.length - 1][0];
}

/** Hidden per-subscription tags { seg, role, act, friend, sig }, cached on the sub (re-made when the truth changes). */
export function tagOf(state, sub, activation = ACT_BASE) {
  if (!hasIdea(state)) return null;
  const t = truthOf(state);
  if (sub.pmf && sub.pmf.sig === t.sig) return sub.pmf;
  const cus = customerById(state, sub.customerId);
  const seg = segmentOfCustomer(state, cus, sub);
  const g = t.segments.find((x) => x.id === seg);
  const vdSeg = segmentTruth(state, seg).veryDisappointed;
  const vdAll = Math.max(0.1, segmentTruth(state).veryDisappointed);
  const pAct = clamp(activation * (0.6 + 0.4 * (vdSeg / vdAll)) * (PAYING.has(sub.status) ? 1.2 : 1), 0.05, 0.95);
  let role = ROLES[0];
  if (g?.kind !== 'b2c') {
    const w = ROLE_W[g?.budgetOwner] ?? [0.5, 0.3, 0.2];
    let u = U(keyOf(state, sub), 'role');
    role = ROLES[w.findIndex((x) => (u -= x) <= 0)] ?? ROLES[0];
  }
  sub.pmf = { sig: t.sig, seg, role, act: U(keyOf(state, sub), 'act') < pAct, friend: isFriendCustomer(cus, sub), designPartner: !!cus?.meta?.designPartner };
  return sub.pmf;
}

export const segmentLabel = (state, id) => truthOf(state).segments.find((g) => g.id === id)?.label ?? id ?? 'unknown';

// ---- Per-segment retention shape (strong segments flatten, weak ones keep churning at the early rate) ----
// The market curve decays with tenure for everyone. For a segment without pain that decay is cancelled out (people
// who never needed it keep leaving at the early rate); a hair-on-fire segment has a lower hazard that keeps falling.
// Stored as sub.segF and folded into sub.gtmChurnMult by division, so other multipliers stay intact.
function rawChurnFactor(state, segId, sub, all) {
  const seg = segmentTruth(state, segId);
  const rel = clamp(Math.pow(Math.max(0.03, all.retentionFloor) / Math.max(0.03, seg.retentionFloor), 1.2), 0.35, 2.5);
  const curve = cfg(state)?.monthlyChurn ?? [];
  const m = Math.max(1, sub.paidMonths ?? 1);
  const ref = curve[0] ?? 0, cur = curve[Math.min(curve.length - 1, m - 1)] ?? ref;
  const weak = clamp((0.5 - seg.veryDisappointed) / 0.4, 0, 1); // 0 at vd 0.5+, 1 at vd 0.1
  const strong = clamp((seg.veryDisappointed - 0.3) / 0.3, 0, 1); // hair-on-fire segments: the hazard keeps falling with tenure, so the curve flattens
  const shape = ref > 0 && cur > 0 ? Math.pow(ref / cur, 0.85 * weak) * Math.pow(cur / ref, 0.9 * strong) : 1;
  return clamp(rel * shape, 0.08, 6);
}

// Normalised so the ICP-weighted average factor is 1: the blended churn calibration (core/market.js) is untouched,
// only WHO churns changes.
export function segmentChurnFactor(state, sub, tag) {
  const all = segmentTruth(state);
  const w = Object.entries(icpFocus(state).weights ?? {});
  let mean = 0, tot = 0;
  for (const [id, x] of w) { mean += x * rawChurnFactor(state, id, sub, all); tot += x; }
  mean = tot ? mean / tot : 1;
  return round2(clamp(rawChurnFactor(state, tag.seg, sub, all) / Math.max(0.05, mean), 0.08, 6));
}

export function applySegmentRetention(state, sub) {
  const tag = tagOf(state, sub);
  if (!tag || sub.status === 'canceled') return null;
  if (sub.segMo === (sub.paidMonths ?? 0) && sub.segF != null) return sub.segF;
  const f = segmentChurnFactor(state, sub, tag);
  sub.gtmChurnMult = round2((sub.gtmChurnMult ?? 1) / (sub.segF ?? 1) * f);
  sub.segF = f; sub.segMo = sub.paidMonths ?? 0;
  return f;
}

/** Daily hook: tag new subscriptions and keep their segment retention factor current. */
export function tagSubs(state) {
  if (!hasIdea(state)) return 0;
  let n = 0;
  for (const sub of subsOf(state)) {
    if (sub.status === 'canceled') { if (!sub.pmf) tagOf(state, sub); continue; }
    if (applySegmentRetention(state, sub) != null) n++;
  }
  return n;
}

// ---- Survey pool and answers ----
export function surveyPool(state, target) {
  const day = state.day ?? 0;
  const live = subsOf(state).filter((s) => LIVE.has(s.status));
  for (const s of live) tagOf(state, s);
  if (target === 'activated') return live.filter((s) => s.pmf?.act);
  if (target === 'paying') return live.filter((s) => PAYING.has(s.status));
  if (target === 'recent') return live.filter((s) => s.startDay > day - 14);
  const expired = subsOf(state).filter((s) => s.status === 'canceled' && s.cancelReason === 'trial_not_converted' && (s.canceledDay ?? -1e9) > day - 30);
  for (const s of expired) tagOf(state, s);
  return [...live, ...expired];
}

/** Probability this person answers "very disappointed". The truth per segment, then the biases the player must see through. */
export function veryDisappointedP(state, sub, tag = tagOf(state, sub)) {
  const g = truthOf(state).segments.find((x) => x.id === tag.seg);
  let p = segmentTruth(state, tag.seg).veryDisappointed;
  if (!tag.act) p *= NEVER_ACTIVATED;
  if (g && g.buyerIsUser === false) p *= tag.role === 'owner / exec' ? 0.6 : tag.role === 'end user' ? 1.15 : 1; // users love it, buyers do not pay
  if ((state.day ?? 0) - sub.startDay < 14) p *= HONEYMOON;
  if (tag.friend) p += (1 - p) * FRIEND_LIFT;
  return clamp(p, 0, 0.92);
}

/** One answer row per respondent: { seg, role, src, act, rec, fr, a: 'v'|'s'|'n' } (compact, kept on the survey). */
export function answerRow(state, sub, rand) {
  const tag = tagOf(state, sub);
  const a = rand() < veryDisappointedP(state, sub, tag) ? 'v' : rand() < 0.55 ? 's' : 'n';
  return { seg: tag.seg, role: tag.role, src: sourceClass(sub.source), act: tag.act ? 1 : 0, rec: (state.day ?? 0) - sub.startDay < 14 ? 1 : 0, fr: tag.friend ? 1 : 0, a };
}

const CUTS = {
  segment: (r, st) => [r.seg, segmentLabel(st, r.seg)],
  role: (r) => [r.role, r.role],
  source: (r) => [r.src, r.src],
  activation: (r) => [r.act ? 'act' : 'not', r.act ? 'activated (used the core feature)' : 'not activated'],
  tenure: (r) => [r.rec ? 'new' : 'old', r.rec ? 'signed up in the last 14 days' : 'older customers'],
};
export const CUT_LABELS = { segment: 'Customer segment', role: 'Role of respondent', source: 'Signup source', activation: 'Activation', tenure: 'Tenure' };

/** Sean Ellis results cut by a dimension: [{ key, label, n, very, share, ci, enough, meets }] biggest first. */
export function surveyCut(state, survey, by = 'segment', rows = survey?.rows) {
  if (!rows?.length) return [];
  const f = CUTS[by] ?? CUTS.segment;
  const g = new Map();
  for (const r of rows) {
    const [k, label] = f(r, state);
    const x = g.get(k) ?? { key: k, label, n: 0, very: 0 };
    x.n++; if (r.a === 'v') x.very++;
    g.set(k, x);
  }
  return [...g.values()].map((x) => ({ ...x, share: x.n ? x.very / x.n : null, ci: wilson(x.very, x.n), enough: x.n >= MIN_CUT_N, meets: x.n >= MIN_CUT_N && x.very / x.n >= PMF_LINE })).sort((a, b) => b.n - a.n);
}

/** The Superhuman move: overall below the line, one segment above it -> narrow. */
export function segmentVerdict(state, survey) {
  const rows = survey?.rows;
  if (!rows?.length) return null;
  const n = rows.length, very = rows.filter((r) => r.a === 'v').length, overall = very / n;
  const segs = surveyCut(state, survey, 'segment');
  const strong = segs.filter((x) => x.meets).sort((a, b) => b.share - a.share)[0] ?? null;
  const thin = segs.filter((x) => !x.enough && x.n >= 3 && x.share >= PMF_LINE);
  const friends = rows.filter((r) => r.fr).length / n;
  return {
    overall, n, strong, thin, friendShare: friends,
    narrow: !!strong && overall < PMF_LINE,
    text: strong
      ? (overall < PMF_LINE ? `Overall ${Math.round(overall * 100)}% is below 40%, but ${strong.label} is at ${Math.round(strong.share * 100)}% (n=${strong.n}). Narrow the ICP to that segment and re-survey it.` : `${strong.label} leads at ${Math.round(strong.share * 100)}% (n=${strong.n}).`)
      : thin.length ? `${thin.map((x) => x.label).join(', ')} look(s) above 40% but with fewer than ${MIN_CUT_N} answers: directional only, survey more of them.` : 'No segment with enough answers is above 40%.',
  };
}

// ---- Retention by group (tenure curves, logo) ----
export function flattening(curve) {
  const pts = [];
  for (const v of curve) { if (v == null) break; pts.push(v); }
  const K = pts.length - 1;
  if (K < 4) return { state: 'too_early', floor: pts[K] ?? null };
  // Monthly hazard early (months 0-2) vs late (last two months): a curve flattens when the leaving rate falls away.
  const hz = (a, b) => (a > 0 ? 1 - Math.sqrt(Math.max(0, b / a)) : 1);
  const early = hz(pts[0], pts[2]), late = hz(pts[K - 2], pts[K]);
  const flat = (early < 0.01 && late < 0.01) || late <= 0.4 * early + 0.005;
  return { state: flat ? 'flattening' : 'decaying', floor: round2(pts[K]), early: round2(early), late: round2(late) };
}

/** Logo retention by tenure month for paying customers, grouped by 'segment' | 'source' | 'all'. */
export function retentionByGroup(state, by = 'segment', { months = 8, minN = 5 } = {}) {
  const day = state.day ?? 0;
  const subs = subsOf(state).filter((s) => s.firstPaidDay != null);
  const groups = new Map();
  for (const s of subs) {
    let key = 'all', label = 'All paying customers';
    if (by === 'segment') { const t = tagOf(state, s); key = t?.seg ?? 'all'; label = t ? segmentLabel(state, key) : 'All paying customers'; }
    else if (by === 'source') { key = label = sourceClass(s.source); }
    (groups.get(key) ?? groups.set(key, { key, label, subs: [] }).get(key)).subs.push(s);
  }
  return [...groups.values()].map((g) => {
    const curve = [];
    for (let k = 0; k <= months; k++) {
      const elig = g.subs.filter((s) => day - s.firstPaidDay >= k * 30);
      if (elig.length < minN) { curve.push(null); continue; }
      const alive = elig.filter((s) => s.canceledDay == null || s.status !== 'canceled' || s.canceledDay - s.firstPaidDay > k * 30).length;
      curve.push(round2(alive / elig.length));
    }
    return { key: g.key, label: g.label, n: g.subs.length, curve, ...flattening(curve) };
  }).sort((a, b) => b.n - a.n);
}

// ---- False PMF ----
function custMrr(state) {
  const by = new Map();
  for (const s of subsOf(state)) if (PAYING.has(s.status)) by.set(s.customerId, (by.get(s.customerId) ?? 0) + monthlyAmount(s));
  return by;
}
function decidedDeals(state) {
  return (state.apps?.crm?.deals ?? []).filter((d) => d.stage === 'won' || d.stage === 'lost').map((d) => {
    const h = [...(d.history ?? [])].reverse().find((x) => x.stage === d.stage);
    return { ...d, decidedDay: h?.day ?? d.stageDay ?? d.createdDay, won: d.stage === 'won' };
  });
}

/** [{ id, label, detail, severity: 'high'|'medium', evidence }] -- each flag names its numbers so it is traceable. */
export function falsePmfFlags(state) {
  const out = [];
  const day = state.day ?? 0;
  const flag = (id, label, detail, severity, evidence) => out.push({ id, label, detail, severity, evidence });
  const mrrBy = custMrr(state);
  const total = [...mrrBy.values()].reduce((a, b) => a + b, 0);
  if (mrrBy.size >= 4 && total > 0) {
    const [topId, top] = [...mrrBy.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top / total > 0.3) flag('revenue_concentration', 'Revenue concentration', `${customerById(state, topId)?.company ?? customerById(state, topId)?.name ?? 'Your biggest customer'} is ${Math.round((top / total) * 100)}% of MRR (${Math.round(top)} of ${Math.round(total)} dollars). One cancellation erases the growth, and their feature asks may be idiosyncratic.`, top / total > 0.5 ? 'high' : 'medium', { customerId: topId, share: round2(top / total) });
  }
  const live = subsOf(state).filter((s) => PAYING.has(s.status));
  const fr = live.filter((s) => isFriendCustomer(customerById(state, s.customerId), s));
  const frMrr = fr.reduce((a, s) => a + monthlyAmount(s), 0);
  if (live.length >= 3 && total > 0 && frMrr / total >= 0.4) flag('friends_network_revenue', 'Friends and network are your revenue', `${fr.length} of ${live.length} paying customers (${Math.round((frMrr / total) * 100)}% of MRR) came from your own network. They buy to help you and say "very disappointed" to be kind.`, frMrr / total >= 0.6 ? 'high' : 'medium', { customers: fr.length, share: round2(frMrr / total) });
  const recent = subsOf(state).filter((s) => s.startDay > day - 60);
  if (recent.length >= 8) {
    const paid = recent.filter((s) => sourceClass(s.source) === 'paid / bought').length / recent.length;
    const pull = recent.filter((s) => PULL.has(sourceClass(s.source))).length / recent.length;
    if (paid >= 0.6 && pull < 0.15) flag('paid_no_pull', 'Growth is bought, not pulled', `${Math.round(paid * 100)}% of the last ${recent.length} signups came from paid acquisition and only ${Math.round(pull * 100)}% from organic, inbound or referrals. Growth stops when the budget does; no word of mouth means no pull yet.`, 'high', { paid: round2(paid), pull: round2(pull), n: recent.length });
    const disc = recent.filter((s) => (s.discountPct ?? 0) >= 0.25 || /^ltd|appsumo/.test(s.source ?? '')).length / recent.length;
    if (disc >= 0.4) flag('discount_driven', 'Sales are discount-driven', `${Math.round(disc * 100)}% of the last ${recent.length} signups bought at 25%+ off or via a lifetime deal. Discount buyers churn faster and say little about willingness to pay full price.`, 'medium', { share: round2(disc), n: recent.length });
  }
  // Launch / novelty spike that decayed: weekly new customers.
  const weeks = [];
  for (let w = 0; w < 16; w++) weeks.push(subsOf(state).filter((s) => s.startDay > day - 7 * (w + 1) && s.startDay <= day - 7 * w).length);
  const last4 = (weeks[0] + weeks[1] + weeks[2] + weeks[3]) / 4;
  const peak = Math.max(...weeks.slice(4)), peakAt = weeks.indexOf(peak);
  if (peak >= 10 && peakAt >= 4 && peak >= 3 * Math.max(1, last4) && last4 <= 0.35 * peak) flag('launch_spike_decay', 'Launch spike that decayed', `${peak} signups in one week ${peakAt} weeks ago versus ${round2(last4)} a week now. A launch brings novelty, not pull; look at who is still here, not at the peak.`, 'medium', { peak, peakWeeksAgo: peakAt, now: round2(last4) });
  const dd = decidedDeals(state);
  const recentD = dd.filter((d) => d.decidedDay > day - 90), priorD = dd.filter((d) => d.decidedDay <= day - 90 && d.decidedDay > day - 180);
  const rate = (a) => a.filter((d) => d.won).length / Math.max(1, a.length);
  if (recentD.length >= 5 && priorD.length >= 5 && rate(priorD) >= 0.2 && rate(recentD) < 0.5 * rate(priorD)) flag('founder_led_no_repeat', 'Founder-led sales do not repeat', `Win rate fell from ${Math.round(rate(priorD) * 100)}% (${priorD.length} deals) to ${Math.round(rate(recentD) * 100)}% (${recentD.length} deals). Early wins came from your relationships and personal pitch; a process that works without you has not been shown.`, 'high', { prior: round2(rate(priorD)), recent: round2(rate(recentD)) });
  const dp = new Set((state.apps?.crm?.deals ?? []).filter((d) => d.pilot?.type === 'design_partner' && d.pilot.customerId).map((d) => d.pilot.customerId));
  for (const s of live) if (customerById(state, s.customerId)?.meta?.designPartner) dp.add(s.customerId);
  const dpLive = [...dp].filter((id) => live.some((s) => s.customerId === id)).length;
  if (live.length >= 3 && dpLive >= 2 && dpLive / live.length >= 0.4) flag('design_partners_as_pmf', 'Design partners counted as PMF', `${dpLive} of ${live.length} customers are design partners (free or heavily subsidised, shaping the product with you). They are co-builders, not evidence that strangers will pay.`, 'medium', { designPartners: dpLive, customers: live.length });
  return out;
}

// ---- Scorecard ----
export function pmfScorecard(state) {
  const day = state.day ?? 0;
  const subs = subsOf(state);
  const recent = subs.filter((s) => s.startDay > day - 90);
  const mix = {};
  for (const s of recent) mix[sourceClass(s.source)] = (mix[sourceClass(s.source)] ?? 0) + 1;
  const pullN = recent.filter((s) => PULL.has(sourceClass(s.source))).length;
  const expansions = (state.stripe?.events ?? []).filter((e) => e.type === 'expansion' && e.day > day - 90).length;
  const won = decidedDeals(state).filter((d) => d.won);
  const cyc = (a) => a.reduce((x, d) => x + Math.max(0, d.decidedDay - d.createdDay), 0) / a.length;
  const rc = won.filter((d) => d.decidedDay > day - 120), pc = won.filter((d) => d.decidedDay <= day - 120);
  const cycle = rc.length >= 3 && pc.length >= 3 ? { recent: round2(cyc(rc)), prior: round2(cyc(pc)), trend: cyc(rc) < cyc(pc) * 0.85 ? 'shortening' : cyc(rc) > cyc(pc) * 1.15 ? 'lengthening' : 'flat' } : null;
  const closed = (state.apps?.insights?.pmf?.surveys ?? []).filter((x) => x.status === 'closed' && x.rows?.length && x.target === 'activated').sort((a, b) => b.startDay - a.startDay)[0] ?? null;
  const paying = subs.filter((s) => PAYING.has(s.status)).length;
  const caveats = [];
  if (paying < 20) caveats.push(`Only ${paying} paying customers: every number here moves a lot when one account joins or leaves.`);
  if (recent.length < 15) caveats.push(`Source mix rests on ${recent.length} signups in 90 days.`);
  return {
    customers: paying,
    organic: { n: recent.length, share: recent.length ? round2(pullN / recent.length) : null, mix },
    pull: { inbound: mix['organic / inbound'] ?? 0, referrals: mix.referral ?? 0, expansions },
    retention: retentionByGroup(state, hasIdea(state) ? 'segment' : 'all'),
    salesCycle: cycle,
    sean: closed ? { surveyId: closed.id, day: closed.startDay, n: closed.rows.length, groups: surveyCut(state, closed, 'segment'), verdict: segmentVerdict(state, closed) } : null,
    flags: falsePmfFlags(state),
    caveats,
  };
}

/** Truth of "do we have PMF" for a call: one segment, or the customers we actually have. null = no truth model (legacy callers use fit). */
export function callTruth(state, segmentId = null) {
  if (!hasIdea(state)) return null;
  if (segmentId) return segmentTruth(state, segmentId).veryDisappointed >= PMF_LINE;
  const live = subsOf(state).filter((s) => LIVE.has(s.status));
  if (!live.length) return null;
  let vd = 0;
  for (const s of live) vd += segmentTruth(state, tagOf(state, s).seg).veryDisappointed;
  return vd / live.length >= PMF_LINE;
}
