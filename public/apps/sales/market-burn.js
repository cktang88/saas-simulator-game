// Market cost of over-contacting (operator-tiers audit, top fix 4 and the "spamming outreach" free-mistakes row).
// Domain reputation is only the sender's cost. Here the MARKET remembers too:
//  - a company that gets mail from you to too many of its people, or whose people mark you as spam / opt out and
//    are then hit again, is "burned": its people reply far less and complain more for ~6 months, and the
//    Prospects database shows it as burned (suppressed from your pool);
//  - a buyer segment carries "heat" from untargeted volume (generic blasts, complaints, opt-outs). Heat decays with a
//    ~30-day half-life and lowers reply rates for every later campaign into that segment. Target from the audit:
//    a 2,000-email generic blast lowers the next campaign's reply rate by 30-50% for about 60 days [design].
//  - each burnt sending domain makes the next one start lower and warm up longer (providers and blocklists keep
//    a memory of the brand, the links and the sending IPs) [design].
// All numbers here are [design] estimates derived from the audit's targets; none is a published statistic.
import { clamp } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { emitSalesEvent } from './events.js';

export const BURN = {
  windowDays: 30,
  maxPeoplePerCompany: 3, // distinct people at one company emailed in 30 days before it reads as a blast [design]
  maxEmailsPerCompany: 12, // emails to one company in 30 days (2 people × 6 steps is still fine) [design]
  burnDays: 180,
  burnedReplyMult: 0.3,
  burnedComplaintMult: 2,
  decay: 0.977, // daily heat decay ≈ 30-day half-life [design]
  scale: 5500, // heat at which a segment's reply rate would reach 0 before the floor [design]
  floor: 0.5,
  tierHeat: { generic: 1, basic: 0.5, researched: 0.2, warm: 0 },
  complaintHeat: 50,
  unsubHeat: 10,
  domain: { startPenalty: 8, startFloor: 26, extraWarmupDays: 7 },
};

export function ensureBurn(state) {
  const o = (state.apps.outreach ??= {});
  const m = (o.market ??= {});
  m.companies ??= {};
  m.segments ??= {};
  m.domainBurns ??= 0;
  m.decayDay ??= state.day;
  return m;
}

const segKey = (company) => company?.segmentId || company?.industry || 'unknown';

function companyRec(m, company) {
  return (m.companies[company.id] ??= { days: [], people: {}, spam: 0, unsub: 0, burnedUntil: null, reason: null });
}

/** Daily decay of segment heat (called from the outreach day). */
export function decayBurn(state) {
  const m = ensureBurn(state);
  const n = Math.max(0, state.day - m.decayDay);
  if (!n) return;
  const f = Math.pow(BURN.decay, n);
  for (const k of Object.keys(m.segments)) {
    m.segments[k].heat *= f;
    if (m.segments[k].heat < 1) delete m.segments[k];
  }
  m.decayDay = state.day;
}

function burnCompany(state, company, reason) {
  const m = ensureBurn(state);
  const r = companyRec(m, company);
  if (r.burnedUntil != null && r.burnedUntil > state.day) return;
  r.burnedUntil = state.day + BURN.burnDays;
  r.reason = reason;
  company.burnedUntil = r.burnedUntil;
  emitSalesEvent(state, 'market_burned', { companyId: company.id, reason }, `market_burned:${company.id}:${state.day}`);
  logMistake(state, {
    functionId: 'prospecting', id: 'never_prune', label: 'Over-contacted an account', app: 'outreach', delayed: true,
    cost: { reputation: 1 }, key: `burn:${company.id}:${state.day}`,
    detail: `${company.name}: ${reason}. Its people now ignore or flag you for ~6 months; the account is burned in your database.`,
  });
}

/** Record one cold email to a person at a company (tier = personalization tier of that email). */
export function recordTouch(state, company, contactId, tier = 'basic') {
  if (!company) return;
  const m = ensureBurn(state);
  const r = companyRec(m, company);
  r.days.push(state.day);
  r.days = r.days.filter((d) => d > state.day - BURN.windowDays);
  r.people[contactId] = state.day;
  for (const [id, d] of Object.entries(r.people)) if (d <= state.day - BURN.windowDays) delete r.people[id];
  const seg = (m.segments[segKey(company)] ??= { heat: 0, sent: 0 });
  seg.heat += BURN.tierHeat[tier] ?? 0.5;
  seg.sent++;
  const people = Object.keys(r.people).length;
  if (people > BURN.maxPeoplePerCompany) burnCompany(state, company, `${people} people emailed within 30 days`);
  else if (r.days.length > BURN.maxEmailsPerCompany) burnCompany(state, company, `${r.days.length} emails within 30 days`);
}

/** A spam complaint or an opt-out: heat on the segment; complaints, or opt-outs that keep coming, burn the account. */
export function recordNegative(state, company, kind) {
  if (!company) return;
  const m = ensureBurn(state);
  const r = companyRec(m, company);
  const seg = (m.segments[segKey(company)] ??= { heat: 0, sent: 0 });
  if (kind === 'complaint') { r.spam++; seg.heat += BURN.complaintHeat; burnCompany(state, company, 'marked your email as spam'); }
  else { r.unsub++; seg.heat += BURN.unsubHeat; if (r.unsub >= 2) burnCompany(state, company, `${r.unsub} people opted out`); }
}

export function isBurned(state, company) {
  const until = state.apps.outreach?.market?.companies?.[company?.id]?.burnedUntil ?? company?.burnedUntil;
  return until != null && until > state.day;
}

/** Reply multiplier for this segment from accumulated heat (1 = fresh market). */
export function segmentMult(state, company) {
  const heat = state.apps.outreach?.market?.segments?.[segKey(company)]?.heat ?? 0;
  return clamp(1 - heat / BURN.scale, BURN.floor, 1);
}

/** Combined market multiplier on reply odds for a contact at `company`. */
export function marketReplyMult(state, company) {
  if (!company) return 1;
  return segmentMult(state, company) * (isBurned(state, company) ? BURN.burnedReplyMult : 1);
}
export const marketComplaintMult = (state, company) => (isBurned(state, company) ? BURN.burnedComplaintMult : 1);

/** A sending domain fell below 25 for the first time: remember it (the next domain starts worse). */
export function recordDomainBurn(state, domain) {
  if (domain.burnCounted) return;
  domain.burnCounted = true;
  const m = ensureBurn(state);
  m.domainBurns++;
  logMistake(state, {
    functionId: 'cold_outreach', id: 'volume_as_pipeline', label: 'Burned a sending domain', app: 'outreach',
    cost: { usd: 12 + 2 * 7, days: 28, reputation: 1 }, key: `domainburn:${domain.id}`,
    detail: `${domain.name} fell below 25 reputation. Replacing it means a new domain, new inboxes and 4+ weeks of warmup, and the next domain starts lower.`,
  });
}

/** Starting reputation and warmup length for a newly bought domain, given past burns. */
export function newDomainTerms(state) {
  const burns = state.apps.outreach?.market?.domainBurns ?? 0;
  return {
    reputation: Math.max(BURN.domain.startFloor, 50 - BURN.domain.startPenalty * burns),
    warmupDays: 28 + BURN.domain.extraWarmupDays * burns,
    burns,
  };
}

/** Coaching read-out for the UI. */
export function burnSummary(state) {
  const m = state.apps.outreach?.market;
  if (!m) return { burned: 0, hotSegments: [], domainBurns: 0 };
  const burned = Object.values(m.companies).filter((r) => r.burnedUntil != null && r.burnedUntil > state.day).length;
  const hotSegments = Object.entries(m.segments).map(([id, s]) => ({ id, heat: s.heat, mult: clamp(1 - s.heat / BURN.scale, BURN.floor, 1) })).filter((x) => x.mult < 0.95).sort((a, b) => a.mult - b.mult);
  return { burned, hotSegments, domainBurns: m.domainBurns };
}
