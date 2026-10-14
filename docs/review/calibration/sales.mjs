// Copied from docs/review/e2e-bots/sales.mjs (+ 'mixed' call skill). Founder-led outbound playbook driven through the real sales modules (CRM/Outreach/Calls/Mail).
import * as L from './lib.mjs';
const R = (process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '';
const M = await import(R + '/apps/sales/model.js');
const E = await import(R + '/apps/sales/engine.js');
const J = await import(R + '/apps/sales/jobs.js');
const SC = await import(R + '/apps/sales/scorecard.js');
const D = await import(R + '/apps/sales/deals.js');
const P = await import(R + '/apps/sales/params.js');
const RP = await import(R + '/apps/sales/replies.js');
const C = await import(R + '/apps/sales/copy.js');
const mail = await import(R + '/core/mail.js');
const cal = await import(R + '/core/calendar.js');
const bank = await import(R + '/core/bank.js');
const { rng, chance, pick, uid } = L.util;

const CORP = ['Northwind', 'Bluefin', 'Altamira', 'Keystone', 'Meridian', 'Pinecrest', 'Halcyon', 'Ironbridge', 'Sable', 'Corvid', 'Lumen', 'Brightwater', 'Cobalt', 'Juniper', 'Oakline', 'Redwood', 'Summit', 'Tidal', 'Vantage', 'Willow'];
const SUF = ['Goods', 'Supply', 'Co', 'Outfitters', 'Labs', 'Studio', 'Collective', 'Brands', 'Trading', 'Works'];
const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Priya', 'Mateo', 'Hana', 'Omar', 'Chloe', 'Lucas', 'Aisha', 'Kenji', 'Sofia', 'Diego'];
const LAST = ['Patel', 'Kim', 'Garcia', 'Nguyen', 'Smith', 'Okafor', 'Rossi', 'Silva', 'Cohen', 'Tanaka', 'Haddad', 'Johnson'];

export const SEQ_STEPS = [
  { subject: 'payouts at {{company}}', delayDays: 0, body: 'Hi {{firstName}},\n\n{{personalization}}\n\nMost stores your size spend 5-6 hours each month matching payouts to orders by hand, and refunds slip through. We match them nightly and flag the misses.\n\nIs month-end reconciliation a headache for you right now?\n\nNot relevant? Just tell me and I will not follow up.\n{{senderName}}' },
  { subject: '', delayDays: 3, body: 'Hi {{firstName}}, one more thought: a store like {{company}} usually finds 1-2 missed refunds a month once payouts are matched automatically. Worth a look?\n\nNot relevant? Just say so.\n{{senderName}}' },
  { subject: '', delayDays: 5, body: 'Hi {{firstName}}, closing the loop. If payouts are not a pain at {{company}}, no worries at all. Should I check back next quarter instead?\n\n{{senderName}}' },
];

export const SEQ_ENT = [
  { subject: 'SOC 2 evidence at {{company}}', delayDays: 0, body: 'Hi {{firstName}},\n\n{{personalization}}\n\nSecurity teams your size spend 300-600 hours a cycle screenshotting AWS and Okta evidence. We pull it nightly via API, map it to SOC 2 controls and flag failing ones.\n\nIs evidence collection a pain for you before the next audit?\n\nNot relevant? Just tell me and I will not follow up.\n{{senderName}}' },
  { subject: '', delayDays: 4, body: 'Hi {{firstName}}, one more thought: teams like {{company}} usually cut access-review time from 3 weeks to 3 days once Okta users sync automatically. Worth a look?\n\nNot relevant? Just say so.\n{{senderName}}' },
  { subject: '', delayDays: 6, body: 'Hi {{firstName}}, closing the loop. If audits are under control at {{company}}, no worries. Should I check back before your next audit window?\n\n{{senderName}}' },
];
export function setupOutbound(g, { inboxes = 2 } = {}) {
  const s = g.state;
  const o = M.ensureOutreach(s);
  M.ensureCrm(s); M.ensureCalls(s);
  if (!L.tryHours(g, 0.25 + 0.15 + 0.75 + 0.1 * inboxes + 0.05 * inboxes + 0.25 * 3, 'Sales: outbound setup')) return false;
  bank.post(s, { amount: -P.SALES.sequencerMonthly, counterparty: 'Sequencer', description: 'Cold email sequencer, first month', category: 'software', method: 'card' });
  bank.addRecurring(s, { vendor: 'Sequencer (cold email)', amount: P.SALES.sequencerMonthly, category: 'software', dayOfMonth: 15 });
  o.sequencer = true;
  bank.post(s, { amount: -P.SALES.domainCostYear, counterparty: 'Domain registrar', description: 'Domain', category: 'software', method: 'card' });
  const d = { id: uid('dom'), name: 'trybotco.com', boughtDay: s.day, auth: { spf: true, dkim: true, dmarc: true }, redirect: true, reputation: 50, log: [] };
  o.domains.push(d);
  for (let i = 0; i < inboxes; i++) o.inboxes.push({ id: uid('ib'), domainId: d.id, address: `alex${i}@trybotco.com`, createdDay: s.day, warmupStartDay: s.day, dailyLimit: 'auto', paused: false, sentTotal: 0 });
  bank.addRecurring(s, { vendor: 'Google Workspace (outbound inboxes)', amount: P.SALES.inboxMonthly * inboxes, category: 'software', dayOfMonth: 3 });
  const q = { id: uid('seq'), name: 'Founder outbound', steps: (s.company.model === 'ent' ? SEQ_ENT : SEQ_STEPS).map((x) => ({ ...x, id: uid('step') })), status: 'active', createdDay: s.day, trackOpens: false, inboxIds: [], judge: {}, stats: { sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0 } };
  o.sequences.push(q);
  L.tryHours(g, P.HOURS.writeStep * 3, 'Sales: writing sequence');
  g.ctx.enqueue('sales:judgeSequence', { sequenceId: q.id });
  g.seqId = q.id;
  return true;
}

// Add one researched + personalized prospect. icpRate = share of the list that is truly in-ICP.
export function addProspect(g, { icpRate = 0.6, warm = false, title = 'Owner' } = {}) {
  const s = g.state;
  const h = P.HOURS.addProspect + P.HOURS.research + P.HOURS.personalize + P.HOURS.verify;
  if (!L.tryHours(g, h, 'Sales: prospecting & research')) return null;
  const co = `${pick(s, CORP)} ${pick(s, SUF)} ${Math.floor(rng(s) * 900 + 100)}`;
  const domain = co.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  const first = pick(s, FIRST), last = pick(s, LAST);
  const inIcp = rng(s) < icpRate;
  let r;
  try {
    r = M.addContact(s, { firstName: first, lastName: last, email: `${first.toLowerCase()}@${domain}`, title, company: co, domain }, { source: warm ? 'network' : 'manual', warm });
  } catch { return null; }
  const { company, contact } = r;
  const words = s.company.icp.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const ent = s.company.model === 'ent';
  company.site = ent && inIcp
    ? { title: co, description: `${co}: payments infrastructure for credit unions`, headings: ['Security & compliance', 'SOC 2 Type II'], text: `${co} is a fintech with 650 employees. Our security and compliance team maintains SOC 2 Type II and PCI DSS; we run quarterly access reviews and annual audits. ${words.slice(0, 4).join(' ')}.` }
    : ent ? { title: co, description: `${co}: a regional marketing agency`, headings: ['Our work'], text: `${co} is a 30-person creative agency. We design campaigns for local brands.` }
    : inIcp
    ? { title: co, description: `${co}: independent online store on Shopify`, headings: ['Free shipping over $50', 'Our bestsellers ship from Ohio'], text: `${co} is an online store with 2,500 orders a month. We use Shopify and our bookkeeper reconciles payouts. ${words.slice(0, 4).join(' ')}. Free shipping over $50. Bestsellers ship from Ohio.` }
    : { title: co, description: `${co}: a local service business`, headings: ['Book an appointment'], text: `${co} offers appointments and consultations in town. Call us to book.` };
  company.research = { ...J.heuristicResearch(s, company), mock: true, day: s.day };
  contact.personalization = ent ? (inIcp ? 'Saw you maintain SOC 2 Type II and PCI DSS with quarterly access reviews at 650 people.' : 'Saw your campaign work for local brands.') : inIcp ? `Saw your bestsellers ship from Ohio with free shipping over $50 at 2,500 orders a month.` : `Saw you take appointments and consultations in town.`;
  contact.personalizationSource = 'player';
  contact.verification = contact.truth;
  bank.post(s, { amount: -P.SALES.verify.costPerEmail, counterparty: 'Email verifier', description: 'Verify 1 address', category: 'software', method: 'card' });
  return contact;
}

export function enroll(g, contacts) {
  const s = g.state;
  const o = M.ensureOutreach(s);
  const ok = contacts.filter((c) => c && c.verification !== 'invalid');
  if (!ok.length) return;
  if (!L.tryHours(g, P.HOURS.enrollBase + ok.length * P.HOURS.enrollPer, 'Sales: enrollment')) return;
  for (const c of ok) {
    o.enrollments.push({ id: uid('enr'), sequenceId: g.seqId, contactId: c.id, step: 0, nextDay: s.day + 1, status: 'active', sent: [], inboxId: null, enrolledDay: s.day });
    if (['new', 'no_reply', 'inbound'].includes(c.status)) c.status = 'enrolled';
    M.ensureDeal(s, { companyId: c.companyId, contactId: c.id, source: 'outbound', stage: 'lead' });
  }
}

// Reply to prospects whose latest message is from them (positive or curious); ask for a short call.
export function workInbox(g) {
  const s = g.state;
  let n = 0;
  for (const t of mail.ensureMail(s).threads) {
    if (t.kind !== 'prospect') continue;
    const last = t.messages.at(-1);
    if (!last || last.from !== 'them') continue;
    const ct = M.contactById(s, t.refId);
    if (!ct || ct.status === 'unsubscribed' || ct.status === 'customer') continue;
    const mine = t.messages.filter((m) => m.from === 'me').length;
    if (mine >= 4 || t._handled === t.messages.length) continue;
    t._handled = t.messages.length;
    if (!RP.isPositive(ct.replyKind ?? 'curious') && ct.replyKind !== 'not_now' && ct.replyKind !== 'objection') continue;
    if (M.openMeetingFor(s, ct.id)) continue;
    const body = 'Thanks for the reply. Short version: it pulls payouts nightly, matches them to orders and flags missed refunds; most stores set it up in 15 minutes. Would a 20-minute call on Tuesday or Wednesday work so I can see how you handle it today?';
    if (!L.tryHours(g, Math.min(0.5, 0.1 + L.util.words(body) / 400), 'Sales: email replies')) break;
    mail.addMessage(s, t.id, { from: 'me', body });
    g.ctx.enqueue('reply:prospect', { threadId: t.id, refId: t.refId });
    n++;
  }
  return n;
}

const CALL_SCRIPT = [
  'Thanks for making time. Tell me about the last time you closed the books, walk me through what happened?',
  'How do you currently handle payout matching, and how much time did that take last month?',
  'What did you try before to fix it, and what did that cost?',
  'Who else is involved in deciding on tools like this, and how do you usually buy software?',
  'What would it need to do for you to switch? Any deal-breakers?',
  'It is live today. Want to set up a 14-day pilot next week with your real data? I can send a calendar invite.',
];
const BAD_SCRIPT = [
  'Hi! Let me show you our product, it automatically matches payouts and our platform is really powerful.',
  'Would you use something like this? How much would you pay for it?',
  'Wouldn\'t it be great to never reconcile by hand again?',
  'So, can we set up a trial next week?',
];

// Run every call that is ready today. skill: 'good' | 'bad'.
export function runCalls(g, skill = 'good') {
  const s = g.state;
  const calls = M.ensureCalls(s);
  for (const m of calls.meetings) {
    if (m.status !== 'ready' || m.day !== s.day) continue;
    const ct = M.contactById(s, m.contactId);
    const co = M.companyById(s, m.companyId) ?? {};
    const persona = RP.personaFor(s, ct, co);
    m.status = 'in_call'; m.transcript = []; m.engagement = 5;
    const ev = M.calendarEvent(s, m);
    if (ev) cal.completeEvent(s, ev.id, 'in_progress');
    const sk = skill === 'mixed' ? (rng(s) < 0.5 ? 'good' : 'bad') : skill;
    const script = sk === 'good' ? CALL_SCRIPT : BAD_SCRIPT;
    script.forEach((text, i) => {
      m.transcript.push({ from: 'me', text });
      const d = SC.heuristicCallReply({ persona, text, turn: i + 1, engagement: m.engagement, shipped: L.market.shippedFeatures(s), price: '' });
      m.transcript.push({ from: 'them', text: d.reply });
      m.engagement = d.engagement;
      if (d.agreedNextStep) m.agreed = true;
    });
    const card = SC.heuristicScorecard(m.transcript);
    if (m.agreed && !card.nextStepSecured) card.nextStepSecured = true;
    m.scorecard = card; m.cardMock = true; m.status = 'held';
    const q = D.callQuality(card);
    const { qualified } = E.applyCallOutcome(s, m, card, q);
    m.qualified = qualified; m.quality = q;
    if (ev) cal.completeEvent(s, ev.id, 'done');
    L.tryHours(g, P.HOURS.followUp * 0.6, 'Sales: post-call notes');
    g.callsHeld = (g.callsHeld ?? 0) + 1;
  }
  // Rebook no-shows once.
  for (const m of calls.meetings) {
    if (m.status !== 'no_show' || m.rebooked || (m.rebookTries ?? 0) >= 1) continue;
    if (!L.tryHours(g, P.HOURS.reschedule, 'Sales: rescheduling')) break;
    m.rebookTries = 1;
    if (chance(s, P.SALES.rebookAfterNoShow)) {
      const slot = M.nextSlot(s, { minLead: 1, duration: m.duration });
      if (slot) m.rebooked = M.createMeeting(s, { contactId: m.contactId, slot, kind: m.kind, source: m.source, duration: m.duration }).id;
    }
  }
}

// Send proposals for qualified deals.
export function proposals(g, { quantity = 1, annual = false, discountPct = 0 } = {}) {
  const s = g.state;
  for (const deal of M.ensureCrm(s).deals) {
    if (deal.stage !== 'qualified') continue;
    if (!L.tryHours(g, s.company.model === 'ent' ? P.HOURS.proposalEnt : P.HOURS.proposalSmb, 'Sales: proposals')) break;
    M.startProposal(s, deal, { planId: L.market.mainPlan(s).id, quantity, annual, discountPct });
  }
}

export function funnel(g) {
  const s = g.state;
  const o = s.apps.outreach;
  const crm = s.apps.crm;
  const q = o?.sequences?.[0]?.stats ?? {};
  const meetings = s.apps.calls?.meetings ?? [];
  return {
    prospects: crm?.contacts?.length ?? 0, sent: q.sent, replies: q.replies, positive: q.positive,
    meetingsBooked: meetings.length, held: meetings.filter((m) => m.status === 'held').length, noShow: meetings.filter((m) => m.status === 'no_show').length,
    qualified: meetings.filter((m) => m.qualified).length,
    proposals: crm?.deals?.filter((d) => d.history.some((h) => h.stage === 'proposal')).length ?? 0,
    won: crm?.deals?.filter((d) => d.stage === 'won').length ?? 0,
    lostReasons: Object.entries((crm?.deals ?? []).filter((d) => d.stage === 'lost').reduce((a, d) => { a[d.lostReason] = (a[d.lostReason] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4),
  };
}

// CRM → Inbound → "Accept" (UI handler replica, crm.js data-accept; HOURS.triage). The reply then goes through workInbox().
export function triageInbound(g) {
  const s = g.state;
  const crm = s.apps.crm;
  if (!crm?.inboundQueue?.length) return 0;
  let n = 0;
  for (const q of crm.inboundQueue) {
    if (q.status !== 'new') continue;
    const c = M.contactById(s, q.contactId);
    if (!c) { q.status = 'dismissed'; continue; }
    if (!L.tryHours(g, P.HOURS.triage, 'Sales: inbound triage')) break;
    q.status = 'accepted'; c.status = 'interested'; c.replyKind = 'inbound'; c.lastThemDay = q.day;
    M.ensureDeal(s, { companyId: c.companyId, contactId: c.id, source: q.source === 'inbound' ? 'inbound' : q.source, stage: 'replied' });
    const th = mail.newThread(s, { subject: `Demo request: ${M.companyById(s, c.companyId)?.name ?? c.firstName ?? 'lead'}`, with: { name: c.firstName ?? 'Lead', email: c.email }, kind: 'prospect', app: 'crm', refId: c.id });
    const m = mail.addMessage(s, th.id, { from: 'them', body: q.note || `Hi, I filled in the form on your site. Can you tell me more about how ${s.company.name} works?` });
    m.day = q.day; c.threadId = th.id;
    n++;
  }
  return n;
}
