// Operator readers for functions whose state is already readable (ARCHITECTURE principle 7, audit 5.1).
// Each reader looks at what the player DID in another app's slice, strictly read-only, and returns
// { tier, evidence, coaching, score, n, traps }. Owners of the other functions register their own readers
// from their modules with registerOperatorReader (public/core/operator.js).
//
// Rules every reader follows:
//  - 'unknown' until the player has acted in that function (or, for duty-type functions such as books and
//    legal, until the duty exists: a month to close, a paying customer, a hire).
//  - Quality, not volume: a score in 0..1 from judged quality, consistency and outcomes reconciled with hidden
//    state. Volume only adds evidence (it shrinks the read less toward the median), it never adds score.
//  - Offline (heuristic) judgments are shrunk toward the median before they count.
//  - Weights and cut-offs below are [design] tuning values; the tier spreads they should produce are in
//    public/data/operator-tiers.js (outcomes per tier).

import { registerOperatorReader, hasOperatorReader, shrink, tierFromScore, trapCoaching, tierBehaviours, TIER_RANK, unknownRead } from '../../core/operator.js';
import { clamp, hash } from '../../core/util.js';
import { mainPlan, monthlyPrice, cfg } from '../../core/market.js';
import { activeSubs } from '../../core/stripe.js';
import { analyzeCopy, stepQuality } from '../sales/copy.js';
import { closableMonths } from '../money/ledger.js';
import { legalIssues } from '../legal/sim.js';
import { candQuality } from '../people/hiring.js';
import { presellRead } from '../sales/presell.js';

// Copy quality per step: the shared rule in sales/copy.js (re-exported for existing callers).
export { stepQuality };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const lin = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1); // 0 at lo, 1 at hi (works reversed too)
// Offline heuristic judgments are crude: shrink them toward the median before they count [design 0.5].
export const offlineAdjust = (q, mock) => (q == null ? null : mock ? 0.5 + (q - 0.5) * 0.5 : q);

/**
 * Turn a raw quality score into a read: shrink toward the median by evidence, map to a tier, apply hard caps
 * for severe traps, and attach coaching (trap lines first, then what a stellar operator does).
 */
export function buildRead(fn, { raw, n, k = 4, minN = 1, evidence = [], traps = [], cap = null }) {
  const score = shrink(clamp(raw, 0, 1), n, 0.5, k);
  let tier = tierFromScore(score, { n, minN });
  if (cap && TIER_RANK[tier] > TIER_RANK[cap]) tier = cap;
  const coaching = traps.map((t) => (typeof t === 'string' ? trapCoaching(fn, t) : trapCoaching(fn, t.id, t.text) || t.text)).filter(Boolean);
  if (tier !== 'stellar' && tier !== 'unknown') {
    const b = tierBehaviours(fn, 'stellar')[0];
    if (b) coaching.push(`What a stellar operator does: ${b}.`);
  }
  return { tier, score: Math.round(score * 100) / 100, raw: Math.round(clamp(raw, 0, 1) * 100) / 100, n, evidence, coaching: [...new Set(coaching)], traps: traps.map((t) => (typeof t === 'string' ? t : t.id)) };
}

// ---------------- Customer discovery (research app) ----------------

const STRONG_COMMIT = new Set(['intro', 'pilot', 'loi', 'preorder']);
export function readCustomerDiscovery(state) {
  const ivs = state.apps.research?.interviews ?? [];
  const real = ivs.filter((i) => i.real && i.status === 'done');
  const rehearsals = ivs.filter((i) => !i.real && i.grade);
  // Pre-sell asks (CRM → Pre-sell) are discovery evidence too: asking for money and telling commitments from compliments.
  const ps = presellRead(state);
  const psKnown = ps.tier !== 'unknown';
  if (!real.length && !psKnown) return unknownRead(rehearsals.length ? ['Rehearsals with AI personas are practice, not evidence. Book real interviews with strangers who have the problem.'] : []);
  if (!real.length) return buildRead('customer_discovery', { raw: ps.score, n: ps.n, k: 4, evidence: ps.evidence, traps: ps.coaching.map((t, i) => ({ id: `presell_${i}`, text: t })) });
  // Self-reported notes are the player's own claim: count them at half strength. Live calls are graded on transcript.
  const q = mean(real.map((i) => offlineAdjust((i.grade?.score ?? 40) / 100, i.grade?.selfReported || i.grade?.source === 'offline heuristic')));
  const commitScore = mean(real.map((i) => { const c = i.grade?.commitments ?? []; return c.some((x) => STRONG_COMMIT.has(x)) ? 1 : c.includes('followup') ? 0.3 : 0; }));
  const strangers = real.filter((i) => i.channel && i.channel !== 'warm').length / real.length;
  const graded = [...real, ...rehearsals].map((i) => i.grade).filter(Boolean);
  const hypo = mean(graded.map((g) => (g.hypotheticals?.length ?? 0) + (g.leadingQuestions?.length ?? 0) + (g.pitching?.length ?? 0)));
  const raw = 0.4 * q + 0.4 * Math.min(1, commitScore / 0.35) + 0.2 * Math.min(1, strangers / 0.5);
  const traps = [];
  if (hypo != null && hypo >= 1.5) traps.push('hypotheticals');
  if (real.length >= 4 && commitScore < 0.1) traps.push('compliments');
  if (real.length >= 3 && strangers < 0.2) traps.push('warm_only');
  if (real.filter((i) => !(i.grade?.commitments ?? []).length).length / real.length > 0.6) traps.push('no_ask');
  if (psKnown) ps.coaching.forEach((t, i) => traps.push({ id: `presell_${i}`, text: t }));
  return buildRead('customer_discovery', {
    raw: psKnown ? 0.75 * raw + 0.25 * ps.score : raw, n: real.length + (psKnown ? ps.n : 0), k: 4, traps,
    evidence: [...(psKnown ? [`Pre-selling: ${ps.evidence.join(', ')}`] : []), `${real.length} real interviews, average quality ${Math.round(q * 100)}/100`, `${Math.round(commitScore * 100)}% ended in a real commitment (intro, pilot, LOI, pre-order)`, `${Math.round(strangers * 100)}% with people outside your warm network`],
  });
}

// ---------------- Cold outreach (outreach + CRM) ----------------

const TIER_W = { generic: 0.1, basic: 0.45, researched: 0.85, warm: 1 };
export function readColdOutreach(state) {
  const o = state.apps.outreach;
  const contacts = (state.apps.crm?.contacts ?? []).filter((c) => c.tier && TIER_W[c.tier] != null);
  const daily = o?.daily ?? [];
  const sent = daily.reduce((a, d) => a + (d.sent ?? 0), 0);
  const aiSent = daily.reduce((a, d) => a + (d.aiSent ?? 0), 0);
  if (!contacts.length && !sent && !aiSent) return unknownRead();
  const tierMix = contacts.length ? mean(contacts.map((c) => TIER_W[c.tier])) : 0.1;
  const seqs = (o?.sequences ?? []).filter((s) => s.status !== 'draft' && s.steps?.length);
  let copy = null;
  try { copy = mean(seqs.map((s) => clamp(stepQuality(s, s.steps[0], 0), 0, 1))); } catch { copy = null; }
  // Template personalisation: the same "personal" line pasted across many recipients is not research.
  const lines = contacts.map((c) => String(c.personalization ?? '').trim().toLowerCase()).filter((x) => x.length > 8);
  const uniqueShare = lines.length >= 10 ? new Set(lines).size / lines.length : 1;
  const bounced = daily.reduce((a, d) => a + (d.bounced ?? 0), 0);
  const complaints = daily.reduce((a, d) => a + (d.complaints ?? 0), 0);
  const positive = daily.reduce((a, d) => a + (d.positive ?? 0), 0);
  const total = sent + aiSent;
  const bounceRate = total ? bounced / total : 0;
  const deliv = total ? lin(bounceRate, 0.08, 0.02) * (complaints / total > 0.003 ? 0.5 : 1) : 0.5;
  const outcome = total >= 100 ? Math.min(1, (positive / total) / 0.025) : null;
  const parts = [[0.4, tierMix], [0.25, copy ?? 0.5], [0.15, deliv]];
  if (outcome != null) parts.push([0.2, outcome]);
  const raw = parts.reduce((a, [w, v]) => a + w * v, 0) / parts.reduce((a, [w]) => a + w, 0);
  const traps = [];
  let cap = null;
  if (uniqueShare < 0.5) { traps.push('generic_ai_personalisation'); cap = 'average'; }
  else if (contacts.length >= 10 && tierMix < 0.3) traps.push('generic_ai_personalisation');
  if (seqs.some((s) => s.steps.length > 7)) traps.push('ninth_touch');
  const primary = String(state.company.domain ?? '').toLowerCase();
  if (primary && (o?.domains ?? []).some((d) => String(d.name).toLowerCase() === primary)) { traps.push('primary_domain'); cap = 'average'; }
  if (aiSent > sent && aiSent >= 200) traps.push('generic_ai_personalisation');
  if (bounceRate > 0.05) traps.push({ id: 'bounces', text: `Bounce rate ${Math.round(bounceRate * 100)}%: above 5% is a list problem, not a copy problem. Verify before you send.` });
  return buildRead('cold_outreach', {
    raw, n: Math.min(contacts.length || total / 10, 300) / 15, k: 3, cap, traps,
    evidence: [
      `${contacts.length} prospects emailed: ${Object.keys(TIER_W).map((t) => `${contacts.filter((c) => c.tier === t).length} ${t}`).join(', ')}`,
      copy != null ? `Sequence copy quality ${Math.round(copy * 100)}/100` : 'No launched sequence yet',
      total ? `Bounce ${(bounceRate * 100).toFixed(1)}%, positive replies ${((positive / total) * 100).toFixed(1)}% of ${total.toLocaleString()} sends` : 'No sends yet',
    ],
  });
}

// ---------------- Paid ads (ads app) ----------------

export function readPaidAds(state) {
  const A = state.apps.ads;
  const rows = A?.rows ?? [];
  const spend = rows.reduce((a, r) => a + (r.sp ?? 0), 0);
  if (!(spend > 0)) return unknownRead();
  const results = rows.reduce((a, r) => a + (r.tr ?? 0) + (r.pu ?? 0), 0);
  const acct = Object.values(A.accounts ?? {})[0];
  const price = monthlyPrice(mainPlan(state)) || 1;
  const target = acct?.targetCpa ?? price * 3;
  const cpa = results ? spend / results : spend * 2;
  const outcome = lin(cpa / Math.max(1, target), 2.5, 0.8);
  // Ceiling from unit economics: payback on the CPA ceiling at ~80% gross margin [design: <=6 mo great, >=24 bad].
  const ceiling = lin(target / (price * 0.8), 24, 6);
  const spentSets = new Set(rows.filter((r) => r.sp > 0).map((r) => r.s));
  const sets = (A.adsets ?? []).filter((s) => spentSets.has(s.id));
  const recentEdits = sets.reduce((a, s) => a + (s.edits ?? []).filter((e) => e.day > state.day - 30).length, 0);
  const editsPer14 = sets.length ? recentEdits / sets.length / (30 / 14) : 0;
  const editScore = lin(editsPer14, 4, 1);
  const jumps = sets.flatMap((s) => s.edits ?? []).filter((e) => { const m = /budget (\d+) → (\d+)/.exec(e.why ?? ''); return m && +m[2] >= 2 * +m[1]; }).length;
  const adIds = new Set(rows.filter((r) => r.sp > 0).map((r) => r.a));
  const crs = (A.ads ?? []).filter((a) => adIds.has(a.id) && a.creativeId).map((a) => (A.creatives ?? []).find((c) => c.id === a.creativeId)).filter(Boolean);
  const entities = new Set(crs.map((c) => c.entity ?? c.id)).size;
  const skill = mean(crs.filter((c) => c.skill != null).map((c) => offlineAdjust(c.skill, c.judge?.mock ?? c.mock)));
  const rtSpend = rows.filter((r) => (A.adsets ?? []).find((s) => s.id === r.s)?.audience?.type === 'retargeting').reduce((a, r) => a + r.sp, 0);
  const rtShare = spend ? rtSpend / spend : 0;
  const raw = 0.3 * outcome + 0.15 * ceiling + 0.2 * editScore + 0.15 * Math.min(1, entities / 4) + 0.2 * (skill ?? 0.4);
  const traps = [];
  if (editsPer14 > 2) traps.push('learning_churn');
  if (jumps) traps.push('scale_3x');
  if (rtShare > 0.4) traps.push('retargeting_roas');
  if (sets.some((s) => s.optimization === 'lead') && state.company.model !== 'ent') traps.push('signup_conversion');
  if (ceiling < 0.3) traps.push({ id: 'cpa_ceiling', text: `Your CPA ceiling (${Math.round(target)}) pays back in ${Math.round(target / (price * 0.8))} months of gross margin. Set it from LTV and payback before spending.` });
  const days = new Set(rows.filter((r) => r.sp > 0).map((r) => r.d)).size;
  return buildRead('paid_ads', {
    raw, n: Math.min(12, days / 5), k: 3, traps,
    evidence: [`$${Math.round(spend).toLocaleString()} spent over ${days} days; CPA ${results ? `$${Math.round(cpa)}` : 'n/a (no results)'} vs target $${Math.round(target)}`, `${entities} distinct creative concepts; ${editsPer14.toFixed(1)} edits per ad set per 2 weeks`, `${Math.round(rtShare * 100)}% of spend on retargeting`],
  });
}

// ---------------- Pricing and packaging (pricing lab + plans) ----------------

export function readPricing(state) {
  const P = state.apps.pricing;
  const used = Boolean(P && ((P.history?.length ?? 0) || (P.surveys?.length ?? 0) || (P.abTests?.length ?? 0) || (P.increases?.length ?? 0)));
  const paying = activeSubs(state).length;
  if (!used && paying < 3) return unknownRead();
  const wtp = state.market?.fit?.price?.wtp ?? cfg(state).refPrice;
  const price = monthlyPrice(mainPlan(state));
  const ratio = wtp > 0 && price > 0 ? price / wtp : 1;
  const priceScore = ratio < 0.6 ? lin(ratio, 0.2, 0.6) : ratio > 1.05 ? lin(ratio, 1.6, 1.05) : 1;
  const surveys = (P?.surveys ?? []).filter((s) => s.status !== 'collecting').length;
  const tests = P?.abTests ?? [];
  const enough = (t) => (t.agg?.A?.decided ?? 0) >= 30 && (t.agg?.B?.decided ?? 0) >= 30;
  const goodTests = tests.filter((t) => t.status === 'stopped' && enough(t)).length;
  const peeked = tests.filter((t) => t.adopted && !enough(t)).length;
  const evidence = Math.min(1, (surveys + 2 * goodTests) / 2) * (peeked ? 0.5 : 1);
  const incs = P?.increases ?? [];
  const incScore = incs.length ? mean(incs.map((i) => 0.5 * (i.noticeDays >= 30 ? 1 : i.noticeDays >= 14 ? 0.6 : 0.2) + 0.25 * (i.grandfatherMonths > 0 ? 1 : 0) + 0.25 * clamp(i.comms ?? 0.4, 0, 1))) : 0.6;
  const deals = (state.apps.crm?.deals ?? []).filter((d) => d.stage === 'won');
  const discShare = deals.length >= 3 ? deals.filter((d) => (d.discountPct ?? 0) > 0.2).length / deals.length : 0;
  const raw = 0.45 * priceScore + 0.25 * evidence + 0.2 * incScore + 0.1 * (1 - discShare);
  const traps = [];
  if (ratio < 0.4) traps.push('price_from_cost');
  if (incs.some((i) => i.noticeDays < 14 && (i.comms ?? 0.4) < 0.4)) traps.push('surprise_increase');
  if (discShare > 0.5) traps.push('discount_everything');
  if (peeked) traps.push({ id: 'peeked', text: `You adopted ${peeked} price test${peeked > 1 ? 's' : ''} before 30 decided trials per arm. Early winners are mostly noise.` });
  return buildRead('pricing_packaging', {
    raw, n: 1 + surveys + tests.length + incs.length + (paying >= 3 ? 2 : 0), k: 3, traps,
    evidence: [`Main plan at $${Math.round(price)}/mo`, `${surveys} price survey${surveys === 1 ? '' : 's'}, ${goodTests} A/B test${goodTests === 1 ? '' : 's'} run to a full sample${peeked ? `, ${peeked} adopted early` : ''}`, incs.length ? `${incs.length} price increase${incs.length > 1 ? 's' : ''}: notice ${incs.map((i) => `${i.noticeDays}d`).join(', ')}` : 'No price increases yet'],
  });
}

// ---------------- Fundraising (investor pipeline) ----------------

export function readFundraising(state) {
  const fr = state.apps.fundraising;
  const contacted = (fr?.investors ?? []).filter((i) => i.outreach);
  if (!contacted.length) return unknownRead();
  const warm = contacted.filter((i) => i.outreach.channel === 'warm').length / contacted.length;
  const quality = mean(contacted.map((i) => offlineAdjust(clamp(((i.outreach.quality ?? 3) - 1) / 4, 0, 1), i.outreach.judge?.mock)));
  const byRaise = {};
  for (const i of contacted) (byRaise[i.raiseId ?? 'none'] ??= []).push(i.outreach.day ?? 0);
  const parallel = mean(Object.values(byRaise).map((days) => { const first = Math.min(...days); return days.filter((d) => d - first <= 21).length / days.length; }));
  const mtgs = (fr.meetings ?? []).filter((m) => m.status === 'done' && m.perf != null);
  const pitch = mtgs.length ? mean(mtgs.map((m) => clamp((m.perf - 1) / 4, 0, 1))) : null;
  const cold = contacted.length - contacted.filter((i) => i.outreach.channel === 'warm').length;
  const raw = 0.3 * warm + 0.2 * quality + 0.2 * parallel + 0.2 * (pitch ?? 0.5) + 0.1 * (cold > 60 ? 0.2 : 1);
  const traps = [];
  if (cold > 60 || contacted.length > 100) traps.push('meeting_count');
  if (pitch != null && mtgs.length >= 2 && pitch < 0.4) traps.push('deck_before_call');
  if (parallel < 0.5 && contacted.length >= 6) traps.push('series_not_parallel');
  const leads = (fr.investors ?? []).filter((i) => i.status === 'committed' && i.terms?.lead);
  if (leads.some((l) => (fr.investors ?? []).filter((o) => o.raiseId === l.raiseId && (o.terms?.lead || o.status === 'term_sheet')).length <= 1)) traps.push('first_term_sheet');
  return buildRead('fundraising', {
    raw, n: Math.min(15, contacted.length / 3), k: 3, traps,
    evidence: [`${contacted.length} investors contacted, ${Math.round(warm * 100)}% through warm intros`, `Outreach quality ${Math.round(quality * 100)}/100; ${Math.round(parallel * 100)}% contacted inside a 3-week window`, pitch != null ? `${mtgs.length} pitch meetings, average performance ${(1 + pitch * 4).toFixed(1)}/5` : 'No pitch meetings yet'],
  });
}

// ---------------- Investor relations (updates) ----------------

export function readInvestorRelations(state) {
  const fr = state.apps.fundraising;
  const ir = fr?.ir;
  const updates = ir?.updates ?? [];
  const closed = (fr?.investors ?? []).filter((i) => i.status === 'committed' && i.closedDay != null);
  const hasInsiders = closed.length > 0 || (fr?.cap?.safes ?? []).length > 0;
  if (!updates.length && !hasInsiders) return unknownRead();
  const firstClose = Math.min(...closed.map((i) => i.closedDay), ...(fr?.cap?.safes ?? []).map((s) => s.day ?? Infinity));
  if (!updates.length) {
    if (!(state.day - firstClose > 45)) return unknownRead(['Send your first investor update within a month of closing.']);
    return buildRead('investor_relations', { raw: 0.1, n: 3, k: 2, traps: ['wait_for_next_update'], evidence: [`No investor update in ${state.day - firstClose} days since money came in`] });
  }
  const quality = mean(updates.map((u) => offlineAdjust(clamp(((u.quality ?? 3) - 1) / 4, 0, 1), u.judge?.mock ?? u.mock)));
  // Cadence counts from the first update or a month after money came in, whichever is earlier (last 6 months).
  const start = Math.max(Math.min(updates[0].day, Number.isFinite(firstClose) ? firstClose + 30 : Infinity), state.day - 180);
  const monthsElapsed = Math.max(1, Math.min(6, Math.round((state.day - start) / 30.4) + 1));
  const months = new Set(updates.filter((u) => u.day >= start).map((u) => u.month)).size;
  const cadence = Math.min(1, months / monthsElapsed);
  const covered = Math.min(months, monthsElapsed);
  const asks = updates.flatMap((u) => u.judge?.asks ?? []);
  const broad = asks.length >= 2 && asks.filter((a) => !a.specific).length / asks.length > 0.5;
  const raw = 0.5 * quality + 0.35 * cadence + 0.15 * (ir.hidBadNews ? 0 : 1);
  const traps = [];
  if (ir.hidBadNews) traps.push('all_highlights');
  if (broad) traps.push('broad_ask');
  const silent = hasInsiders ? state.day - updates.at(-1).day : 0;
  if (silent > 45) traps.push('wait_for_next_update');
  // Silent for a quarter with money in: that is the mediocre behaviour itself, whatever the old updates said.
  return buildRead('investor_relations', {
    raw, n: updates.length, k: 2, traps, cap: silent > 90 ? 'mediocre' : silent > 45 ? 'average' : null,
    evidence: [`${updates.length} update${updates.length === 1 ? '' : 's'} sent; ${covered} of the last ${monthsElapsed} months covered`, `Average judged quality ${(1 + quality * 4).toFixed(1)}/5`, ir.hidBadNews ? 'Bad news was left out of an update' : 'Lowlights reported'],
  });
}

// ---------------- Bookkeeping, close and compliance (books app) ----------------

export function readBookkeeping(state) {
  const B = state.apps.books;
  const txns = state.bank?.txns ?? [];
  let months = [];
  try { months = closableMonths(state).slice(-6); } catch { months = []; }
  // Duty-type function: once there is an ended month with activity, not closing it is itself the read.
  if (!months.length || txns.length < 5) return unknownRead();
  const closedShare = months.filter((m) => B?.closed?.[m]).length / months.length;
  let mis = 0, reviewed = 0;
  if (B) {
    const recent = txns.filter((t) => t.day > state.day - 120 && B.cats?.[t.id]);
    reviewed = recent.length;
    // Same rule as money/ledger.js isMisclassified, on the transactions the player (or service) booked.
    mis = recent.filter((t) => !['uncategorized', 'other'].includes(t.category) && B.cats[t.id].cat !== t.category).length;
  }
  const misShare = reviewed ? mis / reviewed : 0.15; // unreviewed books: assume the DIY default error rate
  const missed = Object.values(B?.compliance ?? {}).filter((r) => ['missed', 'overdue'].includes(r?.status)).length;
  const raw = 0.45 * closedShare + 0.25 * lin(misShare, 0.25, 0.02) + 0.2 * (missed ? 0 : 1) + 0.1 * (B && B.service && B.service !== 'diy' ? 1 : 0.5);
  const traps = [];
  if (months.length >= 2 && closedShare === 0) traps.push('bank_feed_is_books');
  if (missed) traps.push('deadline_in_head');
  return buildRead('bookkeeping_close_tax', {
    raw, n: months.length, k: 2, traps, cap: missed ? 'average' : null,
    evidence: [`${Math.round(closedShare * 100)}% of the last ${months.length} month(s) closed`, reviewed ? `${Math.round(misShare * 100)}% of ${reviewed} reviewed transactions miscategorised` : 'No transactions reviewed yet', `${missed} missed filing${missed === 1 ? '' : 's'} or payment${missed === 1 ? '' : 's'}`],
  });
}

// ---------------- Legal hygiene (legal app) ----------------

export function readLegal(state) {
  const L = state.apps.legal;
  const subs = state.stripe?.subscriptions ?? [];
  const hires = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent');
  const d = L?.docs ?? {};
  const acted = Boolean(L && (L.incorporation || L.founderStock || d.ipAssignment || d.ciiaa || (d.tos && d.tos !== 'none') || (d.msa && d.msa !== 'none') || L.dpaReady || (L.soc2 && L.soc2 !== 'none')));
  if (!acted && !subs.length && !hires.length) return unknownRead();
  let issues = [];
  try { issues = legalIssues(state); } catch { issues = []; }
  const firstCustomer = subs.length ? Math.min(...subs.map((s) => s.startDay ?? s.createdDay ?? Infinity)) : Infinity;
  const incDay = L?.incorporation?.effectiveDay ?? L?.incorporation?.day ?? (state.company.incorporated ? 0 : Infinity);
  const timing = Number.isFinite(firstCustomer) ? (incDay <= firstCustomer ? 1 : state.company.incorporated ? 0.5 : 0) : (state.company.incorporated ? 1 : 0.6);
  const fs = L?.founderStock;
  const raw = 0.6 * clamp(1 - 0.2 * issues.length, 0, 1) + 0.25 * timing + 0.15 * (fs ? (fs.filed83b ? 1 : fs.missed ? 0 : 0.5) : 0.5);
  const traps = [];
  if (fs?.missed) traps.push('miss_83b');
  if (state.company.incorporated && !L?.docs?.ipAssignment) traps.push('no_ip_assignment');
  for (const i of issues.slice(0, 3)) if (!/83\(b\)|IP assignment/.test(i)) traps.push({ id: 'issue', text: i });
  return buildRead('legal_hygiene', {
    raw, n: 3 + (acted ? 2 : 0), k: 2, traps, cap: fs?.missed ? 'average' : issues.length >= 3 ? 'average' : null,
    evidence: [`${issues.length} open diligence red flag${issues.length === 1 ? '' : 's'}`, Number.isFinite(firstCustomer) ? (incDay <= firstCustomer ? 'Incorporated before the first customer' : 'Took customers before incorporating') : 'No customers yet', fs ? (fs.filed83b ? '83(b) filed on time' : fs.missed ? '83(b) missed' : '83(b) still open') : 'No founder stock issued yet'],
  });
}

// ---------------- Hiring (people app) ----------------

const SAMPLE_KEYS = ['workSample', 'paidTrial', 'walkthrough'];
const REF_KEYS = ['references', 'backchannel'];
export function readHiring(state) {
  const p = state.apps.people;
  const cands = p?.candidates ?? [];
  const offered = cands.filter((c) => c.offer);
  const interviewed = cands.filter((c) => c.interview?.done);
  if (!offered.length && !interviewed.length) return unknownRead();
  const pool = offered.length ? offered : interviewed;
  const job = (c) => (p.jobs ?? []).find((j) => j.id === c.jobId);
  const did = (c, keys) => keys.some((k) => c.assessments?.[k] && !c.assessments[k].dropped);
  const process = mean(pool.map((c) => 0.25 * (job(c)?.scorecard ? 1 : 0) + 0.3 * clamp(c.interview?.execution ?? 0, 0, 1) + 0.25 * (did(c, SAMPLE_KEYS) ? 1 : 0) + 0.2 * (did(c, REF_KEYS) ? 1 : 0)));
  const posts = (p.jobs ?? []).filter((j) => j.quality != null).map((j) => j.quality);
  const postQ = mean(posts);
  const hired = cands.filter((c) => c.stage === 'hired');
  const outcome = hired.length ? mean(hired.map((c) => clamp(candQuality(c), 0, 1))) : null;
  const parts = [[0.55, process], [0.15, postQ ?? 0.4]];
  if (outcome != null) parts.push([0.3, outcome]);
  const raw = parts.reduce((a, [w, v]) => a + w * v, 0) / parts.reduce((a, [w]) => a + w, 0);
  const traps = [];
  if (pool.some((c) => !job(c)?.scorecard)) traps.push(offered.length ? 'culture_fit' : 'role_undefined');
  if (offered.some((c) => !did(c, REF_KEYS))) traps.push({ id: 'no_references', text: 'You made an offer without calling references. Ask "what would make you not hire them again?".' });
  if ((p.members ?? []).some((m) => m.placement?.fee > 0)) traps.push('recruiter_first');
  return buildRead('hiring', {
    raw, n: offered.length * 2 + interviewed.length * 0.5, k: 2, traps,
    evidence: [`${interviewed.length} interviews, ${offered.length} offers, ${hired.length} hires`, `Process ${Math.round(process * 100)}/100 (scorecard, structured interview, work sample, references)`, outcome != null ? `Hire quality ${Math.round(outcome * 100)}/100` : 'No hires yet'],
  });
}

export const READERS = {
  customer_discovery: readCustomerDiscovery,
  cold_outreach: readColdOutreach,
  paid_ads: readPaidAds,
  pricing_packaging: readPricing,
  fundraising: readFundraising,
  investor_relations: readInvestorRelations,
  bookkeeping_close_tax: readBookkeeping,
  legal_hygiene: readLegal,
  hiring: readHiring,
};

// Defaults only: if a function's owner registers its own reader (before or after this module loads), the
// owner's reader wins.
export function registerScorecardReaders() {
  for (const [id, fn] of Object.entries(READERS)) if (!hasOperatorReader(id)) registerOperatorReader(id, fn);
}
registerScorecardReaders();
