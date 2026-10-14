// Calibration round 2: new actions a real founder would take (or misuse). Each function either calls an exported module
// action or replicates the UI handler line for line (file noted), and charges the UI's founder hours via L.tryHours.
import * as L from './lib.mjs';
const R = (process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '';
const AG = await import(R + '/apps/product/agent.js');
const REL = await import(R + '/apps/product/releases.js');
const LC = await import(R + '/apps/lifecycle/model.js');
const LJ = await import(R + '/apps/lifecycle/judge.js');
const PR = await import(R + '/apps/sales/prospector.js');
const IB = await import(R + '/apps/sales/inbox.js');
const NT = await import(R + '/apps/sales/notetaker.js');
const PL = await import(R + '/apps/sales/pipeline.js');
const SM = await import(R + '/apps/sales/model.js');
const SP = await import(R + '/apps/sales/params.js');
const AS = await import(R + '/apps/assistant/engine.js');
const OPR = await import(R + '/core/operator.js');
const { ensureStripe, ensureDunning } = L.stripe;
const { addRecurring, post } = await import(R + '/core/bank.js');
export { OPR, PR, NT };

// ---------------- Product: AI-coding workflow + release safety (product/views.js data-wf, data-rset) ----------------
export function setWorkflow(g, tier) {
  const sl = L.PS.productSlice(g.state);
  Object.assign(sl.agent.workflow, AG.TIER_WORKFLOWS[tier]);
}
export function releaseSetup(g, keys = ['monitoring', 'alerts']) {
  const s = g.state;
  const rel = REL.releasesSlice(L.PS.productSlice(s));
  for (const k of keys) {
    if (rel.flags[k]) continue;
    const t = REL.RELEASE_SETUP[k];
    if (!L.tryHours(g, t.hours, t.label)) return;
    rel.flags[k] = true;
    if (t.monthly) addRecurring(s, { vendor: k === 'seer' ? 'Error monitoring AI (Seer-style)' : 'Error monitoring (Sentry-style)', amount: t.monthly, category: 'software', dayOfMonth: 9 });
  }
}

// ---------------- Payments: dunning (stripe.js data-set toggles + #dunForm) ----------------
const DUN_STEPS = [
  { day: 0, channel: 'email', subject: 'Your card was declined: update it in 1 click', body: 'Hi {{firstName}}, your payment of {{amount}} for {{plan}} did not go through. Update your card here: {{update_link}}. Nothing changes in your account. If money is tight, reply and I can pause your plan instead. Alex' },
  { day: 3, channel: 'email', subject: 'Quick reminder about your card', body: 'Hi {{firstName}}, a quick reminder: we still could not charge {{amount}} for {{plan}}. Update your card: {{update_link}}. Want to pause or downgrade instead? Just reply. Alex' },
  { day: 7, channel: 'email', subject: 'Your account pauses in 7 days', body: 'Hi {{firstName}}, we will pause your account in 7 days unless the card is updated: {{update_link}}. Your data stays safe. Reply if you want a cheaper plan. Alex' },
  { day: 13, channel: 'email', subject: 'Last reminder before we pause', body: 'Hi {{firstName}}, last reminder: update your card ({{update_link}}) to keep {{plan}} running. Thanks for being a customer. Alex' },
];
export function dunningSetup(g) {
  const s = g.state;
  const set = ensureStripe(s).settings;
  for (const [k, h] of [['smartRetries', 0.1], ['cardUpdater', 0.25], ['preExpiryEmails', 0.25], ...(s.company.model === 'b2c' ? [['trialReminders', 0.25]] : [])]) {
    if (set[k]) continue;
    if (!L.tryHours(g, h, 'Billing settings')) return false;
    set[k] = true;
  }
  const d = ensureDunning(s);
  if (d.designedDay != null) return true;
  if (!L.tryHours(g, 0.25 + 0.3 * DUN_STEPS.length, 'Dunning sequence')) return false;
  d.steps = DUN_STEPS.map((x) => ({ ...x, quality: +L.stripe.dunningStepQuality(x).toFixed(2) }));
  d.fromPerson = true; d.designedDay = s.day; set.dunningEmails = true;
  return true;
}

// ---------------- Lifecycle email (lifecycle.js handlers) ----------------
const featureTitles = (s) => L.market.shippedFeatures(s).map((f) => f.title);
function setVendor(g, k = 'loops') {
  const s = g.state; const l = LC.ensureLifecycle(s);
  if (l.vendor) return true;
  if (!L.tryHours(g, LC.HOURS.setup, `Set up ${LC.ESP[k].label}`)) return false;
  l.vendor = k;
  const r = addRecurring(s, { vendor: LC.ESP[k].label, amount: 0, category: 'software', dayOfMonth: 5, note: `${LC.ESP[k].label} plan` });
  r.active = false; l.billId = r.id;
  const t = LC.planTier(s, l);
  if (t.price > 0) { r.amount = t.price; r.active = true; r.note = `${LC.ESP[k].label} ${t.name}`; }
  return true;
}
async function publish(g, f, emails) {
  const s = g.state; const l = LC.ensureLifecycle(s);
  const ev = l.activationEvent ? LC.eventById(s, l.activationEvent.id) : null;
  const nodes = f.nodes.filter((n) => n.type === 'email');
  emails.forEach((e, i) => { if (nodes[i]) Object.assign(nodes[i], e); });
  f.nodes = f.nodes.filter((n) => n.type !== 'email' || n.body);
  const hrs = 0.25 * 0.4 + f.nodes.filter((n) => n.type === 'email').length * (emails[0]?.aiDraft ? LC.HOURS.aiDraft : LC.HOURS.email) + LC.HOURS.flowOther;
  if (!L.tryHours(g, hrs, 'Publish lifecycle flow')) return false;
  for (const n of f.nodes.filter((x) => x.type === 'email')) {
    n.lint = LC.lintEmail(n, { kind: f.kind, event: ev, featureTitles: featureTitles(s) });
    const r = await LJ.judgeEmail(g.ctx, { subject: n.subject, body: n.body }, { kind: f.kind, event: ev, featureTitles: featureTitles(s) });
    n.judge = r.judge;
  }
  LC.reviewFlow(s, l, f);
  f.status = 'live'; f.publishedDay ??= s.day;
  if (f.kind === 'welcome' && f.nodes.some((n) => n.lint?.discount) && f.filter.activation !== 'activated') OPR.logMistake(s, { functionId: 'lifecycle_activation', id: 'upsell_non_activated', label: 'Upselling users who have not activated', app: 'lifecycle', cost: { reputation: 0.5 }, detail: `Flow "${f.name}" pitches a discount before activation.`, delayed: true });
  return true;
}
// Elite: authenticated domain, activation event chosen from a retention analysis, hand-written welcome + nudge flows.
export async function lifecycleElite(g) {
  const s = g.state; const l = LC.ensureLifecycle(s);
  if (!setVendor(g)) return;
  for (const k of ['spf', 'dkim', 'dmarc']) if (!l.domain[k] && L.tryHours(g, LC.HOURS.dns, `${k.toUpperCase()} record`)) l.domain[k] = true;
  if (!l.activationEvent) {
    if (!(s.day - (g.rec.firstShipDay ?? s.day) >= 21)) return;
    if (!L.tryHours(g, LC.HOURS.analysis, 'Retention by activation event')) return;
    const a = LC.eventRetentionAnalysis(s, l);
    if (!a.n) return;
    l.analyses.unshift({ day: a.day, n: a.n, lowSample: a.lowSample, rows: a.rows });
    const best = (a.rows ?? []).filter((r) => (r.reach ?? 0) >= 0.1 && r.ratio != null).sort((x, y) => y.ratio - x.ratio)[0];
    const id = a.lowSample || !best?.id ? 'core_own_data' : best.id;
    if (!L.tryHours(g, 1, 'Define and instrument activation event')) return;
    l.eventHistory.push({ id, day: s.day });
    l.activationEvent = { id, day: s.day, validated: !a.lowSample };
    g.activationEvent = id;
  }
  if (l.flows.some((f) => f.kind === 'welcome')) return;
  const ev = LC.eventById(s, l.activationEvent.id);
  const core = featureTitles(s)[0] ?? 'the main feature';
  if (!L.tryHours(g, LC.HOURS.flowOther, 'New flow')) return;
  const w = LC.templateFlow('welcome'); w.createdDay = s.day; w.exitOnGoal = true; l.flows.push(w);
  const mk = (subject, line) => ({ subject, body: `Hi {{firstName}}, ${line} It takes about 5 minutes: {{ctaUrl}}. Reply if anything gets in the way; I read every email. Alex, founder` });
  await publish(g, w, [
    mk(`Your first step: ${core.toLowerCase().split(' ').slice(0, 4).join(' ')}`, `the fastest way to see if this works for you is to use "${core}" on your own data. ${ev?.label ?? ''}.`),
    mk('Did the first run work?', `most people who stick with us used "${core}" on their own data in the first 3 days. Here is the one-minute setup again.`),
    mk('One thing that saves the most time', `the customers who get the most out of it run "${core}" three times in the first week. Try it on this week's data.`),
    mk('Want me to set it up with you?', `if you have not had time yet, I can set up "${core}" with you on a 15-minute call. Pick a time.`),
  ]);
  if (!L.tryHours(g, LC.HOURS.flowOther, 'New flow')) return;
  const n = LC.templateFlow('nudge'); n.createdDay = s.day; n.exitOnGoal = true; l.flows.push(n);
  await publish(g, n, [mk('Stuck on setup?', `you signed up but have not run "${core}" yet. Here is the shortest path.`), mk('A 2-minute example', `here is "${core}" on sample data so you can see the result before connecting yours.`), mk('Should I close your trial?', `if now is not the time, no problem. If it is, start with "${core}" here.`)]);
}
// Mistakes: no DNS, unedited AI drafts, no goal exit, and monthly discount blasts to the whole list.
export async function lifecycleMistakes(g) {
  const s = g.state; const l = LC.ensureLifecycle(s);
  if (!setVendor(g)) return;
  if (!l.flows.some((f) => f.kind === 'welcome')) {
    if (!L.tryHours(g, LC.HOURS.flowOther, 'New flow')) return;
    const w = LC.templateFlow('welcome'); w.createdDay = s.day; l.flows.push(w);
    const ai = (i) => { const d = { subject: ['Welcome aboard!', 'Unlock the full power of the platform', 'Upgrade today and save 30%', 'Don\'t miss out'][i], body: `Hi {{firstName}}, welcome! In today's fast-paced world, our innovative all-in-one solution helps you unlock your potential. Explore all our features and upgrade to Pro today with 30% off: {{ctaUrl}}. Check out our blog, our docs and our community too!` }; return { ...d, aiDraft: true, draftText: JSON.stringify(d), edited: false }; };
    await publish(g, w, [ai(0), ai(1), ai(2), ai(3)]);
  }
  if ((g.lastBlast ?? -99) <= s.day - 30 && l.contacts.length >= 20) {
    if (!L.tryHours(g, LC.HOURS.broadcast, 'Lifecycle broadcast')) return;
    const bc = { subject: 'FLASH SALE: 40% off ends tonight!!!', body: 'Hi {{firstName}}, huge news! Upgrade now and save 40% on any plan. Limited time only, act now: {{ctaUrl}}' };
    const r = await LJ.judgeEmail(g.ctx, bc, { kind: 'broadcast', event: null, featureTitles: featureTitles(s) });
    LC.sendBroadcastNow(s, { ...bc, segment: 'all', lint: r.lint, judge: r.judge, logMistake: OPR.logMistake });
    g.lastBlast = s.day;
  }
}

// ---------------- Growth: releases, relaunches, Show HN, App Store ----------------
export async function releasePost(g) {
  const s = g.state;
  const ctx = L.OE.launchContext(s, 'release');
  if (ctx.change < 1) return false;
  if (!L.tryHours(g, 0.75, 'Release announcement')) return false;
  const f = L.market.shippedFeatures(s).at(-1);
  const text = `Shipped this week: ${f.title}. ${String(f.problem).split(';')[0]}. Now ${String(f.solution).split(',')[0].toLowerCase()}. ${L.stripe.activeSubs(s).length} customers use it; tell me what breaks.`;
  const j = await L.JG.judgePost(g.ctx, text, 'linkedin', 'product release announcement');
  L.OE.announceRelease(s, { platform: 'linkedin', text, skill: j.skill, judge: j });
  return true;
}
export async function showHN(g) {
  const s = g.state;
  if (!L.tryHours(g, 3, 'Show HN')) return false;
  const title = `Show HN: ${s.company.oneLiner.slice(0, 70)}`;
  const text = `I built this after ${Math.max(5, g.interviewsDone ?? 0)} conversations with people who do this by hand every month. It runs nightly, flags the exceptions and exports a report. It is ${L.market.shippedFeatures(s).length} features in, built solo with a coding agent. Pricing is on the site. I would love feedback on the matching logic and on what you would want next.`;
  const j = await L.JG.judgePost(g.ctx, `${title}\n\n${text}`, 'x', 'Show HN post and first comment for Hacker News readers');
  L.OE.launchShowHN(s, { title, text, skill: j.skill });
  return true;
}
// Product Hunt (re)launch: elite only with ≥ minChange features shipped since; mistakes regardless.
export async function phLaunch(g, { requireChange = true } = {}) {
  const s = g.state;
  const ctx = L.OE.launchContext(s, 'product_hunt');
  if (ctx.last && ctx.daysSince < 183) return false;
  if (requireChange && ctx.last && !ctx.legit) return false;
  return L.productHunt(g, { allowRepeat: true });
}
export async function networkRelaunch(g) {
  const s = g.state;
  if (!L.tryHours(g, 3.25, 'Organic: network launch')) return false;
  const msg = `Big update: ${s.company.oneLiner.toLowerCase()} is live with a 14-day free trial. If you or someone you know has this problem, I would love 15 minutes of feedback.`;
  const j = await L.JG.judgePost(g.ctx, msg, 'linkedin', 'launch announcement to personal network');
  L.OE.launchToNetwork(s, { channels: { friends: true, linkedin: true, x: true }, message: msg, skill: j.skill });
  return true;
}
export async function asoListing(g) {
  const s = g.state;
  if (!L.tryHours(g, 1.5, 'App Store listing')) return false;
  const f = { title: '20-Min Home Workouts', subtitle: 'Plans busy parents can finish', keywords: 'home workout,parent fitness,short workout,no equipment,habit tracker,quick exercise,family fitness,mom workout,dad workout', description: 'A 20-minute home workout planned for you every evening. Pause when the kids wake up, resume later. Weekly streaks and partner check-ins.' };
  const j = await L.JG.judgeAso(g.ctx, f);
  L.OE.setAsoListing(s, { ...f, score: j.score, feedback: j.feedback });
  return true;
}
export function ratingPrompt(g, prompt) {
  if (!L.tryHours(g, 1, 'Rating prompt')) return false;
  L.OE.setReviewPrompt(g.state, prompt);
  return true;
}

// ---------------- Sales: prospect database (prospects-view.js) ----------------
export function dbPlan(g, plan = 'apollo_basic') {
  const s = g.state; const p = PR.ensureProspector(s);
  if (p.plan === plan) return true;
  if (!L.tryHours(g, 0.25, 'Prospecting (plan)')) return false;
  PR.setPlan(s, plan);
  return true;
}
// Tight weekly list: owners in an ICP segment on the ICP's tech, sized to the ICP, US; 5-row test first; verify; reasons.
export function sourceTight(g, n = 15) {
  const s = g.state; const p = PR.ensureProspector(s);
  const ip = PR.idealProfile(s);
  let rows = [];
  for (const seg of ip.segments) {
    const f = { ...PR.DEFAULT_FILTERS, seniority: ip.buyer, segment: seg, tech: ip.tech[0] ?? '', geo: 'US', minEmp: ip.band[0], maxEmp: ip.band[1] };
    if (!L.tryHours(g, PR.HOURS_P.search, 'Prospecting')) return [];
    PR.recordSearch(s, f);
    rows.push(...PR.search(s, f).filter((r) => !p.revealed[r.id] && !(p.missed[r.id]?.length)));
    if (rows.length >= n) break;
  }
  const ids = rows.slice(0, n).map((r) => r.id);
  if (!ids.length) return [];
  if (!p.waterfall.tested && L.tryHours(g, PR.HOURS_P.test5, 'Prospecting (5-row test)')) PR.testFive(s, ids.slice(0, 5), { mode: 'db' });
  if (!L.tryHours(g, PR.HOURS_P.revealBase + ids.length * PR.HOURS_P.revealPer, 'Prospecting (enrichment)')) return [];
  try { PR.reveal(s, ids, { mode: 'db' }); } catch { return []; }
  const got = ids.filter((id) => p.revealed[id]);
  if (!L.tryHours(g, PR.HOURS_P.saveBase + got.length * PR.HOURS_P.savePer, 'Prospecting (save list)')) return [];
  const list = PR.saveList(s, got, `Tight list wk ${Math.floor(s.day / 7)}`, { addContact: SM.addContact });
  const contacts = list.contactIds.map((id) => SM.contactById(s, id)).filter(Boolean);
  // Reasons (0.01h each) + researched first line (personalize 0.12h each) + verification ($ + hours).
  if (!L.tryHours(g, contacts.length * (PR.HOURS_P.reasonPer + SP.HOURS.personalize) + 0.05, 'Prospecting (reasons, personalization, verification)')) return [];
  for (const c of contacts) {
    const co = SM.companyById(s, c.companyId);
    if (co?.prospect) co.prospect.reason = `Runs on ${co.prospect.techs?.[0] ?? 'Shopify'} with ${co.employees} people; owner does the books`;
    c.personalization = `Saw you run ${co?.name ?? 'your store'} on ${co?.prospect?.techs?.[0] ?? 'Shopify'} with a team of ${co?.employees ?? 'a few'}.`;
    c.personalizationSource = 'player';
  }
  post(s, { amount: -Math.max(0.5, contacts.length * SP.SALES.verify.costPerEmail), counterparty: 'Email verifier', description: `Verified ${contacts.length} addresses`, category: 'software', method: 'card' });
  SM.verifyContacts(s, contacts);
  return contacts;
}
// Untargeted blast: no filters, reveal hundreds, save, no verification, no personalization.
export function sourceBlast(g, n = 200) {
  const s = g.state; const p = PR.ensureProspector(s);
  if (!L.tryHours(g, PR.HOURS_P.search, 'Prospecting')) return [];
  PR.recordSearch(s, PR.DEFAULT_FILTERS);
  const ids = PR.search(s, PR.DEFAULT_FILTERS).filter((r) => !p.revealed[r.id] && !(p.missed[r.id]?.length)).slice(0, n).map((r) => r.id);
  if (!L.tryHours(g, PR.HOURS_P.revealBase + ids.length * PR.HOURS_P.revealPer, 'Prospecting (enrichment)')) return [];
  try { PR.reveal(s, ids, { mode: 'db' }); } catch { return []; }
  const got = ids.filter((id) => p.revealed[id]);
  if (!L.tryHours(g, PR.HOURS_P.saveBase + got.length * PR.HOURS_P.savePer, 'Prospecting (save list)')) return [];
  const list = PR.saveList(s, got, `Everyone ${s.day}`, { addContact: SM.addContact });
  return list.contactIds.map((id) => SM.contactById(s, id)).filter(Boolean);
}

// ---------------- Reply inbox autopilot, notetaker, nudges (outreach / calls / crm handlers) ----------------
export function inboxAutopilot(g) {
  const s = g.state; const ib = IB.ensureInbox(s);
  if (ib.settings.agent.mode === 'autopilot') { if (ib.credits < 50) IB.buyCredits(s, 'small'); return; }
  if (!L.tryHours(g, IB.INBOX.hours.setup, 'Reply inbox setup')) return;
  ib.settings.aiCategorize = true;
  ib.settings.agent = { mode: 'autopilot', scope: ['interested', 'meeting_request', 'question', 'objection', 'not_now'], criteria: '', templates: '', escalation: '' };
  IB.buyCredits(s, 'small');
}
export function notetaker(g, { mode = 'on', plan = 'paid', autoShare = false } = {}) {
  const s = g.state; const nt = NT.ensureNotetaker(s);
  if (nt.mode === mode && nt.plan === plan && nt.autoShare === autoShare) return;
  if (!L.tryHours(g, 0.2, 'Notetaker setup')) return;
  nt.mode = mode; nt.autoShare = autoShare;
  if (nt.plan !== plan) NT.setNotetakerPlan(s, plan);
}
// Elite review: read the transcript line behind each field (catches ~90% of wrong fields), push, recap within 24 h.
export function reviewNotes(g, m) {
  const s = g.state;
  if (!m.notes || m.notes.status === 'pushed') return;
  const deal = s.apps.crm.deals.find((d) => d.id === m.dealId);
  if (!deal) return;
  if (!L.tryHours(g, NT.NOTETAKER.hours.review + NT.NOTETAKER.hours.recap, 'Reviewing call notes + recap')) return;
  for (const f of m.notes.fields) f.decision = f.wrong && L.util.rng(s) < 0.9 ? 'reject' : 'accept';
  NT.pushNotes(s, m, deal, { reviewed: true, setNextStep: (st, d, text, due) => { d.nextStep = { text, dueDay: due }; }, addActivity: SM.addActivity });
  NT.sendRecap(s, m, deal);
}
export function nudgeStale(g) {
  const s = g.state;
  for (const d of s.apps.crm?.deals ?? []) {
    if (!['qualified', 'proposal', 'contract'].includes(d.stage) || ['won', 'lost'].includes(d.stage)) continue;
    if (PL.staleDays(s, d) < 14 || (d.nudges ?? []).some((x) => x > s.day - 14)) continue;
    if (!L.tryHours(g, PL.PIPE.hours.nudge, 'Deal nudge')) return;
    PL.nudgeDeal(s, d);
  }
}

// ---------------- Assistant on autopilot (assistant app): auto mode with write scope on mail and books ----------------
export function assistantAutopilot(g) {
  const s = g.state; const A = AS.ensureAssistant(s);
  if (A.tasks.length) return;
  if (!L.tryHours(g, 1, 'Assistant setup')) return;
  AS.choosePlan(s, 'claude_pro');
  AS.grantConnector(s, 'mail', 'write'); AS.grantConnector(s, 'books', 'write'); AS.grantConnector(s, 'stripe', 'read');
  AS.createTask(s, { name: 'Answer customer email', templateId: 'customer_digest', mode: 'auto', schedule: 'weekdays' });
  AS.createTask(s, { name: 'Clean up receipts', templateId: 'receipts_cleanup', mode: 'auto', schedule: 'weekly' });
  AS.createTask(s, { name: 'Investor update', templateId: 'investor_update', mode: 'auto', schedule: 'weekly' });
}

export function mistakesOf(s) {
  const t = s.mistakeTotals ?? { count: 0, circles: 0, hours: 0, usd: 0, customers: 0, reputation: 0, days: 0 };
  const by = {};
  for (const m of s.mistakes ?? []) by[`${m.functionId}:${m.id}`] = (by[`${m.functionId}:${m.id}`] ?? 0) + 1;
  return { count: t.count, circles: t.circles, delayed: t.delayed, hours: Math.round(t.hours), usd: Math.round(t.usd), customers: +(t.customers ?? 0).toFixed(2), reputation: +(t.reputation ?? 0).toFixed(1), days: Math.round(t.days ?? 0), by };
}

// ---------------- Operating hygiene a stellar founder keeps (product decisions, incident comms, receipts) ----------------
const HD = await import(R + '/apps/helpdesk.js');
const SPD = await import(R + '/apps/money/spend.js');
const PE2 = await import(R + '/apps/product/engine.js');
// Product → Decisions (views.js [data-dec]): keep hits, kill misses (with a reason).
export function productDecisions(g) {
  const s = g.state; const sl = L.PS.productSlice(s);
  for (const f of sl.features) {
    if (f.status !== 'shipped' || !f.check || f.decision) continue;
    if (!L.tryHours(g, 0.1, 'Feature decision')) return;
    // Kill a miss only while at least 3 other live features remain (never gut the core); otherwise an explicit keep.
    const live = sl.features.filter((x) => x.status === 'shipped' && x.id !== f.id).length;
    PE2.decideFeature(s, sl, f, f.check.verdict === 'hit' || live < 3 ? 'keep' : 'kill', `30-day check: ${f.check.text}`);
  }
}
// Helpdesk → status page (helpdesk.js postStatusUpdate, 0.25 h) during an incident.
export function incidentStatus(g) {
  const s = g.state; const t = s.apps.insights?.today;
  if (!t || t.day !== s.day || t.statusPosted || !(t.severity > 0)) return;
  if (!L.tryHours(g, 0.25, 'Incident status update')) return;
  try { HD.postStatusUpdate(s, `We are seeing ${t.cause}. Some customers cannot use the app right now. We are working on a fix and will update here within the hour. Your data is safe.`); } catch {}
}
// Bank → Spend: connect the receipt inbox once, then attach receipts weekly (hours from attachAll).
export function receipts(g) {
  const s = g.state; const sp = SPD.ensureSpend(s);
  if (!sp.inbox) { if (!L.tryHours(g, 0.25, 'Connect receipt inbox')) return; SPD.connectInbox(s); }
  const r = SPD.attachAll(s);
  if (r.hours) L.tryHours(g, r.hours, 'Receipts');
}
