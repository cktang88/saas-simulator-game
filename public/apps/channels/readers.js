// Operator readers for the Channels app (data/operator-tiers.js):
//  - event_led_growth: what the player DID with events: who was in the room (hidden ICP truth of real CRM guests),
//    peer value vs pitch, anchors / pre-booked meetings, how fast and how personally they followed up, and the
//    mistakes logged. Not the number of events or invitations.
//  - partnerships_channels: focus (one or two partner types vs logo collecting), pitch quality, enablement and
//    follow-through, sourced customers, and the partner mistakes logged.

import { registerOperatorReader, unknownRead, tierFromScore, trapCoaching, tierBehaviours } from '../../core/operator.js';
import { round2 } from '../../core/util.js';
import { FN as EVENTS_FN } from './hosted.js';
import { performance } from './sim.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const speedScore = (late) => (late == null ? 0 : late <= 0 ? 1 : late <= 1 ? 0.85 : late <= 2 ? 0.5 : 0.15);

export function readEvents(state) {
  const C = state.apps?.channels;
  const hosted = (C?.hosted?.list ?? []).filter((e) => e.status === 'done' || e.status === 'missed');
  const confs = (C?.events?.list ?? []).filter((e) => e.status === 'done' && e.mode !== 'speak');
  const mail = (C?.mailCampaigns ?? []).filter((c) => c.piece === 'dimensional');
  if (!hosted.length && !confs.length && !mail.length) return unknownRead('Host one small dinner or roundtable for ICP buyers and follow up the next morning.');
  const ms = (state.mistakes ?? []).filter((m) => m.functionId === EVENTS_FN);
  const has = (id) => ms.filter((m) => m.id === id).length;
  const parts = [], evidence = [], coaching = [];
  const add = (w, v) => { if (v != null && Number.isFinite(v)) parts.push([w, clamp01(v)]); };
  const done = hosted.filter((e) => e.status === 'done');

  // 1. Who was in the room (hidden truth of the attendees).
  const icp = mean(done.filter((e) => e.attendees?.length).map((e) => e.results?.icpShare ?? 0));
  if (icp != null) {
    add(0.22, (icp - 0.2) / 0.6);
    evidence.push(`${Math.round(icp * 100)}% of attendees at your hosted events were ICP buyers`);
    if (icp < 0.55) coaching.push(trapCoaching(EVENTS_FN, 'wrong_audience_event'));
  }
  // 2. Peer value vs vendor pitch.
  const peer = mean(done.map((e) => (e.agendaQ - 0.8 * e.pitch - 0.2) / 0.6));
  if (peer != null) {
    add(0.18, peer);
    const pitchy = done.filter((e) => e.pitch >= 0.5).length;
    evidence.push(`Agendas: average judged ${Math.round(mean(done.map((e) => e.agendaQ)) * 100)}/100; ${pitchy} of ${done.length} read as a product pitch`);
    if (pitchy) coaching.push(trapCoaching(EVENTS_FN, 'vendor_pitch_event'));
  }
  // 3. Follow-up speed (hosted events and conference conversations that are past the 72-hour window or answered).
  const fu = [];
  for (const e of done) { if (e.followed) fu.push(speedScore(e.followed.late)); else if (state.day - e.capturedDay >= 3) fu.push(0); }
  for (const e of confs) { if (!e.leads) continue; if (e.leads.followed) fu.push(speedScore(e.leads.followed.late)); else if (state.day - e.leads.capturedDay >= 3) fu.push(0); }
  const speed = mean(fu);
  if (speed != null) {
    add(0.25, speed);
    const fast = fu.filter((x) => x >= 0.85).length;
    evidence.push(`${fast} of ${fu.length} events followed up the same or next day`);
    if (speed < 0.7) coaching.push(trapCoaching(EVENTS_FN, 'no_event_followup'));
  }
  // 4. Personal follow-up that references the conversation.
  const pers = mean([...done.filter((e) => e.followed).map((e) => (e.followed.personalized ? 0.45 + 0.55 * e.followed.quality : 0.35 * e.followed.quality)), ...confs.filter((e) => e.leads?.followed).map((e) => (e.leads.followed.personalized ? 0.45 + 0.55 * (e.leads.followed.quality ?? 0.5) : 0.35 * (e.leads.followed.quality ?? 0.5)))]);
  if (pers != null) {
    add(0.12, pers);
    evidence.push(`Follow-ups: ${done.filter((e) => e.followed?.personalized).length + confs.filter((e) => e.leads?.followed?.personalized).length} personal, ${done.filter((e) => e.followed && !e.followed.personalized).length + confs.filter((e) => e.leads?.followed && !e.leads.followed.personalized).length} templated`);
  }
  // 5. Preparation: anchors, reminders, notice; pre-booked meetings at conferences.
  const prep = [
    ...done.map((e) => Math.min(1, (e.anchors >= 2 ? 0.55 : e.anchors === 1 ? 0.35 : 0.05) + (e.reminders ? 0.2 : 0) + (e.leadDays >= 10 ? 0.25 : 0.05))),
    ...confs.map((e) => (e.prebooked > 0 ? Math.min(1, 0.5 + 0.1 * e.prebooked) : 0.1)),
  ];
  if (prep.length) {
    add(0.13, mean(prep));
    evidence.push(`${done.reduce((a, e) => a + (e.anchors ?? 0), 0)} anchor guests secured; ${confs.reduce((a, e) => a + (e.prebooked ?? 0), 0)} conference meetings pre-booked`);
    if (confs.some((e) => !e.prebooked)) coaching.push(trapCoaching(EVENTS_FN, 'booth_no_prebooked'));
    if (done.some((e) => !e.anchors)) coaching.push(trapCoaching(EVENTS_FN, 'empty_room'));
  }
  // 6. Pipeline per attendee (luck matters; low weight).
  const att = done.reduce((a, e) => a + (e.attendees?.length ?? 0), 0);
  const mtg = done.reduce((a, e) => a + (e.followed?.meetings ?? 0), 0);
  if (att >= 3) {
    add(0.1, (mtg / att) * 10 / 4);
    evidence.push(`${mtg} next meetings from ${att} attendees (${round2((mtg / att) * 10)} per ten)`);
  }
  if (mail.length) {
    if (has('gift_low_acv')) coaching.push(trapCoaching(EVENTS_FN, 'gift_low_acv'));
    if (has('gift_no_followup')) coaching.push(trapCoaching(EVENTS_FN, 'gift_no_followup'));
    add(0.05, 1 - Math.min(1, 0.5 * (has('gift_low_acv') + has('gift_no_followup'))));
    evidence.push(`${mail.length} gift campaign(s); ${has('gift_low_acv') + has('gift_no_followup')} logged as wasted`);
  }
  if (!parts.length) return unknownRead('Follow up on your last event and host one for ICP buyers.');
  const wsum = parts.reduce((a, [w]) => a + w, 0) || 1;
  const raw = parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
  const penalty = Math.min(0.4, 0.08 * ms.length);
  const score = clamp01(raw - penalty);
  if (ms.length) evidence.push(`${ms.length} event mistake(s) logged (${[...new Set(ms.map((m) => m.id))].join(', ')})`);
  const tier = tierFromScore(score);
  if (tier !== 'stellar') coaching.push(`What a stellar operator does: ${tierBehaviours(EVENTS_FN).join('; ')}.`);
  return { tier, score: round2(score), raw: round2(raw), evidence, coaching: [...new Set(coaching.filter(Boolean))] };
}

const PARTNER_KEYS = (k) => k === 'partner' || k === 'comarketing' || k === 'affiliate' || k.startsWith('mkt:');

export function readPartnerships(state) {
  const C = state.apps?.channels;
  if (!C) return unknownRead('Pick one partner whose customers are your ICP and ask for three introductions.');
  const pitched = Object.values(C.partners?.pitched ?? {});
  const signed = C.partners?.list ?? [];
  const comk = (C.comarketing ?? []).filter((c) => c.partnerId);
  const stores = Object.values(C.stores ?? {}).filter((s) => s.status && s.status !== 'idle');
  const aff = C.affiliates?.program ? 1 : 0;
  const relationships = pitched.length + comk.length + stores.length + aff;
  if (!relationships) return unknownRead('Pick one partner whose customers are your ICP and ask for three introductions.');
  const FNP = 'partnerships_channels';
  const ms = (state.mistakes ?? []).filter((m) => m.functionId === FNP);
  const parts = [], evidence = [], coaching = [];
  const add = (w, v) => { if (v != null && Number.isFinite(v)) parts.push([w, clamp01(v)]); };

  // 1. Pitch quality: partner pitches, co-marketing proposals, affiliate outreach (judged text).
  const qs = [...pitched.map((p) => p.quality ?? 0.5), ...comk.map((c) => c.quality ?? 0.5), ...(C.affiliates?.outreach ? [C.affiliates.outreach.quality ?? 0.5] : [])];
  const q = mean(qs);
  if (q != null) { add(0.25, (q - 0.3) / 0.55); evidence.push(`Average judged partner pitch ${Math.round(q * 100)}/100 over ${qs.length}`); if (q < 0.55) coaching.push(trapCoaching(FNP, 'logo_collecting')); }
  // 2. Focus: a couple of partners that fit beats a dozen announcements.
  const focus = relationships <= 4 ? 1 : relationships <= 8 ? 0.6 : relationships <= 14 ? 0.3 : 0.1;
  add(0.15, focus);
  evidence.push(`${relationships} partner relationships started (pitches, co-marketing, listings, affiliate program)`);
  if (focus < 0.6) coaching.push(trapCoaching(FNP, 'logo_collecting'));
  // 3. Follow-through: enablement of signed partners, co-marketing actually delivered.
  const ft = [];
  for (const p of signed) ft.push(p.status === 'stalled' || p.status === 'dropped' ? 0.1 : p.sessions > 0 ? 1 : 0.5);
  for (const c of comk) if (['done', 'failed'].includes(c.status)) ft.push(c.status === 'done' ? (c.prep ? 1 : 0.6) : 0);
  if (ft.length) { add(0.25, mean(ft)); evidence.push(`${signed.filter((p) => p.status === 'stalled').length} stalled partner(s); ${comk.filter((c) => c.status === 'done').length} co-marketing run(s) delivered, ${comk.filter((c) => c.status === 'failed').length} dropped`); }
  // 4. Sourced customers per relationship older than 90 days (sourced only: no "influenced" credit).
  const old = signed.filter((p) => state.day - p.signedDay >= 90).length + comk.filter((c) => c.status === 'done' && state.day - (c.eventDay ?? c.day) >= 60).length + stores.filter((s) => (s.liveDay ?? Infinity) <= state.day - 90).length;
  if (old) {
    let customers = 0;
    try { customers = performance(state).filter((r) => PARTNER_KEYS(r.key)).reduce((a, r) => a + r.customers, 0); } catch { customers = 0; }
    add(0.2, customers / Math.max(2, old));
    evidence.push(`${customers} partner-sourced customers from ${old} relationship(s) older than three months`);
  }
  // 5. Mistakes (agency scams, early exits, poor agencies; rev share before sourcing).
  add(0.15, 1 - Math.min(1, 0.35 * ms.length));
  if (ms.length) evidence.push(`${ms.length} partnership mistake(s) logged`);
  if (ms.some((m) => /agency/.test(m.id))) coaching.push('Pay agencies by milestone, check a client they did not list and run a paid trial before a retainer.');
  const wsum = parts.reduce((a, [w]) => a + w, 0) || 1;
  const score = clamp01(parts.reduce((a, [w, v]) => a + w * v, 0) / wsum);
  const tier = tierFromScore(score);
  if (tier !== 'stellar') coaching.push(`What a stellar operator does: ${tierBehaviours(FNP).join('; ')}.`);
  return { tier, score: round2(score), evidence, coaching: [...new Set(coaching.filter(Boolean))] };
}

registerOperatorReader(EVENTS_FN, readEvents);
registerOperatorReader('partnerships_channels', readPartnerships);
