// Meeting notetaker → CRM (Granola / Fathom style), gap-analysis item 5.
// Research: docs/research/tools/deep/d04-meeting-notes-call-intel.md. Granola Basic $0 (30-day history, no
// integrations), Business $14/user/mo (CRM integrations, pre-meeting briefs, follow-up emails); Fathom Team $15-19,
// Business $25-34 (CRM field sync). Transcript accuracy 85-95% (~87% hard conditions) [unverified]. No vendor
// publishes a hallucination rate: 5-10% wrong or unsupported action items on noisy calls is the research note's own
// [design] default. Fathom-style field mapping overwrites on every matching call; Granola documents wrong-record
// matches when the invite email differs from the CRM email.
//
// Operator tiers (gap item 5): stellar reviews each proposed field against the transcript line, pushes only what
// was agreed, sends a recap within 24h (next-step accuracy ~98%, small continuity bonus); good reviews the summary;
// average pushes everything (~7% of next steps wrong); mediocre auto-shares with no review and acts on invented next
// steps (close odds ×0.8 on affected deals, a trust incident every ~20 calls) [design].
import { hash, clamp, words, uid, dayOfMonth } from '../../core/util.js';
import { addRecurring } from '../../core/bank.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { emitSalesEvent } from './events.js';

// Vendor plans (d04, pricing pages accessed 2026-10-14). The paradigms differ:
//   Granola: bot-free, records on your laptop and merges your own jottings; CRM push only on Business ($14/user);
//     known failure: notes match the wrong CRM record when the invite email differs from the CRM email.
//   Fathom: a bot joins the call (some prospects get guarded); generous free tier with no CRM; Team $19/user monthly
//     with a 2-user minimum and HubSpot only; Business $34/user monthly (2-user minimum) adds CRM field sync, which
//     overwrites fields on every matching call (auto-share by default).
//   Gong: quote-only, ~$28k a year for 10 users: OUTDATED for startups below ~10 reps (gtm §6), not offered here.
// `free` / `paid` are the pre-vendor save values (Granola Basic / Business).
export const NOTETAKER = {
  plans: {
    granola_basic: { vendor: 'Granola', label: 'Granola Basic (free, bot-free, 30-day history)', perUser: 0, minSeats: 1, monthly: 0, capture: 'local', push: false, briefs: false, historyDays: 30, crms: [] },
    granola_business: { vendor: 'Granola', label: 'Granola Business ($14/user: CRM push, briefs, recaps)', perUser: 14, minSeats: 1, monthly: 14, capture: 'local', push: true, briefs: true, historyDays: Infinity, wrongRecord: 0.04, crms: ['attio', 'hubspot'] },
    fathom_free: { vendor: 'Fathom', label: 'Fathom Free (bot, unlimited recordings, no CRM)', perUser: 0, minSeats: 1, monthly: 0, capture: 'bot', push: false, briefs: false, historyDays: Infinity, crms: [] },
    fathom_team: { vendor: 'Fathom', label: 'Fathom Team ($19/user, 2-user min, HubSpot only)', perUser: 19, minSeats: 2, monthly: 38, capture: 'bot', push: true, briefs: false, historyDays: Infinity, crms: ['hubspot'] },
    fathom_business: { vendor: 'Fathom', label: 'Fathom Business ($34/user, 2-user min, CRM field sync)', perUser: 34, minSeats: 2, monthly: 68, capture: 'bot', push: true, briefs: true, historyDays: Infinity, autoSync: true, crms: ['hubspot', 'salesforce', 'attio'] },
    free: { legacy: true, vendor: 'Granola', label: 'Free (notes only, 30-day history)', monthly: 0, push: false, briefs: false, historyDays: 30, crms: [] },
    paid: { legacy: true, vendor: 'Granola', label: 'Business ($14/mo: CRM sync, briefs, recap drafts)', monthly: 14, push: true, briefs: true, historyDays: Infinity, wrongRecord: 0.04, crms: ['attio', 'hubspot'] },
  },
  wrongRate: { clean: 0.05, noisy: 0.1 }, // [design] d04 s4
  botEngagementCost: 0.3, // a recording bot makes some prospects guarded [design]
  wrongCloseMult: 0.8, // acting on an invented next step / wrong field [design, gap item 5]
  continuityBonus: 0.04, // reviewed, correct next step carried into the next call [design, +0.03-0.05]
  recapBonus: 0.03, // recap within 24h quoting the prospect [design]
  hours: { manualNotes: 0.2, review: 0.06, pushOnly: 0.03, manualCopy: 0.1, recap: 0.1 }, // manual write-up 10-15 min (d04)
};

const u = (s) => (parseInt(hash(s), 36) % 100000) / 100000;

export function ensureNotetaker(state) {
  const c = (state.apps.calls ??= {});
  c.notetaker ??= { mode: 'off', template: 'discovery', autoShare: false, plan: 'free', recurringId: null };
  return c.notetaker;
}

export function setNotetakerPlan(state, plan) {
  const nt = ensureNotetaker(state);
  const old = state.recurring?.find((r) => r.id === nt.recurringId);
  if (old) old.active = false;
  const P = NOTETAKER.plans[plan];
  if (!P) throw new Error('Unknown notetaker plan');
  nt.plan = plan;
  nt.recurringId = null;
  if (P.capture && nt.mode !== 'off') nt.mode = P.capture; // the vendor decides bot vs bot-free
  if (P.autoSync) nt.autoShare = true; // Fathom field sync writes on every matching call unless you turn it off
  if (P.minSeats > 1) logMistake(state, { functionId: 'discovery_demo', id: 'notetaker_seat_minimum', label: `${P.vendor} team plan for a solo seller`, app: 'calls', key: `ntseats:${plan}`, cost: { usd: P.perUser * (P.minSeats - 1) * 3 }, detail: `${P.label}: the 2-user minimum bills a seat nobody uses. Solo: Granola Business ($14) pushes to Attio/HubSpot; Fathom Free covers recording.` });
  if (P.monthly) {
    post(state, { amount: -P.monthly, counterparty: P.vendor ?? 'Notetaker', description: `${P.label}, first month`, category: 'software', method: 'card' });
    nt.recurringId = addRecurring(state, { vendor: P.vendor ? `${P.vendor} (notetaker)` : 'AI notetaker', amount: P.monthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note: 'Meeting notes → CRM' }).id; // anniversary billing: the first month was just paid
  }
}

const FIELD_LABEL = { budget: 'Budget', timeline: 'Timeline', champion: 'Champion / authority', competitor: 'Current tool / competitor', nextStep: 'Next step' };
const WRONG = {
  budget: (p) => `$${Math.round((p.budgetMonthly ?? 100) * 2.5 / 10) * 10}/month approved`,
  timeline: () => 'Wants to start this month',
  champion: () => 'Decides alone; no one else involved',
  competitor: () => 'Evaluating two other vendors',
  nextStep: () => 'Send the annual proposal with a 20% discount by Friday',
};

/**
 * Generate notes after a call: summary, action items and proposed CRM fields, each with a confidence dot and the
 * transcript line it rests on. Some items are wrong (hidden `wrong`), more on long, noisy calls.
 */
export function generateNotes(state, m, persona, card) {
  const nt = ensureNotetaker(state);
  if (nt.mode === 'off' || !m.transcript?.length) return null;
  const t = m.transcript;
  const noisy = t.length > 28 || t.filter((x) => x.from === 'them' && words(x.text) < 4).length > 4;
  const pWrong = noisy ? NOTETAKER.wrongRate.noisy : NOTETAKER.wrongRate.clean;
  const find = (re) => t.findIndex((x) => x.from === 'them' && re.test(x.text));
  const fields = [];
  const add = (key, value, line) => {
    const wrong = u(`${m.id}|${key}|w`) < pWrong;
    const conf = wrong ? (u(`${m.id}|${key}|c`) < 0.5 ? 'high' : 'low') : (line >= 0 ? 'high' : 'low');
    fields.push({ key, label: FIELD_LABEL[key], value: wrong ? WRONG[key](persona) : value, line: wrong ? Math.floor(u(`${m.id}|${key}|l`) * t.length) : line, conf, wrong, decision: null });
  };
  const bLine = find(/\$\d/);
  if (bLine >= 0) add('budget', t[bLine].text.match(/\$[\d,]+(?:\s*[–-]\s*\$?[\d,]+)?(?:\s*(?:a|per)\s*month)?/)?.[0] ?? 'Range discussed', bLine);
  const tl = find(/timeline|quarter|this year|next month|not urgent/i);
  if (tl >= 0) add('timeline', persona.timeline, tl);
  const au = find(/decid|sign|owner|boss|partner|approv/i);
  if (au >= 0) add('champion', `${persona.authority}; ${persona.decisionProcess}`, au);
  const tool = (String(persona.currentTools ?? 'x').split(' ')[0].trim() || 'x').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // names like "C++" or "(Excel)" are not regex
  const cp = find(new RegExp(`use|${tool}`, 'i'));
  if (cp >= 0) add('competitor', persona.currentTools, cp);
  if (card?.nextStepSecured) add('nextStep', card.nextStep || 'Follow-up call next week', t.length - 1);
  else if (u(`${m.id}|invent`) < pWrong * 2) fields.push({ key: 'nextStep', label: FIELD_LABEL.nextStep, value: WRONG.nextStep(), line: t.length - 1, conf: 'high', wrong: true, decision: null }); // hallucinated
  const items = fields.filter((f) => f.key === 'nextStep').map((f) => ({ text: f.value, owner: 'you', wrong: f.wrong }));
  const said = t.filter((x) => x.from === 'them').map((x) => x.text);
  const notes = {
    id: uid('notes'), day: state.day, template: nt.template, mode: nt.mode, noisy,
    summary: `${persona.name} (${persona.title}). ${persona.hasPain && said.some((x) => words(x) > 12) ? `Pain: ${persona.pain}.` : 'No clear pain stated.'} Today: ${persona.currentTools}. ${card?.nextStepSecured ? `Agreed: ${card.nextStep || 'a follow-up'}.` : 'No dated next step.'}`,
    actionItems: items, fields, status: 'ready', pushedDay: null, recapDay: null,
  };
  m.notes = notes;
  emitSalesEvent(state, 'notes_ready', { meetingId: m.id, dealId: m.dealId, contactId: m.contactId, notesId: notes.id }, `notes:${notes.id}`);
  return notes;
}

/** Can the player still open these notes (free plan keeps 30 days)? */
export const notesVisible = (state, notes) => Boolean(notes) && state.day - notes.day <= NOTETAKER.plans[ensureNotetaker(state).plan].historyDays;

/**
 * Push decided fields to the deal. reviewed: the founder checked the fields against the transcript (decisions set
 * per field); unreviewed pushes everything. Returns { pushed, wrong }.
 */
export function pushNotes(state, m, deal, { reviewed = false, setNextStep, addActivity } = {}) {
  const n = m.notes;
  if (!n || !deal) return { pushed: 0, wrong: 0 };
  // Granola matches notes to CRM records by the invite email; an unreviewed push sometimes lands on the wrong record.
  const P = NOTETAKER.plans[ensureNotetaker(state).plan] ?? {};
  if (!reviewed && P.wrongRecord && u(`${m.id}|rec`) < P.wrongRecord) {
    n.status = 'pushed'; n.pushedDay = state.day; n.reviewed = false; n.wrongRecord = true;
    logMistake(state, { functionId: 'discovery_demo', id: 'notes_wrong_record', label: 'Call notes landed on the wrong CRM record', app: 'calls', key: `wrongrec:${n.id}`, delayed: true, cost: { hours: 0.25 }, detail: 'The invite email differed from the CRM email, so the notes matched another record; this deal kept no next step. Review the match before pushing.' });
    return { pushed: 0, wrong: 0, wrongRecord: true };
  }
  const pushed = n.fields.filter((f) => (reviewed ? f.decision === 'accept' : true));
  deal.fields ??= {};
  let wrong = 0;
  for (const f of pushed) {
    deal.fields[f.key] = { value: f.value, day: state.day, source: 'notetaker', wrong: f.wrong };
    if (f.wrong) wrong++;
    if (f.key === 'nextStep') {
      setNextStep?.(state, deal, f.value, state.day + 3);
      deal.nextStepFromNotes = { wrong: f.wrong, reviewed, day: state.day };
      if (!f.wrong && reviewed) deal.callQuality = clamp((deal.callQuality ?? 0.4) + NOTETAKER.continuityBonus, 0, 1);
    }
  }
  if (wrong) {
    deal.wrongFacts = (deal.wrongFacts ?? 0) + wrong;
    logMistake(state, {
      functionId: 'discovery_demo', id: 'unreviewed_ai_notes', label: 'Pushed wrong AI notes into the CRM', app: 'calls', delayed: true, key: `wrongnotes:${n.id}`,
      cost: { customers: 0.05 * wrong }, detail: `${wrong} field(s) the notetaker got wrong went into the deal (${pushed.filter((f) => f.wrong).map((f) => f.label.toLowerCase()).join(', ')}). Acting on them lowers the odds of closing.`,
    });
  }
  n.status = 'pushed';
  n.pushedDay = state.day;
  n.reviewed = reviewed;
  addActivity?.(state, { type: 'note', text: `Call notes pushed to CRM${reviewed ? ' after review' : ' without review'}: ${pushed.map((f) => `${f.label}: ${f.value}`).join(' · ')}`, dealId: deal.id, companyId: deal.companyId });
  return { pushed: pushed.length, wrong };
}

/** Recap email (from the notes). Within 24h helps; a recap repeating a wrong pushed fact is a trust incident. */
export function sendRecap(state, m, deal) {
  const n = m.notes;
  if (!deal) return null;
  const days = state.day - m.day;
  const wrongInRecap = Object.values(deal.fields ?? {}).some((f) => f.wrong);
  deal.recap = { day: state.day, latency: days, wrong: wrongInRecap };
  if (n) n.recapDay = state.day;
  if (wrongInRecap) {
    deal.callQuality = clamp((deal.callQuality ?? 0.4) - 0.05, 0, 1);
    deal.trustIncident = state.day;
    logMistake(state, { functionId: 'discovery_demo', id: 'unreviewed_ai_notes', label: 'Recap repeated a wrong AI note to the buyer', app: 'calls', key: `recapwrong:${deal.id}:${state.day}`, cost: { reputation: 1, customers: 0.1 }, detail: 'The buyer read a recap with things they never said (wrong price, timeline or next step). Trust drops.' });
  } else if (days <= 1) deal.callQuality = clamp((deal.callQuality ?? 0.4) + NOTETAKER.recapBonus, 0, 1);
  return deal.recap;
}

/** Close-odds multiplier from notes hygiene (used by the deal engine). */
export const notesCloseMult = (deal) => (deal?.wrongFacts ? NOTETAKER.wrongCloseMult : 1);

/** Pre-call brief from earlier notes (paid plan). */
export function preCallBrief(state, meetings, deal) {
  const nt = ensureNotetaker(state);
  if (!NOTETAKER.plans[nt.plan].briefs || !deal) return null;
  const prev = meetings.filter((x) => x.dealId === deal.id && x.notes).sort((a, b) => b.day - a.day)[0];
  if (!prev) return null;
  return { summary: prev.notes.summary, fields: Object.entries(deal.fields ?? {}).map(([k, f]) => `${FIELD_LABEL[k] ?? k}: ${f.value}`) };
}

/** Notes stats for the operator reader: reviewed share, wrong pushed, recap latency. */
export function notesStats(state) {
  const ms = (state.apps.calls?.meetings ?? []).filter((m) => m.notes);
  const pushed = ms.filter((m) => m.notes.status === 'pushed');
  return {
    n: ms.length, pushed: pushed.length, reviewed: pushed.filter((m) => m.notes.reviewed).length,
    wrongPushed: (state.apps.crm?.deals ?? []).reduce((a, d) => a + (d.wrongFacts ?? 0), 0),
    recapsFast: (state.apps.crm?.deals ?? []).filter((d) => d.recap && d.recap.latency <= 1).length,
  };
}
