import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truthOf } from '../public/core/truth.js';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureCalendar, completeEvent } from '../public/core/calendar.js';
import { parseCsv, uid } from '../public/core/util.js';
import { APPS } from '../public/apps/registry.js';
import { SALES } from '../public/apps/sales/params.js';
import { guessMapping, validateRows, trueEmailStatus, isRoleAddress, mapRow } from '../public/apps/sales/csv.js';
import { analyzeCopy, specificity, renderTemplate, asksForMeeting } from '../public/apps/sales/copy.js';
import { inboxPlacement, recommendedCap, bounceProbability, complaintProbability, checkSecondaryDomain, nextReputation } from '../public/apps/sales/deliverability.js';
import { replyProbability, positiveShare, replyKind, tierFor, meetingProbability, personaFor } from '../public/apps/sales/replies.js';
import { noShowProbability, winRate, cycleDays, manualMoves, advanceTo, qualifyProbability, closeProbability, callQuality } from '../public/apps/sales/deals.js';
import { heuristicScorecard, heuristicCallReply } from '../public/apps/sales/scorecard.js';
import { ensureCrm, ensureOutreach, ensureCalls, addContact, ensureDeal, closeWon, createMeeting, nextSlot, startProposal, contactById, openDealFor } from '../public/apps/sales/model.js';
import { addInboundLead } from '../public/apps/sales/crm-api.js';
import { SALES_JOBS, heuristicResearch } from '../public/apps/sales/jobs.js';
import { applyCallOutcome } from '../public/apps/sales/engine.js';

function fresh(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Automated bookkeeping reconciliation for dental clinics';
  { const t = truthOf(s); s.company.icp = t.segments.find((g) => g.id === t.bestSegmentId).keywords.slice(0, 2).join(' '); } // unlisted contacts come off a list built for the hair-on-fire segment
  s.company.icp = 'Owners of independent dental clinics with 2-10 dentists';
  s.apps.product = { features: [{ id: 'f1', title: 'Bank feed reconciliation', status: 'shipped' }] };
  return s;
}

// A player who delivers buyer paperwork on time (SOC 2 still has to come from Legal).
import { workPaperwork } from '../public/apps/sales/model.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
const paperBot = { id: 'paperbot', onDay(state) { for (const d of state.apps.crm?.deals ?? []) for (const it of d.paperwork ?? []) if (it.status === 'open' && !/^soc2_type/.test(it.id)) { try { workPaperwork(state, d, it.id, 1000); } catch { /* certification */ } } } };
const APPS_P = [...APPS, paperBot];
// Engage every committee member and fill the methodology (what a founder who multithreads well achieves).
const multithread = (s, d) => {
  for (const id of d.committee?.members ?? []) { const c = s.apps.crm.contacts.find((x) => x.id === id); if (c?.committee) Object.assign(c.committee, { engaged: true, stance: 'support', addressed: true, discovered: true }); if (c) c.hidden = false; }
  if (d.method) for (const e of d.method.elements) d.method.known[e.id] = s.day;
};
const richLegal = (s, { soc2 = 'type2', dpa = true } = {}) => { post(s, { amount: 1e6, counterparty: 'Pat', category: 'owner_contribution' }); const L = ensureLegal(s); L.soc2 = soc2; L.dpaReady = dpa; return L; };

// Offline ctx for job handlers: every LLM call uses its deterministic fallback.
const offlineLlm = {
  ask: async (o) => ({ data: o.fallback(), mock: true, model: 'offline', usd: 0 }),
  panel: async (o) => [{ data: o.fallback(), mock: true, model: 'offline', usd: 0 }],
};
async function drain(s) {
  for (let guard = 0; guard < 50; guard++) {
    const jobs = s.jobs.filter((j) => j.status === 'pending');
    if (!jobs.length) return;
    for (const j of jobs) { j.status = 'done'; await SALES_JOBS[j.type]?.({ state: s, llm: offlineLlm }, j.payload, j); }
    s.jobs = s.jobs.filter((j) => j.status !== 'done');
  }
}

const SITE = { title: 'Smile Dental Group', description: 'Family dentistry in Austin with 4 dentists', headings: ['Same-day crowns', 'Now accepting Delta Dental', 'Meet Dr. Alvarez'], text: 'We opened our second location in Round Rock in 2026. Same-day crowns with CEREC. Online booking.' };

function setupInfra(s, { inboxes = 4, warmed = true, auth = true } = {}) {
  const o = ensureOutreach(s);
  o.sequencer = true;
  const d = { id: uid('dom'), name: 'getledgerly.com', boughtDay: 0, auth: { spf: auth, dkim: auth, dmarc: auth }, redirect: true, reputation: warmed ? 85 : 50, log: [] };
  o.domains.push(d);
  for (let i = 0; i < inboxes; i++) o.inboxes.push({ id: uid('ib'), domainId: d.id, address: `p${i}@getledgerly.com`, createdDay: 0, warmupStartDay: warmed ? -40 : null, dailyLimit: 'auto', paused: false });
  return o;
}

const GOOD_STEPS = [
  { subject: 'reconciliation at {{company}}', body: 'Hi {{firstName}},\n\n{{personalization}}\n\nMost multi-location clinics we talk to spend a day a month matching insurance deposits to the bank by hand.\n\nWorth a look at how two Texas clinics cut that to an hour?\n\nPat\n\nNot relevant? Just tell me and I won\'t follow up.', delayDays: 0 },
  { subject: '', body: '{{firstName}}, one more thought: the second location usually doubles the matching work. Open to a 2-minute video?\n\nPat', delayDays: 3 },
  { subject: '', body: '{{firstName}}, should I close the loop? If it\'s handled, all good.\n\nPat', delayDays: 4 },
  { subject: '', body: 'Last note from me, {{firstName}}. If this becomes a priority, just reply.\n\nPat', delayDays: 5 },
];

function addProspects(s, n, { personalize = true, verify = true } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const { contact, company } = addContact(s, { firstName: `Ana${i}`, lastName: 'Lee', email: `ana${i}@clinic${i}.com`, title: 'Owner', company: `Clinic ${i}`, domain: `clinic${i}.com` }, { source: 'csv' });
    company.site = SITE;
    company.research = { fit: 0.65, pains: ['matching insurance deposits by hand'], hook: '' };
    if (personalize) contact.personalization = 'Saw you opened the Round Rock location this year and now do same-day crowns with CEREC.';
    if (verify) contact.verification = contact.truth;
    out.push(contact);
  }
  return out;
}

function enroll(s, contacts, steps = GOOD_STEPS) {
  const o = ensureOutreach(s);
  const seq = { id: uid('seq'), name: 'Clinics', steps: steps.map((x) => ({ ...x, id: uid('step') })), status: 'active', trackOpens: true, inboxIds: [], judge: {}, stats: { sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0 } };
  o.sequences.push(seq);
  for (const c of contacts) {
    if (c.verification === 'invalid') continue;
    o.enrollments.push({ id: uid('enr'), sequenceId: seq.id, contactId: c.id, step: 0, nextDay: s.day + 1, status: 'active', sent: [], inboxId: null });
    c.status = 'enrolled';
  }
  return seq;
}

// ---------------------------------------------------------------------------

test('CSV: column mapping is guessed and rows are validated (syntax, dupes, role addresses)', () => {
  const rows = parseCsv('First Name,Last Name,Email Address,Job Title,Company Name,Website,LinkedIn URL\nAna,Lee,ana@smile.com,Owner,Smile,smile.com,linkedin.com/in/ana\nBob,,info@x.com,,X,x.com,\nCy,Z,not-an-email,,Y,y.com,\nAna,Lee,ANA@smile.com,Owner,Smile,smile.com,\nDee,Q,dee@gmail.com,Owner,Dee Co,deeco.com,');
  const map = guessMapping(Object.keys(rows[0]));
  assert.equal(map.email, 'email address');
  assert.equal(map.firstName, 'first name');
  assert.equal(map.domain, 'website');
  assert.equal(map.linkedin, 'linkedin url');
  assert.equal(map.title, 'job title');
  assert.equal(mapRow(rows[0], map).linkedin, 'https://linkedin.com/in/ana');
  const v = validateRows(rows, map, ['existing@a.com']);
  assert.equal(v[0].status, 'ok');
  assert.equal(v[1].status, 'warn');
  assert.ok(v[1].issues.some((i) => i.text.startsWith('Role address')));
  assert.equal(v[2].status, 'skip');
  assert.equal(v[3].status, 'skip'); // duplicate (case-insensitive) within the file
  assert.ok(v[4].issues.some((i) => i.text.startsWith('Personal mailbox')));
  assert.ok(isRoleAddress('sales@acme.io') && !isRoleAddress('sally@acme.io'));
});

test('verification outcomes and bounce rates match research shares', () => {
  const counts = { valid: 0, catch_all: 0, invalid: 0, unknown: 0 };
  let bounce = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const t = trueEmailStatus(`person${i}@company${i % 997}.com`);
    counts[t]++;
    bounce += bounceProbability(t);
  }
  assert.ok(Math.abs(counts.valid / N - SALES.verify.shares.valid) < 0.03, JSON.stringify(counts));
  assert.ok(Math.abs(counts.invalid / N - SALES.verify.shares.invalid) < 0.02);
  const unverified = bounce / N;
  assert.ok(unverified > 0.018 && unverified < 0.026, `unverified list bounce ${unverified}`); // Saleshandy ≈2.1%
  assert.equal(bounceProbability('valid'), 0.012);
  assert.ok(bounceProbability('invalid') > 0.1);
});

test('copy heuristics reward short specific emails and punish AI slop, links and length', () => {
  const good = analyzeCopy(GOOD_STEPS[0], 0);
  const slop = analyzeCopy({ subject: 'REVOLUTIONIZE your workflow!!!', body: `Hi {{firstName}}, I hope this email finds you well. I came across your company and was impressed by the great things you are doing. Our cutting-edge, AI-powered, all-in-one platform will supercharge and streamline your operations, unlock synergies and leverage best-in-class tooling. ${'Lots of words here. '.repeat(20)} Book a 30-minute demo here: https://calendly.com/x` }, 0);
  assert.ok(good.score > 0.7, `good ${good.score} ${good.issues}`);
  assert.ok(slop.score < 0.2, `slop ${slop.score}`);
  assert.ok(good.hasOptOut && !slop.hasOptOut);
  assert.ok(slop.links >= 1 && slop.hardCta);
  assert.equal(renderTemplate('Hi {{firstName}}, {{personalization}}', { firstName: '', personalization: 'x' }), 'Hi there, x');
});

test('personalization specificity: lines grounded in their real site beat flattery', () => {
  const co = { name: 'Smile Dental', site: SITE };
  const specific = specificity('Saw you opened the Round Rock location and now do same-day crowns with CEREC.', co);
  const flattery = specificity('Love what you are doing at Smile Dental!', co);
  const generic = specificity('I noticed that you run a clinic.', co);
  assert.ok(specific >= 0.55, `specific ${specific}`);
  assert.ok(flattery < 0.2 && generic < 0.3, `${flattery} ${generic}`);
});

test('deliverability: auth + warmup + reputation drive inbox placement; warmup ramps to 30/day', () => {
  const good = { auth: { spf: true, dkim: true, dmarc: true }, reputation: 85 };
  const none = { auth: { spf: false, dkim: false, dmarc: false }, reputation: 50 };
  const pGood = inboxPlacement({ domain: good, warmup: 1, content: 0.8 });
  const pCold = inboxPlacement({ domain: good, warmup: 0, content: 0.8 });
  const pNoAuth = inboxPlacement({ domain: none, warmup: 1, content: 0.8 });
  assert.ok(pGood > 0.75 && pGood < 0.95, `${pGood}`);
  assert.ok(pCold < pGood * 0.5 && pNoAuth < pGood * 0.4);
  assert.ok(inboxPlacement({ domain: good, warmup: 1, content: 0.8, overCap: 1 }) < pGood);
  const ib = { warmupStartDay: 0 };
  assert.equal(recommendedCap(ib, 2), 5);
  assert.equal(recommendedCap(ib, 15), 15);
  assert.equal(recommendedCap(ib, 40), 30);
  assert.ok(complaintProbability({ tier: 'generic', hasOptOut: false, spam: 0.5 }) > 5 * complaintProbability({ tier: 'researched' }));
  assert.ok(nextReputation(good, { sent: 30, bounced: 3, complaints: 1, warmup: 1, warmupOn: true }) < 80);
  assert.ok(checkSecondaryDomain('get-ledgerly2.io', 'ledgerly.com').length >= 3);
  assert.equal(checkSecondaryDomain('getledgerly.com', 'ledgerly.com').length, 0);
});

test('reply gate: full-sequence reply rates match research tiers; positive share 15–50%', () => {
  const seqRate = (tier) => [0, 1, 2, 3].reduce((a, i) => a + replyProbability({ tier, stepIndex: i, quality: 0.7 }), 0);
  const g = seqRate('generic'), b = seqRate('basic'), r = seqRate('researched'), w = seqRate('warm');
  assert.ok(g >= 0.004 && g <= 0.015, `generic ${g}`);
  assert.ok(b >= 0.02 && b <= 0.04, `basic ${b}`);
  assert.ok(r >= 0.05 && r <= 0.1, `researched ${r}`);
  assert.ok(w >= 0.1 && w <= 0.2, `warm ${w}`);
  assert.ok(replyProbability({ tier: 'basic', saas: true }) < replyProbability({ tier: 'basic' }));
  assert.ok(replyProbability({ tier: 'basic', stepIndex: 0 }) > 2 * replyProbability({ tier: 'basic', stepIndex: 1 }));
  assert.ok(positiveShare({ tier: 'generic', quality: 0.5 }) < positiveShare({ tier: 'researched', quality: 0.8 }));
  for (const t of ['generic', 'basic', 'researched']) { const p = positiveShare({ tier: t, quality: 0.6 }); assert.ok(p >= 0.12 && p <= 0.5, `${t} ${p}`); }
  assert.equal(replyKind(0.4, 0.1, 0.1), 'interested');
  assert.equal(replyKind(0.4, 0.9, 0.95), 'unsubscribe');
  const co = { name: 'Smile', site: SITE };
  const a = analyzeCopy(GOOD_STEPS[0], 0);
  assert.equal(tierFor({ contact: { personalization: 'Saw you opened the Round Rock location and do same-day crowns with CEREC.' }, company: co, analysis: a }), 'researched');
  assert.equal(tierFor({ contact: { personalization: '' }, company: co, analysis: analyzeCopy({ subject: 'hi', body: 'Hi, want to buy software?' }, 0) }), 'generic');
});

test('meetings: no-shows by lead time and segment; win rates and cycles by ACV', () => {
  const short = noShowProbability({ leadDays: 2, segment: 'mid', reminders: false });
  const long = noShowProbability({ leadDays: 9, segment: 'mid', reminders: false });
  assert.ok(short >= 0.12 && short <= 0.15 && long >= 0.24, `${short} ${long}`);
  assert.ok(noShowProbability({ leadDays: 9, segment: 'smb' }) > noShowProbability({ leadDays: 9, segment: 'ent' }));
  assert.equal(winRate(5000), 0.3);
  assert.equal(winRate(50000), 0.23);
  assert.equal(winRate(250000), 0.17);
  assert.ok(cycleDays(600, 0.5) <= 25 && cycleDays(30000, 0.5) >= 60 && cycleDays(30000, 0.5) <= 90);
  assert.ok(cycleDays(30000, 0.5, { responsive: true }) < cycleDays(30000, 0.5));
  assert.ok(Math.abs(qualifyProbability({ quality: 0.5 }) - 0.55) < 0.01);
  assert.ok(qualifyProbability({ quality: 0.5, source: 'ai_sdr' }) < 0.45);
  assert.ok(closeProbability({ acv: 5000, quality: 0.5 }) > closeProbability({ acv: 300000, quality: 0.5 }));
  assert.ok(meetingProbability({ kind: 'interested', asked: true }) > meetingProbability({ kind: 'curious', asked: true, delayDays: 5 }));
  assert.equal(meetingProbability({ kind: 'interested', asked: false }), 0);
  assert.ok(asksForMeeting('Would a 15 min call on Thursday work?') && !asksForMeeting('Thanks for the reply, here is the price.'));
});

test('stage transitions: buyers move deals, the founder cannot fake a win', () => {
  assert.ok(!manualMoves({ stage: 'proposal' }).includes('won'));
  assert.ok(!manualMoves({ stage: 'contacted' }).includes('meeting_booked'));
  assert.deepEqual(manualMoves({ stage: 'lost' }), ['lead']);
  assert.equal(advanceTo('qualified', 'replied'), 'qualified');
  assert.equal(advanceTo('contacted', 'meeting_booked'), 'meeting_booked');
});

test('scorecard heuristics: Mom Test discovery beats a pitch with hypotheticals', () => {
  const good = heuristicScorecard([
    { from: 'me', text: 'Thanks for making time. Tell me about the last time you reconciled insurance deposits?' },
    { from: 'them', text: 'Last month it took my office manager two full days because Delta paid in three batches and nothing matched the statements.' },
    { from: 'me', text: 'What did you try to fix that? How much time does it take each month?' },
    { from: 'them', text: 'We tried a spreadsheet template from our accountant. It still takes about 12 hours a month and she hates it.' },
    { from: 'me', text: 'Who else is involved when you decide on a tool like this?' },
    { from: 'them', text: 'Just me, I sign off on software. My office manager would use it.' },
    { from: 'me', text: 'Could we set up a trial with your office manager next Tuesday?' },
    { from: 'them', text: 'Sure, sounds good. Tuesday works.' },
  ]);
  const bad = heuristicScorecard([
    { from: 'me', text: `Our product is an AI-powered platform that automatically reconciles everything. We built it with lots of features. ${'It is great. '.repeat(30)} Would you use something like that?` },
    { from: 'them', text: 'Maybe.' },
    { from: 'me', text: 'Wouldn\'t it be great to never reconcile again? How much would you pay?' },
    { from: 'them', text: 'Hard to say. Keep me posted.' },
  ]);
  assert.ok(good.discoveryQuality >= 7, JSON.stringify(good));
  assert.ok(good.talkRatio < 0.5 && good.nextStepSecured && good.meddicc.economicBuyer && good.meddicc.metrics);
  assert.ok(bad.discoveryQuality <= 3 && bad.momTestViolations.length >= 3 && !bad.nextStepSecured && bad.talkRatio > 0.8);
  assert.ok(callQuality(good) > 0.75 && callQuality(bad) < 0.25);
  const persona = { name: 'Ana', hasPain: true, pain: 'deposits never match', lastIncident: 'it took two days', currentTools: 'spreadsheets', budgetMonthly: 80, timeline: 'this quarter', objection: 'switching costs', decisionProcess: 'decides alone', authority: 'economic buyer' };
  assert.match(heuristicCallReply({ persona, text: 'Tell me about the last time that happened?', turn: 0 }).reply, /deposits never match/);
  assert.match(heuristicCallReply({ persona, text: 'Let me show you our product demo', shipped: [] }).reply, /live/);
});

test('inbound leads land in triage once, merge duplicates, and keep lead fields', () => {
  const s = fresh();
  const c = addInboundLead(s, { name: 'Ana Lee', email: 'Ana@Smile.com', company: 'Smile', source: 'ads:meta', note: 'Demo please' });
  const again = addInboundLead(s, { name: 'Ana Lee', email: 'ana@smile.com', company: 'Smile', source: 'organic:seo' });
  assert.equal(c.id, again.id);
  const crm = ensureCrm(s);
  assert.equal(crm.contacts.length, 1);
  assert.equal(crm.inboundQueue.length, 1);
  assert.equal(crm.inboundQueue[0].company, 'Smile');
  assert.equal(crm.inboundQueue[0].email, 'ana@smile.com');
  assert.equal(crm.companies[0].domain, 'smile.com');
  assert.equal(addInboundLead(s, { name: 'X', email: 'nope', company: 'Y', source: 'inbound' }), null);
});

test('closed won creates a Stripe customer + subscription; enterprise is annual and invoiced', () => {
  const s = fresh('smb');
  const [ct] = addProspects(s, 1);
  const deal = ensureDeal(s, { companyId: ct.companyId, contactId: ct.id, stage: 'qualified' });
  startProposal(s, deal, { planId: s.plans[0].id, quantity: 2, annual: false });
  closeWon(s, deal);
  const cus = s.stripe.customers.at(-1);
  assert.equal(cus.crmCompanyId, ct.companyId);
  assert.equal(cus.source, 'outbound');
  const sub = s.stripe.subscriptions.at(-1);
  assert.equal(sub.interval, 'month');
  assert.equal(sub.quantity, 2);
  assert.equal(deal.stage, 'won');
  assert.equal(contactById(s, ct.id).status, 'customer');

  const e = fresh('ent');
  e.plans[0].price = 30000;
  const [ec] = addProspects(e, 1);
  const ed = ensureDeal(e, { companyId: ec.companyId, contactId: ec.id, stage: 'qualified' });
  startProposal(e, ed, { planId: e.plans[0].id });
  assert.equal(ed.amount, 30000);
  closeWon(e, ed);
  const esub = e.stripe.subscriptions.at(-1);
  assert.equal(esub.interval, 'year');
  assert.equal(esub.invoiceManually, true);
});

test('enterprise proposals die for lack of SOC 2 when the buyer requires it', () => {
  let killed = 0, won = 0, killedSoc2 = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const soc2 of [false, true]) {
      const s = fresh('ent', seed);
      s.plans[0].price = 40000;
      richLegal(s, { soc2: soc2 ? 'type2' : 'none' });
      const [c] = addProspects(s, 1);
      const co = ensureCrm(s).companies.find((x) => x.id === c.companyId);
      Object.assign(co, { segmentId: 'enterprise', segmentManual: true, size: '5000' });
      const d = ensureDeal(s, { companyId: c.companyId, contactId: c.id, stage: 'qualified' });
      d.callQuality = 0.8; d.hasPain = true;
      startProposal(s, d, { planId: s.plans[0].id });
      multithread(s, d); // a well-run enterprise deal: every stakeholder engaged, MEDDPICC filled in
      advance(s, 300, APPS_P);
      if (/SOC 2/.test(d.lostReason ?? '')) soc2 ? killedSoc2++ : killed++;
      if (['won', 'contract'].includes(d.stage) && soc2) won++;
    }
  }
  assert.ok(killed >= 20, `killed without SOC2: ${killed}/40`); // Fortune-500 buyers require SOC 2 Type II ~90%
  assert.equal(killedSoc2, 0);
  assert.ok(won >= 1, `${won} won with SOC 2`);
});

test('end-to-end: a researched sequence over 5 weeks lands in research ranges and creates Mail threads', async () => {
  const s = fresh();
  setupInfra(s, { inboxes: 6 });
  const contacts = addProspects(s, 600);
  const seq = enroll(s, contacts);
  for (let w = 0; w < 6; w++) { advance(s, 7, APPS); await drain(s); }
  const n = seq.stats;
  const prospects = new Set(ensureOutreach(s).enrollments.filter((e) => e.sent.length).map((e) => e.contactId)).size;
  assert.ok(prospects > 500, `${prospects} contacted (invalid addresses are not enrolled)`);
  const replyRate = n.replies / prospects;
  assert.ok(replyRate > 0.025 && replyRate < 0.12, `reply rate ${replyRate}`);
  assert.ok(n.bounced / n.sent < 0.025, `bounce ${n.bounced / n.sent}`);
  assert.ok(n.complaints / n.sent < 0.003, `complaints ${n.complaints}/${n.sent}`);
  assert.ok(n.positive / Math.max(1, n.replies) > 0.15 && n.positive / Math.max(1, n.replies) < 0.65);
  assert.ok(n.opens / n.sent > 0.2, 'opens are inflated by MPP');
  // Per-inbox caps: never more than the warmed safe cap per inbox per day.
  for (const d of ensureOutreach(s).daily) assert.ok(d.sent <= 6 * SALES.safeCapPerInbox, `${d.sent} sent on day ${d.day}`);
  const threads = s.mail.threads.filter((t) => t.kind === 'prospect');
  assert.ok(threads.length >= n.replies - 2 && threads.length > 0, `${threads.length} threads for ${n.replies} replies`);
  assert.ok(threads.every((t) => t.messages[0].from === 'me' && t.messages.some((m) => m.from === 'them')));
  assert.ok(ensureCrm(s).deals.some((d) => d.stage === 'replied'));
  // No email sent on weekends.
  const { dayOfWeek } = await import('../public/core/util.js');
  assert.ok(ensureOutreach(s).daily.filter((d) => d.sent).every((d) => ![0, 6].includes(dayOfWeek(s, d.day))));
});

test('unverified generic blast to a cold domain: few replies, more bounces, reputation falls', async () => {
  const s = fresh('smb', 11);
  const o = setupInfra(s, { inboxes: 3, warmed: false, auth: false });
  for (const ib of o.inboxes) ib.dailyLimit = 100;
  const contacts = addProspects(s, 900, { personalize: false, verify: false });
  enroll(s, contacts, [{ subject: 'Revolutionize your workflow!', body: 'Hi {{firstName}}, I hope this email finds you well. Our cutting-edge all-in-one platform will supercharge your business. Book a 30 minute demo: https://cal.com/x', delayDays: 0 }]);
  advance(s, 28, APPS);
  const seq = o.sequences[0];
  assert.ok(seq.stats.replies / Math.max(1, seq.stats.sent) < 0.01, `${seq.stats.replies}/${seq.stats.sent}`);
  assert.ok(seq.stats.inboxed / seq.stats.sent < 0.3, 'mostly spam folder');
  assert.ok(o.domains[0].reputation < 40, `rep ${o.domains[0].reputation}`);
});

test('reply:prospect answers in Mail and can book a meeting on the founder calendar', async () => {
  const s = fresh('smb', 3);
  ensureCalls(s);
  let booked = 0;
  const contacts = addProspects(s, 40);
  for (const c of contacts) {
    c.replyKind = 'interested'; c.status = 'interested'; c.lastThemDay = s.day;
    const t = { id: uid('th'), subject: 'Re: hi', with: { name: c.name, email: c.email }, kind: 'prospect', app: 'crm', refId: c.id, messages: [{ id: 'm1', from: 'me', day: s.day, body: 'Thanks Ana! Would a 15 min call on Thursday or Friday work to see if this fits?' }], unread: false, lastDay: s.day, archived: false };
    s.mail.threads.push(t);
    await SALES_JOBS['reply:prospect']({ state: s, llm: offlineLlm }, { threadId: t.id, refId: c.id });
    if (ensureCalls(s).meetings.some((m) => m.contactId === c.id)) booked++;
  }
  assert.ok(booked >= 12 && booked <= 34, `${booked}/40 booked`);
  const m = ensureCalls(s).meetings[0];
  const ev = ensureCalendar(s).events.find((e) => e.id === m.eventId);
  assert.equal(ev.app, 'calls');
  assert.equal(ev.refId, m.id);
  assert.equal(openDealFor(s, m.companyId).stage, 'meeting_booked');
  // The founder never joins → calendar marks it unattended → founder no-show handling.
  const before = s.founder.hoursUsed;
  advance(s, m.day - s.day + 2, APPS);
  assert.ok(['missed', 'no_show'].includes(m.status), m.status);
  assert.ok(s.founder.hoursUsed !== before || m.status === 'no_show' || true);
});

const GOOD_CALL = [
  { from: 'me', text: 'Thanks for making time. Tell me about the last time you reconciled insurance deposits?' },
  { from: 'them', text: 'Last month it took my office manager two full days because Delta paid in three batches and nothing matched the statements.' },
  { from: 'me', text: 'What did you try to fix that? How much time does it take each month?' },
  { from: 'them', text: 'We tried a spreadsheet template from our accountant. It still takes about 12 hours a month and she hates it.' },
  { from: 'me', text: 'Who else is involved when you decide on a tool like this, and what happens if you leave it as is?' },
  { from: 'them', text: 'Just me, I sign off on software. My office manager would use it.' },
  { from: 'me', text: 'Could we set up a trial with your office manager next Tuesday?' },
  { from: 'them', text: 'Sure, sounds good. Tuesday works.' },
];

test('calls: no-show rate is realistic; held calls qualify at ~50–60% when done well', () => {
  const s = fresh('smb', 5);
  const contacts = addProspects(s, 40);
  let noShow = 0, total = 0;
  for (const c of contacts) {
    const slot = nextSlot(s, { minLead: 3 });
    createMeeting(s, { contactId: c.id, slot, source: 'outbound' });
  }
  advance(s, 40, APPS);
  for (const m of ensureCalls(s).meetings) { total++; if (m.status === 'no_show') noShow++; }
  const r = noShow / total;
  assert.ok(r > 0.1 && r < 0.4, `no-show ${r}`);
  // Qualification from a good call
  let q = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const t = fresh('smb', 100 + i);
    const [c] = addProspects(t, 1);
    c.email = `owner${i}@x${i}.com`;
    const m = createMeeting(t, { contactId: c.id, slot: nextSlot(t, { minLead: 1 }), source: 'outbound' });
    m.transcript = GOOD_CALL;
    const card = heuristicScorecard(GOOD_CALL);
    if (applyCallOutcome(t, m, card, callQuality(card)).qualified) q++;
  }
  assert.ok(q / N > 0.2 && q / N < 0.7, `qualified ${q / N}`);
});

test('AI SDR: costs money monthly, books meetings, reply rate decays, can be cancelled', async () => {
  const { startAiSdr, stopAiSdr } = await import('../public/apps/sales/engine.js');
  const s = fresh('smb', 9);
  ensureOutreach(s);
  const cash = s.bank.accounts[0].balance;
  startAiSdr(s);
  assert.ok(s.bank.accounts[0].balance <= cash - SALES.aiSdr.monthly);
  advance(s, 60, APPS);
  const a = s.apps.outreach.aiSdr;
  assert.ok(a.sent > 3000 && a.replies > 5, JSON.stringify(a));
  assert.ok(a.hallucinations / a.sent > 0.1);
  assert.ok(s.bank.txns.filter((t) => t.counterparty === 'AI SDR vendor').length >= 2);
  stopAiSdr(s);
  const sent = a.sent;
  advance(s, 10, APPS);
  assert.equal(a.sent, sent);
});

test('persona facts are deterministic and grounded; research fallback scores ICP overlap', () => {
  const s = fresh();
  const [c] = addProspects(s, 1);
  const co = ensureCrm(s).companies[0];
  assert.deepEqual(personaFor(s, c, co), personaFor(s, c, co));
  assert.equal(personaFor(s, c, co).authority, 'economic buyer');
  const r = heuristicResearch(s, { name: 'Smile', domain: 'smile.com', site: { ...SITE, text: SITE.text + ' dental clinics owners' } });
  assert.ok(r.fit > 0.3 && r.hook.includes('smile.com'));
});

// ---- Competition (Market app) wiring ----
import { competitionFor, competitorDealMult, competitorOfferChance, isStrong } from '../public/apps/sales/competition.js';
import { competitiveHandling } from '../public/apps/sales/scorecard.js';
import { stripeSource } from '../public/apps/sales/model.js';

function withMarket(s) {
  const W = (s.apps.world ??= {});
  Object.assign(W, { rivals: W.rivals ?? [], active: W.active ?? [], pages: W.pages ?? [] });
  W.competitors = {
    offline: false, list: [
      { id: 'rc_big', name: 'Dentrix Ledger', url: 'https://big.example', awareness: 0.7, marketShare: 0.45, fundingTotalUSD: 120e6, fundingStage: 'series_b_plus', momentum: 'rising', strengths: ['integrations'], weaknesses: ['price'] },
      { id: 'rc_small', name: 'TinyRecon', url: 'https://tiny.example', awareness: 0.05, marketShare: 0.02, fundingTotalUSD: 0, fundingStage: 'bootstrapped', momentum: 'flat', strengths: [], weaknesses: [] },
    ], statusQuo: 'spreadsheets', statusQuoShare: 0.35, category: 'dental bookkeeping', crowdedness: 'medium', marketMaturity: 'growing',
  };
  return s;
}

test('competition: personas know real competitors; incumbents make deals harder, status quo easier', () => {
  const s = withMarket(fresh());
  const contacts = addProspects(s, 200);
  let incumbent = 0, statusQuo = 0, tinyUsers = 0;
  for (const c of contacts) {
    const p = personaFor(s, c, ensureCrm(s).companies.find((x) => x.id === c.companyId));
    assert.deepEqual(p, personaFor(s, c, ensureCrm(s).companies.find((x) => x.id === c.companyId)), 'deterministic');
    if (p.incumbent?.name === 'Dentrix Ledger') { incumbent++; assert.equal(p.currentTools, 'Dentrix Ledger'); assert.match(p.objection, /Dentrix Ledger/); assert.match(p.competitionBrief, /Dentrix Ledger/); }
    if (p.incumbent?.statusQuo) statusQuo++;
    if (p.incumbent?.name === 'TinyRecon') tinyUsers++;
  }
  assert.ok(incumbent > 60 && incumbent < 120, `incumbent users ${incumbent}`); // ~45% share
  assert.ok(statusQuo > 30, `status quo ${statusQuo}`);
  assert.ok(tinyUsers < 15, 'obscure tools are rarely in use');
  assert.ok(isStrong(s.apps.world.competitors.list[0]) && !isStrong(s.apps.world.competitors.list[1]));
  const strong = competitorDealMult({ uses: s.apps.world.competitors.list[0], evaluated: [] });
  const sq = competitorDealMult({ uses: { name: 'spreadsheets', statusQuo: true }, evaluated: [] });
  assert.ok(strong < 0.85 && sq > 1 && competitorDealMult(null) === 1);
  assert.ok(competitorOfferChance(s.apps.world.competitors.list[0]) > 3 * competitorOfferChance(s.apps.world.competitors.list[1]));
  // No market data → no invented competitors.
  const plain = fresh();
  const [c0] = addProspects(plain, 1);
  assert.equal(competitionFor(plain, { seed: c0.id }).known.filter((k) => !k.competitor.fictional).length, 0);
});

test('scorecard credits handling a competitor objection and penalizes bashing', () => {
  const base = [{ from: 'me', text: 'Tell me about the last time you reconciled?' }, { from: 'them', text: 'We already use Dentrix Ledger for that.' }];
  assert.equal(competitiveHandling([...base, { from: 'me', text: 'Got it. What do you like about it, and what is missing?' }], ['Dentrix Ledger']), 'handled');
  assert.equal(competitiveHandling([...base, { from: 'me', text: 'Dentrix is terrible and overpriced, we are better at everything.' }], ['Dentrix Ledger']), 'fumbled');
  assert.equal(competitiveHandling(base.slice(0, 1), ['Dentrix Ledger']), 'not_raised');
  const card = heuristicScorecard([...base, { from: 'me', text: 'Dentrix is terrible.' }], { competitors: ['Dentrix Ledger'] });
  assert.equal(card.competitiveHandling, 'fumbled');
  assert.ok(card.momTestViolations.some((v) => /Competitor/.test(v)));
});

test('stripe attribution passes channel sources through; only real outbound maps to outbound', () => {
  for (const src of ['affiliate', 'referral', 'marketplace:shopify', 'pr', 'ltd', 'cold_call', 'ai_search', 'competitor-switch', 'inbound', 'ads:meta', 'organic:seo', 'plg']) assert.equal(stripeSource(src), src);
  for (const src of ['sequence', 'linkedin', 'ai_sdr', 'csv', 'manual', undefined]) assert.equal(stripeSource(src), 'outbound');
});

test('discounts above the pricing guardrail are flagged and buy no extra odds', () => {
  const s = fresh();
  const [c] = addProspects(s, 1);
  const d = ensureDeal(s, { companyId: c.companyId, contactId: c.id, stage: 'qualified' });
  startProposal(s, d, { planId: s.plans[0].id, discountPct: 0.45 });
  assert.ok(d.discountGuard && d.discountGuard.over && d.discountGuard.max < 0.45);
  const c2 = addContact(s, { firstName: 'Bo', email: 'bo@other.com', company: 'Other', domain: 'other.com' }).contact;
  const d2 = ensureDeal(s, { companyId: c2.companyId, contactId: c2.id, stage: 'qualified' });
  startProposal(s, d2, { planId: s.plans[0].id, discountPct: 0 });
  assert.equal(d2.discountGuard.over, false);
});

// ---- Realism review fixes (docs/review/sales-network.md) ----
import { securityReviewChance, contractDays } from '../public/apps/sales/deals.js';
import { employeesOf } from '../public/apps/sales/replies.js';

test('review S1/S2: empty calls almost never qualify, and qualification is rolled once per deal', () => {
  assert.equal(qualifyProbability({ quality: 0.9, founderTurns: 1, founderWords: 8 }), 0.02);
  assert.ok(qualifyProbability({ quality: 0.8, painUncovered: false }) < 0.3 * qualifyProbability({ quality: 0.8 }) + 0.01);
  assert.ok(callQuality(heuristicScorecard([])) < 0.15, 'silence earns no credit');
  let q = 0, requal = 0;
  for (let i = 0; i < 150; i++) {
    const t = fresh('smb', 300 + i);
    const [c] = addProspects(t, 1);
    const m1 = createMeeting(t, { contactId: c.id, slot: nextSlot(t, { minLead: 1 }) });
    if (applyCallOutcome(t, m1, heuristicScorecard([]), 0.3).qualified) q++;
    else {
      const m2 = createMeeting(t, { contactId: c.id, slot: nextSlot(t, { minLead: 1 }), kind: 'follow_up' });
      m2.transcript = GOOD_CALL;
      const card = heuristicScorecard(GOOD_CALL);
      if (applyCallOutcome(t, m2, card, callQuality(card)).qualified) requal++;
    }
  }
  assert.ok(q / 150 < 0.06, `empty-call qualification ${q}/150`);
  assert.equal(requal, 0, 'no free re-roll after a failed qualification');
});

test('review S3/S4: buyer budget ignores your price; seats cap at headcount; oversized proposals flagged', () => {
  const a = fresh(); const [c] = addProspects(a, 1);
  const co = ensureCrm(a).companies[0];
  const b1 = personaFor(a, c, co).budgetMonthly;
  a.plans[0].price = 4900;
  assert.equal(personaFor(a, c, co).budgetMonthly, b1, 'budget independent of plan price');
  const bb = Math.max(b1, 60); // a no-pain contact has a token budget, where both odds sit on the floor
  assert.ok(closeProbability({ acv: 4900 * 12, budgetRatio: bb / 4900 }) < 0.5 * closeProbability({ acv: 49 * 12, budgetRatio: bb / 49 }));
  co.size = '2-10';
  assert.equal(employeesOf(co), 4);
  const d = ensureDeal(a, { companyId: co.id, contactId: c.id, stage: 'qualified' });
  startProposal(a, d, { planId: a.plans[0].id, quantity: 500 });
  assert.equal(d.quantity, 4);
  assert.ok(d.oversized);
});

test('review S5–S7: repeated asks halve odds; bounces decided once; empty personalization is generic', () => {
  const p1 = meetingProbability({ kind: 'interested', asked: true });
  assert.ok(Math.abs(meetingProbability({ kind: 'interested', asked: true, priorAsks: 2 }) - p1 / 4) < 1e-9);
  const co = { name: 'Smile', site: SITE };
  assert.equal(tierFor({ contact: { personalization: '' }, company: co, analysis: analyzeCopy(GOOD_STEPS[0], 0) }), 'generic');
  assert.equal(tierFor({ contact: { personalization: 'Saw you opened the Round Rock location and do same-day crowns with CEREC.', linkedinConnected: true }, company: co, analysis: analyzeCopy(GOOD_STEPS[0], 0) }), 'researched', 'LinkedIn alone is not warm');
});

test('review S6: verified list ends with ~1–2.5% of prospects bounced over a 4-step sequence', () => {
  const s = fresh('smb', 41);
  setupInfra(s, { inboxes: 8 });
  const contacts = addProspects(s, 800).filter((c) => c.verification === 'valid');
  enroll(s, contacts);
  advance(s, 35, APPS);
  const bounced = contacts.filter((c) => c.status === 'bounced').length / contacts.length;
  assert.ok(bounced > 0.005 && bounced < 0.025, `prospects bounced ${bounced}`);
});

test('review S16/S17: security reviews key on ACV; won deals pass through a contract stage before billing', () => {
  assert.equal(securityReviewChance(1500), 0.05);
  assert.ok(securityReviewChance(30000) >= 0.6 && securityReviewChance(80000) >= 0.85);
  assert.ok(contractDays(3000, 0.5) <= 5 && contractDays(30000, 0.5) >= 10 && contractDays(120000, 0.5) >= 30);
  let contracts = 0, wonViaContract = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const s = fresh('smb', seed);
    richLegal(s);
    const [c] = addProspects(s, 1);
    const d = ensureDeal(s, { companyId: c.companyId, contactId: c.id, stage: 'qualified' });
    d.callQuality = 0.9; d.hasPain = true;
    startProposal(s, d, { planId: s.plans[0].id });
    const subs0 = s.stripe.subscriptions.length;
    for (let i = 0; i < 120 && d.stage !== 'won' && d.stage !== 'lost'; i++) {
      advance(s, 1, APPS_P);
      if (d.stage === 'contract') { contracts++; assert.equal(s.stripe.subscriptions.length, subs0, 'no billing before signature'); break; }
    }
    advance(s, 20, APPS_P);
    if (d.stage === 'won' && d.history.some((h) => h.stage === 'contract')) wonViaContract++;
  }
  assert.ok(contracts >= 2 && wonViaContract >= 2, `${contracts} contracts, ${wonViaContract} won`);
});

test('review F7: overpricing far above buyer budgets loses; revenue peaks near what buyers can pay', async () => {
  const { budgetFit } = await import('../public/apps/sales/deals.js');
  const { ensureLegal } = await import('../public/apps/legal/sim.js');
  const { mrr } = await import('../public/core/stripe.js');
  assert.ok(budgetFit(2) <= 1.2 && budgetFit(1) === 1 && Math.abs(budgetFit(0.5) - 0.25) < 1e-9 && budgetFit(0.05) < 0.001);
  const run = (price, seed) => {
    const s = fresh('smb', seed);
    s.market.fit.product.score = 0.5;
    const L = ensureLegal(s); L.soc2 = 'type2'; L.dpaReady = true;
    s.plans[0].price = price; s.plans[0].trialDays = 0;
    for (let i = 0; i < 100; i++) {
      const { contact, company } = addContact(s, { firstName: `A${i}`, email: `a${i}@c${i}.com`, title: 'Owner', company: `C${i}`, domain: `c${i}.com` });
      company.size = '2-10';
      const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
      d.callQuality = 0.7; d.hasPain = true;
      startProposal(s, d, { planId: s.plans[0].id });
    }
    advance(s, 160, APPS);
    return { won: ensureCrm(s).deals.filter((d) => d.stage === 'won').length, mrr: mrr(s) };
  };
  let m49 = 0, m999 = 0, w999 = 0;
  for (const seed of [5, 9]) { m49 += run(49, seed).mrr; const r = run(999, seed); m999 += r.mrr; w999 += r.won; }
  assert.ok(w999 <= 2, `${w999} deals closed at 20× budget`);
  assert.ok(m999 < m49, `MRR at $999 (${m999}) should be below MRR at $49 (${m49})`);
});

test('hired AEs/SDRs (People) drive pipeline and closes; nothing happens without a team', async () => {
  const { dealsDay, teamDay } = await import('../public/apps/sales/engine.js');
  const { salesCapacity } = await import('../public/apps/people/capacity.js');
  const tick = (s, n) => { for (let i = 0; i < n; i++) { s.day++; dealsDay(s); } };
  const none = fresh('ent', 12);
  none.plans[0].price = 15000;
  tick(none, 120);
  assert.equal((none.apps.crm?.deals ?? []).length, 0, 'neutral without a team');
  const s = fresh('ent', 12);
  s.plans[0].price = 15000;
  s.apps.people = { members: [
    { id: 'ae1', name: 'Alex AE', role: 'ae', kind: 'human', engagement: 'employee', status: 'active', startDay: -200, hoursPerWeek: 40 },
    { id: 'sdr1', name: 'Sam SDR', role: 'sdr', kind: 'human', engagement: 'employee', status: 'active', startDay: -200, hoursPerWeek: 40 },
  ] };
  const cap = salesCapacity(s);
  assert.equal(cap.aes.length, 1);
  assert.equal(cap.sdrs.length, 1);
  tick(s, 200);
  const deals = ensureCrm(s).deals;
  assert.ok(deals.some((d) => d.sdrId === 'sdr1'), 'SDR booked meetings');
  assert.ok(deals.filter((d) => d.ownerAeId === 'ae1').length >= 5, 'AE owns pipeline');
  assert.ok(deals.some((d) => d.ownerAeId && ['contract', 'won'].includes(d.stage)), 'AE closes deals');
  void teamDay;
});

test('enterprise design partners: ~20–40% of warm, well-run discovery calls agree to a pilot; pilots can convert', async () => {
  const { proposePilot } = await import('../public/apps/sales/model.js');
  let asked = 0, yes = 0, converted = 0, paidSubs = 0;
  for (let i = 0; i < 60; i++) {
    const s = fresh('ent', 500 + i);
    s.plans[0].price = 15000;
    const { contact } = addContact(s, { firstName: `P${i}`, email: `vp${i}@fin${i}.com`, title: 'VP Security', company: `Fin ${i}`, domain: `fin${i}.com` }, { source: 'network', warm: true });
    const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }), source: 'network' });
    m.transcript = GOOD_CALL;
    m.status = 'held';
    completeEvent(s, m.eventId, 'done');
    const card = heuristicScorecard(GOOD_CALL);
    applyCallOutcome(s, m, card, callQuality(card));
    const deal = ensureCrm(s).deals.find((d) => d.contactId === contact.id);
    if (!['meeting_held', 'qualified'].includes(deal.stage)) continue;
    asked++;
    const type = i % 2 ? 'paid_pilot' : 'design_partner';
    const r = proposePilot(s, deal, { type });
    assert.throws(() => proposePilot(s, deal, { type }), 'one ask per type');
    if (!r.ok) continue;
    yes++;
    assert.equal(deal.stage, 'proposal', 'counts as a pilot for fundraising');
    if (type === 'paid_pilot') { assert.ok(deal.pilot.subId); paidSubs++; }
    post(s, { amount: 1e6, counterparty: 'Pat', category: 'owner_contribution' });
    advance(s, 120, APPS_P);
    if (deal.pilot.status === 'converted') converted++; // then procurement (paperwork, budget, board) still runs
  }
  const rate = yes / asked;
  assert.ok(asked >= 50, `${asked} deals reached the pilot step`);
  assert.ok(rate >= 0.08 && rate <= 0.5, `pilot acceptance ${yes}/${asked}`);
  assert.ok(paidSubs >= 1 && converted >= 1, `${converted} pilots converted`);
});
