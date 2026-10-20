// Event-led growth, pure numbers: hosted formats (own webinar, executive dinner, roundtable, local meetup, virtual
// summit), RSVP and show-up odds, attendee mix, follow-up decay and the meeting odds per attendee kind.
// Research: docs/research/cold-email-alternatives-2026.md §5 (Events) and §6 (calls, direct mail).
//  - Webinar registration -> live attendance 41.6% (independent median) to ~60% (ON24/TwentyThree incl. on-demand).
//  - Hosted dinners: $3,500-8,000 for 12-20 guests ($175-650 per guest), 80-90% of confirmed attend, 5-12 senior-buyer
//    conversations, 2-4 opportunities; executive-dinner attendee meeting->opportunity 30-50% (Vendelux) [unverified].
//  - "73% of event leads go cold within 72 hours without follow-up" (Goldcast via Salesfuel) [unverified].
//  - Roundtable, meetup and virtual-summit benchmarks: none found; every number for them is [design].
// Everything not quoted above is a game choice inside those ranges and is marked [design].

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (r, t) => r[0] + (r[1] - r[0]) * clamp(t, 0, 1);

/**
 * Hosted event formats.
 *  capacity: seats; minGuests: below this the room feels empty [design].
 *  prepHours: founder hours to design, curate and run logistics (excl. hosting time and follow-up) — research says
 *    webinar 10-20 h all-in, dinner/roundtable 6-12 h to curate and host; meetup and summit [design].
 *  hostMin: minutes on the calendar for the event itself. start: time of day.
 *  budgets: per-guest (or fixed) spend options. fixed: software / venue fixed cost.
 *  rsvpBase: chance an invited, relevant, average-quality invitation turns into a yes [design].
 *  show: [low, high] share of RSVPs who attend; reminders and quality move it inside the range.
 *  intimacy: meeting odds per attendee relative to a dinner (a webinar is one-to-many, low trust) [design].
 *  leadIdeal: [min, max] days of notice that senior guests need [design].
 *  audience: true when people register from your audience and promotion, not only from invitations.
 */
export const HOSTED = {
  webinar: {
    label: 'Webinar you host', capacity: 1000, minGuests: 10, prepHours: 10, hostMin: 75, start: 11 * 60, location: 'Zoom Webinar',
    budgets: { free: { label: 'Free tier webinar tool', fixed: 0, perGuest: 0 }, pro: { label: 'Webinar software (one month, ~$79)', fixed: 79, perGuest: 0 } },
    rsvpBase: 0.14, show: [0.416, 0.6], intimacy: 0.35, leadIdeal: [10, 28], audience: true, key: 'webinar', source: 'webinar',
    note: 'Registration-to-live-attendance 41.6% (independent median) to ~60% (ON24, incl. on-demand).',
  },
  dinner: {
    label: 'Executive dinner', capacity: 20, minGuests: 6, prepHours: 8, hostMin: 180, start: 19 * 60, location: 'Private dining room',
    budgets: { lean: { label: 'Casual restaurant (~$175/guest)', fixed: 0, perGuest: 175 }, standard: { label: 'Good private room (~$350/guest)', fixed: 0, perGuest: 350 }, premium: { label: 'Premium venue (~$650/guest)', fixed: 0, perGuest: 650 } },
    rsvpBase: 0.3, show: [0.8, 0.9], intimacy: 1, leadIdeal: [14, 42], audience: false, key: 'hosted', source: 'events',
    note: '$3,500-8,000 for 12-20 guests; 80-90% of confirmed attend; 5-12 senior-buyer conversations (Vendelux, unverified).',
  },
  roundtable: {
    label: 'Peer roundtable', capacity: 15, minGuests: 5, prepHours: 6, hostMin: 90, start: 8 * 60, location: 'Breakfast room / video',
    budgets: { virtual: { label: 'Virtual (video, no venue)', fixed: 0, perGuest: 0 }, breakfast: { label: 'In-person breakfast (~$60/guest)', fixed: 0, perGuest: 60 } },
    rsvpBase: 0.3, show: [0.65, 0.82], intimacy: 0.85, leadIdeal: [10, 35], audience: false, key: 'hosted', source: 'events',
    note: 'No roundtable benchmark found; numbers are game estimates between webinar and dinner.',
  },
  meetup: {
    label: 'Local meetup', capacity: 80, minGuests: 12, prepHours: 7, hostMin: 150, start: 18 * 60, location: 'Coworking space',
    budgets: { pizza: { label: 'Free space + pizza (~$15/head)', fixed: 0, perGuest: 15 }, venue: { label: 'Rented venue + drinks ($500 + $25/head)', fixed: 500, perGuest: 25 } },
    rsvpBase: 0.12, show: [0.4, 0.55], intimacy: 0.5, leadIdeal: [10, 35], audience: true, key: 'hosted', source: 'events',
    note: 'Free meetups lose about half their RSVPs (game estimate); the room mixes buyers, peers, job seekers and vendors.',
  },
  summit: {
    label: 'Virtual summit (multi-speaker)', capacity: 3000, minGuests: 40, prepHours: 32, hostMin: 360, start: 10 * 60, location: 'Virtual summit platform',
    budgets: { basic: { label: 'Summit platform (~$1,500)', fixed: 1500, perGuest: 0 }, promo: { label: 'Platform + speaker gifts (~$2,500)', fixed: 2500, perGuest: 0 } },
    rsvpBase: 0.1, show: [0.3, 0.45], intimacy: 0.3, leadIdeal: [21, 56], audience: true, key: 'webinar', source: 'webinar',
    note: 'No virtual-summit benchmark found: big registrant numbers, low live attendance and low intent (game estimate).',
  },
};

/** Founder prep hours for a design: format base + curating each invitee (~5 min) + anchor calls + reminders [design]. */
export function prepHours(format, { guests = 0, anchors = 0, reminders = false } = {}) {
  const F = HOSTED[format];
  if (!F) return 0;
  return Math.round((F.prepHours + guests * (5 / 60) + anchors * 0.5 + (reminders ? 0.5 : 0)) * 100) / 100;
}

/** Notice period multiplier on RSVPs: too short and senior calendars are full; far out and people forget [design]. */
export function leadMult(format, leadDays) {
  const [lo, hi] = HOSTED[format]?.leadIdeal ?? [14, 42];
  if (leadDays < 5) return 0.35;
  if (leadDays < lo * 0.6) return 0.6;
  if (leadDays < lo) return 0.88;
  if (leadDays <= hi) return 1;
  return 0.85;
}

/**
 * How peer-value vs vendor-pitch the event is, from the judged agenda (0..1 quality) and the heuristic pitchiness
 * (0..1). Engagement drives the room: questions, staying late, wanting a follow-up [design].
 */
export const engagementOf = ({ agendaQ = 0.5, pitch = 0 }) => clamp(0.35 + 0.65 * agendaQ - 0.55 * pitch, 0.15, 1);

/**
 * Chance one invited guest says yes [design].
 *  inviteQ: judged invitation (0..1); pitch: agenda pitchiness; fit: the guest's TRUE fit (relevance of the topic to
 *  them; poor-fit people still RSVP to free food, which is why a wrong list shows "strong attendance, zero meetings");
 *  warm: knows you already; senior: exec title; anchors: confirmed anchor guests (social proof, intimate formats);
 *  fatigue: invited recently and ignored / burned by a past pitch.
 */
export function rsvpProb(format, { inviteQ = 0.5, pitch = 0, fit = 0.5, warm = false, senior = false, anchors = 0, leadDays = 21, fatigue = 1 } = {}) {
  const F = HOSTED[format];
  const intimate = F.intimacy >= 0.8;
  const inviteMult = (0.55 + 0.9 * clamp(inviteQ, 0, 1)) * (1 - 0.5 * clamp(pitch, 0, 1));
  const fitMult = 0.85 + 0.3 * clamp(fit, 0, 1);
  const anchorMult = intimate ? 1 + 0.1 * Math.min(3, anchors) : 1 + 0.05 * Math.min(3, anchors);
  const seniorMult = senior ? (intimate ? 1 : 0.75) : 1;
  return clamp(F.rsvpBase * inviteMult * fitMult * anchorMult * seniorMult * (warm ? 1.4 : 1) * leadMult(format, leadDays) * fatigue, 0.01, 0.9);
}

/** Show-up rate among RSVPs: range per format, reminders and a strong invitation move it up [design inside the cited ranges]. */
export function showRate(format, { reminders = false, inviteQ = 0.5, lean = false } = {}) {
  const F = HOSTED[format];
  const t = clamp((reminders ? 0.55 : 0.1) + 0.45 * clamp(inviteQ, 0, 1), 0, 1) - (lean ? 0.15 : 0);
  return lerp(F.show, t);
}

/**
 * Follow-up decay by days since the event [design on the 73%-cold-in-72h claim, unverified]: the same evening or
 * next morning keeps 90%; two days 75%; three days (72 h) 30%; then it keeps fading.
 */
export function eventFollowUpFactor(days) {
  const d = Math.max(0, days);
  if (d <= 0) return 1;
  if (d <= 1) return 0.9;
  if (d <= 2) return 0.75;
  if (d <= 3) return 0.3;
  return Math.max(0.03, 0.3 * Math.exp(-(d - 3) / 5));
}

/** Follow-up note multiplier: personalized and specific beats a template; a template still beats silence [design]. */
export const followUpNoteMult = ({ personalized = false, quality = 0.5 }) => (personalized ? 0.75 + 0.5 * clamp(quality, 0, 1) : 0.7 + 0.2 * clamp(quality, 0, 1));

// Base chance an attendee of each hidden kind agrees to a next meeting after a good follow-up at a dinner [design]:
// in-market buyers often (dinner attendee meeting->opportunity 30-50% downstream), buyers not in market sometimes,
// peers rarely, vendors never (they came to sell to you).
export const KIND_MEETING = { in_market: 0.6, buyer: 0.28, peer: 0.04, vendor: 0, outsider: 0.015 };

export function meetingProb({ format, kind, engagement = 0.6, followMult = 1, decay = 1 }) {
  const F = HOSTED[format] ?? { intimacy: 0.5 };
  return clamp((KIND_MEETING[kind] ?? 0) * F.intimacy * engagement * followMult * decay, 0, 0.85);
}

/** Share of audience registrants of each kind for a promoted webinar/meetup/summit [design]. */
export function audienceKinds(fitMean) {
  const vendor = 0.12, peer = 0.22;
  const buyer = clamp(fitMean, 0.1, 0.85) * (1 - vendor - peer);
  return { vendor, peer, buyer, outsider: Math.max(0, 1 - vendor - peer - buyer) };
}

/** Paid promotion: LinkedIn/newsletter cost per registrant [design inside the $50-250 B2B CPL range of the research]. */
export const PROMO_CPR = 90;

/** Gifts and dimensional mail only pay back above this annual contract value [design, research §6]. */
export const GIFT_MIN_ACV = 15000;

/** When a guest list counts as the wrong audience (share of attendees in the ICP) [design]. */
export const WRONG_AUDIENCE_SHARE = 0.35;
/** Agenda pitchiness at which the event reads as a vendor pitch [design]. */
export const PITCH_LIMIT = 0.5;
