// White-glove setup ("we set it up for you"): a 1-3 h founder session per new account, its own calendar
// meeting type (kind 'onboarding_setup'). Hand-onboarding the first customers is the classic early-stage play
// (the first 20-50 accounts; docs/research hr-legal-product.md §3.4) and the best product-discovery you get.
// All effect sizes are [design] game assumptions unless noted.

import { ensureStripe } from '../../core/stripe.js';
import { ensureMarket, trialConversion, setModifier } from '../../core/market.js';
import { ONBOARDING } from '../../core/params.js';
import { scheduleEvent, findSlots, completeEvent, ensureCalendar } from '../../core/calendar.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { chance, clamp, uid, words } from '../../core/util.js';
import { customersSlice, researchSlice } from '../product/store.js';

export const SETUP = {
  hours: { min: 1, max: 3 },          // founder hours per account [design]; B2B default 2, B2C power user 1
  convMult: 2.6,                      // trial->paid vs self-serve for a fully set-up trial (concierge is 2.2) [design]
  noShowPenalty: 0.5,                 // forceConvert multiplier when the founder doesn't show [design]
  playbookHoursMult: 0.6,             // productized onboarding (checklist, templates, docs) cuts session time [design]
  playbookMinSessions: 8,             // sessions needed to know what to productize [design]
  playbookHours: 6,                   // founder hours to write checklist + templates + docs [design]
  learnWindow: 10,                    // first N accounts: skipping setup loses the learning [design]
  weekShareLimit: 0.3,                // setups > 30% of the week = "onboarding ate the week" [design]
  scaleCoachAt: 20,                   // accounts at which the game coaches productizing [design]
  referralBase: 0.12, referralMax: 0.4, // chance a held session yields a referral/testimonial [design]
};

const BLOCKER = /(stuck|couldn't|could not|confus|expected|workaround|manual|spreadsheet|asked (for|if|whether)|wanted|wish|missing|slow|took (them|him|her)|didn't (know|see|understand)|instead of|currently|today they|every (week|day|month))/i;

export const setupHoursFor = (state, hours) => {
  const base = clamp(Number(hours) || (state.company.model === 'b2c' ? 1 : 2), SETUP.hours.min, SETUP.hours.max);
  return +(base * (customersSlice(state).playbook ? SETUP.playbookHoursMult : 1)).toFixed(2);
};

// Score the founder's session notes 0-1. Rewards concrete, distinct observations (a quote, a blocker, a
// workaround or number, what they asked for); keyword stuffing and padding don't help (distinct-word ratio).
export function scoreNotes(notes = '') {
  const t = String(notes).trim();
  const sentences = t.split(/[.\n!?]+/).map((x) => x.trim()).filter((x) => words(x) >= 4);
  if (!sentences.length) return { score: 0, insights: [] };
  const ws = t.toLowerCase().split(/\W+/).filter(Boolean);
  const distinct = new Set(ws).size / Math.max(1, ws.length);
  const rated = sentences.map((x) => ({ x, v: (BLOCKER.test(x) ? 1 : 0) + (/["“”']/.test(x) ? 1 : 0) + (/\d/.test(x) ? 0.5 : 0) + Math.min(0.5, words(x) / 40) }));
  const concrete = rated.filter((r) => r.v >= 1).length;
  const score = clamp((Math.min(concrete, 4) / 4) * 0.75 + Math.min(1, words(t) / 70) * 0.25, 0, 1) * (distinct < 0.45 ? 0.5 : 1);
  return { score, insights: rated.sort((a, b) => b.v - a.v).filter((r) => r.v >= 1).slice(0, 3).map((r) => r.x) };
}
export const notesTier = (s) => (s >= 0.75 ? 'stellar' : s >= 0.5 ? 'good' : s >= 0.25 ? 'average' : 'mediocre');

const subOf = (state, id) => ensureStripe(state).subscriptions.find((x) => x.id === id);
const custOf = (state, id) => ensureStripe(state).customers.find((c) => c.id === id);
export const setups = (state) => (customersSlice(state).setups ??= []);

export function setupCandidates(state) {
  const have = new Set(setups(state).filter((r) => r.status !== 'canceled').map((r) => r.subId));
  return ensureStripe(state).subscriptions.filter((s) => ['trialing', 'active'].includes(s.status) && s.startDay >= state.day - 30 && !have.has(s.id));
}

/** Book a white-glove setup for one subscription on the calendar. → { ok, error?, rec? } */
export function bookSetup(state, subId, { hours, day = null, start = null } = {}) {
  const sub = subOf(state, subId);
  if (!sub) return { ok: false, error: 'Unknown account.' };
  if (setups(state).some((r) => r.subId === subId && ['booked', 'held'].includes(r.status))) return { ok: false, error: 'Already booked or done for this account.' };
  const h = setupHoursFor(state, hours);
  const duration = Math.round(h * 60);
  const slot = day != null ? { day, start: start ?? ensureCalendar(state).workHours.start } : findSlots(state, { fromDay: state.day + 1, duration, count: 1 })[0];
  if (!slot) return { ok: false, error: 'No free slot in the next 30 days.' };
  const c = custOf(state, sub.customerId);
  const rec = { id: uid('stp'), subId, customerId: sub.customerId, name: c?.name ?? 'Customer', company: c?.company ?? null, hours: h, day: slot.day, start: slot.start, status: 'booked', eventId: null, bookedDay: state.day };
  try {
    const ev = scheduleEvent(state, { title: `White-glove setup: ${rec.company ?? rec.name}`, kind: 'onboarding_setup', app: 'customers', refId: rec.id, with: { name: rec.name, email: c?.email }, day: slot.day, start: slot.start, duration, notes: 'Set the account up with them live; write down where they get stuck.' });
    rec.eventId = ev.id;
  } catch (e) { return { ok: false, error: e.message }; }
  setups(state).unshift(rec);
  return { ok: true, rec };
}

/** Hold the session (founder joined). Notes decide how much real product learning you get. */
export function holdSetup(state, recId, notes = '') {
  const rec = setups(state).find((r) => r.id === recId);
  if (!rec || rec.status !== 'booked') return { ok: false, error: 'Not a booked session.' };
  completeEvent(state, rec.eventId, 'done', 'held');
  rec.status = 'held'; rec.heldDay = state.day;
  const sub = subOf(state, rec.subId);
  if (sub) {
    sub.onboarded = 'held'; sub.setupDone = true; // churn.js: early-life churn x0.8 and reason mix x0.55 for 'held'
    if (sub.status === 'trialing') sub.forceConvert = Math.min(0.95, (trialConversion(state) / (ONBOARDING[ensureMarket(state).onboarding]?.conv ?? 1)) * SETUP.convMult * Math.min(1, rec.hours / 1.5));
  }
  const n = scoreNotes(notes);
  rec.notesScore = n.score; rec.notesTier = notesTier(n.score); rec.notes = String(notes).slice(0, 2000);
  const slice = researchSlice(state);
  for (const text of n.insights) slice.insights.unshift({ id: uid('ins'), interviewId: null, theme: 'Onboarding', text, type: 'workaround', real: true, verified: true, who: `${rec.name}${rec.company ? `, ${rec.company}` : ''} (setup session)`, day: state.day });
  rec.insights = n.insights.length;
  if (!n.insights.length) {
    logMistake(state, { functionId: 'customer_discovery', id: 'setup_no_notes', label: 'Sat with a customer for an hour and wrote nothing down', cost: { hours: 0.5 }, detail: `${rec.name}'s setup produced no usable product insight; the learning is gone.`, app: 'customers', key: `setup_notes:${rec.id}`, charge: true });
  }
  // Referral / testimonial: a delighted, well-listened-to customer vouches for you. Better with real listening.
  const p = clamp(SETUP.referralBase + 0.2 * n.score + 0.1 * (ensureMarket(state).fit.product.score ?? 0.3), 0, SETUP.referralMax);
  if (chance(state, p)) {
    rec.testimonial = true;
    const sl = customersSlice(state);
    sl.testimonials = (sl.testimonials ?? 0) + 1;
    setModifier(state, 'conversion', 'setup-testimonials', +(1 + Math.min(0.06, 0.015 * sl.testimonials)).toFixed(4)); // [design] social proof, capped +6%
    notify(state, `${rec.company ?? rec.name} offered a testimonial / referral after their setup.`, { type: 'good', app: 'customers' });
  }
  return { ok: true, rec };
}

/** Productize: checklist, templates, docs. Worth most after you've learned from 8+ sessions. */
export function productizeOnboarding(state) {
  const sl = customersSlice(state);
  if (sl.playbook) return { ok: false, error: 'Already productized.' };
  const held = setups(state).filter((r) => r.status === 'held').length;
  const quality = held >= SETUP.playbookMinSessions ? 1 : 0.3;
  sl.playbook = { day: state.day, quality, sessions: held };
  setModifier(state, 'churn', 'onboarding-playbook', +(1 - 0.08 * quality).toFixed(4)); // [design] docs/checklist: modest early-churn gain
  if (quality < 1) logMistake(state, { functionId: 'customer_discovery', id: 'premature_playbook', label: `Wrote the onboarding docs after only ${held} sessions`, cost: { hours: 3 }, circles: true, delayed: true, detail: 'Docs written before you learned where people get stuck; they will need rewriting.', app: 'customers', key: 'premature_playbook', charge: true });
  return { ok: true, quality };
}

const weekSetupHours = (state) => setups(state).filter((r) => r.status === 'held' && r.heldDay > state.day - 7).reduce((a, r) => a + r.hours, 0);

export function setupDay(state) {
  const sl = customersSlice(state);
  const evs = ensureCalendar(state).events;
  for (const rec of setups(state)) {
    if (rec.status !== 'booked') continue;
    const ev = evs.find((e) => e.id === rec.eventId);
    if (!ev || ev.status === 'canceled') { rec.status = 'canceled'; continue; }
    if (ev.status === 'done') { rec.status = 'held'; rec.heldDay ??= state.day; continue; }
    if (ev.status === 'unattended' || ev.status === 'missed') {
      rec.status = 'no-show';
      const sub = subOf(state, rec.subId);
      if (sub) { sub.onboarded = 'no_show'; if (sub.status === 'trialing') sub.forceConvert = (trialConversion(state) / (ONBOARDING[ensureMarket(state).onboarding]?.conv ?? 1)) * SETUP.noShowPenalty; }
      logMistake(state, { functionId: 'customer_success', id: 'setup_no_show', label: 'Missed a white-glove setup you promised', cost: { reputation: 1, customers: 0.3 }, detail: `${rec.name} blocked ${rec.hours}h and you didn't show.`, app: 'customers', key: `setup_ns:${rec.id}` });
      notify(state, `You missed ${rec.name}'s setup session. They were promised hands-on help.`, { type: 'bad', app: 'customers' });
    }
  }
  const held = setups(state).filter((r) => r.status === 'held');
  // It can't scale: weekly share of the week, and coaching to productize.
  if (state.day % 7 === 0 && weekSetupHours(state) > SETUP.weekShareLimit * (state.founder.hoursPerWeek ?? 55)) {
    logMistake(state, { functionId: 'founder_time', id: 'onboarding_ate_week', label: 'Hand-onboarding ate the week', cost: { days: 3 }, circles: true, detail: `${weekSetupHours(state).toFixed(1)} h of setup sessions in a week. Productize: checklist, templates, docs.`, app: 'customers', key: `ate:${Math.floor(state.day / 28)}` });
  }
  const accounts = ensureStripe(state).subscriptions.length;
  if (accounts >= SETUP.scaleCoachAt && !sl.playbook && !sl.scaleCoached) {
    sl.scaleCoached = true;
    notify(state, `${accounts} accounts: you can't hand-onboard everyone. Write the checklist, templates and docs from what you learned (Customers > Onboarding).`, { type: 'warn', app: 'customers' });
  }
  // Skipped the learning: by the time the first 10 accounts exist, fewer than 5 got a hands-on session.
  if (accounts >= SETUP.learnWindow && !sl.learnChecked) {
    sl.learnChecked = true;
    if (held.length < 5) logMistake(state, { functionId: 'customer_discovery', id: 'skipped_early_onboarding', label: 'Skipped hands-on onboarding for the first 10 customers', cost: { days: 14 }, delayed: true, detail: `Only ${held.length} of your first ${SETUP.learnWindow} accounts got a setup session: you learned less about where users get stuck.`, app: 'customers', key: 'skip_early_onb' });
  }
}
