// Scripted ABM / signal-based operators for test/abm-signals.test.js. Each plays the same hidden world (same seed,
// same company) through the real model functions (apps/sales/abm.js) for a short horizon and returns what happened.
import { newState } from '../../public/core/state.js';
import { ensureMarket } from '../../public/core/market.js';
import { universe, idealProfile, FUNDING_LABEL } from '../../public/apps/sales/prospector.js';
import {
  ensureAbm, addTargetAccount, researchAccount, findMember, subscribeSource, pruneSource, sendTouch, verifySignal, dismissSignal,
  visibleSignals, abmDay, abmSummary, targets, INITIATIVES, SIGNAL_TYPES, signalStrength, runClusterPlay, sourceScoreboard,
} from '../../public/apps/sales/abm.js';

export function mkState(seed = 3) {
  const s = newState({ companyName: 'Pipeline Pilot', model: 'ent', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Revenue operations software for mid-market B2B companies';
  s.company.icp = 'mid-market B2B companies 100-1000 employees using HubSpot or Salesforce';
  s.day = 10;
  return s;
}

const ROLE_LINE = {
  economic_buyer: 'Teams your size usually see payback inside a quarter, with clear ROI on the spend.',
  finance: 'Teams your size usually see payback inside a quarter, with clear ROI on the spend.',
  champion: 'It usually gives the team a few hours a week back on the process.',
  user: 'It takes a lot of clicks out of the day-to-day workflow.',
  technical: 'It connects through the API and SSO, so the integration is a day of work.',
};
const REFABLE = new Set(['funding', 'hiring', 'tech_change', 'competitor_review', 'job_change', 'content_engagement']);
function signalLine(sig, acc) {
  return {
    funding: `Congrats on the ${FUNDING_LABEL[acc.funding] ?? 'new'} round you announced.`,
    hiring: 'Saw you are hiring for several revenue roles.',
    tech_change: `Saw you moved to ${acc.techs[0] ?? 'a new CRM'} recently.`,
    competitor_review: 'I read your review of the tool you use now; the part about reporting taking hours stood out.',
    job_change: `Congrats on the new role at ${acc.name}.`,
    content_engagement: 'Thanks for your comment on my post about pipeline reviews.',
  }[sig.type];
}

const V = (acc, m, k, arr) => arr[(acc.name.length * 7 + m.first.length * 3 + k) % arr.length];
function skilled(acc, m, sig) {
  const lines = [`Hi ${m.first},`];
  // Person-level signals are only quoted to the person they are about.
  if (sig && REFABLE.has(sig.type) && (!SIGNAL_TYPES[sig.type].person || sig.personKey === m.key)) lines.push(signalLine(sig, acc));
  lines.push(V(acc, m, 1, [`At ${acc.employees} people on ${acc.techs.join(' and ')}, ${acc.industry.toLowerCase()} teams like ${acc.name} hit the same wall.`, `${acc.name} runs ${acc.techs[0]} with about ${acc.employees} people; that is where forecasting gets painful.`, `Most ${acc.industry.toLowerCase()} groups around ${acc.employees} people that we talk to stitch ${acc.techs.join(' plus ')} together by hand.`]));
  const init = acc.research.initiative;
  if (init) lines.push(V(acc, m, 2, [`With ${INITIATIVES[init].label.toLowerCase()} on your plate, the revenue reporting usually breaks first.`, `Since ${INITIATIVES[init].label.toLowerCase()} is the priority this year, pipeline numbers need to be right weekly.`, `${INITIATIVES[init].label} tends to expose gaps in how deals get tracked.`]));
  else lines.push(V(acc, m, 2, ['Usually the revenue reporting is the first thing that breaks at this stage.', 'Forecast calls tend to eat a morning a week at this stage.', 'Pipeline reviews usually turn into spreadsheet archaeology around now.']));
  lines.push(ROLE_LINE[m.role] ?? ROLE_LINE.champion);
  lines.push('Worth a 20-minute look next week?');
  return lines.join(' ');
}
const MEDIOCRE_TEXT = (acc, m) => `Hi ${m.first}, I noticed your team is researching tools like ours. We help companies like yours save time and grow with our best-in-class platform. Can we book a demo this week?`;
const AVERAGE_TEXT = (acc, m, sig) => `Hi ${m.first}, ${sig && REFABLE.has(sig.type) ? `saw that ${acc.name} ${sig.type === 'funding' ? 'raised a round' : sig.type === 'hiring' ? 'is hiring' : 'made a change'}.` : `hope things are good at ${acc.name}.`} We help teams like yours save hours every week on reporting. Open to a quick chat?`;

const PROFILES = {
  // Stellar researches lightly up front and goes deep only when an account shows intent (intent sequences the work).
  stellar: { sources: ['visitor_id', 'firmographic', 'competitor_reviews'], pick: 'fit', n: 30, tier1: 8, research: { 1: 'light' }, find: { 1: ['champion'], 2: ['champion'] }, onSignal: { research: { 1: 'deep', 2: 'light' }, find: { 1: ['economic_buyer', 'user'], 2: ['economic_buyer'] } }, latency: 1, verify: true, stackRule: true, threads: 3, cap: 3, text: skilled, prune: true },
  good: { sources: ['visitor_id', 'firmographic'], pick: 'fit', n: 30, tier1: 8, research: { 1: 'light', 2: null }, find: { 1: ['champion', 'economic_buyer'], 2: [] }, latency: 2, verify: false, stackRule: false, threads: 2, cap: 3, text: skilled, prune: false },
  average: { sources: ['firmographic'], pick: 'segment_size', n: 30, tier1: 15, research: {}, find: {}, latency: 7, verify: false, stackRule: false, threads: 1, cap: 4, text: AVERAGE_TEXT, prune: false },
  mediocre: { sources: ['third_party_intent', 'content_engagement'], pick: 'segment_size', n: 30, tier1: 30, research: {}, find: {}, latency: 14, verify: false, stackRule: false, threads: 1, cap: 5, text: MEDIOCRE_TEXT, prune: false, followUps: true },
};

function pickAccounts(s, how, n) {
  const u = universe(s);
  const ideal = idealProfile(s);
  let cos = u.companies.filter((c) => c.employees >= 20);
  if (how === 'fit') cos = cos.filter((c) => ideal.segments.has(c.segId) && c.employees >= ideal.band[0] && c.employees <= ideal.band[1]).sort((a, b) => (b.hiringShown || b.recentRaise ? 1 : 0) - (a.hiringShown || a.recentRaise ? 1 : 0) || (b.techs.some((t) => ideal.tech.includes(t)) ? 1 : 0) - (a.techs.some((t) => ideal.tech.includes(t)) ? 1 : 0));
  else if (how === 'segment_size') cos = cos.filter((c) => ideal.segments.has(c.segId)).sort((a, b) => b.employees - a.employees);
  else cos = cos.sort((a, b) => b.employees - a.employees);
  return cos.slice(0, n);
}

/** Play one tier for `days` days. Returns { summary, positives, touches, hours, state }. */
export function play(tier, { seed = 3, days = 75 } = {}) {
  const P = PROFILES[tier];
  const s = mkState(seed);
  ensureAbm(s);
  const picks = pickAccounts(s, P.pick, P.n);
  picks.forEach((co, i) => {
    const t = i < P.tier1 ? 1 : 2;
    const reason = P.pick === 'fit' ? `${co.hiringShown ? 'hiring revenue roles; ' : ''}${co.recentRaise ? 'raised recently; ' : ''}uses ${co.techs.join(' and ')}` : 'big logo with lots of employees';
    addTargetAccount(s, co.key, { tier: t, reason });
  });
  for (const id of P.sources) subscribeSource(s, id);
  for (const acc of targets(s)) {
    const depth = P.research[acc.tier];
    if (depth) researchAccount(s, acc.id, depth);
    for (const role of P.find[acc.tier] ?? []) { let r = findMember(s, acc.id, role); if (!r.ok && acc.members.some((m) => m.role === role)) r = findMember(s, acc.id, role); }
  }
  const pending = []; // signals waiting for the latency
  const end = s.day + days;
  while (s.day < end) {
    const a = ensureAbm(s);
    // Batch cadence: act on what is old enough per this operator's latency.
    if ((s.day % Math.max(1, P.latency === 14 ? 14 : 1)) === 0) {
      const fresh = visibleSignals(s).filter((x) => !x.actedDay && !x.dismissed && !x.handled && x.accountId);
      for (const sig of fresh) {
        if (s.day - sig.seenDay < (P.latency === 14 ? 0 : P.latency - 1)) continue;
        const acc = a.accounts.find((x) => x.id === sig.accountId);
        if (!acc) continue;
        if (acc.status === 'suggested') { if (tier !== 'mediocre') addTargetAccount(s, acc.key, { tier: 1, reason: 'champion who bought before moved here' }); else { sig.handled = true; continue; } }
        if (P.verify && !sig.verified && ['funding', 'hiring', 'tech_change', 'job_change', 'competitor_review'].includes(sig.type)) {
          const v = verifySignal(s, sig.id);
          if (v.result === 'not_true') { dismissSignal(s, sig.id); continue; }
        }
        if (P.stackRule) {
          const recent = visibleSignals(s, acc.id).filter((x) => s.day - x.day <= 14 && x.verified !== 'not_true');
          const strong = ['job_change', 'competitor_review'].includes(sig.type);
          if (new Set(recent.map((x) => x.source)).size < 2 && !strong && acc.tier !== 1) { if (s.day - sig.seenDay > 6) { dismissSignal(s, sig.id); } continue; }
        }
        sig.handled = true;
        actOn(s, P, acc, sig);
      }
    }
    if (P.followUps && s.day % 7 === 0) { // re-hit everyone already contacted
      for (const acc of targets(s)) {
        const m = acc.members.find((x) => x.found && x.touches > 0 && !x.optedOut);
        if (m && m.touches < P.cap && !(acc.burnedUntil > s.day)) { try { sendTouch(s, acc.id, m.key, { text: P.text(acc, m, null) }); } catch { /* burned */ } }
      }
    }
    if (P.prune && s.day % 15 === 0) for (const r of sourceScoreboard(s)) if (r.on && r.acted >= 8 && r.positives === 0) pruneSource(s, r.id);
    s.day++;
    abmDay(s);
  }
  for (let i = 0; i < 6; i++) { s.day++; abmDay(s); } // let replies land
  const sum = abmSummary(s);
  return { tier, summary: sum, state: s };
}

function actOn(s, P, acc, sig) {
  if (P.onSignal && !acc.prepped) {
    acc.prepped = true;
    const depth = P.onSignal.research[acc.tier];
    if (depth && !(depth === 'light' && acc.research.light)) researchAccount(s, acc.id, depth);
    for (const role of P.onSignal.find[acc.tier] ?? []) if (acc.members.some((m) => m.role === role && !m.found)) { const r = findMember(s, acc.id, role); if (!r.ok) findMember(s, acc.id, role); }
  }
  const found = acc.members.filter((m) => m.found && !m.optedOut);
  if (!found.length) return;
  const order = [...found].sort((x, y) => (y.warm ? 1 : 0) - (x.warm ? 1 : 0) || (y.role === 'champion') - (x.role === 'champion') || (y.role === 'economic_buyer') - (x.role === 'economic_buyer'));
  const recentTouches = ensureAbm(s).touches.filter((t) => t.accountId === acc.id && s.day - t.day <= 30).length;
  let n = 0;
  for (const m of order.slice(0, P.threads)) {
    if (recentTouches + n >= P.cap) break;
    if (P.threads > 1 && m.lastTouchDay != null && s.day - m.lastTouchDay < 14) continue;
    try { sendTouch(s, acc.id, m.key, { text: P.text(acc, m, sig), signalId: sig.id }); n++; } catch { /* burned or opted out */ }
  }
}

export { runClusterPlay, signalStrength, SIGNAL_TYPES };
