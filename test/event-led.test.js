// Event-led growth (apps/channels/hosted.js, events-model.js, readers.js) and the CRM-targeted conferences, cold calls
// and direct mail in apps/channels/sim.js. Short, seeded, targeted: no calendar-wide simulation, days are jumped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { addContact, ensureCrm } from '../public/apps/sales/model.js';
import { productSlice } from '../public/apps/product/store.js';
import { isWeekend } from '../public/core/util.js';
import '../public/apps/channels.js';
import * as S from '../public/apps/channels/sim.js';
import * as H from '../public/apps/channels/hosted.js';
import * as E from '../public/apps/channels/events-model.js';
import { pitchiness, heuristicJudge } from '../public/apps/channels/judge.js';

function fresh(seed = 11, model = 'smb') {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', description: 'seed', category: 'owner_contribution' });
  s.company.oneLiner = 'Bookkeeping reconciliation for small agencies';
  s.company.icp = 'owners of 5-30 person marketing agencies';
  productSlice(s).features.push({ id: 'f_core', title: 'Core reconciliation', status: 'shipped', effortHours: 40, progressHours: 40, shippedDay: 0 });
  s.founder.hoursPerWeek = 400;
  S.ensureChannels(s);
  return s;
}

// A CRM of 24 ICP buyers (prospect database fit 0.8), 12 poor-fit contacts (0.15) and 4 vendors. Returns id groups.
function crm(s) {
  const out = { icp: [], poor: [], vendor: [] };
  const mk = (i, kind) => {
    const title = kind === 'vendor' ? 'Account Executive' : kind === 'icp' ? 'Agency Owner' : 'Operations Manager';
    const { contact, company } = addContact(s, { fullName: `Guest ${kind} ${i}`, email: `g${i}@${kind}${i}co.com`, title, company: `${kind}${i} Co`, industry: kind === 'icp' ? 'Marketing agency' : 'Logistics', size: '11-50' }, { source: 'prospector' });
    company.prospect = { fit: kind === 'icp' ? 0.8 : kind === 'vendor' ? 0.4 : 0.15 };
    out[kind].push(contact.id);
  };
  for (let i = 0; i < 24; i++) mk(i, 'icp');
  for (let i = 0; i < 12; i++) mk(100 + i, 'poor');
  for (let i = 0; i < 4; i++) mk(200 + i, 'vendor');
  return out;
}

const weekday = (s, d) => { while (isWeekend(s, d)) d++; return d; };
const J = (quality, text = '') => ({ quality, score: quality * 10, text, results: [], mock: true });
const PEER = 'A peer roundtable for agency owners: three guests share what is working to close the books in two days, compare notes on benchmarks, open discussion and your questions. No slides, no pitch.';
const PITCH = 'Demo of the Ledgerly platform: our product tour, new features, pricing and a special offer. Ledgerly will show how Ledgerly can automate your books. Sign up for a free trial.';
const FOLLOW = 'Hi Sam, thanks for coming last night. You mentioned the month-end crunch with three clients; here are the notes we discussed. Worth 20 minutes next week to compare your close?';

// Scripted hosts: what they actually do (guest list, agenda, anchors, notice, reminders, follow-up timing and style).
const HOSTS = {
  stellar: (g) => ({ guests: g.icp.slice(0, 22), anchors: g.icp.slice(0, 3), agenda: J(0.85, PEER), invite: J(0.85, 'Hi, I am hosting 12 agency owners for dinner on Thursday at 7pm.'), budget: 'standard', days: 24, reminders: true, followLate: 0, personal: true, follow: J(0.85, FOLLOW) }),
  good: (g) => ({ guests: [...g.icp.slice(0, 18), ...g.poor.slice(0, 3)], anchors: g.icp.slice(0, 1), agenda: J(0.7, PEER), invite: J(0.65, 'Join a small dinner of agency owners on Thursday at 7pm.'), budget: 'standard', days: 16, reminders: true, followLate: 1, personal: true, follow: J(0.65, FOLLOW) }),
  average: (g) => ({ guests: [...g.icp.slice(0, 14), ...g.poor, ...g.vendor.slice(0, 2)], anchors: [], agenda: J(0.55, 'An evening about bookkeeping for agencies with a short overview and discussion.'), invite: J(0.5, 'You are invited to our dinner.'), budget: 'standard', days: 10, reminders: false, followLate: 2, personal: false, follow: J(0.5, 'Thanks for coming to our dinner. Let us know if you want a call.') }),
  mediocre: (g) => ({ guests: [...g.icp.slice(0, 8), ...g.poor, ...g.vendor], anchors: [], agenda: J(0.3, PITCH), invite: J(0.35, 'Come see the Ledgerly demo and pricing at our dinner.'), budget: 'lean', days: 6, reminders: false, followLate: 4, personal: false, follow: J(0.35, 'Thanks for attending the Ledgerly demo. Book a demo and see our pricing and special offer.') }),
};

/** Run one scripted dinner end to end. Returns { s, ev, meetings, hours, deals }. */
function runDinner(tier, seed, { followLate = null } = {}) {
  const s = fresh(seed);
  const g = crm(s);
  const h = HOSTS[tier](g);
  const day = s.day + h.days;
  const spec = { format: 'dinner', title: `${tier} dinner`, agenda: h.agenda, invite: h.invite, guestIds: h.guests, anchorIds: h.anchors, budget: h.budget, day, reminders: h.reminders };
  // keep the date on a weekday
  while (H.hostBlockers(s, spec).some((x) => /weekday/.test(x))) spec.day++;
  const ev = H.hostEvent(s, spec);
  const prep = ev.hours;
  s.day = ev.day;
  H.hostedDay(s);
  assert.equal(ev.status, 'done');
  s.day += followLate ?? h.followLate;
  const r = H.followUpHosted(s, ev.id, { personalized: h.personal, judged: h.follow });
  const hours = prep + E.HOSTED.dinner.hostMin / 60 + H.followUpHours(ev, h.personal);
  const deals = ensureCrm(s).deals.filter((d) => d.source === 'events');
  return { s, ev, meetings: r.meetings, hours, deals };
}

test('pitchiness: a demo agenda reads as a pitch, a peer agenda does not; the heuristic judge agrees', () => {
  const s = fresh(1);
  assert.ok(pitchiness(s, PITCH) >= E.PITCH_LIMIT, `pitch ${pitchiness(s, PITCH)}`);
  assert.ok(pitchiness(s, PEER) < 0.2);
  assert.ok(heuristicJudge(s, 'event_agenda', PEER).score > heuristicJudge(s, 'event_agenda', PITCH).score + 2);
});

test('model: webinar show-up stays inside 41.6-60%, dinner 80-90%; follow-up keeps ~30% of value at 72 h', () => {
  for (const r of [false, true]) for (const q of [0, 0.5, 1]) {
    const w = E.showRate('webinar', { reminders: r, inviteQ: q });
    assert.ok(w >= 0.416 - 1e-9 && w <= 0.6 + 1e-9, `webinar ${w}`);
    const d = E.showRate('dinner', { reminders: r, inviteQ: q });
    assert.ok(d >= 0.8 - 1e-9 && d <= 0.9 + 1e-9, `dinner ${d}`);
  }
  assert.equal(E.eventFollowUpFactor(0), 1);
  assert.ok(Math.abs(E.eventFollowUpFactor(3) - 0.3) < 1e-9);
  assert.ok(E.eventFollowUpFactor(7) < 0.15);
  // A curated, anchored, well-invited dinner fills a room of 12-20 from ~22 invitations; a weak blast does not.
  const good = E.rsvpProb('dinner', { inviteQ: 0.85, fit: 0.8, anchors: 3, leadDays: 24 });
  const weak = E.rsvpProb('dinner', { inviteQ: 0.35, pitch: 0.7, fit: 0.2, anchors: 0, leadDays: 6 });
  assert.ok(good * 22 >= 10 && good * 22 <= 20, `good RSVPs ${good * 22}`);
  assert.ok(weak < good / 3);
});

test('tier separation: stellar > good > average > mediocre dinner hosts on meetings per founder hour (6 seeds)', () => {
  const seeds = [3, 5, 8, 13, 21, 34];
  const res = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    let m = 0, h = 0, conv = 0, att = 0, usd = 0;
    for (const seed of seeds) { const r = runDinner(tier, seed); m += r.meetings; h += r.hours; conv += r.ev.results.conversations; att += r.ev.results.attended; usd += r.ev.spent; }
    res[tier] = { perHour: m / h, meetings: m / seeds.length, conversations: conv / seeds.length, attended: att / seeds.length, usd: usd / seeds.length, costPerMeeting: m ? usd / m : Infinity };
  }
  const t = res;
  assert.ok(t.stellar.perHour > t.good.perHour && t.good.perHour > t.average.perHour && t.average.perHour > t.mediocre.perHour, JSON.stringify(t));
  assert.ok(t.stellar.perHour >= 2 * t.average.perHour, `stellar ${t.stellar.perHour} vs average ${t.average.perHour}`);
  assert.ok(t.stellar.perHour >= 4 * t.mediocre.perHour, `stellar ${t.stellar.perHour} vs mediocre ${t.mediocre.perHour}`);
  // A stellar dinner sits inside the research band: 5-12 buyer conversations, a handful of next meetings.
  assert.ok(t.stellar.conversations >= 5 && t.stellar.conversations <= 14, `conversations ${t.stellar.conversations}`);
  assert.ok(t.stellar.meetings >= 2 && t.stellar.meetings <= 9, `meetings ${t.stellar.meetings}`);
  console.log('event tiers', JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { perHour: +v.perHour.toFixed(3), meetings: +v.meetings.toFixed(2), conversations: +v.conversations.toFixed(1), attended: +v.attended.toFixed(1), costPerMeeting: Math.round(v.costPerMeeting) }]))));
});

test('reader: event_led_growth reads the scripted hosts in tier order; mistakes are logged and traceable', () => {
  const reads = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    const r = runDinner(tier, 7);
    reads[tier] = readOperator(r.s, H.FN);
    if (tier === 'mediocre') {
      const ids = (r.s.mistakes ?? []).filter((m) => m.functionId === H.FN).map((m) => m.id);
      assert.ok(ids.includes('vendor_pitch_event'), ids.join());
      assert.ok(ids.includes('wrong_audience_event') || r.ev.results.icpShare >= E.WRONG_AUDIENCE_SHARE, ids.join());
      assert.ok((r.s.mistakes ?? []).every((m) => m.functionId !== H.FN || m.cost.usd > 0 || m.cost.hours > 0 || m.cost.reputation > 0));
    }
    if (tier === 'stellar') assert.equal((r.s.mistakes ?? []).filter((m) => m.functionId === H.FN).length, 0);
  }
  assert.equal(reads.stellar.tier, 'stellar', JSON.stringify(reads.stellar));
  assert.equal(reads.mediocre.tier, 'mediocre', JSON.stringify(reads.mediocre));
  assert.ok(reads.stellar.score > reads.good.score && reads.good.score > reads.average.score && reads.average.score > reads.mediocre.score, JSON.stringify(Object.fromEntries(Object.entries(reads).map(([k, v]) => [k, v.score]))));
  assert.ok(reads.mediocre.evidence.length > 2);
});

test('follow-up decay: same-day personal notes book far more meetings than the same notes four days later; silence is logged at 72 h', () => {
  let fast = 0, slow = 0;
  for (const seed of [2, 4, 6, 9, 12, 15, 18, 21]) { fast += runDinner('stellar', seed, { followLate: 0 }).meetings; slow += runDinner('stellar', seed, { followLate: 4 }).meetings; }
  assert.ok(fast >= 2.5 * Math.max(1, slow), `fast ${fast} slow ${slow}`);
  const s = fresh(5);
  const g = crm(s);
  const ev = H.hostEvent(s, { format: 'roundtable', title: 'Close in two days', agenda: J(0.8, PEER), invite: J(0.8, 'Join six agency owners on Tuesday at 8am.'), guestIds: g.icp.slice(0, 12), anchorIds: [], budget: 'virtual', day: weekday(s, s.day + 15), reminders: true });
  s.day = ev.day; H.hostedDay(s);
  s.day += 3; H.hostedDay(s);
  const m = s.mistakes.find((x) => x.id === 'no_event_followup');
  assert.ok(m && m.delayed && (m.cost.hours > 0), JSON.stringify(m));
  H.hostedDay(s); // idempotent
  assert.equal(s.mistakes.filter((x) => x.id === 'no_event_followup').length, 1);
});

test('events create real CRM records: invitations, attendance, meetings and deals with an events source; webinar attendees become contacts', () => {
  const r = runDinner('stellar', 3);
  const crmS = ensureCrm(r.s);
  assert.ok(r.meetings > 0);
  assert.ok(r.deals.length >= r.meetings && r.deals.every((d) => d.stage === 'meeting_booked' || d.stage === 'replied'));
  assert.ok((r.s.apps.calls?.meetings ?? []).some((m) => m.source === 'events'));
  assert.ok(crmS.activities.some((a) => a.type === 'event' && /Attended your executive dinner/.test(a.text)));
  assert.ok(r.s.bank.txns.some((t) => t.meta?.channel === 'hosted' && /covers/.test(t.description)));
  assert.ok(r.s.calendar.events.some((e) => e.refId === r.ev.id));
  // Performance table attributes them to hosted events.
  assert.ok(S.performance(r.s).some((row) => row.key === 'hosted' && row.ld > 0 && row.sp > 0));
  // Webinar: audience registrants who attend land in the CRM with a webinar source.
  const s = fresh(9);
  s.founder.network.newsletter = 3000; s.founder.network.linkedin = 2000;
  const g = crm(s);
  const before = ensureCrm(s).contacts.length;
  const day = s.day + 18;
  const spec = { format: 'webinar', title: 'Month-end benchmarks', agenda: J(0.8, PEER), invite: J(0.7, 'Join us on Wednesday at 11am.'), guestIds: g.icp.slice(0, 10), anchorIds: [], budget: 'pro', day, reminders: true, promoUsd: 900 };
  while (H.hostBlockers(s, spec).length) spec.day++;
  const ev = H.hostEvent(s, spec);
  s.day = ev.day; H.hostedDay(s);
  assert.ok(ev.results.registrants > 20, `registrants ${ev.results.registrants}`);
  const show = ev.results.attended / Math.max(1, ev.results.rsvps + ev.results.registrants);
  assert.ok(show > 0.3 && show < 0.7, `show ${show}`);
  assert.ok(ensureCrm(s).contacts.filter((c) => c.source === 'webinar').length > 5);
  assert.ok(ensureCrm(s).contacts.length > before);
});

test('conferences: pre-booked meetings with named CRM accounts are real meetings; a booth without them is a logged mistake', () => {
  const s = fresh(17, 'ent');
  const g = crm(s);
  const conf = S.conferenceDates(s)[0];
  const e = S.bookConference(s, conf.id, 'attend');
  const n = S.prebookMeetings(s, e.id, 4, { contactIds: g.icp });
  assert.equal(e.prebooked, n);
  assert.ok(e.prebookAsks > 0 && e.prebookAsks <= 12);
  if (n) assert.ok((s.apps.calls?.meetings ?? []).some((m) => m.day >= conf.day && m.day <= conf.day + 1 && m.source === 'events'));
  const b = S.bookConference(s, conf.id, 'booth');
  s.day = conf.day + 2;
  S.channelsDay(s);
  assert.equal(b.status, 'done');
  assert.ok(s.mistakes.some((m) => m.id === 'booth_no_prebooked' && m.cost.usd > 5000));
  assert.ok(b.leads.contactIds.length === b.leads.real && b.leads.real > 0);
  const ids = new Set(ensureCrm(s).contacts.map((c) => c.id));
  assert.ok(b.leads.contactIds.every((id) => ids.has(id)));
  const r = S.followUpEventLeads(s, b.id, { personalized: true, judged: J(0.8, FOLLOW) });
  assert.equal(r.late, 0);
  assert.ok(ensureCrm(s).deals.filter((d) => d.source === 'events').length >= r.n);
});

test('cold calls and direct mail target CRM contacts: warm ICP lists book more meetings; gifts to a low-ACV product are a logged cost', () => {
  let warm = 0, cold = 0;
  for (const seed of [1, 2, 3]) {
    for (const kind of ['warm', 'cold']) {
      const s = fresh(seed);
      const ids = [];
      for (let i = 0; i < 300; i++) {
        const { contact, company } = addContact(s, { fullName: `P ${i}`, email: `p${i}@c${i}x.com`, title: 'Agency Owner', company: `C${i}`, industry: 'Marketing agency' }, { source: 'prospector' });
        company.prospect = { fit: kind === 'warm' ? 0.8 : 0.15 };
        if (kind === 'warm') contact.warm = true;
        ids.push(contact.id);
      }
      S.setDialer(s, 'parallel');
      S.buyCallList(s, 'crm_verified', ids);
      S.ensureChannels(s).calls.script = J(0.6);
      for (let b = 0; b < 3; b++) { const r = S.callBlock(s, 3); if (kind === 'warm') warm += r.meetings; else cold += r.meetings; }
      const L = S.ensureChannels(s).calls.list;
      assert.ok(L.queue.every((q) => q.attempts <= S.MAX_ATTEMPTS));
      if (kind === 'warm') assert.ok(ensureCrm(s).deals.some((d) => d.source === 'cold_call'));
    }
  }
  assert.ok(warm >= 3 * Math.max(1, cold), `warm ${warm} cold ${cold}`);
  // Direct mail: gift boxes for a $49/month product.
  const s = fresh(4);
  const g = crm(s);
  const camp = S.sendDirectMail(s, { piece: 'dimensional', contactIds: g.icp, followUp: false, judged: J(0.7) });
  assert.equal(camp.count, g.icp.length);
  assert.ok(s.mistakes.some((m) => m.id === 'gift_low_acv' && m.cost.usd > 0));
  assert.ok(s.mistakes.some((m) => m.id === 'gift_no_followup'));
  s.day = camp.arriveDay;
  S.channelsDay(s);
  assert.equal(camp.status, 'done');
  assert.equal(ensureCrm(s).deals.filter((d) => d.source === 'direct_mail').length >= Math.min(1, camp.qualified), true);
});

test('reader: partnerships_channels separates a focused, enabled partner program from logo collecting', () => {
  const s = fresh(3);
  assert.equal(readOperator(s, 'partnerships_channels').tier, 'unknown');
  assert.equal(readOperator(fresh(3), H.FN).tier, 'unknown');
  s.day = 120;
  const C = S.ensureChannels(s);
  C.partners.pitched = { ap_0: { day: 60, signs: true, quality: 0.82, done: true }, ap_1: { day: 62, signs: true, quality: 0.78, done: true } };
  C.partners.list = [{ id: 'p1', status: 'producing', sessions: 4, signedDay: 90, kind: 'agency' }, { id: 'p2', status: 'signed', sessions: 2, signedDay: 95, kind: 'agency' }];
  C.comarketing = [{ id: 'c1', partnerId: 'cp_0', quality: 0.8, status: 'done', prep: 1, day: 80, eventDay: 100 }];
  const st = readOperator(s, 'partnerships_channels');
  const m = fresh(3);
  m.day = 120;
  const D = S.ensureChannels(m);
  D.partners.pitched = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`ap_${i}`, { day: 10, signs: i < 4, quality: 0.3, done: true }]));
  D.partners.list = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, status: 'stalled', sessions: 0, signedDay: 30, kind: 'agency' }));
  D.comarketing = [{ id: 'c1', partnerId: 'cp_0', quality: 0.3, status: 'failed', prep: 0, day: 20, eventDay: 40 }];
  m.mistakes = [{ functionId: 'partnerships_channels', id: 'agency_scam', cost: { usd: 3000 } }];
  const md = readOperator(m, 'partnerships_channels');
  assert.equal(st.tier, 'stellar', JSON.stringify(st));
  assert.equal(md.tier, 'mediocre', JSON.stringify(md));
});
