// Event-led growth: events the founder HOSTS (own webinar, executive dinner, peer roundtable, local meetup, virtual
// summit) plus the CRM link shared by conferences, cold calls and direct mail.
//
// The player designs the event: format, topic and agenda (judged: peer value vs vendor pitch), the invitation
// (judged), a guest list picked from real CRM contacts (their hidden fit, buying role and timing decide what
// happens), anchor guests asked personally first, budget and venue, the date (on the calendar) and reminders.
// Invitations -> RSVPs -> attendance (no-shows) -> hidden attendee truth (in-market buyer, buyer, peer, vendor,
// outsider) -> follow-up (hours vs days, personalized vs generic) -> real CRM meetings and deals with an `events` or
// `webinar` source. Numbers: events-model.js (research: docs/research/cold-email-alternatives-2026.md §5).
//
// Mistakes (functionId event_led_growth, data/operator-tiers.js): no follow-up within 72 h, vendor-pitch event,
// wrong audience, empty room, booth with no pre-booked meetings, gifts to low-ACV accounts, gifts with no follow-up.

import { notify } from '../../core/state.js';
import { rng, chance, uid, round2, hash, isWeekend } from '../../core/util.js';
import { scheduleEvent, ensureCalendar } from '../../core/calendar.js';
import { logMistake } from '../../core/operator.js';
import { recordPublicEvent } from '../../core/network.js';
import { ensureCrm, addContact, addActivity, companyOf, contactById, contactName, createMeeting, nextSlot, ensureDeal, prospectLead, openMeetingFor } from '../sales/model.js';
import { personForContact, hasTruth } from '../sales/truth-persona.js';
import { ledgerAdd } from '../growth/acquire.js';
import { pitchiness } from './judge.js';
import * as M from './model.js';
import * as E from './events-model.js';
import { ensureChannels, spend, bump, leadPerson } from './sim.js';

export const FN = 'event_led_growth';
const u01 = (s) => (parseInt(hash(String(s)), 36) % 100000) / 100000;
const R = (state) => () => rng(state);

// ---------------------------------------------------------------------------------------------------------
// Hidden truth of a CRM contact as an event guest / call / mail target
// ---------------------------------------------------------------------------------------------------------

const VENDOR_TITLE = /\b(account executive|sales (rep|representative|manager|development)|sdr|bdr|business development|partnerships? manager|recruiter)\b/i;
export const SENIOR_TITLE = /\b(chief|ceo|cfo|cto|coo|cio|ciso|cro|cmo|vp|vice president|president|head of|director|owner|founder|partner)\b/i;

/**
 * The guest's hidden truth: fit 0..1 (the prospect database or inbound truth first, else the hidden market person),
 * kind ('in_market' | 'buyer' | 'peer' | 'vendor' | 'outsider'). Deterministic per contact (no rng draw). The UI never
 * shows it; the player sees industry, size and title and has to judge fit themselves.
 */
export function guestTruth(state, ct) {
  const co = companyOf(state, ct) ?? {};
  let fit = co.prospect?.fit ?? co.inboundFit ?? co.research?.fit ?? null;
  let fromPerson = false;
  let person = null;
  if (fit == null && hasTruth(state)) {
    try { person = personForContact(state, ct, co); } catch { person = null; }
    if (person) { fit = person.segmentId === 'outsider' ? 0.15 : person.isBuyer ? 0.75 : 0.45; fromPerson = true; }
  }
  if (fit == null) fit = 0.5;
  const vendor = VENDOR_TITLE.test(ct?.title ?? '');
  // In market now (an active problem and a buying window in the next months) [design]: rises with fit.
  let inMarket = fit >= 0.5 && u01(`evmkt|${ct?.id}`) < 0.1 + 0.5 * fit;
  if (fromPerson && person) inMarket = inMarket && Boolean(person.hasPain);
  const kind = vendor ? 'vendor' : fit >= 0.5 ? (inMarket ? 'in_market' : 'buyer') : u01(`evpeer|${ct?.id}`) < 0.5 ? 'peer' : 'outsider';
  return { fit: +fit.toFixed(2), kind, icp: !vendor && fit >= 0.5 };
}

/** ABM hook: other apps (Prospector / ABM) register a provider returning [{ companyId, tier }] target accounts. */
const targetProviders = [];
export function registerEventTargetProvider(fn) { if (typeof fn === 'function' && !targetProviders.includes(fn)) targetProviders.push(fn); }
/** Map companyId -> tier label for target accounts (registered providers, then common fields on the company). */
export function eventTargetAccounts(state) {
  const out = new Map();
  for (const fn of targetProviders) {
    try { for (const t of fn(state) ?? []) if (t?.companyId) out.set(t.companyId, t.tier ?? 'target'); } catch { /* a broken provider never breaks events */ }
  }
  for (const co of state.apps.crm?.companies ?? []) {
    const tier = co.abm?.tier ?? co.abmTier ?? co.targetTier ?? null;
    if (tier != null && !out.has(co.id)) out.set(co.id, String(tier));
  }
  return out;
}

/**
 * Event engagement of a CRM company for other apps (ABM signals, account scoring): invitations, attendance, the last
 * event day and whether a follow-up meeting came from it.
 */
export function eventEngagement(state, companyId) {
  const C = state.apps.channels;
  const res = { invited: 0, attended: 0, lastDay: null, meetings: 0 };
  for (const ev of C?.hosted?.list ?? []) {
    for (const g of ev.guests ?? []) {
      const ct = contactById(state, g.contactId);
      if (ct?.companyId !== companyId) continue;
      res.invited++;
      if (g.attended) { res.attended++; res.lastDay = Math.max(res.lastDay ?? 0, ev.day); }
      if (g.meeting) res.meetings++;
    }
  }
  return res;
}

/**
 * Book the next step with a CRM contact who said yes: a real discovery call on the calendar (deal at Meeting booked)
 * or, when no slot exists, an open deal at Replied plus a task. Attributes the lead to the channel key.
 */
export function bookNextStep(state, ct, { source = 'events', key = 'events', note = '', slot = null } = {}) {
  if (!ct?.companyId) return null;
  let m = openMeetingFor(state, ct.id);
  if (!m) {
    const s = slot ?? nextSlot(state, { minLead: prospectLead(state, ct, { interest: 'interested' }), duration: 30, seed: ct.id });
    try { if (s) m = createMeeting(state, { contactId: ct.id, slot: s, kind: 'discovery', source }); } catch { m = null; }
    if (!m) ensureDeal(state, { companyId: ct.companyId, contactId: ct.id, source, stage: 'replied' });
  }
  ct.warm = true;
  const C = ensureChannels(state);
  if (ct.email) C.leadMap[String(ct.email).toLowerCase()] = key;
  bump(state, key, 'ld', 1);
  bump(state, key, 'tr', 1);
  ledgerAdd(state, state.day, source, 'ld', 1);
  if (note) addActivity(state, { type: 'event', text: note, companyId: ct.companyId, contactId: ct.id });
  return m ?? true;
}

// ---------------------------------------------------------------------------------------------------------
// Hosted events
// ---------------------------------------------------------------------------------------------------------

export function hostedSlice(state) {
  const C = ensureChannels(state);
  C.hosted ??= { list: [] };
  return C.hosted;
}

const fatigueOf = (state, ct) => {
  if ((ct.eventBurnUntil ?? -1) > state.day) return 0.3; // pitched at a past event: they remember
  const recent = (ct.evInv ?? []).filter((x) => state.day - x.day <= 45 && !x.attended).length;
  return recent >= 2 ? 0.45 : recent === 1 ? 0.7 : 1;
};

/** Plain spec check for the UI's "why disabled" list. Returns [] when the design can be hosted. */
export function hostBlockers(state, spec) {
  const F = E.HOSTED[spec.format];
  const out = [];
  if (!F) return ['Pick a format.'];
  if (!spec.agenda) out.push('Write the topic and agenda and get feedback on the current text (step 2).');
  if (!spec.invite) out.push('Write the invitation and get feedback on the current text (step 4).');
  const n = (spec.guestIds ?? []).length;
  if (!n && !F.audience) out.push('Pick guests from your CRM (step 3). Dinners and roundtables are invitation-only.');
  if (!n && F.audience && !(spec.promoUsd > 0) && !(state.founder.network.newsletter > 0)) out.push('Invite CRM contacts or add paid promotion: you have no newsletter list to promote to.');
  if (n > 400) out.push('More than 400 personal invitations is a blast, not a guest list.');
  if (!(spec.day > state.day + 2)) out.push('Pick a date at least 3 days out (senior guests need 2-6 weeks).');
  else if (isWeekend(state, spec.day)) out.push('Pick a weekday.');
  if (!F.budgets[spec.budget]) out.push('Pick a venue / budget.');
  return out;
}

function depositOf(F, spec, nGuests) {
  const b = F.budgets[spec.budget];
  return round2(b.fixed + (b.perGuest ? 0.3 * b.perGuest * Math.min(F.capacity, Math.max(F.minGuests, Math.round(nGuests * 0.5))) : 0));
}

/** Ask a guest personally to be an anchor before the invitations go out (0.5 h each in the UI) [design odds]. */
export function anchorAcceptProb(state, ct, inviteQ = 0.5) {
  const t = guestTruth(state, ct);
  return M.clamp(0.2 + 0.35 * t.fit + (ct.warm ? 0.25 : 0) + 0.15 * inviteQ - (t.kind === 'vendor' ? 0.3 : 0), 0.03, 0.85);
}

/**
 * Host an event. spec: { format, title, agenda: judged ({ quality, text }), invite: judged, guestIds, anchorIds, budget,
 * day, reminders, promoUsd }. Spends the deposit / software and promotion, asks anchors, sends invitations (RSVPs are
 * decided now and revealed a few days later), books the calendar. Returns the event.
 */
export function hostEvent(state, spec) {
  const blockers = hostBlockers(state, spec);
  if (blockers.length) throw new Error(blockers[0]);
  const F = E.HOSTED[spec.format];
  const H = hostedSlice(state);
  const crm = ensureCrm(state);
  const ids = [...new Set(spec.guestIds ?? [])].filter((id) => crm.contacts.some((c) => c.id === id));
  const anchorIds = [...new Set(spec.anchorIds ?? [])].filter((id) => ids.includes(id)).slice(0, 3);
  const agendaText = spec.agenda.text ?? '';
  const pitch = Math.max(pitchiness(state, `${spec.title ?? ''}\n${agendaText}`), (spec.agenda.quality ?? 0.5) <= 0.3 ? 0.55 : 0);
  const inviteQ = M.clamp((spec.invite.quality ?? 0.5) * (1 - 0.4 * pitchiness(state, spec.invite.text ?? '')), 0, 1);
  const leadDays = spec.day - state.day;
  const ev = {
    id: uid('hev'), format: spec.format, title: String(spec.title || F.label).slice(0, 120), day: spec.day, createdDay: state.day,
    status: 'invited', agendaQ: spec.agenda.quality ?? 0.5, inviteQ: +inviteQ.toFixed(3), pitch: +pitch.toFixed(2), budget: spec.budget,
    reminders: Boolean(spec.reminders), promoUsd: Math.max(0, Math.round(spec.promoUsd ?? 0)), leadDays,
    guests: [], spent: 0, hours: E.prepHours(spec.format, { guests: ids.length, anchors: anchorIds.length, reminders: spec.reminders }),
    rsvpDay: Math.min(spec.day - 1, state.day + 5), results: null, capturedDay: null, followed: null, attendees: [],
  };
  // Anchors first: a personal ask, then their yes is social proof for everyone else.
  let anchors = 0;
  for (const id of anchorIds) {
    const ct = contactById(state, id);
    const yes = chance(state, anchorAcceptProb(state, ct, inviteQ));
    if (yes) anchors++;
    ev.guests.push({ contactId: id, anchor: yes ? 'confirmed' : 'declined', rsvp: yes });
  }
  ev.anchors = anchors;
  for (const id of ids) {
    if (anchorIds.includes(id)) continue;
    const ct = contactById(state, id);
    const t = guestTruth(state, ct);
    const p = E.rsvpProb(spec.format, { inviteQ, pitch, fit: t.fit, warm: Boolean(ct.warm), senior: SENIOR_TITLE.test(ct.title ?? ''), anchors, leadDays, fatigue: fatigueOf(state, ct) });
    ev.guests.push({ contactId: id, anchor: null, rsvp: chance(state, p) });
  }
  // Seats: the first yeses get them; the rest wait-list (they still count as invited).
  let seats = 0;
  for (const g of ev.guests) { if (g.rsvp && seats < F.capacity) seats++; else if (g.rsvp) { g.rsvp = false; g.waitlist = true; } }
  for (const g of ev.guests) {
    const ct = contactById(state, g.contactId);
    (ct.evInv ??= []).push({ day: state.day, evId: ev.id, attended: false });
    if (ct.evInv.length > 12) ct.evInv.shift();
    addActivity(state, { type: 'event', text: `Invited to your ${F.label.toLowerCase()} "${ev.title}"${g.anchor ? ' (asked personally as an anchor guest)' : ''}`, companyId: ct.companyId, contactId: ct.id });
  }
  const key = F.key;
  const dep = depositOf(F, spec, ids.length);
  if (dep > 0) { spend(state, key, dep, { counterparty: F.budgets[spec.budget].perGuest ? 'Venue' : 'Event software', description: `${F.label}: ${F.budgets[spec.budget].perGuest ? 'venue deposit' : F.budgets[spec.budget].label}` }); ev.spent += dep; }
  if (ev.promoUsd > 0) { spend(state, key, ev.promoUsd, { counterparty: 'LinkedIn / newsletter ads', description: `Promotion: ${ev.title}`, category: 'advertising' }); ev.spent += ev.promoUsd; }
  try {
    ev.eventId = scheduleEvent(state, { title: `${F.label}: ${ev.title}`, kind: 'meeting', app: 'channels', refId: ev.id, day: ev.day, start: F.start, duration: F.hostMin, location: F.location, allowConflict: true, notes: 'You are the host: show up or it fails.' }).id;
  } catch { /* the date was validated above */ }
  H.list.unshift(ev);
  return ev;
}

/** Visible RSVP count (after the reply window). */
export const rsvpsVisible = (state, ev) => (state.day >= ev.rsvpDay ? ev.guests.filter((g) => g.rsvp).length : null);

function audienceRegistrants(state, ev, F) {
  const scale = ev.format === 'summit' ? 2.2 : ev.format === 'meetup' ? 0.5 : 1;
  const q = M.clamp(ev.agendaQ * (1 - 0.5 * ev.pitch), 0, 1);
  const organic = M.webinarRegistrants({ ownList: (state.founder.network.newsletter ?? 0) * (ev.reminders ? 1 : 0.6), followers: (state.founder.network.linkedin ?? 0) + (state.founder.network.x ?? 0), quality: q }) * scale;
  const paid = ev.promoUsd / E.PROMO_CPR;
  return Math.max(0, Math.round((organic + paid) * (0.8 + 0.4 * rng(state))));
}

function resolveHosted(state, ev) {
  const F = E.HOSTED[ev.format];
  const calEv = ensureCalendar(state).events.find((x) => x.id === ev.eventId);
  if (calEv && ['missed', 'canceled'].includes(calEv.status)) {
    ev.status = 'missed';
    notify(state, `You missed your own ${F.label.toLowerCase()}. Guests showed up to nothing.`, { type: 'bad', app: 'channels' });
    for (const g of ev.guests) { if (!g.rsvp) continue; const ct = contactById(state, g.contactId); if (ct) ct.eventBurnUntil = state.day + 365; }
    // A booked private room still bills its guaranteed covers when the host does not show (was: skipping your own
    // dinner cancelled the venue bill).
    if (ev.format === 'dinner' || ev.format === 'roundtable') {
      const b = F.budgets[ev.budget];
      const bill = round2((b?.fixed ?? 0) + (b?.perGuest ?? 0) * Math.max(F.minGuests, ev.guests.filter((g) => g.rsvp).length) - (ev.spent - (ev.promoUsd ?? 0)));
      if (bill > 0) { spend(state, F.key, bill, { counterparty: 'Venue', description: `${F.label}: guaranteed covers (no-show host)` }); ev.spent = round2(ev.spent + bill); }
    }
    logMistake(state, { functionId: FN, id: 'empty_room', label: `Missed your own ${F.label.toLowerCase()}`, app: 'channels', cost: { usd: ev.spent, hours: ev.hours, reputation: 1 }, key: `evmiss:${ev.id}`, detail: `Every confirmed guest came to an event with no host; they will not come again for a year.` });
    return;
  }
  const lean = ev.budget === 'lean';
  const eng = E.engagementOf({ agendaQ: ev.agendaQ, pitch: ev.pitch }) - (lean ? 0.05 : 0);
  const show = E.showRate(ev.format, { reminders: ev.reminders, inviteQ: ev.inviteQ, lean });
  const attendees = [];
  for (const g of ev.guests) {
    if (!g.rsvp) continue;
    const attended = chance(state, g.anchor === 'confirmed' ? 0.95 : show);
    g.attended = attended;
    if (!attended) continue;
    const ct = contactById(state, g.contactId);
    if (!ct) continue;
    const t = guestTruth(state, ct);
    attendees.push({ contactId: ct.id, kind: t.kind, icp: t.icp, invited: true, anchor: g.anchor === 'confirmed', engaged: M.clamp(eng + (rng(state) - 0.5) * 0.3, 0, 1) });
  }
  // Open registration from your audience and promotion (webinars, meetups, summits). Attendees become CRM contacts.
  let registrants = 0, audienceAttended = 0;
  if (F.audience) {
    registrants = audienceRegistrants(state, ev, F);
    audienceAttended = M.binomialSample(R(state), registrants, show);
    const fitMean = M.clamp(0.3 + 0.45 * ev.agendaQ - 0.25 * ev.pitch + (ev.promoUsd > 0 ? -0.05 : 0), 0.12, 0.8);
    const mix = E.audienceKinds(fitMean);
    const create = Math.min(audienceAttended, 120);
    for (let i = 0; i < create; i++) {
      const r = rng(state);
      const kind = r < mix.vendor ? 'vendor' : r < mix.vendor + mix.peer ? 'peer' : r < mix.vendor + mix.peer + mix.buyer ? (rng(state) < 0.35 ? 'in_market' : 'buyer') : 'outsider';
      const p = leadPerson(state);
      let ct = null;
      try { ct = addContact(state, { fullName: p.name, email: p.email, title: kind === 'vendor' ? 'Account Executive' : p.title, company: p.company, domain: p.domain, notes: `Attended your ${F.label.toLowerCase()}` }, { source: F.source, status: 'new', allowNoEmail: true }).contact; } catch { ct = null; }
      if (!ct) continue;
      const co = companyOf(state, ct);
      if (co && co.inboundFit == null) co.inboundFit = kind === 'in_market' || kind === 'buyer' ? +(0.55 + 0.4 * rng(state)).toFixed(2) : +(0.05 + 0.35 * rng(state)).toFixed(2);
      attendees.push({ contactId: ct.id, kind, icp: kind === 'in_market' || kind === 'buyer', invited: false, anchor: false, engaged: M.clamp(eng + (rng(state) - 0.5) * 0.3, 0, 1) });
    }
  }
  const invitedRsvps = ev.guests.filter((g) => g.rsvp).length;
  const nAtt = attendees.length + Math.max(0, audienceAttended - Math.min(audienceAttended, 120));
  // Money: dinners and breakfasts bill guaranteed covers (no-shows still cost); meetups pay per head who came.
  const b = F.budgets[ev.budget];
  const covers = ev.format === 'dinner' || ev.format === 'roundtable' ? Math.max(F.minGuests, invitedRsvps) : nAtt;
  const bill = round2(b.fixed + b.perGuest * covers - (ev.spent - ev.promoUsd));
  if (bill > 0) { spend(state, F.key, bill, { counterparty: b.perGuest ? 'Venue' : 'Event software', description: `${F.label}: ${b.perGuest ? `${covers} covers` : 'balance'}` }); ev.spent = round2(ev.spent + bill); }
  for (const a of attendees) {
    const ct = contactById(state, a.contactId);
    if (!ct) continue;
    const inv = (ct.evInv ?? []).find((x) => x.evId === ev.id);
    if (inv) inv.attended = true;
    if (F.intimacy >= 0.8) ct.warm = true; // you broke bread: they know you now
    addActivity(state, { type: 'event', text: `Attended your ${F.label.toLowerCase()} "${ev.title}"${a.engaged > 0.7 ? ': asked questions and stayed after' : a.engaged < 0.35 ? ': left early' : ''}`, companyId: ct.companyId, contactId: ct.id });
  }
  const icpN = attendees.filter((a) => a.icp).length;
  const conversations = attendees.filter((a) => a.kind === 'in_market' || a.kind === 'buyer').length;
  ev.attendees = attendees;
  ev.results = { invited: ev.guests.length, rsvps: invitedRsvps, registrants, attended: nAtt, noShows: invitedRsvps + registrants - nAtt, icpShare: attendees.length ? +(icpN / attendees.length).toFixed(2) : 0, conversations, engagement: +eng.toFixed(2) };
  ev.status = 'done';
  ev.capturedDay = state.day;
  if (calEv && calEv.status === 'unattended') calEv.status = 'done';
  bump(state, F.key, 'vis', nAtt);
  recordPublicEvent(state, 'event_attended', { event: ev.title, mode: `host_${ev.format}` });
  notify(state, `${F.label} "${ev.title}": ${nAtt} attended (${invitedRsvps} RSVPs${registrants ? `, ${registrants} registrants` : ''}). Follow up today: most event leads go cold within 72 hours.`, { type: 'info', app: 'channels' });
  // Mistakes that are visible the evening of the event.
  if (ev.pitch >= E.PITCH_LIMIT) {
    for (const a of attendees) { const ct = contactById(state, a.contactId); if (ct) ct.eventBurnUntil = state.day + 180; }
    logMistake(state, { functionId: FN, id: 'vendor_pitch_event', label: `Your ${F.label.toLowerCase()} was a product pitch`, app: 'channels', cost: { usd: Math.round(ev.spent * 0.5), hours: round2(ev.hours * 0.5), reputation: 1 }, key: `evpitch:${ev.id}`, detail: `Guests came for peer value and got a demo: engagement ${Math.round(eng * 100)}%, and ${attendees.length} attendees will ignore your next invitation for about six months. A stellar host runs peer discussion and keeps the product out of the room unless asked.` });
  }
  if (attendees.length >= 4 && icpN / attendees.length < E.WRONG_AUDIENCE_SHARE) {
    logMistake(state, { functionId: FN, id: 'wrong_audience_event', label: `Wrong audience at your ${F.label.toLowerCase()}`, app: 'channels', cost: { usd: Math.round(ev.spent), hours: ev.hours }, key: `evaud:${ev.id}`, detail: `Only ${icpN} of ${attendees.length} attendees were buyers in your ICP: good attendance, almost no pipeline. A stellar host curates the guest list from ICP accounts and checks industry, size and role before inviting.` });
  }
  if (nAtt < F.minGuests) {
    logMistake(state, { functionId: FN, id: 'empty_room', label: `Near-empty ${F.label.toLowerCase()}`, app: 'channels', cost: { usd: Math.round(ev.spent * 0.5), hours: round2(ev.hours * 0.5), reputation: 0.5 }, key: `evempty:${ev.id}`, detail: `${nAtt} people came (the room needs ${F.minGuests}+). Weak invitations, short notice or no anchor guests leave empty chairs. Secure two or three anchor guests first and give senior guests 2-6 weeks of notice.` });
  }
}

/**
 * Follow up with attendees. Same day = full value; next day 90%; 48 h 60%; 72 h 30% (73% cold, unverified claim).
 * personalized: one note per person referencing the conversation (~10 min each); judged: the follow-up text.
 * Meetings land as real CRM discovery calls. Returns { meetings, late, contacted }.
 */
export function followUpHosted(state, evId, { personalized = false, judged }) {
  const H = hostedSlice(state);
  const ev = H.list.find((x) => x.id === evId);
  if (!ev || ev.status !== 'done') throw new Error('Nothing to follow up yet.');
  if (ev.followed) throw new Error('Already followed up.');
  if (!judged) throw new Error('Write the follow-up and get feedback first.');
  const F = E.HOSTED[ev.format];
  const late = state.day - ev.capturedDay;
  const decay = E.eventFollowUpFactor(late);
  const note = E.followUpNoteMult({ personalized, quality: judged.quality }) * (1 - 0.5 * pitchiness(state, judged.text ?? ''));
  let meetings = 0;
  for (const a of ev.attendees) {
    const ct = contactById(state, a.contactId);
    if (!ct) continue;
    const p = E.meetingProb({ format: ev.format, kind: a.kind, engagement: a.engaged, followMult: note, decay });
    addActivity(state, { type: 'email', text: `${personalized ? 'Personal' : 'Templated'} follow-up after your ${F.label.toLowerCase()}${late ? ` (${late} day${late > 1 ? 's' : ''} later)` : ' (same day)'}`, companyId: ct.companyId, contactId: ct.id });
    if (!chance(state, p)) continue;
    const g = ev.guests.find((x) => x.contactId === ct.id);
    if (g) g.meeting = true;
    a.meeting = true;
    if (bookNextStep(state, ct, { source: F.source, key: F.key, note: `Agreed to a call after your ${F.label.toLowerCase()} "${ev.title}"` })) meetings++;
  }
  ev.followed = { day: state.day, late, personalized: Boolean(personalized), quality: judged.quality ?? 0.5, meetings };
  return { meetings, late, contacted: ev.attendees.length };
}

/** Founder hours for the follow-up: ~10 min per personal note, under an hour for a template [design]. */
export const followUpHours = (ev, personalized) => (personalized ? round2(Math.max(0.5, (ev.attendees?.length ?? 0) * (10 / 60))) : 0.75);

export function hostedDay(state) {
  const C = state.apps.channels;
  if (!C) return;
  for (const ev of C.hosted?.list ?? []) {
    if (ev.status === 'invited' && state.day >= ev.day) resolveHosted(state, ev);
    if (ev.status === 'done' && !ev.followed && ev.capturedDay != null && state.day - ev.capturedDay >= 3) {
      const F = E.HOSTED[ev.format];
      logMistake(state, { functionId: FN, id: 'no_event_followup', label: `No follow-up within 72 h after your ${F.label.toLowerCase()}`, app: 'channels', delayed: true, cost: { usd: Math.round(ev.spent * 0.7), hours: round2(ev.hours * 0.7) }, key: `evnofu:${ev.id}`, detail: `${ev.results?.attended ?? 0} attendees heard nothing for three days; most event leads are cold by then (a widely cited, unverified 73%). Follow up the same evening or next morning with a personal note and one next step.` });
    }
  }
  // Conferences: scanned leads nobody followed up within 72 h.
  for (const e of C.events?.list ?? []) {
    if (e.leads && !e.leads.followed && state.day - e.leads.capturedDay >= 3 && (e.leads.real ?? 0) > 0) {
      logMistake(state, { functionId: FN, id: 'no_event_followup', label: `No follow-up within 72 h after ${e.name}`, app: 'channels', delayed: true, cost: { usd: Math.round((e.cost ?? 0) * 0.7), hours: 0 }, key: `cfnofu:${e.id}`, detail: `${e.leads.real} real conversations from ${e.name} went three days without a follow-up; trade-show leads cool fastest. Follow up the same evening.` });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Read helpers for the UI and readers
// ---------------------------------------------------------------------------------------------------------

/** CRM contacts eligible as guests / targets (not hidden, not customers' already-open meetings filtered by caller). */
export function crmCandidates(state, { filter = 'all' } = {}) {
  const crm = state.apps.crm;
  if (!crm) return [];
  const targets = eventTargetAccounts(state);
  const openDeal = new Set(crm.deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost').map((d) => d.companyId));
  return crm.contacts.filter((c) => !c.hidden && c.status !== 'customer').filter((c) => {
    if (filter === 'targets') return targets.has(c.companyId);
    if (filter === 'warm') return Boolean(c.warm);
    if (filter === 'nodeal') return !openDeal.has(c.companyId);
    if (filter === 'senior') return SENIOR_TITLE.test(c.title ?? '');
    return true;
  }).map((c) => ({ c, co: crm.companies.find((x) => x.id === c.companyId) ?? null, target: targets.get(c.companyId) ?? null, name: contactName(c) }));
}

