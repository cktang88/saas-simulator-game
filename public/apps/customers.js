// Customer panel: AI trial users built from your ICP (and real CRM companies) use what you've actually
// shipped and tell you whether they activated, what they'd pay and what's missing. Plus onboarding mode
// (self-serve / kickoff call / concierge, booked on the calendar), the customer feedback inbox and the
// churn-reason survey.
//
// Onboarding conversion multipliers and founder hours per trial: core/params.js ONBOARDING
// (research: hr-legal-product.md §3.4; concierge 1.5–3× opt-in is an [A] game assumption).

import { html, mount, on, toast } from '../core/ui.js';
import * as llmCore from '../core/llm.js';
import { REALISM } from '../core/llm.js';
import { ONBOARDING } from '../core/params.js';
import { notify } from '../core/state.js';
import { adviceFor, learningMode } from '../core/advice.js';
import { ensureMarket, mainPlan, monthlyPrice, trialConversion, cfg, shippedFeatures, recordStatedWtp, wtpOf } from '../core/market.js';
import { activeSubs, ensureStripe, cancel, subscribe } from '../core/stripe.js';
import { newThread, addMessage, ensureMail } from '../core/mail.js';
import { enqueue } from '../core/jobs.js';
import { scheduleEvent, findSlots, completeEvent, ensureCalendar, fmtTime } from '../core/calendar.js';
import { rng, chance, pick, money, pct, fmtDate, clamp, uid, gaussian } from '../core/util.js';
import { customersSlice, productSlice } from './product/store.js';
import { openBugHours } from './product/build.js';
import { knownCompetitors, competitionBrief, competitorsFor } from './marketworld/competitors.js';
import { PANEL_SCHEMA, buildPersonas, trialBrief, heuristicTrial, aggregatePanel, BOOKING_SHARE, UNATTENDED_PENALTY, FEEDBACK, CANCEL_CATEGORIES, cancelCategory, heuristicReplyQuality, switchTargets, pickSwitchTarget } from './product/panel.js';

import { bookSetup, holdSetup, setups, setupCandidates, setupHoursFor, productizeOnboarding, setupDay, SETUP } from './customers/setup.js';
import { statedReason, churnSegment, CHURN_REASONS } from '../core/churn.js';
import { INTERVIEW, interviewAcceptance, revealChance, exitInterviewQuality, INTERVIEW_SCHEMA, interviewPrompt, interviewFallback, surveyResponseRate } from './retention/interview.js';
import { b2cCategoryField, wireB2cCategory } from './retention/ui.js';
import { getSegment } from '../data/buyer-segments.js';
import { B2C_CHURN } from '../data/churn-reasons.js';
import { bizBlock } from './context.js';
import { requestFor, logRequest, requestsBuildDay, requestLog, loudestSub } from './customers/requests.js';
import { interviewQuality } from './customers/rubric.js';
import { feedbackWritingRubric, replyRubric, REPLY_SCHEMA, replySatisfaction, replyFallbackCriteria, trialRubric } from './customers/rubric.js';
import { REPLY_CRITERIA } from './customers/rubric.js';
import { INTERVIEW_CRITERIA } from './customers/rubric.js';

export const PANEL_HOURS = 1.5; // [A] set up trial accounts for the panel, read session notes
const OB_LABEL = { self: 'Self-serve', call: 'Optional kickoff call', concierge: 'Concierge setup' };
const OB_MINUTES = { call: Math.round(ONBOARDING.call.hoursPerTrial * 60), concierge: Math.round(ONBOARDING.concierge.hoursPerTrial * 60) };

// Trial-to-paid without the onboarding uplift (a trial whose call never happened behaves like self-serve).
const selfServeRate = (state) => trialConversion(state) / (ONBOARDING[ensureMarket(state).onboarding]?.conv ?? 1);
const llmOf = (ctx) => ctx.llm ?? llmCore;
const custOf = (state, id) => ensureStripe(state).customers.find((c) => c.id === id);
const subOf = (state, id) => ensureStripe(state).subscriptions.find((x) => x.id === id);

export async function runPanel(ctx) {
  const state = ctx.state;
  const feats = shippedFeatures(state);
  if (!feats.length) throw new Error('Ship at least one feature first: panelists can only use what exists.');
  const plan = mainPlan(state);
  const priceMonthly = monthlyPrice(plan);
  const brief = trialBrief(state, feats);
  const bugs = openBugHours(productSlice(state));
  const personas = buildPersonas(state);
  const out = [];
  const audience = state.company.model === 'b2c' ? 'consumer' : 'prospect';
  for (const p of personas) {
    const known = knownCompetitors(state, { audience, seed: p.id, max: 4 });
    const compBrief = competitionBrief(state, known); // what this panelist uses today (not the trial brief)
    const res = await llmOf(ctx).panel({
      task: 'product_trial_panel', context: bizBlock(ctx.state, 'public'),
      system: `${REALISM}\nYou are ${p.role}. Context: ${p.context}\nThe year is 2026. You signed up for a trial and used the product for a week alongside your real work. You only know what is below; if a feature isn't listed it does not exist.${bugs > 40 ? ' The product was buggy in places.' : ''}\n${compBrief ? `What you use and know today: ${compBrief} Compare honestly: switching cost (data, habits, team), features you'd lose vs. what you use now, and whether an alternative does this cheaper or free. Status quo inertia is strong.` : 'You know of no dedicated tool for this; your alternative is doing it by hand or not at all.'}\n${trialRubric()}`,
      prompt: `${brief}\n\nAfter your trial week, answer honestly. Most trials never activate and most people don't pay. Judge each listed feature by its exact title.`,
      schema: PANEL_SCHEMA,
      temperature: 0.8,
      maxTokens: 900,
      fallback: () => heuristicTrial(state, p, feats, { openBugHours: bugs, refPrice: cfg(state).refPrice, priceMonthly, known }),
      cache: state.cache,
    });
    for (const r of res) out.push({ persona: { id: p.id, role: p.role, source: p.source, name: p.name, knows: known.map((k) => `${k.competitor.name} (${k.relation.replace('_', ' ')})`) }, model: r.model, mock: r.mock, ...r.data });
  }
  const agg = aggregatePanel(out, priceMonthly);
  const m = ensureMarket(state);
  const source = out.every((r) => r.mock) ? 'offline heuristic' : 'LLM trial panel';
  // The panel is a noisy readout of the market's true fit (review P1); it sets nothing in the market.
  const truth = m.fit.product.score ?? 0;
  const sigma = 0.12 / Math.sqrt(Math.max(1, personas.length));
  agg.estimate = clamp(0.5 * (truth + sigma * gaussian(state)) + 0.5 * agg.score, 0, 1);
  agg.source = source;
  if (agg.useful && agg.wtp) recordStatedWtp(state, agg.wtp, { notes: 'median willingness to pay of activated trial panelists', source });
  const slice = customersSlice(state);
  slice.panels.unshift({ id: uid('pnl'), day: state.day, features: feats.map((f) => f.title), onboarding: m.onboarding, price: priceMonthly, results: out, agg });
  slice.panels.length = Math.min(slice.panels.length, 5);
  notify(state, `Trial panel: estimated product fit ${Math.round(agg.estimate * 100)}/100, ${pct(agg.activation, 0)} activated, ${pct(agg.payRate, 0)} would pay ${money(priceMonthly)}/mo.`, { type: agg.score > 0.55 ? 'good' : 'info', app: 'customers' });
  return agg;
}

// ---- Daily simulation ----

function onboardingDay(state, slice) {
  const m = ensureMarket(state);
  const mode = m.onboarding;
  const seen = new Set(slice.seenSubs);
  const isEnt = state.company.model === 'ent';
  for (const sub of ensureStripe(state).subscriptions) {
    if (seen.has(sub.id) || sub.startDay < state.day - 1) continue;
    if (!(sub.status === 'trialing' || (isEnt && sub.status === 'active'))) continue;
    slice.seenSubs.push(sub.id);
    if (mode === 'self') continue;
    const c = custOf(state, sub.customerId);
    const minutes = OB_MINUTES[mode];
    const lastDay = sub.trialEndDay ? sub.trialEndDay - 1 : state.day + 21;
    let slot = null;
    if (chance(state, BOOKING_SHARE[mode])) slot = findSlots(state, { fromDay: state.day + 1, duration: minutes, count: 1 })[0];
    if (!slot || slot.day > lastDay) {
      if (sub.status === 'trialing') sub.forceConvert = selfServeRate(state);
      continue;
    }
    const rec = { id: uid('onb'), subId: sub.id, customerId: sub.customerId, name: c?.name ?? 'Trial user', company: c?.company ?? null, mode, day: slot.day, start: slot.start, status: 'booked', eventId: null };
    try {
      const ev = scheduleEvent(state, { title: `${mode === 'concierge' ? 'Concierge setup' : 'Kickoff call'}: ${rec.company ?? rec.name}`, kind: 'call', app: 'customers', refId: rec.id, with: { name: rec.name, email: c?.email }, day: slot.day, start: slot.start, duration: minutes, notes: `New ${isEnt ? 'customer' : 'trial'} onboarding.` });
      rec.eventId = ev.id;
      slice.onboarding.unshift(rec);
    } catch { if (sub.status === 'trialing') sub.forceConvert = selfServeRate(state); }
  }
  if (slice.seenSubs.length > 600) slice.seenSubs.splice(0, slice.seenSubs.length - 600);
  if (slice.onboarding.length > 300) slice.onboarding.length = 300;

  const evs = ensureCalendar(state).events;
  for (const rec of slice.onboarding) {
    if (rec.status !== 'booked') continue;
    const ev = evs.find((e) => e.id === rec.eventId);
    if (!ev || ev.status === 'canceled') { rec.status = 'canceled'; continue; }
    if (ev.status === 'done') { rec.status = 'held'; markOnboarded(state, rec, 'held'); }
    else if (ev.status === 'unattended' || ev.status === 'missed') {
      rec.status = 'no-show';
      markOnboarded(state, rec, 'no_show');
      const sub = subOf(state, rec.subId);
      if (sub?.status === 'trialing') sub.forceConvert = selfServeRate(state) * UNATTENDED_PENALTY;
      notify(state, `You didn't show up to ${rec.name}'s ${rec.mode === 'concierge' ? 'concierge setup' : 'kickoff call'}. They waited on the link; that trial is now less likely to convert.`, { type: 'bad', app: 'customers' });
    }
  }
}

// The onboarding outcome follows the subscription: core/churn.js reads it for early-life churn and the reason mix.
function markOnboarded(state, rec, v) {
  const sub = subOf(state, rec.subId);
  if (sub) sub.onboarded = v;
}

function feedbackDay(state, slice) {
  const subs = activeSubs(state);
  const pslice = productSlice(state);
  const bugs = pslice.bugs.filter((b) => !b.fixedDay);
  // Once the Helpdesk is in use, bug reports and questions arrive there as tickets instead of emails.
  if (!state.apps.support?.active && subs.length && chance(state, Math.min(0.9, subs.length * FEEDBACK.perAccountDaily))) {
    // The biggest account is also the loudest: it writes more often (and mostly about its own setup).
    const loud = loudestSub(state);
    let sub = pick(state, subs);
    if (loud && chance(state, 0.3)) sub = loud;
    const isLoud = Boolean(loud && sub.id === loud.id);
    const r = rng(state);
    const type = bugs.length && r < 0.4 ? 'bug' : r < 0.85 ? 'request' : 'question';
    const lastPanel = slice.panels[0];
    // A request comes from the customer's hidden person (their segment's jobs, or an ask only their own setup needs).
    const grounded = type === 'request' ? requestFor(state, sub, custOf(state, sub.customerId), { loud: isLoud, salt: String(state.day) }) : null;
    const topic = type === 'bug' ? pick(state, bugs).title
      : type === 'request' ? (grounded?.text ?? (lastPanel?.agg.mustHaves.length ? pick(state, lastPanel.agg.mustHaves).text : pick(state, ['an export to CSV', 'a way to invite a teammate', 'an integration with the tool they already use', 'a weekly summary email', 'bulk editing'])))
        : pick(state, ['how billing works for annual plans', 'whether their data is used to train AI models', 'how to set up the main feature']);
    const req = grounded ? logRequest(state, slice, grounded, sub) : null;
    enqueue(state, 'customer:feedback', { subId: sub.id, customerId: sub.customerId, type, topic, requestId: req?.id ?? null }, { label: 'Customer email' });
  }
  // Exit survey for today's cancellations.
  const m = ensureMarket(state);
  const price = monthlyPrice(mainPlan(state));
  let emailed = 0;
  for (const sub of ensureStripe(state).subscriptions) {
    if (sub.status !== 'canceled' || sub.canceledDay !== state.day) continue;
    const trial = sub.cancelReason === 'trial_not_converted';
    // Paying customers: the answer comes from their TRUE reason (core/churn.js) and is often misleading (a closed
    // business ticks "too expensive"); failed-payment churners almost never answer; the cancel-flow survey (if
    // you built one) already captured an answer in the flow.
    if (!trial && !sub.flowSurvey && !chance(state, surveyResponseRate(sub, FEEDBACK.surveyResponse))) continue;
    if (trial && !chance(state, FEEDBACK.surveyResponse)) continue;
    const targets = switchTargets(competitorsFor(state));
    let category, text = null;
    if (trial) {
      category = cancelCategory(() => rng(state), {
        competitorShare: targets.reduce((a, t) => a + t.w, 0),
        reason: sub.cancelReason, priceRatio: wtpOf(state) ? price / wtpOf(state) : 1, productScore: m.fit.product.score ?? 0.35,
        bugHours: openBugHours(pslice), onboarding: m.onboarding, wrapper: pslice.features.some((f) => f.commoditized),
      });
    } else {
      const ans = statedReason(state, sub);
      category = ans.category ?? 'no_answer';
      text = ans.text;
    }
    const competitor = category === 'switched' ? pickSwitchTarget(() => rng(state), targets) : null;
    slice.surveys.unshift({ day: state.day, subId: sub.id, customerId: sub.customerId, reason: sub.cancelReason, category, text, competitor, trial });
    if (!emailed && !trial && category !== 'no_answer' && chance(state, FEEDBACK.cancelEmailShare)) {
      emailed++;
      enqueue(state, 'customer:feedback', { subId: sub.id, customerId: sub.customerId, type: 'cancel', topic: competitor ? `Switched to ${competitor}` : text ?? CANCEL_CATEGORIES[category] ?? 'No longer need it' }, { label: 'Cancellation email' });
    }
  }
  if (slice.surveys.length > 400) slice.surveys.length = 400;
  // Unanswered complaints and requests: some accounts quietly decide to leave.
  for (const it of slice.feedback) {
    if (it.status !== 'open' || state.day - it.day < FEEDBACK.ignoreDays) continue;
    it.status = 'ignored';
    const sub = subOf(state, it.subId);
    if (['bug', 'request'].includes(it.type) && sub?.status === 'active' && !sub.cancelAtPeriodEnd && chance(state, FEEDBACK.cancelIfIgnored)) {
      cancel(state, sub.id, { atPeriodEnd: true, reason: 'felt_ignored' });
      it.consequence = 'cancel_at_period_end';
    }
  }
  if (slice.feedback.length > 300) slice.feedback.length = 300;
  requestsBuildDay(state, slice);
}

// ---- Jobs ----

const EMAIL_SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string' } } };

function fallbackEmail(state, c, type, topic) {
  const first = String(c?.name ?? 'there').split(' ')[0];
  return {
    bug: { subject: 'Something broke', body: `Hi, ${topic.replace(/"/g, '')}. Happened twice this week and I had to redo it by hand. Is this known? ${first}` },
    request: { subject: 'Feature request', body: `Hey, we're using ${state.company.name} for the main thing but we keep needing ${topic.toLowerCase()}. Without it I still do part of this in a spreadsheet. Anything planned? ${first}` },
    question: { subject: 'Quick question', body: `Hi, quick one: ${topic}? Couldn't find it in the docs. Thanks, ${first}` },
    cancel: { subject: 'Re: Why did you cancel?', body: `Since you asked: ${topic.toLowerCase()}. Nothing personal. ${first}` },
  }[type];
}

async function feedbackJob(ctx, payload) {
  const state = ctx.state;
  const c = custOf(state, payload.customerId);
  if (!c) return;
  const feats = shippedFeatures(state).map((f) => f.title).join('; ');
  const res = await llmOf(ctx).ask({
    task: 'customer_feedback_email',
    system: `${REALISM}\nYou are ${c.name}${c.company ? ` from ${c.company}` : ''}, a ${payload.type === 'cancel' ? 'customer who just canceled' : 'paying customer'} of ${state.company.name} (${state.company.oneLiner}). Shipped features: ${feats}. Write like a real busy customer: short, plain, a bit annoyed if something broke, no pleasantries padding.\n${feedbackWritingRubric()}`,
    prompt: `Write an email to the founder. Type: ${payload.type}. About: ${payload.topic}. 2–5 sentences, specific to your situation.`,
    schema: EMAIL_SCHEMA,
    temperature: 0.9,
    maxTokens: 300,
    fallback: () => fallbackEmail(state, c, payload.type, payload.topic),
  });
  const t = newThread(state, { subject: res.data.subject, with: { name: c.name, email: c.email, company: c.company }, kind: 'customer', app: 'customers', refId: uid('cfb') });
  addMessage(state, t.id, { from: 'them', body: res.data.body });
  customersSlice(state).feedback.unshift({ id: t.refId, threadId: t.id, customerId: c.id, subId: payload.subId, type: payload.type, topic: payload.topic, requestId: payload.requestId ?? null, day: state.day, status: 'open', mock: res.mock });
}

async function replyJob(ctx, payload) {
  const state = ctx.state;
  const slice = customersSlice(state);
  const t = ensureMail(state).threads.find((x) => x.id === payload.threadId);
  if (!t) return;
  const it = slice.feedback.find((x) => x.threadId === t.id);
  const mine = t.messages.filter((m) => m.from === 'me').at(-1)?.body ?? '';
  const type = it?.type ?? 'question';
  const winRoll = rng(state);
  const history = t.messages.slice(-6).map((m) => `${m.from === 'me' ? 'FOUNDER' : 'YOU'}: ${m.body}`).join('\n');
  const q = heuristicReplyQuality(mine, type);
  const res = await llmOf(ctx).ask({
    task: 'customer_reply', rubric: REPLY_CRITERIA,
    system: `${REALISM}\nYou are ${t.with?.name}, a ${type === 'cancel' ? 'customer who just canceled' : 'customer'} of ${state.company.name}. You wrote about: ${it?.topic ?? t.subject}. Generic, canned or defensive replies leave you unsatisfied; a specific fix, date, workaround or a real question about your situation satisfies you.\n${replyRubric()}`,
    prompt: `Conversation so far:\n${history}\n\nReply to the founder's last message in 1–3 sentences, in character. Then score every rubric criterion for the founder's last message only (quote the words behind any 1 or 2), and rate how satisfied you are.${type === 'cancel' ? ' This is a cancellation thread: score cancel_handling.' : ' This is not a cancellation: score cancel_handling 3.'}`,
    schema: REPLY_SCHEMA,
    temperature: 0.8,
    maxTokens: 600, // reply + five scored criteria + quoted evidence; 250 cut the JSON off mid-string
    fallback: () => ({
      reply: q >= 0.6 ? (type === 'cancel' ? 'Okay, that\'s fair. Maybe I\'ll give it another month.' : 'Thanks, that helps. Appreciate the quick answer.') : 'Okay. Let me know when it\'s actually sorted.',
      ...replyFallbackCriteria(q), satisfied: q, comeBack: type === 'cancel' && q >= 0.7,
    }),
  });
  const d = res.data;
  addMessage(state, t.id, { from: 'them', body: d.reply });
  if (!it) return;
  it.repliedDay ??= state.day;
  const satisfied = res.mock ? clamp(Number(d.satisfied) || 0, 0, 1) : replySatisfaction(d);
  it.satisfied = satisfied;
  it.status = satisfied >= 0.6 ? 'resolved' : 'replied';
  const sub = subOf(state, it.subId);
  if (!sub) return;
  if (satisfied >= 0.6 && type !== 'cancel') {
    sub.churnMult = FEEDBACK.churnMultIfHelped; // needs core support in churnBeforeRenewal (see report)
    if (sub.cancelAtPeriodEnd && sub.cancelReason === 'felt_ignored') { sub.cancelAtPeriodEnd = false; sub.cancelReason = null; it.consequence = 'saved'; }
  }
  if (type === 'cancel' && satisfied >= 0.7 && d.comeBack && winRoll < (res.mock ? FEEDBACK.winBack : 0.5)) {
    if (sub.status === 'active' && sub.cancelAtPeriodEnd) { sub.cancelAtPeriodEnd = false; sub.cancelReason = null; }
    else if (sub.status === 'canceled') subscribe(state, sub.customerId, mainPlan(state), { trial: false, source: sub.source });
    it.consequence = 'won_back';
    notify(state, `${t.with?.name} came back after your reply.`, { type: 'good', app: 'customers' });
  }
}

// ---- UI ----

function panelView(ctx, slice) {
  const s = ctx.state;
  const feats = shippedFeatures(s);
  const personas = buildPersonas(s);
  const p = slice.panels[0];
  const m = ensureMarket(s);
  return html`
    <div class="callout small">These panelists are AI personas. In real life, synthetic users give shallow, overly favourable feedback (NN/G 2024) and are never evidence; here they stand in for the market so the game can react to what you ship. Real evidence comes from <a href="#/research">real interviews</a>.</div>
    <div class="grid-2">
      <section class="panel">
        <h2>Run a trial panel</h2>
        <p class="small muted">Each panelist sees only your <b>shipped</b> features, your website copy, your price (${money(monthlyPrice(mainPlan(s)))}/mo) and your onboarding mode (${OB_LABEL[m.onboarding]}).</p>
        <ul class="list small">${personas.map((x) => html`<li>${x.source === 'crm' ? html`<span class="badge accent">CRM</span> ` : ''}${x.role}</li>`)}</ul>
        <p class="small">${feats.length ? `${feats.length} shipped feature(s): ${feats.map((f) => f.title).join(', ')}` : html`<span class="neg">Nothing shipped yet.</span> <a href="#/product">Build something first.</a>`}</p>
        <button class="primary" id="runPanel" ${feats.length ? '' : 'disabled'}>Run trial panel (${PANEL_HOURS} h)</button>
      </section>
      <section class="panel">
        <h2>Product fit</h2>
        <div class="stats">
          <div class="stat"><div class="stat-label">Estimated product fit</div><div class="stat-value">${p?.agg.estimate != null ? Math.round(p.agg.estimate * 100) : '—'}</div><div class="stat-sub">${p ? `±${Math.round(100 * 0.12 / Math.sqrt(Math.max(1, (p.agg.n ?? 2) / 2)))} · panel of ${fmtDate(s, p.day)}` : 'run a panel to estimate'}</div></div>
          <div class="stat"><div class="stat-label">Willingness to pay</div><div class="stat-value">${money(m.fit.price.stated ?? m.fit.price.wtp)}</div><div class="stat-sub">${m.fit.price.source ?? '—'}</div></div>
          ${p ? html`<div class="stat"><div class="stat-label">Activated</div><div class="stat-value">${pct(p.agg.activation, 0)}</div><div class="stat-sub">would pay: ${pct(p.agg.payRate, 0)}</div></div>` : ''}
        </div>
        ${p ? html`<h3>Missing must-haves</h3>${p.agg.mustHaves.length ? html`<ul class="small">${p.agg.mustHaves.map((x) => html`<li>${x.text} <span class="muted">×${x.count}</span></li>`)}</ul>` : html`<p class="small muted">None mentioned.</p>`}
          <h3>Per feature</h3><ul class="small list">${Object.entries(p.agg.perFeature).map(([k, v]) => html`<li>${k}: <span class="pos">${v.useful} useful</span> · ${v.meh} meh · <span class="neg">${v.irrelevant} irrelevant</span></li>`)}</ul>` : ''}
      </section>
    </div>
    ${p ? html`<section class="panel"><h2>Panel of ${fmtDate(s, p.day)}</h2>${p.results.map((r) => html`<div class="card">
        <div class="small muted">${r.persona.role} · ${r.model}${r.mock ? ' (offline)' : ''} · churn risk ${pct(r.churnRisk, 0)}</div>
        <p>${r.activated ? html`<span class="badge good">activated</span>` : html`<span class="badge bad">didn't activate</span>`} ${r.wouldPay ? html`<span class="badge good">would pay</span>` : html`<span class="badge">wouldn't pay</span>`} WTP ${money(r.willingnessToPayMonthly)}/mo</p>
        <p>"${r.quote}"</p>
        ${r.activated ? html`<p class="small"><b>Aha:</b> ${r.ahaMoment}</p>` : ''}
        ${r.vsAlternative && r.vsAlternative !== 'none' ? html`<p class="small"><b>Vs. what they use:</b> ${r.vsAlternative}</p>` : ''}
        ${r.persona.knows?.length ? html`<p class="small muted">Knows: ${r.persona.knows.join(', ')}</p>` : ''}
        ${r.missingMustHaves?.length ? html`<p class="small"><b>Missing:</b> ${r.missingMustHaves.join('; ')}</p>` : ''}
      </div>`)}</section>` : ''}`;
}

function onboardingView(ctx, slice) {
  const s = ctx.state;
  const m = ensureMarket(s);
  const recent = ensureStripe(s).subscriptions.filter((x) => x.startDay > s.day - 7 && (x.trialEndDay || s.company.model === 'ent')).length;
  const proj = (mode) => recent * BOOKING_SHARE[mode] * ONBOARDING[mode].hoursPerTrial;
  const evs = ensureCalendar(s).events;
  const upcoming = slice.onboarding.filter((r) => r.status === 'booked');
  const focus = ctx.params;
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Onboarding mode</h2>
        <form id="obForm">
          ${Object.keys(ONBOARDING).map((k) => html`<label class="radio-card"><input type="radio" name="mode" value="${k}" ${m.onboarding === k ? 'checked' : ''} /><b>${OB_LABEL[k]}</b><span>${k === 'self' ? 'No human touch. Cheapest; activation depends entirely on the product.' : `Trial→paid ×${ONBOARDING[k].conv} for trials that get it (game assumption; one sales touch lifts ~38% in a low-confidence vendor study, concierge 1.5–3×). ~${ONBOARDING[k].hoursPerTrial} founder h each, booked on your calendar; ~${pct(BOOKING_SHARE[k], 0)} of trials book. At last week's ${recent} new trials: ~${proj(k).toFixed(1)} h/week.`}</span></label>`)}
          <label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" name="card" ${m.cardRequired ? 'checked' : ''} /> Require a card to start the trial <span class="hint">(opt-out trials convert ~49–60% vs ~18–25% opt-in, with fewer signups)</span></label>
          <button class="primary">Save</button>
        </form>
        <p class="small muted">Define activation as the "aha" event tied to retention and remove every step before it. Self-serve below ~$5k ACV, hybrid $5–25k, sales-led above.</p>
      </section>
      <section class="panel">
        <h2>Onboarding calls</h2>
        ${upcoming.length ? html`<ul class="list">${upcoming.slice(0, 20).map((r) => {
          const ev = evs.find((e) => e.id === r.eventId);
          const today = ev && ev.day === s.day && ev.status === 'scheduled';
          return html`<li style="${focus === r.id ? 'background:var(--accent-soft)' : ''}"><b>${r.company ?? r.name}</b> <span class="small muted">${r.mode} · ${fmtDate(s, r.day)} ${fmtTime(r.start)}</span>
            ${today ? html` <button class="sm primary" data-hold="${r.id}">Join & hold call</button>` : html` <span class="badge">${ev?.status ?? 'scheduled'}</span>`}</li>`;
        })}</ul>
        ${upcoming.some((r) => r.day === s.day) ? html`<button id="holdAll">Hold all of today's calls</button>` : ''}` : html`<p class="empty">No onboarding calls booked.</p>`}
        <p class="small muted">Calls are charged to your hours on the day (by the calendar). If you don't join, the trial user waits on the link and is less likely to convert.</p>
        <h3>History</h3>
        <p class="small">${['held', 'no-show', 'canceled'].map((st) => `${slice.onboarding.filter((r) => r.status === st).length} ${st}`).join(' · ')}</p>
      </section>
    </div>`;
}

function setupView(ctx, slice) {
  const s = ctx.state;
  const evs = ensureCalendar(s).events;
  const list = setups(s);
  const booked = list.filter((r) => r.status === 'booked');
  const cands = setupCandidates(s).slice(0, 12);
  const held = list.filter((r) => r.status === 'held').length;
  const accounts = ensureStripe(s).subscriptions.length;
  const dh = s.company.model === 'b2c' ? 1 : 2;
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>White-glove setup</h2>
        <p class="small muted">"We set it up for you": a live session per account (${SETUP.hours.min}-${SETUP.hours.max} h, ${setupHoursFor(s, dh)} h by default${slice.playbook ? ', cut by your playbook' : ''}). Trials convert far better and early churn drops, and you hear exactly where people get stuck. Effects are game assumptions [design]. It does not scale: past ~${SETUP.scaleCoachAt} accounts it eats the week.</p>
        <div class="stats"><div class="stat"><div class="stat-label">Sessions held</div><div class="stat-value">${held}</div><div class="stat-sub">${accounts} accounts total</div></div>
          <div class="stat"><div class="stat-label">Testimonials</div><div class="stat-value">${slice.testimonials ?? 0}</div></div></div>
        ${cands.length ? html`<ul class="list">${cands.map((sub) => {
          const c = ensureStripe(s).customers.find((x) => x.id === sub.customerId);
          return html`<li><b>${c?.company ?? c?.name ?? 'Customer'}</b> <span class="small muted">${sub.status} · since ${fmtDate(s, sub.startDay)}</span>
            <select data-sh="${sub.id}"><option value="1">1 h</option><option value="2" ${dh === 2 ? 'selected' : ''}>2 h</option><option value="3">3 h</option></select> <button class="sm primary" data-book-setup="${sub.id}">Book setup</button></li>`;
        })}</ul>` : html`<p class="empty">No new accounts without a setup session.</p>`}
        <h3>Playbook</h3>
        ${slice.playbook ? html`<p class="small">Productized on ${fmtDate(s, slice.playbook.day)} after ${slice.playbook.sessions} sessions${slice.playbook.quality < 1 ? ' (premature: expect rewrites)' : ''}.</p>`
          : html`<p class="small muted">${accounts >= SETUP.scaleCoachAt ? 'You have outgrown hand-onboarding. ' : ''}Write the checklist, templates and docs (${SETUP.playbookHours} h). Best after ${SETUP.playbookMinSessions}+ sessions so you know what to document.</p><button id="productize">Productize onboarding (${SETUP.playbookHours} h)</button>`}
      </section>
      <section class="panel">
        <h2>Upcoming sessions</h2>
        ${booked.length ? booked.slice(0, 20).map((r) => {
          const ev = evs.find((e) => e.id === r.eventId);
          const today = ev && ev.day === s.day && ev.status === 'scheduled';
          return html`<div class="card"><b>${r.company ?? r.name}</b> <span class="small muted">${fmtDate(s, r.day)} ${fmtTime(r.start)} · ${r.hours} h</span>
            ${today ? html`<form data-setup-form="${r.id}"><textarea name="notes" placeholder="Notes: where did they get stuck? What did they say (quote it)? What did they ask for? What do they do today instead?" rows="4"></textarea><button class="sm primary">Join and hold session</button></form>` : html`<span class="badge">${ev?.status ?? 'scheduled'}</span>`}</div>`;
        }) : html`<p class="empty">No sessions booked.</p>`}
        <h3>History</h3>
        <ul class="list small">${list.filter((r) => r.status !== 'booked').slice(0, 10).map((r) => html`<li>${r.company ?? r.name}: ${r.status}${r.status === 'held' ? ` · ${learningMode(s) ? `notes ${r.notesTier}, ` : ''}${r.insights} insight(s)${r.testimonial ? ', testimonial' : ''}` : ''}${r.status === 'held' && r.notesTier !== 'stellar' ? adviceFor(s, 'customer_success', ['Quote the customer, name the blocker and what they do today.'], { kind: 'coaching' }).map((i) => ` · ${i.text} (${i.from})`).join('') : ''}</li>`)}</ul>
      </section>
    </div>`;
}

function feedbackView(ctx, slice) {
  const s = ctx.state;
  const items = slice.feedback;
  const answered = items.filter((x) => x.repliedDay != null);
  const avgResp = answered.length ? answered.reduce((a, x) => a + (x.repliedDay - x.day), 0) / answered.length : null;
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Open</div><div class="stat-value">${items.filter((x) => x.status === 'open').length}</div><div class="stat-sub">unanswered emails</div></div>
      <div class="stat"><div class="stat-label">Avg response</div><div class="stat-value">${avgResp == null ? '—' : `${avgResp.toFixed(1)}d`}</div><div class="stat-sub">ignored after ${FEEDBACK.ignoreDays} days</div></div>
      <div class="stat"><div class="stat-label">Resolved</div><div class="stat-value">${items.filter((x) => x.status === 'resolved').length}</div><div class="stat-sub">${items.filter((x) => x.consequence === 'won_back').length} won back</div></div>
      <div class="stat ${items.some((x) => x.consequence === 'cancel_at_period_end') ? 'bad' : ''}"><div class="stat-label">Lost to silence</div><div class="stat-value">${items.filter((x) => x.consequence === 'cancel_at_period_end').length}</div><div class="stat-sub">canceled after no reply</div></div>
    </div>
    ${(() => {
      const log = requestLog(s, slice).slice(0, 8);
      return log.length ? html`<section class="panel"><h2>Feature requests</h2><p class="small muted">Most MRR first. One loud account asking is not a market: check how many accounts need the same thing before you build it.</p>
        <div class="table-wrap"><table><thead><tr><th>Request</th><th>Accounts asking</th><th>MRR behind it</th><th>Status</th></tr></thead><tbody>${log.map((r) => html`<tr><td class="small">${r.text}</td><td>${r.accounts}</td><td>${money(r.mrr)}</td><td>${r.status}</td></tr>`)}</tbody></table></div></section>` : '';
    })()}
    <section class="panel"><h2>Customer emails</h2><p class="small muted">Feature requests, bug reports and cancellation reasons from active customers. Reply in Mail: a fast, specific answer (fix, date, workaround, a real question) keeps accounts; canned replies don't.</p>
    ${items.length ? html`<div class="table-wrap"><table><thead><tr><th>Day</th><th>Type</th><th>About</th><th>Status</th><th></th></tr></thead><tbody>${items.slice(0, 40).map((x) => html`<tr>
      <td>${fmtDate(s, x.day)}</td><td><span class="badge ${x.type === 'bug' || x.type === 'cancel' ? 'bad' : x.type === 'request' ? 'accent' : ''}">${x.type}</span></td><td class="small">${x.topic}</td>
      <td><span class="badge ${x.status === 'resolved' ? 'good' : x.status === 'ignored' ? 'bad' : x.status === 'open' ? 'warn' : ''}">${x.status}</span></td><td><a class="btn sm" href="#/mail/customer:${x.threadId}">Open</a></td></tr>`)}</tbody></table></div>` : html`<p class="empty">No customer email yet. Paying customers write in occasionally.</p>`}</section>`;
}

const interviewDraft = {};
const labelOfCat = (k) => (k === 'no_answer' ? 'No usable answer (skipped or "other")' : CANCEL_CATEGORIES[k] ?? k);

function churnView(ctx, slice) {
  const s = ctx.state;
  slice.interviews ??= [];
  const subs = ensureStripe(s).subscriptions.filter((x) => x.status === 'canceled');
  const byReason = {};
  for (const x of subs) byReason[x.cancelReason ?? 'unknown'] = (byReason[x.cancelReason ?? 'unknown'] ?? 0) + 1;
  const paid = slice.surveys.filter((x) => !x.trial);
  const trials = slice.surveys.filter((x) => x.trial);
  const tally = (list) => Object.entries(list.reduce((a, x) => ((a[x.category] = (a[x.category] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const bar = (n, total) => html`<div class="meter" style="flex:1"><div style="width:${total ? (n / total) * 100 : 0}%"></div></div>`;
  const block = (title, list) => html`<section class="panel"><h2>${title} <span class="badge">${list.length} responses</span></h2>${list.length ? html`<ul class="list">${tally(list).map(([k, n]) => html`<li style="display:flex;gap:8px;align-items:center"><span style="flex:2">${labelOfCat(k)}</span>${bar(n, list.length)}<span class="small">${pct(n / list.length, 0)}</span></li>`)}</ul>` : html`<p class="empty">No responses yet.</p>`}</section>`;
  const cancelMails = slice.feedback.filter((x) => x.type === 'cancel');
  const lostTo = Object.entries(slice.surveys.filter((x) => x.competitor).reduce((a, x) => ((a[x.competitor] = (a[x.competitor] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  // Exit interviews: recent paying churners you can still reach.
  const recent = subs.filter((x) => x.paidMonths > 0 && x.canceledDay != null && s.day - x.canceledDay <= INTERVIEW.windowDays && x.cancelReason !== 'trial_not_converted').sort((a, b) => b.canceledDay - a.canceledDay).slice(0, 12);
  const ivOf = (id) => slice.interviews.find((x) => x.subId === id);
  const learned = slice.interviews.filter((x) => x.revealed);
  const learnedTally = Object.entries(learned.reduce((a, x) => ((a[x.revealed] = (a[x.revealed] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const mismatch = learned.filter((x) => x.statedCategory && x.statedCategory !== 'no_answer' && !sameStory(x.revealed, x.statedCategory)).length;
  return html`
    <div class="inline" style="justify-content:space-between;flex-wrap:wrap"><p class="small muted">Exit survey: ~${pct(FEEDBACK.surveyResponse, 0)} of cancellations answer by email (failed-payment churners almost never; a cancel-flow survey gets more). Stated reasons are what customers SAY: "too expensive" often means they never got value. Stripe's raw cancel reasons: ${Object.entries(byReason).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(' · ') || 'none yet'}.</p>${b2cCategoryField(s)}</div>
    <div class="grid-2">${block('What paying customers said (survey)', paid)}${block('Why trials didn\'t convert', trials)}</div>
    <section class="panel"><h2>Exit interviews <span class="badge">${slice.interviews.filter((x) => x.status === 'done').length} held</span></h2>
      <p class="small muted">A 30-minute call with someone who just left is the only reliable way to learn the real reason. Ask open questions about what happened ("walk me through the week you decided"), who else was involved, and what they use now; never "was it the price?", and don't pitch. ~${INTERVIEW.outreachHours}h to ask, ~${INTERVIEW.callHours}h for the call; many say no.</p>
      ${recent.length ? html`<ul class="list">${recent.map((x) => {
        const c = custOf(s, x.customerId);
        const iv = ivOf(x.id);
        const sv = slice.surveys.find((y) => y.subId === x.id);
        return html`<li><b>${c?.company ?? c?.name ?? 'Customer'}</b> <span class="small muted">left ${fmtDate(s, x.canceledDay)} · survey: ${sv ? (sv.text ?? labelOfCat(sv.category)) : 'no answer'}</span>
          ${!iv ? html` <button class="sm" data-ivask="${x.id}">Ask for an exit interview (${INTERVIEW.outreachHours} h)</button>`
            : iv.status === 'declined' ? html` <span class="badge">declined</span>`
            : iv.status === 'accepted' ? html`<form class="ivform" data-ivsub="${x.id}"><label class="small">Your questions (one per line)<textarea name="q" rows="4" placeholder="Walk me through the week you decided to cancel. What happened?">${interviewDraft[x.id] ?? ''}</textarea></label><button class="sm primary">Hold the call (${INTERVIEW.callHours} h)</button></form>`
            : html`<div class="small">${learningMode(s) ? html`<span class="badge ${iv.revealed ? 'good' : ''}">${iv.revealed ? 'learned the real reason' : 'polite answer only'}</span> ` : ''}"${iv.answer}"${iv.coaching ? adviceFor(s, 'customer_discovery', [iv.coaching], { kind: 'coaching' }).map((i) => html`<div class="muted">${i.text} (${i.from})</div>`) : ''}</div>`}
        </li>`;
      })}</ul>` : html`<p class="empty">No paying customers left in the last ${INTERVIEW.windowDays} days.</p>`}
      ${learned.length && learningMode(s) ? html`<h3>Real reasons learned (${learned.length})</h3><ul class="list small">${learnedTally.map(([k, n]) => html`<li>${CHURN_REASONS[k]?.label ?? k}: ${n}</li>`)}</ul><p class="small muted">${mismatch} of ${learned.length} interviews told a different story than that customer's survey answer.</p>` : ''}
    </section>
    ${lostTo.length ? html`<section class="panel"><h2>Lost to competitors</h2><ul class="list small">${lostTo.map(([n, c]) => html`<li>${n}: ${c}</li>`)}</ul><p class="small muted">Only competitors with meaningful market share pull churners away (weighted by share and momentum). See <a href="#/market">Market & competitors</a>.</p></section>` : ''}
    ${cancelMails.length ? html`<section class="panel"><h2>In their words</h2><ul class="list small">${cancelMails.slice(0, 10).map((x) => html`<li>${x.topic} · <a href="#/mail/customer:${x.threadId}">thread</a> <span class="badge ${x.consequence === 'won_back' ? 'good' : ''}">${x.consequence ?? x.status}</span></li>`)}</ul></section>` : ''}`;
}

// Does a stated survey category tell the same story as the real reason?
function sameStory(reasonId, category) {
  return (CHURN_REASONS[reasonId]?.surveyLabels ?? []).some((l) => l.category === category && !l.misleading);
}

/** Ask a churned customer for an exit interview (outreach only; the call is a second step). */
export function requestExitInterview(state, subId) {
  const slice = customersSlice(state);
  slice.interviews ??= [];
  if (slice.interviews.some((x) => x.subId === subId)) throw new Error('Already asked.');
  const sub = subOf(state, subId);
  if (!sub || sub.status !== 'canceled') throw new Error('Only customers who cancelled can be interviewed.');
  const c = custOf(state, sub.customerId);
  const p = interviewAcceptance({ model: state.company.model, crm: Boolean(c?.crmCompanyId), involuntary: sub.churnReason === 'payment_failed' });
  const iv = { id: uid('xiv'), subId, customerId: sub.customerId, day: state.day, status: chance(state, p) ? 'accepted' : 'declined' };
  slice.interviews.unshift(iv);
  if (slice.interviews.length > 200) slice.interviews.length = 200;
  return iv;
}

/** Hold the exit interview: the founder's questions are judged; good interviews surface the true reason. */
export async function holdExitInterview(ctx, subId, questions) {
  const state = ctx.state;
  const slice = customersSlice(state);
  const iv = (slice.interviews ?? []).find((x) => x.subId === subId && x.status === 'accepted');
  if (!iv) throw new Error('No accepted interview for this customer.');
  const sub = subOf(state, subId);
  const c = custOf(state, sub.customerId);
  const sv = slice.surveys.find((y) => y.subId === subId);
  const seg = churnSegment(state, sub);
  const segmentLabel = seg.kind === 'b2c' ? B2C_CHURN[seg.id]?.label : getSegment(seg.id)?.label;
  const trueReason = sub.churnReason ?? 'other';
  const args = { name: c?.name ?? 'the customer', company: c?.company, segmentLabel, trueReason, stated: sv?.text ?? null, productName: state.company.name, questions };
  const { system, prompt } = interviewPrompt(args);
  const res = await llmOf(ctx).ask({ task: 'exit_interview', rubric: INTERVIEW_CRITERIA, context: bizBlock(ctx.state, 'customer'), system, prompt, schema: INTERVIEW_SCHEMA, temperature: 0.7, maxTokens: 900, fallback: () => interviewFallback(args) });
  const d = res.data;
  const h = exitInterviewQuality(questions);
  const p = revealChance(h, res.mock ? null : interviewQuality(d), res.mock);
  const revealed = rng(state) < p;
  Object.assign(iv, { status: 'done', heldDay: state.day, questions: String(questions).slice(0, 1500), quality: +h.toFixed(2), revealed: revealed ? trueReason : null, statedCategory: sv?.category ?? null, answer: revealed ? d.candidAnswer : d.guardedAnswer, coaching: d.coaching, mock: res.mock });
  return iv;
}

export default {
  id: 'customers',
  title: 'Customer panel',
  icon: '🧪',
  group: 'Product',
  badge: (state) => (state.apps.customers?.feedback ?? []).filter((x) => x.status === 'open').length || null,

  render(root, ctx) {
    const s = ctx.state;
    const slice = customersSlice(s);
    const param = ctx.params || 'panel';
    const tab = param.startsWith('onb_') ? 'onboarding' : ['panel', 'onboarding', 'setup', 'feedback', 'churn'].includes(param) ? param : 'panel';
    const tabs = [['panel', 'Trial panel'], ['onboarding', 'Onboarding'], ['setup', 'White-glove setup'], ['feedback', 'Feedback'], ['churn', 'Churn reasons']];
    mount(root, html`
      <div class="app-head"><div><h1>Customer panel</h1><p>Do people activate, see value and pay? Trials, onboarding, customer emails and why people leave.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/customers/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'panel' ? panelView(ctx, slice) : tab === 'onboarding' ? onboardingView(ctx, slice) : tab === 'setup' ? setupView(ctx, slice) : tab === 'feedback' ? feedbackView(ctx, slice) : churnView(ctx, slice)}`);

    on(root, 'click', '#runPanel', async (e, el) => {
      el.disabled = true;
      el.textContent = 'Panelists are trying your product…';
      await ctx.act(() => runPanel(ctx), { hours: PANEL_HOURS, label: 'Customer trial panel' });
    });
    on(root, 'submit', '#obForm', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      ctx.act((st) => {
        const m = ensureMarket(st);
        m.onboarding = fd.get('mode') ?? 'self';
        m.cardRequired = fd.get('card') === 'on';
        toast(`Onboarding: ${OB_LABEL[m.onboarding]}, ${m.cardRequired ? 'card required' : 'no card'}.`, 'good');
      });
    });
    const hold = (st, rec) => {
      completeEvent(st, rec.eventId, 'done', 'held');
      rec.status = 'held';
      markOnboarded(st, rec, 'held');
    };
    on(root, 'click', '[data-book-setup]', (e, el) => ctx.act((st) => {
      const h = Number(root.querySelector(`[data-sh="${el.dataset.bookSetup}"]`)?.value) || undefined;
      const r = bookSetup(st, el.dataset.bookSetup, { hours: h });
      toast(r.ok ? `Booked for ${fmtDate(st, r.rec.day)}. The calendar charges the hours that day.` : r.error, r.ok ? 'good' : 'warn');
    }, { hours: 0.1, label: 'Book setup session' }));
    on(root, 'submit', '[data-setup-form]', (e, el) => {
      e.preventDefault();
      const notes = el.querySelector('textarea').value;
      ctx.act((st) => {
        const r = holdSetup(st, el.dataset.setupForm, notes);
        toast(r.ok ? `Held. ${r.rec.insights} real insight(s) added to Research (notes: ${r.rec.notesTier}).` : r.error, r.ok ? 'good' : 'warn');
      }, { hours: 0.1, label: 'Setup session notes' });
    });
    on(root, 'click', '#productize', () => ctx.act((st) => {
      const r = productizeOnboarding(st);
      toast(r.ok ? (r.quality < 1 ? 'Docs written, but you had little to base them on.' : 'Onboarding productized: checklist, templates, docs.') : r.error, r.ok ? 'good' : 'warn');
    }, { hours: SETUP.playbookHours, label: 'Productize onboarding' }));
    wireB2cCategory(root, ctx);
    on(root, 'click', '[data-ivask]', (e, el) => ctx.act((st) => {
      const iv = requestExitInterview(st, el.dataset.ivask);
      toast(iv.status === 'accepted' ? 'They agreed to a short call. Write your questions.' : 'No reply. Most churned customers never answer.', iv.status === 'accepted' ? 'good' : 'info');
    }, { hours: INTERVIEW.outreachHours, label: 'Exit interview outreach' }));
    on(root, 'input', '.ivform textarea', (e, el) => { interviewDraft[el.closest('form').dataset.ivsub] = el.value; });
    on(root, 'submit', '.ivform', (e, el) => {
      e.preventDefault();
      const id = el.dataset.ivsub;
      const q = el.querySelector('textarea').value;
      if (!q.trim()) { toast('Write at least one question.', 'warn'); return; }
      ctx.act(async () => { const iv = await holdExitInterview(ctx, id, q); delete interviewDraft[id]; toast('Exit interview held. Read their answer below.', 'info'); }, { hours: INTERVIEW.callHours, label: 'Exit interview' });
    });
    on(root, 'click', '[data-hold]', (e, el) => ctx.act((st) => {
      const rec = customersSlice(st).onboarding.find((r) => r.id === el.dataset.hold);
      if (rec?.status === 'booked') { hold(st, rec); toast(`Held ${rec.name}'s ${rec.mode === 'concierge' ? 'setup' : 'kickoff'}: they got to the aha moment with you.`, 'good'); }
    }, { hours: 0.05, label: 'Onboarding call notes' }));
    on(root, 'click', '#holdAll', () => ctx.act((st) => {
      const evs = ensureCalendar(st).events;
      for (const rec of customersSlice(st).onboarding) {
        const ev = evs.find((x) => x.id === rec.eventId);
        if (rec.status === 'booked' && ev?.day === st.day && ev.status === 'scheduled') hold(st, rec);
      }
    }, { hours: 0.1, label: 'Onboarding call notes' }));
  },

  onDay(state) {
    const slice = customersSlice(state);
    onboardingDay(state, slice);
    setupDay(state);
    feedbackDay(state, slice);
  },

  jobs: {
    'customer:feedback': feedbackJob,
    'reply:customer': replyJob,
  },
};
