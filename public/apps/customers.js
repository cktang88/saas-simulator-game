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
import { ensureMarket, mainPlan, monthlyPrice, trialConversion, cfg, shippedFeatures } from '../core/market.js';
import { activeSubs, ensureStripe, cancel, subscribe } from '../core/stripe.js';
import { newThread, addMessage, ensureMail } from '../core/mail.js';
import { enqueue } from '../core/jobs.js';
import { scheduleEvent, findSlots, completeEvent, ensureCalendar, fmtTime } from '../core/calendar.js';
import { rng, chance, pick, money, pct, fmtDate, clamp, uid } from '../core/util.js';
import { customersSlice, productSlice } from './product/store.js';
import { openBugHours } from './product/build.js';
import { PANEL_SCHEMA, buildPersonas, trialBrief, heuristicTrial, aggregatePanel, BOOKING_SHARE, UNATTENDED_PENALTY, FEEDBACK, CANCEL_CATEGORIES, cancelCategory, heuristicReplyQuality } from './product/panel.js';

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
  for (const p of personas) {
    const res = await llmOf(ctx).panel({
      task: 'product_trial_panel',
      system: `${REALISM}\nYou are ${p.role}. Context: ${p.context}\nThe year is 2026. You signed up for a trial and used the product for a week alongside your real work. You only know what is below; if a feature isn't listed it does not exist.${bugs > 40 ? ' The product was buggy in places.' : ''}`,
      prompt: `${brief}\n\nAfter your trial week, answer honestly. Most trials never activate and most people don't pay. Judge each listed feature by its exact title.`,
      schema: PANEL_SCHEMA,
      temperature: 0.8,
      maxTokens: 700,
      fallback: () => heuristicTrial(state, p, feats, { openBugHours: bugs, refPrice: cfg(state).refPrice, priceMonthly }),
      cache: state.cache,
    });
    for (const r of res) out.push({ persona: { id: p.id, role: p.role, source: p.source, name: p.name }, model: r.model, mock: r.mock, ...r.data });
  }
  const agg = aggregatePanel(out, priceMonthly);
  const m = ensureMarket(state);
  const source = out.every((r) => r.mock) ? 'offline heuristic' : 'LLM trial panel';
  m.fit.product = { score: agg.score, notes: `${agg.n} trial judgments; activation ${pct(agg.activation, 0)}, would pay ${pct(agg.payRate, 0)}`, day: state.day, source };
  if (agg.useful && agg.wtp) m.fit.price = { wtp: agg.wtp, notes: 'median willingness to pay of activated trial panelists', day: state.day, source };
  const slice = customersSlice(state);
  slice.panels.unshift({ id: uid('pnl'), day: state.day, features: feats.map((f) => f.title), onboarding: m.onboarding, price: priceMonthly, results: out, agg });
  slice.panels.length = Math.min(slice.panels.length, 5);
  notify(state, `Trial panel: product fit ${Math.round(agg.score * 100)}/100, ${pct(agg.activation, 0)} activated, ${pct(agg.payRate, 0)} would pay ${money(priceMonthly)}/mo.`, { type: agg.score > 0.55 ? 'good' : 'info', app: 'customers' });
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
    if (ev.status === 'done') rec.status = 'held';
    else if (ev.status === 'unattended' || ev.status === 'missed') {
      rec.status = 'no-show';
      const sub = subOf(state, rec.subId);
      if (sub?.status === 'trialing') sub.forceConvert = selfServeRate(state) * UNATTENDED_PENALTY;
      notify(state, `You didn't show up to ${rec.name}'s ${rec.mode === 'concierge' ? 'concierge setup' : 'kickoff call'}. They waited on the link; that trial is now less likely to convert.`, { type: 'bad', app: 'customers' });
    }
  }
}

function feedbackDay(state, slice) {
  const subs = activeSubs(state);
  const pslice = productSlice(state);
  const bugs = pslice.bugs.filter((b) => !b.fixedDay);
  if (subs.length && chance(state, Math.min(0.9, subs.length * FEEDBACK.perAccountDaily))) {
    const sub = pick(state, subs);
    const r = rng(state);
    const type = bugs.length && r < 0.4 ? 'bug' : r < 0.85 ? 'request' : 'question';
    const lastPanel = slice.panels[0];
    const topic = type === 'bug' ? pick(state, bugs).title
      : type === 'request' ? (lastPanel?.agg.mustHaves.length ? pick(state, lastPanel.agg.mustHaves).text : pick(state, ['an export to CSV', 'a way to invite a teammate', 'an integration with the tool they already use', 'a weekly summary email', 'bulk editing']))
        : pick(state, ['how billing works for annual plans', 'whether their data is used to train AI models', 'how to set up the main feature']);
    enqueue(state, 'customer:feedback', { subId: sub.id, customerId: sub.customerId, type, topic }, { label: 'Customer email' });
  }
  // Exit survey for today's cancellations.
  const m = ensureMarket(state);
  const price = monthlyPrice(mainPlan(state));
  let emailed = 0;
  for (const sub of ensureStripe(state).subscriptions) {
    if (sub.status !== 'canceled' || sub.canceledDay !== state.day) continue;
    if (!chance(state, FEEDBACK.surveyResponse)) continue;
    const category = cancelCategory(() => rng(state), {
      reason: sub.cancelReason, priceRatio: m.fit.price.wtp ? price / m.fit.price.wtp : 1, productScore: m.fit.product.score ?? 0.35,
      bugHours: openBugHours(pslice), onboarding: m.onboarding, wrapper: pslice.features.some((f) => f.commoditized),
    });
    slice.surveys.unshift({ day: state.day, subId: sub.id, customerId: sub.customerId, reason: sub.cancelReason, category, trial: sub.cancelReason === 'trial_not_converted' });
    if (!emailed && sub.cancelReason !== 'trial_not_converted' && chance(state, FEEDBACK.cancelEmailShare)) {
      emailed++;
      enqueue(state, 'customer:feedback', { subId: sub.id, customerId: sub.customerId, type: 'cancel', topic: CANCEL_CATEGORIES[category] }, { label: 'Cancellation email' });
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
}

// ---- Jobs ----

const EMAIL_SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string' } } };
const REPLY_SCHEMA = { type: 'object', additionalProperties: false, required: ['reply', 'satisfied', 'comeBack'], properties: { reply: { type: 'string' }, satisfied: { type: 'number', description: '0-1: how well the founder actually addressed your issue' }, comeBack: { type: 'boolean', description: 'Only for cancellations: would you really resubscribe/stay now?' } } };

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
    system: `${REALISM}\nYou are ${c.name}${c.company ? ` from ${c.company}` : ''}, a ${payload.type === 'cancel' ? 'customer who just canceled' : 'paying customer'} of ${state.company.name} (${state.company.oneLiner}). Shipped features: ${feats}. Write like a real busy customer: short, plain, a bit annoyed if something broke, no pleasantries padding.`,
    prompt: `Write an email to the founder. Type: ${payload.type}. About: ${payload.topic}. 2–5 sentences, specific to your situation.`,
    schema: EMAIL_SCHEMA,
    temperature: 0.9,
    maxTokens: 300,
    fallback: () => fallbackEmail(state, c, payload.type, payload.topic),
  });
  const t = newThread(state, { subject: res.data.subject, with: { name: c.name, email: c.email, company: c.company }, kind: 'customer', app: 'customers', refId: uid('cfb') });
  addMessage(state, t.id, { from: 'them', body: res.data.body });
  customersSlice(state).feedback.unshift({ id: t.refId, threadId: t.id, customerId: c.id, subId: payload.subId, type: payload.type, topic: payload.topic, day: state.day, status: 'open', mock: res.mock });
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
    task: 'customer_reply',
    system: `${REALISM}\nYou are ${t.with?.name}, a ${type === 'cancel' ? 'customer who just canceled' : 'customer'} of ${state.company.name}. You wrote about: ${it?.topic ?? t.subject}. Generic, canned or defensive replies leave you unsatisfied; a specific fix, date, workaround or a real question about your situation satisfies you.`,
    prompt: `Conversation so far:\n${history}\n\nReply to the founder's last message in 1–3 sentences, in character. Then rate how satisfied you are.`,
    schema: REPLY_SCHEMA,
    temperature: 0.8,
    maxTokens: 250,
    fallback: () => ({
      reply: q >= 0.6 ? (type === 'cancel' ? 'Okay, that\'s fair. Maybe I\'ll give it another month.' : 'Thanks, that helps. Appreciate the quick answer.') : 'Okay. Let me know when it\'s actually sorted.',
      satisfied: q, comeBack: type === 'cancel' && q >= 0.7,
    }),
  });
  const d = res.data;
  addMessage(state, t.id, { from: 'them', body: d.reply });
  if (!it) return;
  it.repliedDay ??= state.day;
  const satisfied = clamp(Number(d.satisfied) || 0, 0, 1);
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
    notify(state, `${t.with?.name} came back after your reply. Win-backs from a real conversation are the cheapest customers you'll ever get.`, { type: 'good', app: 'customers' });
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
          <div class="stat"><div class="stat-label">Product fit</div><div class="stat-value">${m.fit.product.score != null ? Math.round(m.fit.product.score * 100) : '—'}</div><div class="stat-sub">${m.fit.product.source ?? 'not judged'}</div></div>
          <div class="stat"><div class="stat-label">Willingness to pay</div><div class="stat-value">${money(m.fit.price.wtp)}</div><div class="stat-sub">${m.fit.price.source ?? '—'}</div></div>
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
    <section class="panel"><h2>Customer emails</h2><p class="small muted">Feature requests, bug reports and cancellation reasons from active customers. Reply in Mail: a fast, specific answer (fix, date, workaround, a real question) keeps accounts; canned replies don't.</p>
    ${items.length ? html`<div class="table-wrap"><table><thead><tr><th>Day</th><th>Type</th><th>About</th><th>Status</th><th></th></tr></thead><tbody>${items.slice(0, 40).map((x) => html`<tr>
      <td>${fmtDate(s, x.day)}</td><td><span class="badge ${x.type === 'bug' || x.type === 'cancel' ? 'bad' : x.type === 'request' ? 'accent' : ''}">${x.type}</span></td><td class="small">${x.topic}</td>
      <td><span class="badge ${x.status === 'resolved' ? 'good' : x.status === 'ignored' ? 'bad' : x.status === 'open' ? 'warn' : ''}">${x.status}</span></td><td><a class="btn sm" href="#/mail/customer:${x.threadId}">Open</a></td></tr>`)}</tbody></table></div>` : html`<p class="empty">No customer email yet. Paying customers write in occasionally.</p>`}</section>`;
}

function churnView(ctx, slice) {
  const s = ctx.state;
  const subs = ensureStripe(s).subscriptions.filter((x) => x.status === 'canceled');
  const byReason = {};
  for (const x of subs) byReason[x.cancelReason ?? 'unknown'] = (byReason[x.cancelReason ?? 'unknown'] ?? 0) + 1;
  const paid = slice.surveys.filter((x) => !x.trial);
  const trials = slice.surveys.filter((x) => x.trial);
  const tally = (list) => Object.entries(list.reduce((a, x) => ((a[x.category] = (a[x.category] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const bar = (n, total) => html`<div class="meter" style="flex:1"><div style="width:${total ? (n / total) * 100 : 0}%"></div></div>`;
  const block = (title, list) => html`<section class="panel"><h2>${title} <span class="badge">${list.length} responses</span></h2>${list.length ? html`<ul class="list">${tally(list).map(([k, n]) => html`<li style="display:flex;gap:8px;align-items:center"><span style="flex:2">${CANCEL_CATEGORIES[k] ?? k}</span>${bar(n, list.length)}<span class="small">${pct(n / list.length, 0)}</span></li>`)}</ul>` : html`<p class="empty">No responses yet.</p>`}</section>`;
  const cancelMails = slice.feedback.filter((x) => x.type === 'cancel');
  return html`
    <p class="small muted">Exit survey: ~${pct(FEEDBACK.surveyResponse, 0)} of cancellations answer (game assumption). Stripe's raw cancel reasons: ${Object.entries(byReason).map(([k, n]) => `${k.replace(/_/g, ' ')} ${n}`).join(' · ') || 'none yet'}.</p>
    <div class="grid-2">${block('Why paying customers left', paid)}${block('Why trials didn\'t convert', trials)}</div>
    ${cancelMails.length ? html`<section class="panel"><h2>In their words</h2><ul class="list small">${cancelMails.slice(0, 10).map((x) => html`<li>${x.topic} · <a href="#/mail/customer:${x.threadId}">thread</a> <span class="badge ${x.consequence === 'won_back' ? 'good' : ''}">${x.consequence ?? x.status}</span></li>`)}</ul></section>` : ''}`;
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
    const tab = param.startsWith('onb_') ? 'onboarding' : ['panel', 'onboarding', 'feedback', 'churn'].includes(param) ? param : 'panel';
    const tabs = [['panel', 'Trial panel'], ['onboarding', 'Onboarding'], ['feedback', 'Feedback'], ['churn', 'Churn reasons']];
    mount(root, html`
      <div class="app-head"><div><h1>Customer panel</h1><p>Do people activate, see value and pay? Trials, onboarding, customer emails and why people leave.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/customers/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'panel' ? panelView(ctx, slice) : tab === 'onboarding' ? onboardingView(ctx, slice) : tab === 'feedback' ? feedbackView(ctx, slice) : churnView(ctx, slice)}`);

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
    };
    on(root, 'click', '[data-hold]', (e, el) => ctx.act((st) => {
      const rec = customersSlice(st).onboarding.find((r) => r.id === el.dataset.hold);
      if (rec) { hold(st, rec); toast(`Held ${rec.name}'s ${rec.mode === 'concierge' ? 'setup' : 'kickoff'}: they got to the aha moment with you.`, 'good'); }
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
    feedbackDay(state, slice);
  },

  jobs: {
    'customer:feedback': feedbackJob,
    'reply:customer': replyJob,
  },
};
