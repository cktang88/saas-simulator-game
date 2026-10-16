// Recruiting decides WHO you actually talk to. A batch of outreach on a channel, aimed at a written target and filtered
// by an optional screener, samples real people from the hidden market (core/truth.js): the target text picks segments
// through segmentMatch, the channel's reach multiplies by each segment's own reach, the screener removes off-target
// responders (and, on panels, professional respondents), and each person who gets through is drawPerson(...).
//
// Sources: docs/research/early-stage/recruiting-interviews.md (channel reply rates, User Interviews / Respondent fees,
// incentives, NNG no-show 11%, 1.15 staff h per recruited participant, panel fraud, 2-3.5 h per completed interview
// all-in). Numbers tagged [design] are game assumptions, not statistics.

import { clamp, uid } from '../../core/util.js';
import { spendHours } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { activeSubs } from '../../core/stripe.js';
import { truthOf, segmentMatch, drawPerson } from '../../core/truth.js';
import { disc, dstream, nextSimId } from './store.js';
import { resolveNiche, nichePopulation, pickInNiche, nicheLabel } from '../growth/nicheUse.js';

// reply: [generic target, razor-sharp target]. leak: share of responders who are off-target before any screening.
// outsider: share of the leak who are outside every segment of the market (the rest are other real segments).
export const CHANNELS = {
  warm: { label: 'Warm network and intros', rel: 'warm', reach: 'warm', reply: [0.45, 0.55], show: 0.88, minutes: 8, days: [1, 4], leak: 0.8, outsider: 0.55, targeted: false, pooled: true, note: 'Highest reply rate, but they are who your network is, and they are kind.' },
  friends: { label: 'Friends and family', rel: 'friends', reach: 'warm', reply: [0.8, 0.8], show: 0.93, minutes: 5, days: [0, 2], leak: 0.97, outsider: 0.9, targeted: false, pooled: true, note: 'Easy and fast. They love you and the idea; they are rarely the customer.' },
  cold_email: { label: 'Cold email', rel: 'cold', reach: 'cold', reply: [0.034, 0.12], show: 0.78, minutes: 9, days: [3, 9], leak: 0.3, outsider: 0.3, targeted: true, note: 'Generic cold email gets ~3.4%; a relevant, well-targeted note ~10-12%.' },
  linkedin: { label: 'LinkedIn', rel: 'cold', reach: 'cold', reply: [0.06, 0.19], show: 0.8, minutes: 7, days: [3, 8], leak: 0.3, outsider: 0.3, targeted: true, note: 'Title and company filters make it the sharpest cheap channel for B2B.' },
  community: { label: 'Communities (Slack, Reddit, forums)', rel: 'community', reach: 'community', reply: [0.1, 0.3], show: 0.85, minutes: 12, days: [3, 7], leak: 0.45, outsider: 0.35, targeted: true, note: 'Contribute before asking; membership is broader than your target.' },
  panel: { label: 'Research panel (User Interviews style)', rel: 'panel', reach: 'panel', reply: [0.9, 0.9], show: 0.9, minutes: 3, days: [2, 5], leak: 0.15, outsider: 0.5, targeted: true, paid: true, fraud: 0.18, note: 'You pay a platform fee and an incentive per completed call. 10-20% can be professional respondents unless you screen.' },
  waitlist: { label: 'Existing users and waitlist', rel: 'community', reach: 'warm', reply: [0.35, 0.55], show: 0.85, minutes: 4, days: [1, 4], leak: 0.25, outsider: 0.2, targeted: false, pooled: true, preScreened: true, note: 'They already raised a hand. Limited to the list you have built.' },
  competitor: { label: "Competitors' customers", rel: 'cold', reach: 'cold', reply: [0.04, 0.14], show: 0.75, minutes: 14, days: [4, 10], leak: 0.15, outsider: 0.2, targeted: true, preScreened: true, note: 'Review sites and public customer lists. They already pay to solve this, but outreach takes research.' },
  events: { label: 'Events and meetups', rel: 'community', reach: 'community', reply: [0.3, 0.5], show: 0.8, minutes: 20, days: [3, 8], leak: 0.5, outsider: 0.4, targeted: true, ticketUsd: 120, note: 'In-person conversations; low volume per hour.' },
  referral: { label: 'Referrals from past interviewees', rel: 'warm', reach: 'warm', reply: [0.7, 0.7], show: 0.92, minutes: 5, days: [2, 5], leak: 0.35, outsider: 0.25, targeted: false, pooled: true, note: 'About one intro per three good calls [design]. People refer people like themselves.' },
};
export const CHANNEL_IDS = Object.keys(CHANNELS);

export const FEES = { b2c: 49, b2b: 98, b2bTargeting: 35, tax: 0.03 }; // panel platform fee per completed session [recruiting-interviews.md §2]
export const MAX_SENDS = 40;
export const INTERVIEW_HOURS = { call: 0.75, notes: 0.5, scheduling: 0.25 }; // + recruiting ~0.5-1.5 = 2-3.5 h per completed interview [research]
export const SCREEN_MINUTES = 3; // reading one responder's screener answers
export const NO_SHOW = { friends: 0.05, warm: 0.1, community: 0.15, cold: 0.2, panel: 0.1, base: 0.12, confirmed: 0.35 }; // [design]; confirmation cuts it to ~35%

const FIRST = ['Dana', 'Marcus', 'Priya', 'Tom', 'Elena', 'Kofi', 'Lena', 'Raj', 'Sara', 'Jonas', 'Mei', 'Carlos', 'Aisha', 'Ben', 'Nora', 'Omar', 'Hana', 'Luis'];
const LAST = ['Reyes', 'Hoffman', 'Shah', 'Becker', 'Okoro', 'Lind', 'Moreau', 'Ito', 'Walsh', 'Novak', 'Brandt', 'Mehta', 'Costa', 'Ferris', 'Adeyemi'];

const isB2b = (state) => state.company.model !== 'b2c';

/** Interviewable people your own network holds (friends and family, warm contacts) and your own list. */
export const warmPool = (state) => Math.round((state.founder.network?.friends ?? 0) / 10 + (state.founder.network?.linkedin ?? 0) / 100);
export const friendsPool = (state) => Math.max(2, Math.round((state.founder.network?.friends ?? 0) / 12));
export function existingPool(state) {
  let subs = 0; try { subs = activeSubs(state).length; } catch { subs = 0; }
  return Math.round((state.founder.network?.newsletter ?? 0) / 12) + subs;
}
const researchRoot = (state) => disc(state);
export function poolLeft(state, channel) {
  const d = disc(state).recruit;
  if (channel === 'warm') return Math.max(0, warmPool(state) - (researchRoot(state).warmUsed ?? 0));
  if (channel === 'friends') return Math.max(0, friendsPool(state) - (d.friendsUsed ?? 0));
  if (channel === 'waitlist') return Math.max(0, existingPool(state) - (d.waitlistUsed ?? 0));
  if (channel === 'referral') return disc(state).introCredits ?? 0;
  return Infinity;
}

// ---------------------------------------------------------------- target and screener

/** What a written target actually points at in the hidden market. Pure read; the player sees only `sharp`/`vague` guidance. */
export function targetRead(state, text, { create = false } = {}) {
  const t = String(text ?? '').trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const m = t ? segmentMatch(state, t).filter((x) => x.score >= 0.2) : [];
  if (!m.length || words < 3) return { text: t, segments: [], weights: {}, best: 0, sharp: 0, vague: true };
  const best = m[0].score;
  const kept = m.filter((x) => x.score >= 0.5 * best);
  const weights = {}; let tot = 0;
  for (const x of kept) tot += (x.score / best) ** 8; // steep: a close second still leaks, a distant one barely does
  for (const x of kept) weights[x.segmentId] = ((x.score / best) ** 8) / tot;
  const maxW = Math.max(...Object.values(weights));
  // Sharpness: a strong match concentrated on one segment, with enough words to name a role and a context.
  const sharp = clamp(best * (0.3 + 0.7 * maxW) * clamp(words / 6, 0.5, 1), 0, 1);
  const out = { text: t, segments: kept.map((x) => x.segmentId), weights, best, sharp, vague: sharp < 0.35 };
  // Fractal niche: a target that names a sub-industry, size, place, role or tool points at a deeper node of the market.
  // create:true (a batch really goes out) grows the tree; a preview only reads nodes that already exist.
  if (!out.vague) {
    const n = resolveNiche(state, t, { source: 'recruit', create, rootIds: undefined });
    if (n && out.segments.includes(n.rootId)) Object.assign(out, { nicheId: n.id, nicheRoot: n.rootId, nicheLevel: n.level, nicheLabel: n.label, shareOfSegment: n.shareOfSegment, hard: n.hard, pool: contactPool(state, n.id) });
  }
  return out;
}

/** People in the niche you could plausibly reach by name: a couple of relevant roles per company [design]; each channel can find only part of them. */
const contactPool = (state, id) => Math.max(4, Math.round(nichePopulation(state, id) * (isB2b(state) ? 2 : 1)));
const REACHABLE = { cold: 0.6, community: 0.25, panel: 0.15, warm: 1 }; // share of the pool a channel can ever reach [design]
const nicheUsed = (state, id) => disc(state).recruit.nicheUsed?.[id] ?? 0;

const SCREEN_Q = {
  behaviour: /\b(when (did|was) you (last|most recently)|last time|in the (last|past) (week|month|quarter|\d+ (days|weeks|months))|how many [a-z ]+ (did|do|have) you|how much (did|do) you (spend|pay)|how often|which (tool|software|app|service|vendor)s? (do|did) you|what (tool|software|app|service|process|system)s?\b.*\b(use|pay|run)|what do you (currently )?(use|pay|do) (for|to)|how do you (currently )?(handle|manage|track|do))\b/i,
  profile: /\b(job title|your role|what('s| is) your (role|title|position)|how many (employees|people|staff|locations|sites|clients|customers|trucks|seats)|company size|headcount|which industry|what industry|number of (employees|locations|sites|clients)|who (makes|signs|owns) (the )?(buying|purchasing|budget|decision))\b/i,
  yesNo: /^\s*(do|are|have|would|will|is|did)\s+you\b/i,
  leading: /\b(struggle|frustrat|hate|pain|wish|would you (use|buy|pay)|interested in|looking for a (tool|solution)|need a (tool|solution))\b/i,
  disqualify: /\b(none of the above|not applicable|if (you answer|no)|we will end|disqualif|screen out|only (if|those)|must (be|have|work))\b/i,
};

/** 0..1 quality of a screener: specific recent behaviour and role/size questions raise it; leading yes/no qualifiers lower it. */
export function screenerQuality(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 0;
  const seen = new Set();
  const qs = raw.split(/\n+|(?<=\?)\s+/).map((s) => s.replace(/^[\s\-*\d.)]+/, '').trim()).filter((s) => s.split(/\s+/).length >= 3).filter((s) => { const k = s.toLowerCase().replace(/\W+/g, ' '); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  if (!qs.length) return 0.05;
  const behaviour = new Set(qs.filter((q) => SCREEN_Q.behaviour.test(q) && !SCREEN_Q.leading.test(q))).size;
  const profile = new Set(qs.filter((q) => SCREEN_Q.profile.test(q))).size;
  const leakyYesNo = qs.filter((q) => SCREEN_Q.yesNo.test(q) && (SCREEN_Q.leading.test(q) || !(SCREEN_Q.behaviour.test(q) || SCREEN_Q.profile.test(q)))).length;
  const disq = SCREEN_Q.disqualify.test(raw) ? 1 : 0;
  return Math.round(clamp(0.1 + 0.22 * Math.min(2, behaviour) + 0.2 * Math.min(1, profile) + 0.08 * disq - 0.14 * Math.min(2, leakyYesNo), 0.05, 0.95) * 100) / 100;
}

// ---------------------------------------------------------------- planning (pure)

function avgReach(state, tr, reachKey) {
  const t = truthOf(state);
  const segs = tr.segments.length ? tr.segments.map((id) => t.segments.find((s) => s.id === id)).filter(Boolean) : t.segments;
  if (!segs.length) return 1;
  const wsum = segs.reduce((a, s) => a + s.share * (tr.weights[s.id] ?? 1), 0) || 1;
  return segs.reduce((a, s) => a + s.share * (tr.weights[s.id] ?? 1) * (s.reach?.[reachKey] ?? 1), 0) / wsum;
}

const incentiveMult = (usd, ch) => (ch.paid || ch.rel === 'friends' ? 1 : 1 + 0.6 * (1 - Math.exp(-Math.max(0, usd) / 75)));
export const defaultIncentive = (state) => (isB2b(state) ? 150 : 50);

/** Expected economics of a batch before the player commits: reply and show rate, hours, cash per completed call. */
export function planBatch(state, { channel, sends = 10, target = '', screener = '', incentive = 0, create = false } = {}) {
  const ch = CHANNELS[channel];
  if (!ch) throw new Error('Pick a recruiting channel.');
  const tr = targetRead(state, target, { create });
  const q = screenerQuality(screener);
  const rel = ch.targeted ? (tr.vague ? 0 : tr.sharp) : 0.4; // relevance of the outreach to the people it lands on
  let reply = ch.reply[0] + (ch.reply[1] - ch.reply[0]) * rel;
  if (ch.targeted && tr.vague && !ch.paid) reply *= 0.7; // a generic ask to nobody in particular
  const reach = ch.targeted ? avgReach(state, tr, ch.reach) : 1;
  // Narrow niches are hard to reach: fewer matching people answer, and once you have messaged most of a small niche the list is burned.
  let saturation = 1;
  if (ch.targeted && tr.nicheId) {
    reply *= 1 - 0.35 * tr.hard;
    const reachable = tr.pool * (REACHABLE[ch.reach] ?? 0.12);
    saturation = clamp((reachable - nicheUsed(state, tr.nicheId)) / Math.max(1, sends), 0, 1);
    reply *= 0.3 + 0.7 * saturation;
  }
  reply = clamp(reply * clamp(reach, 0.25, 1.3) * incentiveMult(incentive, ch), 0.005, 0.95);
  const show = clamp(ch.show + (ch.paid ? 0 : 0.06 * (1 - Math.exp(-incentive / 100))), 0.5, 0.97);
  const expResponders = sends * reply;
  let leak = ch.targeted && !tr.vague ? ch.leak * (1 - 0.35 * tr.sharp) : ch.leak;
  if (ch.targeted && tr.nicheId) leak *= 1 - 0.08 * (tr.nicheLevel - 1); // a specific ask lands on more of the right people [design]
  const passRate = 1 - 0.85 * q * leak - (ch.fraud ? ch.fraud * 0.9 * q : 0);
  const expBooked = expResponders * clamp(passRate, 0.05, 1);
  const hours = (sends * ch.minutes + expResponders * (q > 0 ? SCREEN_MINUTES : 0)) / 60;
  const b2b = isB2b(state);
  const fee = ch.paid ? (b2b ? FEES.b2b + (tr.vague ? 0 : FEES.b2bTargeting * (1 + 2 * (tr.hard ?? 0))) : FEES.b2c) * (1 + FEES.tax) : 0; // panels charge more to find rare job titles
  const perCompleted = (ch.paid ? fee : 0) + (incentive > 0 && ch.rel !== 'friends' ? incentive * (ch.paid ? 1 + FEES.tax : 1) : 0);
  const completed = expBooked * show;
  return {
    channel, label: ch.label, sends, reply, show, leak, niche: tr.nicheId ? { id: tr.nicheId, label: tr.nicheLabel, level: tr.nicheLevel, pool: tr.pool, hard: tr.hard, saturation } : null, screenerQuality: q, target: tr, hours: Math.round(hours * 100) / 100,
    ticketUsd: ch.ticketUsd ?? 0, expectedBooked: Math.round(expBooked * 10) / 10, expectedCompleted: Math.round(completed * 10) / 10,
    usdPerCompleted: Math.round(perCompleted), hoursPerCompleted: completed > 0 ? Math.round(((hours / completed) + INTERVIEW_HOURS.call + INTERVIEW_HOURS.notes + INTERVIEW_HOURS.scheduling) * 10) / 10 : null,
    warnings: [
      ...(ch.targeted && tr.vague ? ['Your target is too vague to aim at: write a role, a kind of company and a size.'] : []),
      ...(q < 0.3 && ch.rel !== 'friends' ? ['No real screener: you will talk to whoever replies.'] : []),
      ...(tr.nicheId && saturation < 1 ? [`You have already contacted most of the ~${tr.pool.toLocaleString()} reachable people in ${tr.nicheLabel}: replies are drying up. Widen the target or use a different channel.`] : []),
      ...(tr.nicheId && tr.hard > 0.6 ? [`${tr.nicheLabel} is a thin slice of the market (~${tr.pool.toLocaleString()} reachable people): expect few replies, higher panel fees and more no-shows.`] : []),
      ...(ch.paid && q < 0.5 ? ['Panels include professional respondents. Screen on specific recent behaviour, not yes/no questions.'] : []),
    ],
  };
}

/** Founder hours a batch costs up front (outreach messages plus reading screener answers). */
export const batchHours = (state, input) => planBatch(state, input).hours;

// ---------------------------------------------------------------- running a batch

const pickWeighted = (r, entries) => {
  const tot = entries.reduce((a, [, w]) => a + w, 0);
  if (tot <= 0) return entries[0]?.[0] ?? null;
  let x = r() * tot;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return entries.at(-1)[0];
};

function pickSegment(state, r, ch, tr, sourceSegmentId, rn) {
  const seg = pickSegment0(state, r, ch, tr, sourceSegmentId);
  // In-niche share: the deeper the niche you wrote, the more of the people who answer are really in it; the rest are in the segment but elsewhere.
  if (tr.nicheId && seg.id === tr.nicheRoot && !seg.offTarget) {
    const inShare = clamp(0.62 + 0.07 * (tr.nicheLevel - 1), 0, 0.92); // [design]
    if (rn() < inShare) seg.nicheId = pickInNiche(state, rn, tr.nicheId); // own stream: niche picks never shift the base draw sequence
    else seg.offNiche = true;
  }
  return seg;
}
function pickSegment0(state, r, ch, tr, sourceSegmentId) {
  const t = truthOf(state);
  const hasT = !tr.vague;
  const on = ch.targeted && hasT;
  const leak = on ? ch.leak * (1 - 0.35 * tr.sharp) : ch.leak;
  const wAll = t.segments.map((s) => [s.id, s.share * (s.reach?.[ch.reach] ?? 1)]);
  let id;
  if (sourceSegmentId && r() < 0.65) id = sourceSegmentId; // referrals cluster: people refer people like themselves
  else if (on && r() >= leak) id = pickWeighted(r, tr.segments.map((sid) => { const s = t.segments.find((x) => x.id === sid); return [sid, (tr.weights[sid] ?? 0) * (s?.share ?? 0.1) * (s?.reach?.[ch.reach] ?? 1)]; }));
  else id = r() < ch.outsider ? 'outsider' : pickWeighted(r, wAll);
  return { id, offTarget: hasT && (id === 'outsider' || !tr.segments.includes(id)) };
}

/**
 * Run one batch of outreach. Returns { batch, booked: [interview], noReply, screenedOut, hours }. With charge:true the
 * founder hours are spent here (tests); in the UI ctx.act charges batchHours() instead.
 */
export function recruitBatch(state, input, { charge = false } = {}) {
  const ch = CHANNELS[input.channel];
  if (!ch) throw new Error('Pick a recruiting channel.');
  const d = disc(state);
  const sends = Math.floor(Number(input.sends) || 0);
  if (sends < 1 || sends > MAX_SENDS) throw new Error(`Send between 1 and ${MAX_SENDS} requests per batch.`);
  if (ch.pooled && sends > poolLeft(state, input.channel)) throw new Error(ch.rel === 'friends' ? 'You have already asked everyone you can ask in your friends and family.' : input.channel === 'referral' ? 'No introductions banked. Ask interviewees for intros at the end of a call.' : input.channel === 'waitlist' ? 'You have already contacted everyone on your list and customers.' : 'You have asked everyone in your warm network already.');
  const target = input.target ?? d.recruit.target;
  const screener = input.screener ?? d.recruit.screener;
  const incentive = Math.max(0, Number(input.incentive ?? d.recruit.incentive) || 0);
  const plan = planBatch(state, { channel: input.channel, sends, target, screener, incentive, create: true });
  if (charge) spendHours(state, plan.hours, 'Recruiting interviewees');
  const tr = plan.target;
  const q = plan.screenerQuality;
  const batchId = uid('rb');
  const r = dstream(state, `batch:${batchId}:${state.day}`);
  const rn = dstream(state, `batchniche:${batchId}:${state.day}`);
  if (input.channel === 'warm') d.warmUsed = (d.warmUsed ?? 0) + sends;
  if (input.channel === 'friends') d.recruit.friendsUsed = (d.recruit.friendsUsed ?? 0) + sends;
  if (input.channel === 'waitlist') d.recruit.waitlistUsed = (d.recruit.waitlistUsed ?? 0) + sends;
  if (ch.targeted && tr.nicheId) { d.recruit.nicheUsed ??= {}; d.recruit.nicheUsed[tr.nicheId] = (d.recruit.nicheUsed[tr.nicheId] ?? 0) + sends; }
  if (input.channel === 'referral') d.introCredits = Math.max(0, d.introCredits - sends);
  const sources = input.channel === 'referral' ? d.recruit.referrals.splice(0, sends) : [];

  const tt = truthOf(state);
  const booked = [];
  let noReply = 0; let screenedOut = 0; let fraudCaught = 0;
  for (let i = 0; i < sends; i++) {
    if (r() >= plan.reply) { noReply++; continue; }
    const seg = pickSegment(state, r, ch, tr, sources[i]?.segmentId, rn);
    const fraud = !!ch.fraud && r() < ch.fraud;
    // Screener: removes off-target responders, and professional respondents unless it is leaky.
    if (q > 0 && seg.offTarget && r() < 0.85 * q) { screenedOut++; continue; }
    if (fraud && r() < 0.9 * q) { screenedOut++; fraudCaught++; continue; }
    if (q > 0 && !fraud && seg.offNiche && rn() < 0.3 * q) { screenedOut++; continue; } // right segment, wrong corner of it (a screener on tool/size/place trims some)
    const seedKey = `${batchId}:${i}`;
    const pre = !!ch.preScreened || (q >= 0.5 && ch.rel !== 'friends');
    let person = drawPerson(state, { segmentId: fraud ? 'outsider' : seg.id, ...(!fraud && seg.nicheId ? { nicheId: seg.nicheId } : {}), channel: ch.rel === 'panel' ? 'panel' : ch.rel === 'friends' ? 'friends' : ch.rel, screened: pre, seedKey });
    const claimedId = fraud ? (tr.segments[0] ?? tt.bestSegmentId) : person.segmentId;
    if (fraud) person = fraudulent(state, person, r);
    const claimed = tt.segments.find((s) => s.id === claimedId);
    if (fraud && claimed) person.claimJob = claimed.jobs.filter((j) => !j.decoy).sort((a, b) => b.importance - a.importance)[0]?.label ?? null;
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const [lo, hi] = ch.days;
    const available = state.day + lo + Math.floor(r() * (hi - lo + 1));
    const iv = {
      id: nextSimId(state), real: true, sim: true, source: 'sim', channel: input.channel, status: 'scheduled', day: available, createdDay: state.day,
      persona: { name, role: person.title, company: (seg.nicheId ? `${descriptorOf(claimed, person)}, ${nicheLabel(state, seg.nicheId)}` : descriptorOf(claimed, person)).slice(0, 90), context: '' },
      profile: { segmentId: claimed?.id ?? 'outsider', segmentLabel: claimed ? shortLabel(claimed) : 'Outside your target market', relationship: person.relationship, role: person.title, title: person.title },
      hidden: person, messages: [], grade: null, nicheId: person.nicheId ?? null,
      recruit: { batchId, screenerQuality: q, incentive: ch.rel === 'friends' ? 0 : incentive, panel: !!ch.paid, hard: seg.nicheId ? (tr.hard ?? 0) : 0, fee: ch.paid ? Math.round((isB2b(state) ? FEES.b2b + (tr.vague ? 0 : FEES.b2bTargeting * (1 + 2 * (tr.hard ?? 0))) : FEES.b2c) * 100) / 100 : 0, show: plan.show },
    };
    d.interviews.unshift(iv);
    booked.push(iv);
  }
  const batch = { id: batchId, day: state.day, channel: input.channel, sends, responders: booked.length + screenedOut, booked: booked.length, noReply, screenedOut, fraudCaught, hours: plan.hours, screenerQuality: q, targetText: String(target).slice(0, 200), sharp: Math.round(tr.sharp * 100) / 100, nicheId: tr.nicheId ?? null };
  d.recruit.batches.unshift(batch);
  if (d.recruit.batches.length > 60) d.recruit.batches.length = 60;
  if (ch.ticketUsd) payUsd(state, ch.ticketUsd, 'Event tickets', 'recruiting');
  return { batch, booked, plan, noReply, screenedOut, hours: plan.hours };
}

function fraudulent(state, base, r) {
  // A professional respondent: fluent, claims the right role and a recent incident, never buys.
  return {
    ...base, role: 'economic_buyer', isBuyer: true, budgetAuthority: false, hasPain: true, painIntensity: 0.55, frequency: 'weekly', lastIncidentDays: 2 + Math.floor(r() * 12), lastIncident: null,
    workaround: 'keeps it in a spreadsheet and a few reminders', workaroundCostMonthly: 80 + Math.floor(r() * 120), wtpTrue: 0, statedWtpMult: 2, statedWtp: 0, politeness: 0.5, fraud: true, idiosyncraticAsk: null,
  };
}

/** A segment as a person would describe their company: label up to the first colon, with the size band after it. */
export function shortLabel(seg) {
  const label = String(seg.label ?? seg.id);
  const [head, ...rest] = label.split(':');
  const tail = rest.join(':').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return (tail ? `${head.trim()}, ${tail}` : head.trim()).slice(0, 110);
}
const descriptorOf = (seg, person) => (seg ? shortLabel(seg).split(',')[0].replace(/\(.*?\)/g, '').trim().slice(0, 48) : person.relationship === 'friend' ? 'Friend of yours' : 'Unrelated company');

export function payUsd(state, usd, what, category = 'recruiting') {
  if (!(usd > 0) || !state.bank) return;
  post(state, { amount: -Math.round(usd * 100) / 100, counterparty: 'Research recruiting', description: what, category, method: 'card', meta: { app: 'research' } });
  disc(state).recruit.spentUsd = Math.round(((disc(state).recruit.spentUsd ?? 0) + usd) * 100) / 100;
}

/** Cash owed for one completed call: panel fee plus incentive (with the platform's 3% on prepaid balances). */
export function completionCost(iv) {
  const r = iv.recruit ?? {};
  const base = (r.fee ?? 0) + (r.incentive ?? 0);
  return Math.round(base * (r.panel ? 1 + FEES.tax : 1) * 100) / 100;
}

export function noShowP(iv, confirmed) {
  const r = iv.recruit ?? {};
  const base = NO_SHOW[iv.hidden?.relationship === 'friend' ? 'friends' : ({ warm: 'warm', community: 'community', cold: 'cold', panel: 'panel' }[CHANNELS[iv.channel]?.rel] ?? 'base')] ?? NO_SHOW.base;
  const inc = 1 - 0.4 * (1 - Math.exp(-(r.incentive ?? 0) / 100));
  return clamp(base * (confirmed ? NO_SHOW.confirmed : 1) * (CHANNELS[iv.channel]?.paid ? 1 : inc) * (1 + 0.5 * (r.hard ?? 0)), 0.01, 0.6); // busy niche professionals flake more
}
