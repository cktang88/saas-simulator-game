// Lifecycle email (Loops / Customer.io style): contacts and events from real signups, ONE activation event the
// founder picks (and can validate against retention), flows (trigger → email / delay / branch, filters, goal exit),
// broadcasts, per-node stats, plan billing. The engine is lifecycle/model.js; the activation lift it measures feeds
// Product analytics (insights/model.js activationRate) and trial conversion / churn via market modifiers.
// Sources: docs/research/tools/deep/d08-lifecycle-email-social.md, operators/o2 §6, review/tool-gap-analysis item 3.

import { html, mount, on, toast, table } from '../core/ui.js';
import { notify } from '../core/state.js';
import { addRecurring } from '../core/bank.js';
import { subscribe, subscriptionById } from '../core/stripe.js';
import { ensureMarket, setModifier, mainPlan } from '../core/market.js';
import { pct, money, fmtDate, round2, uid } from '../core/util.js';
import { registerOperatorReader, logMistake } from '../core/operator.js';
import { activationRate } from './insights/model.js';
import {
  ESP, TRIGGERS, SEGMENTS, HOURS, SPAM_LINE, INTENTS, ensureLifecycle, candidateEvents, eventById, templateFlow, newFlow, lintEmail, reviewFlow,
  lifecycleDay, measureLift, liftMultipliers, trialEndingMult, planTier, billableContacts, sendBroadcastNow, inboxPlacement, nodeQuality,
  eventRetentionAnalysis, lifecycleOperatorRead, isActivated, reachedEvent,
} from './lifecycle/model.js';
import { judgeEmail } from './lifecycle/judge.js';
import { draftGuidance } from './lifecycle/rubric.js';

export { lifecycleEvents, enrolContact, sendBroadcast, lifecycleLift } from './lifecycle/model.js';

registerOperatorReader('lifecycle_activation', lifecycleOperatorRead);

const featureTitles = (s) => (s.apps.product?.features ?? []).filter((f) => f.status === 'shipped').map((f) => f.title);
const baseActivation = (s) => { const m = ensureMarket(s); return activationRate({ fit: m.fit.product.score, onboarding: m.onboarding }); };
const evOf = (s) => (ensureLifecycle(s).activationEvent ? eventById(s, ensureLifecycle(s).activationEvent.id) : null);
const KIND_LABEL = { welcome: 'Welcome', nudge: 'Activation nudges', trial_ending: 'Trial ending', winback: 'Win-back', custom: 'Custom' };
const textHash = (n) => `${n.subject ?? ''}\u0000${n.body ?? ''}`;

// in-progress edits survive re-renders
const ui = { flowId: null, draft: null, bc: { subject: '', body: '', segment: 'activated' }, analysis: null };

function draftFlow(s) {
  const L = ensureLifecycle(s);
  const f = L.flows.find((x) => x.id === ui.flowId);
  if (!f) { ui.draft = null; return null; }
  if (!ui.draft || ui.draft.id !== f.id) ui.draft = JSON.parse(JSON.stringify(f));
  return ui.draft;
}

// ---- AI draft (generic on purpose; the reads-as-AI cap applies until the founder rewrites it) ----
function fallbackDraft(s, kind, ev, i) {
  const product = s.company.name || 'our product';
  const action = ev ? ev.label.replace(/^Used /, 'use ').replace(/^Tried /, 'try ') : 'get started';
  const lines = {
    welcome: [`Welcome to ${product}!`, `Hi {{firstName}},\n\nWelcome to ${product}! We're excited to have you on board. To get the most out of your account, the best first step is to ${action}.\n\nGet started here: {{ctaUrl}}\n\nIf you have any questions, just reply to this email.\n\nThe ${product} team`],
    nudge: [`A quick tip to get started`, `Hi {{firstName}},\n\nWe noticed you haven't had a chance to ${action} yet. It only takes a few minutes and it's the best way to see the value of ${product}.\n\nTry it now: {{ctaUrl}}\n\nThe ${product} team`],
    trial_ending: [`Your trial ends soon`, `Hi {{firstName}},\n\nJust a heads-up that your ${product} trial ends on {{trialEndDate}}. Make sure you ${action} before then so you can see the full value.\n\nChoose a plan: {{ctaUrl}}\n\nThe ${product} team`],
    winback: [`We'd love to have you back`, `Hi {{firstName}},\n\nWe noticed you canceled your ${product} subscription. We've been working hard on improvements and would love for you to give us another try.\n\nCome back: {{ctaUrl}}\n\nThe ${product} team`],
  };
  const [subject, body] = lines[kind] ?? lines.welcome;
  return { subject: i ? `${subject} (${i + 1})` : subject, body };
}

async function aiDraft(ctx, kind, ev, i) {
  const s = ctx.state;
  const res = await ctx.llm.ask({
    task: 'lifecycle_email_draft',
    system: `You write SaaS lifecycle emails like one named founder writing to one person. ${draftGuidance()}`,
    prompt: `Write ${KIND_LABEL[kind] ?? 'a lifecycle'} email #${i + 1} for ${s.company.name} (${s.company.oneLiner || 'a SaaS tool'}). Activation action: ${ev ? ev.label : 'not defined'}. Use {{firstName}} and {{ctaUrl}} (once). The email must ask for exactly the activation action. Return subject and body.`,
    schema: { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string' } } },
    fallback: () => fallbackDraft(s, kind, ev, i),
  });
  return res.data;
}

// ---- Views ----
function header(s, L) {
  const m = measureLift(s, L);
  const ev = evOf(s);
  const tier = planTier(s, L);
  const comp = L.complaintRate30 ?? 0;
  return html`<div class="stats">
    <div class="stat"><div class="stat-label">Contacts</div><div class="stat-value">${L.contacts.length.toLocaleString('en-US')}</div><div class="stat-sub">${L.contacts.filter((c) => c.unsub).length} unsubscribed · ${L.contacts.filter((c) => c.comp).length} complained</div></div>
    <div class="stat"><div class="stat-label">${ev ? 'Reached activation event' : 'Activation event'}</div><div class="stat-value">${ev ? pct(m.eventRate, 0) : '—'}</div><div class="stat-sub">${ev ? ev.label : 'not defined: flows have no goal'}</div></div>
    <div class="stat ${m.lift >= 0.03 ? 'good' : m.lift < 0 ? 'bad' : ''}"><div class="stat-label">Activation lift from email</div><div class="stat-value">${m.n ? `${m.lift >= 0 ? '+' : ''}${(m.lift * 100).toFixed(1)} pts` : '—'}</div><div class="stat-sub">${m.n} signups, 3-63 days old · real activation ${pct(m.activation, 0)}</div></div>
    <div class="stat ${comp >= SPAM_LINE ? 'bad' : comp >= 0.001 ? 'warn' : ''}"><div class="stat-label">Spam complaints (30d)</div><div class="stat-value">${(comp * 100).toFixed(2)}%</div><div class="stat-sub">Gmail: keep under 0.1%, never 0.3% · inbox ~${pct(inboxPlacement(s), 0)}</div></div>
    <div class="stat"><div class="stat-label">Plan</div><div class="stat-value">${L.vendor ? money(tier.price) : '—'}</div><div class="stat-sub">${L.vendor ? `${ESP[L.vendor].label} ${tier.name}/mo` : 'no email tool yet'}</div></div>
  </div>`;
}

function setupView(s, L) {
  const tier = planTier(s, L);
  const sent30 = L.daily.filter((d) => d.day > s.day - 30).reduce((a, d) => a + d.sent + d.transactional, 0);
  const dnsRow = (k, label) => html`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><span class="small"><b>${label}</b></span>${L.domain[k] ? html`<span class="badge good">verified</span>` : html`<button class="sm" data-dns="${k}">Add record (${HOURS.dns} h)</button>`}</div>`;
  return html`<div class="grid-2">
    <section class="panel"><h2>Email tool</h2>
      ${Object.entries(ESP).map(([k, v]) => html`<label class="radio-card"><input type="radio" name="vendor" value="${k}" ${L.vendor === k ? 'checked' : ''} data-vendor="${k}"/><b>${v.label}</b><span>${k === 'loops' ? 'Free to 1,000 contacts and 4,000 sends / 30 days (shared with transactional mail: password resets stop if a broadcast eats the quota). Growth $49/mo to 5,000 contacts; unsubscribed contacts are not billed. (loops.so/pricing)' : 'Essentials from $100/mo for 5,000 profiles, $145 at 10k, $235 at 20k … every identified profile counts, including unsubscribed and stale ones; $0.009 per extra profile. Event-driven journeys. (customer.io/pricing)'}</span></label>`)}
      <p class="small muted">Connecting the tool and sending signup events from the app takes ~${HOURS.setup} h. The most common failure is an event the app never sends: the flow then just sits there.</p>
      ${L.vendor ? html`<p class="small">Now: <b>${ESP[L.vendor].label} ${tier.name}</b> · ${billableContacts(L).toLocaleString('en-US')} billable contacts · ${money(tier.price)}/mo${tier.sendCap ? html` · sends incl. transactional ${sent30.toLocaleString('en-US')} / ${tier.sendCap.toLocaleString('en-US')} (30 days)` : ''}</p>` : ''}
    </section>
    <section class="panel"><h2>Sending domain</h2>
      ${dnsRow('spf', 'SPF')}${dnsRow('dkim', 'DKIM')}${dnsRow('dmarc', 'DMARC')}
      <p class="small muted">Same factors as Outreach: missing DKIM roughly halves inbox placement. Lifecycle mail shares the domain with transactional mail, so spam complaints from blasts also send your magic links and password resets to spam. Reputation now ${Math.round(L.domain.reputation)}/100.</p>
      <h3>Signup form</h3>
      ${L.settings.intentField ? html`<p class="small"><span class="badge good">on</span> Signup asks "What will you use it for?" (${(INTENTS[s.company.model] ?? []).join(' / ')}). Filter flows by intent.</p>` : html`<p class="small">One drip for every signup sends the wrong first email to specific-use-case users. <button class="sm" id="intentOn">Add an intent question to signup (${HOURS.intent} h)</button></p>`}
    </section></div>`;
}

function activationView(s, L) {
  const ev = evOf(s);
  const a = ui.analysis?.day === s.day ? ui.analysis : L.analyses[0];
  const m = measureLift(s, L);
  return html`<div class="grid-2">
    <section class="panel"><h2>Activation event</h2>
      <p class="small muted">Pick the one action that predicts a user staying. Flows use it as their goal (exit when reached) and for "has activated?" branches; the app has to send it (a track() call, ~1 h). Easy events make the dashboard look good and change nothing.</p>
      <form id="evForm">${candidateEvents(s).map((e) => html`<label class="radio-card"><input type="radio" name="ev" value="${e.id}" ${ev?.id === e.id ? 'checked' : ''}/><b>${e.label}</b><span>${a?.rows ? (() => { const r = a.rows.find((x) => x.id === e.id); return r && r.ratio != null ? `${pct(r.reach, 0)} of signups do it in week 1 · week-4 retention ${pct(r.retDid, 0)} vs ${pct(r.retNot, 0)} (${r.ratio.toFixed(1)}×)` : 'not enough data'; })() : 'Run the retention comparison to see how well it predicts staying.'}</span></label>`)}
        <button class="primary">Set and instrument the event (1 h)</button></form>
    </section>
    <section class="panel"><h2>Compare retention by event</h2>
      <p class="small">PostHog-style correlation: for signups 14-104 days old, week-4 retention of people who did each action in week 1 vs those who didn't. ${a ? html`Last run ${fmtDate(s, a.day)} on ${a.n} signups.${a.lowSample ? html` <span class="badge warn">fewer than 50 signups: noisy</span>` : ''}` : ''}</p>
      <button id="analyze" class="sm">Run the comparison (${HOURS.analysis} h)</button>
      ${a?.rows ? table({ columns: [{ label: 'Event', render: (r) => r.label }, { label: 'Did it', align: 'right', render: (r) => pct(r.reach, 0) }, { label: 'W4 retention did / didn\'t', align: 'right', render: (r) => r.ratio != null ? `${pct(r.retDid, 0)} / ${pct(r.retNot, 0)}` : '—' }], rows: a.rows }) : ''}
      <p class="small muted">Measured now: ${ev ? `${pct(m.eventRate, 0)} reach the event; ` : ''}real activation (value reached, as Product analytics counts it) ${pct(m.activation, 0)} vs ~${pct(m.base, 0)} expected without email. Benchmarks: B2B SaaS average 37.5% (Userpilot, 62 companies); a 2022 survey median 25-30%. Flow fixes that work move activation 10-20 points in a quarter; email tweaks alone rarely do (game estimate from operator notes).</p>
      ${L.eventHistory.length > 2 ? html`<p class="callout warn small">You've changed the activation event ${L.eventHistory.length} times. Every change resets the baseline you compare against.</p>` : ''}
    </section></div>`;
}

function flowsView(s, L) {
  const rows = L.flows.map((f) => {
    const tot = Object.values(f.stats).reduce((a, x) => ({ sent: a.sent + x.sent, delivered: a.delivered + x.delivered, clicked: a.clicked + x.clicked, goal: a.goal + x.goal, unsub: a.unsub + x.unsub, complaints: a.complaints + x.complaints }), { sent: 0, delivered: 0, clicked: 0, goal: 0, unsub: 0, complaints: 0 });
    return { f, ...tot };
  });
  return html`<section class="panel"><h2>Flows</h2>
    <div class="inline" style="flex-wrap:wrap;gap:6px">${['welcome', 'nudge', 'trial_ending', 'winback', 'custom'].map((k) => html`<button class="sm" data-new="${k}">+ ${KIND_LABEL[k]}</button>`)}</div>
    <p class="small muted">Templates give the standard timing (welcome T+0/1/3/7, nudges day 2/5/10, trial ending T-7/T-3/T-1, win-back day 0/7/30/60). The copy, the trigger, the filters and the goal are yours. Dunning (failed payment) lives in Payments → Billing.</p>
    ${table({ columns: [
      { label: 'Flow', render: (r) => html`<a href="#/lifecycle/flow/${r.f.id}">${r.f.name}</a> <span class="small muted">${TRIGGERS[r.f.trigger]?.label ?? r.f.trigger}</span>` },
      { label: 'Status', render: (r) => html`<span class="badge ${r.f.status === 'live' ? 'good' : r.f.status === 'paused' ? 'warn' : ''}">${r.f.status}</span>` },
      { label: 'Enrolled', align: 'right', render: (r) => r.f.enrolled ?? 0 },
      { label: 'Click', align: 'right', render: (r) => r.delivered ? pct(r.clicked / r.delivered, 1) : '—' },
      { label: 'Goal', align: 'right', render: (r) => r.goal },
      { label: 'Unsub / spam', align: 'right', render: (r) => r.delivered ? `${pct(r.unsub / r.delivered, 1)} / ${pct(r.complaints / r.delivered, 2)}` : '—' },
    ], rows, empty: 'No flows yet. Start with a welcome flow that points at your activation event.' })}
  </section>`;
}

function nodeStats(f, n) {
  const x = f.stats?.[n.id];
  if (!x || !x.sent) return '';
  const d = Math.max(1, x.delivered);
  return html`<p class="small muted">Sent ${x.sent} · delivered ${pct(x.delivered / x.sent, 0)} · opened ${pct((x.opened + x.mpp) / d, 0)} <span title="Apple Mail Privacy Protection auto-opens">(incl. ~${pct(x.mpp / d, 0)} MPP)</span> · clicked ${pct(x.clicked / d, 1)} · goal ${x.goal} · unsub ${pct(x.unsub / d, 1)} · spam ${pct(x.complaints / d, 2)}${x.react ? ` · reactivated ${x.react}` : ''}</p>`;
}

function flowEditor(s, L) {
  const f = draftFlow(s);
  if (!f) return html`<p class="empty">Flow not found. <a href="#/lifecycle/flows">Back</a></p>`;
  const live = L.flows.find((x) => x.id === f.id);
  const ev = evOf(s);
  const rev = reviewFlow(s, L, f);
  const opt = (v, sel, label) => html`<option value="${v}" ${v === sel ? 'selected' : ''}>${label}</option>`;
  return html`<section class="panel"><p class="small"><a href="#/lifecycle/flows">← Flows</a></p>
    <h2>${f.name} <span class="badge ${live.status === 'live' ? 'good' : ''}">${live.status}</span></h2>
    <form id="flowForm">
      <div class="grid-2">
        <label>Name <input name="name" value="${f.name}"/></label>
        <label>Trigger <select name="trigger">${Object.entries(TRIGGERS).map(([k, t]) => html`<option value="${k}" ${k === f.trigger ? 'selected' : ''} ${t.disabled ? 'disabled' : ''}>${t.label}</option>`)}</select></label>
        <label>Trigger days (N) <input type="number" name="triggerDays" min="0" max="30" value="${f.triggerDays}"/></label>
        <label>Who: plan status <select name="fStatus">${['any', 'trial', 'paid', 'churned'].map((v) => opt(v, f.filter.status, v))}</select></label>
        <label>Who: activation <select name="fAct">${opt('any', f.filter.activation, 'anyone')}${opt('activated', f.filter.activation, 'reached activation event')}${opt('not_activated', f.filter.activation, 'not activated')}</select></label>
        <label>Who: intent <select name="fIntent">${opt('any', f.filter.intent, 'any')}${(INTENTS[s.company.model] ?? []).map((v) => opt(v, f.filter.intent, v))}</select></label>
      </div>
      <label class="inline"><input type="checkbox" name="exitOnGoal" ${f.exitOnGoal ? 'checked' : ''}/> Goal: exit the flow when the contact reaches the activation event ${ev ? html`(${ev.label})` : html`<span class="badge warn">no activation event yet</span>`}</label>
      <h3>Steps</h3>
      ${f.nodes.map((n, i) => html`<div class="card" style="padding:10px;margin:8px 0;border:1px solid var(--border);border-radius:8px">
        <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><b class="small">${i + 1}. ${n.type === 'email' ? 'Email' : n.type === 'delay' ? 'Wait' : 'Branch'}</b>
          <span class="inline" style="gap:4px"><button type="button" class="sm" data-up="${i}">↑</button><button type="button" class="sm" data-down="${i}">↓</button><button type="button" class="sm" data-del="${i}">✕</button></span></div>
        ${n.type === 'email' ? html`
          <label>Subject <input data-field="subject" data-i="${i}" value="${n.subject ?? ''}"/></label>
          <label>Body <textarea data-field="body" data-i="${i}" rows="7">${n.body ?? ''}</textarea></label>
          <div class="inline" style="gap:6px"><button type="button" class="sm" data-ai="${i}">AI draft (${Math.round(HOURS.aiDraft * 60)} min)</button><span class="small muted">Merge fields: {{firstName}} {{company}} {{trialEndDate}} {{ctaUrl}}</span></div>
          ${(() => { const lt = lintEmail(n, { kind: f.kind, event: ev, featureTitles: featureTitles(s) }); return html`<p class="small">Quality ${Math.round(nodeQuality({ ...n, lint: lt }) * 100)}/100${n.judge ? ` (judged ${n.judge.score * 100 | 0})` : ' (offline estimate)'}${n.aiDraft && !n.edited ? html` <span class="badge warn">unedited AI draft</span>` : ''}</p>${lt.issues.length ? html`<ul class="small">${lt.issues.slice(0, 4).map((x) => html`<li>${x}</li>`)}</ul>` : ''}${n.judge?.feedback ? html`<p class="small muted">Reviewer: ${n.judge.feedback}</p>` : ''}`; })()}
          ${nodeStats(live, n)}`
        : n.type === 'delay' ? html`<label>Wait days <input type="number" min="0" max="60" data-field="days" data-i="${i}" value="${n.days}"/></label>`
        : html`<label>If <select data-field="cond" data-i="${i}">${opt('activated', n.cond ?? 'activated', 'contact HAS activated → exit')}${opt('not_activated', n.cond, 'contact has NOT activated → exit')}</select></label>`}
      </div>`)}
      <div class="inline" style="gap:6px;flex-wrap:wrap"><button type="button" class="sm" data-add="email">+ Email</button><button type="button" class="sm" data-add="delay">+ Wait</button><button type="button" class="sm" data-add="branch">+ Branch</button></div>
      ${rev.issues.length ? html`<div class="callout warn small" style="margin-top:8px"><b>Flow review:</b><ul>${rev.issues.map((x) => html`<li>${x}</li>`)}</ul></div>` : html`<p class="callout good small">Structure looks right.</p>`}
      <div class="inline" style="gap:6px;margin-top:8px;flex-wrap:wrap">
        <button type="button" id="saveFlow">Save draft</button>
        <button type="button" class="primary" id="publishFlow">${live.status === 'live' ? 'Review & update live flow' : 'Review & publish'}</button>
        ${live.status === 'live' ? html`<button type="button" id="pauseFlow">Pause</button>` : ''}
        <button type="button" class="danger" id="archiveFlow">Delete</button>
      </div>
      <p class="small muted">Writing or rewriting an email costs ~${Math.round(HOURS.email * 60)} min each; publishing runs the reviewer on changed emails.</p>
    </form></section>`;
}

function broadcastsView(s, L) {
  const ev = evOf(s);
  const lt = lintEmail(ui.bc, { kind: 'custom', event: ev, featureTitles: featureTitles(s) });
  return html`<div class="grid-2">
    <section class="panel"><h2>New broadcast</h2>
      <form id="bcForm">
        <label>Segment <select name="segment">${Object.entries(SEGMENTS).map(([k, l]) => html`<option value="${k}" ${ui.bc.segment === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label>Subject <input name="subject" data-bc="subject" value="${ui.bc.subject}"/></label>
        <label>Body <textarea name="body" data-bc="body" rows="7">${ui.bc.body}</textarea></label>
        ${lt.issues.length && (ui.bc.subject || ui.bc.body) ? html`<ul class="small">${lt.issues.slice(0, 4).map((x) => html`<li>${x}</li>`)}</ul>` : ''}
        <button class="primary">Send now (${HOURS.broadcast} h)</button>
      </form>
      <p class="small muted">Broadcasts to everyone ("weekly update", "30% off") are the classic mediocre move: opens look fine, activation doesn't move, unsubscribes and complaints climb. Send product news to activated users; send the activation action to the not-activated.</p>
    </section>
    <section class="panel"><h2>Sent</h2>
      ${table({ columns: [
        { label: 'Day', render: (b) => fmtDate(s, b.day) },
        { label: 'Subject', render: (b) => b.subject },
        { label: 'To', render: (b) => `${SEGMENTS[b.segment] ?? b.segment} (${b.recipients})` },
        { label: 'Open*/click', align: 'right', render: (b) => b.stats.delivered ? `${pct((b.stats.opened + b.stats.mpp) / b.stats.delivered, 0)} / ${pct(b.stats.clicked / b.stats.delivered, 1)}` : '—' },
        { label: 'Unsub/spam', align: 'right', render: (b) => `${b.stats.unsub} / ${b.stats.complaints}` },
      ], rows: L.broadcasts.slice(0, 20), empty: 'No broadcasts sent.' })}
      <p class="small muted">*Opens are inflated by Apple Mail Privacy Protection (10-15% in B2B). Judge by clicks and activation.</p>
    </section></div>`;
}

function contactsView(s, L) {
  const ev = evOf(s);
  const recent = L.contacts.slice(-40).reverse();
  return html`<section class="panel"><h2>Contacts <span class="small muted">latest 40 of ${L.contacts.length}</span></h2>
    ${table({ columns: [
      { label: 'Email', render: (c) => c.email || c.name },
      { label: 'Signed up', render: (c) => fmtDate(s, c.d) },
      { label: 'Status', render: (c) => c.status },
      { label: 'Intent', render: (c) => (L.settings.intentField ? c.intent : '—') },
      { label: 'Activation event', render: (c) => (ev ? (reachedEvent(c, ev, s.day) ? 'yes' : 'no') : '—') },
      { label: 'Flows', render: (c) => Object.keys(c.enr).length },
      { label: 'Subscribed', render: (c) => (c.comp ? 'complained' : c.unsub ? 'unsubscribed' : 'yes') },
    ], rows: recent, empty: 'Contacts appear as people sign up (Stripe customers).' })}
    <p class="small muted">Properties are current state; events are what people did. A contact who never fires the event just waits in the flow.</p>
  </section>`;
}

// ---- App ----
export default {
  id: 'lifecycle',
  title: 'Lifecycle email',
  icon: '✉️',
  group: 'Growth',
  badge: (state) => { const L = state.apps?.lifecycle; return L && (L.complaintRate30 ?? 0) >= SPAM_LINE ? '!' : null; },

  render(root, ctx) {
    const s = ctx.state;
    const L = ensureLifecycle(s);
    const [tab0, arg] = String(ctx.params || '').split('/');
    const tab = ['setup', 'activation', 'flows', 'flow', 'broadcasts', 'contacts'].includes(tab0) ? tab0 : (L.vendor ? 'flows' : 'setup');
    if (tab === 'flow') ui.flowId = arg; else ui.draft = null;
    const tabs = [['setup', 'Setup'], ['activation', 'Activation'], ['flows', 'Flows'], ['broadcasts', 'Broadcasts'], ['contacts', 'Contacts']];
    const read = lifecycleOperatorRead(s);
    mount(root, html`
      <div class="app-head"><div><h1>Lifecycle email</h1><p>Welcome, activation nudges, trial ending and win-back, triggered by what people do. Activation is the number that matters; open rate is not.</p></div></div>
      ${header(s, L)}
      ${read.tier !== 'unknown' && read.coaching[0] ? html`<p class="callout small">${read.coaching[0]}</p>` : ''}
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/lifecycle/${k}" class="${k === tab || (tab === 'flow' && k === 'flows') ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'setup' ? setupView(s, L) : tab === 'activation' ? activationView(s, L) : tab === 'flow' ? flowEditor(s, L) : tab === 'broadcasts' ? broadcastsView(s, L) : tab === 'contacts' ? contactsView(s, L) : flowsView(s, L)}`);

    // setup
    on(root, 'change', '[data-vendor]', (e, el) => {
      const k = el.dataset.vendor;
      if (L.vendor === k) return;
      ctx.act((st) => {
        const l = ensureLifecycle(st);
        const old = st.recurring.find((r) => r.id === l.billId);
        if (old) old.active = false;
        l.vendor = k;
        const r = addRecurring(st, { vendor: ESP[k].label, amount: 0, category: 'software', dayOfMonth: 5, note: `${ESP[k].label} plan` });
        r.active = false;
        l.billId = r.id;
        const t = planTier(st, l);
        if (t.price > 0) { r.amount = t.price; r.active = true; r.note = `${ESP[k].label} ${t.name}`; }
      }, { hours: L.vendor ? HOURS.setup * 2 : HOURS.setup, label: `Set up ${ESP[k].label}` });
    });
    on(root, 'click', '[data-dns]', (e, el) => ctx.act((st) => { ensureLifecycle(st).domain[el.dataset.dns] = true; }, { hours: HOURS.dns, label: `${el.dataset.dns.toUpperCase()} record` }));
    on(root, 'click', '#intentOn', () => ctx.act((st) => { ensureLifecycle(st).settings.intentField = true; }, { hours: HOURS.intent, label: 'Signup intent question' }));

    // activation
    on(root, 'submit', '#evForm', (e) => {
      e.preventDefault();
      const id = new FormData(e.target).get('ev');
      if (!id) return toast('Pick an event.', 'warn');
      ctx.act((st) => {
        const l = ensureLifecycle(st);
        const validated = l.analyses.some((a) => a.day > st.day - 30 && !a.lowSample);
        if (l.activationEvent?.id !== id) l.eventHistory.push({ id, day: st.day });
        l.activationEvent = { id, day: st.day, validated };
      }, { hours: 1, label: 'Define and instrument activation event' });
    });
    on(root, 'click', '#analyze', () => ctx.act((st) => {
      const l = ensureLifecycle(st);
      const a = eventRetentionAnalysis(st, l);
      if (!a.n) { toast('Needs signups that are at least 14 days old.', 'warn'); return; }
      l.analyses.unshift({ day: a.day, n: a.n, lowSample: a.lowSample, rows: a.rows });
      if (l.analyses.length > 12) l.analyses.length = 12;
      ui.analysis = l.analyses[0];
    }, { hours: HOURS.analysis, label: 'Retention by activation event' }));

    // flows list
    on(root, 'click', '[data-new]', (e, el) => ctx.act((st) => {
      const l = ensureLifecycle(st);
      const k = el.dataset.new;
      const f = k === 'custom' ? newFlow('custom', 'Custom flow') : templateFlow(k);
      f.createdDay = st.day;
      l.flows.push(f);
      ctx.navigate('lifecycle', `flow/${f.id}`);
    }, { hours: HOURS.flowOther, label: 'New flow' }));

    // flow editor: keep typed text in the draft
    const d = ui.draft;
    on(root, 'input', '[data-field]', (e, el) => {
      if (!d) return;
      const n = d.nodes[+el.dataset.i];
      if (!n) return;
      const k = el.dataset.field;
      n[k] = k === 'days' ? Number(el.value) : el.value;
    });
    on(root, 'change', '[data-field=cond]', (e, el) => { if (d) d.nodes[+el.dataset.i].cond = el.value; });
    const readHead = () => {
      const fd = new FormData(root.querySelector('#flowForm'));
      d.name = String(fd.get('name') || d.name);
      d.trigger = String(fd.get('trigger') || d.trigger);
      d.triggerDays = Number(fd.get('triggerDays') ?? d.triggerDays) || 0;
      d.filter = { status: String(fd.get('fStatus') || 'any'), activation: String(fd.get('fAct') || 'any'), intent: String(fd.get('fIntent') || 'any') };
      d.exitOnGoal = fd.get('exitOnGoal') === 'on';
    };
    const rerender = () => { readHead(); ctx.render(); };
    on(root, 'click', '[data-add]', (e, el) => { if (!d) return; readHead(); const t = el.dataset.add; d.nodes.push(t === 'email' ? { id: uid('n'), type: 'email', subject: '', body: '' } : t === 'delay' ? { id: uid('n'), type: 'delay', days: 2 } : { id: uid('n'), type: 'branch', cond: 'activated' }); ctx.render(); });
    on(root, 'click', '[data-del]', (e, el) => { if (!d) return; readHead(); d.nodes.splice(+el.dataset.del, 1); ctx.render(); });
    on(root, 'click', '[data-up]', (e, el) => { const i = +el.dataset.up; if (!d || i < 1) return; readHead(); [d.nodes[i - 1], d.nodes[i]] = [d.nodes[i], d.nodes[i - 1]]; ctx.render(); });
    on(root, 'click', '[data-down]', (e, el) => { const i = +el.dataset.down; if (!d || i >= d.nodes.length - 1) return; readHead(); [d.nodes[i + 1], d.nodes[i]] = [d.nodes[i], d.nodes[i + 1]]; ctx.render(); });
    on(root, 'change', '#flowForm select[name], #flowForm input[name=exitOnGoal]', () => rerender());
    on(root, 'click', '[data-ai]', (e, el) => {
      if (!d) return;
      readHead();
      const i = +el.dataset.ai;
      const idx = d.nodes.slice(0, i).filter((n) => n.type === 'email').length;
      ctx.act(async (st) => {
        const r = await aiDraft(ctx, d.kind, evOf(st), idx);
        Object.assign(d.nodes[i], { subject: r.subject, body: r.body, aiDraft: true, draftText: textHash(r), edited: false });
      }, { hours: HOURS.aiDraft, label: 'AI email draft' });
    });

    // save / publish
    const commit = async (st, publish) => {
      const l = ensureLifecycle(st);
      const f = l.flows.find((x) => x.id === d.id);
      const ev = evOf(st);
      const changed = [];
      for (const n of d.nodes) {
        if (n.type !== 'email') continue;
        const h = textHash(n);
        if (n.aiDraft && n.draftText && h !== n.draftText) n.edited = true;
        n.lint = lintEmail(n, { kind: d.kind, event: ev, featureTitles: featureTitles(st) });
        if (n.savedHash !== h) { changed.push(n); n.savedHash = h; n.judge = null; }
      }
      if (publish) {
        for (const n of d.nodes.filter((x) => x.type === 'email' && !x.judge && (x.subject || x.body))) {
          const r = await judgeEmail(ctx, { subject: n.subject, body: n.body }, { kind: d.kind, event: ev, featureTitles: featureTitles(st) });
          n.judge = r.judge;
          if (r.mock) n.offlineNote = r.feedback;
        }
      }
      const stats = f.stats, enrolled = f.enrolled, goalExits = f.goalExits, irr = f.irrelevantSends, status = f.status, pub = f.publishedDay;
      Object.assign(f, JSON.parse(JSON.stringify(d)), { stats, enrolled, goalExits, irrelevantSends: irr, status, publishedDay: pub });
      if (publish) {
        const rev = reviewFlow(st, l, f);
        if (!l.vendor) throw new Error('Pick an email tool on the Setup tab first.');
        if (!f.nodes.some((n) => n.type === 'email' && n.body?.trim())) throw new Error('Write at least one email first.');
        if (TRIGGERS[f.trigger]?.needsEvent && !ev) throw new Error('This trigger needs an activation event (Activation tab).');
        f.status = 'live'; f.publishedDay ??= st.day;
        toast(rev.issues.length ? `Live, with ${rev.issues.length} structural warning(s).` : 'Live.', rev.issues.length ? 'warn' : 'good');
        if (!pub && d.kind === 'winback' && f.filter.activation !== 'activated') logMistake(st, { functionId: 'lifecycle_activation', id: 'winback_never_activated', label: '"We miss you" to users who never activated', app: 'lifecycle', cost: { reputation: 0.5 }, detail: `Flow "${f.name}" sends win-back mail to churned users who never got value; expect 4× unsubscribes and 6× complaints on those sends.`, delayed: true });
        if (!pub && ['welcome', 'nudge'].includes(d.kind) && f.nodes.some((n) => n.lint?.discount) && f.filter.activation !== 'activated') logMistake(st, { functionId: 'lifecycle_activation', id: 'upsell_non_activated', label: 'Upselling users who have not activated', app: 'lifecycle', cost: { reputation: 0.5 }, detail: `Flow "${f.name}" pitches a discount/upgrade before people reach the activation event. Burns trial users; unsubscribes.`, delayed: true });
      }
      ui.draft = null;
      return changed.length;
    };
    const hoursFor = () => { if (!d) return 0; const n = d.nodes.filter((x) => x.type === 'email' && (x.subject || x.body) && textHash(x) !== x.savedHash).length; return round2(HOURS.flowOther * 0.4 + n * HOURS.email); };
    on(root, 'click', '#saveFlow', () => { if (!d) return; readHead(); ctx.act((st) => commit(st, false), { hours: hoursFor(), label: 'Write lifecycle emails' }); });
    on(root, 'click', '#publishFlow', () => { if (!d) return; readHead(); ctx.act((st) => commit(st, true), { hours: round2(hoursFor() + HOURS.flowOther), label: 'Publish lifecycle flow' }); });
    on(root, 'click', '#pauseFlow', () => ctx.act((st) => { const f = ensureLifecycle(st).flows.find((x) => x.id === ui.flowId); if (f) f.status = 'paused'; ui.draft = null; }, { label: 'Pause flow' }));
    on(root, 'click', '#archiveFlow', () => ctx.act((st) => {
      const l = ensureLifecycle(st);
      l.flows = l.flows.filter((x) => x.id !== ui.flowId);
      for (const c of l.contacts) delete c.enr[ui.flowId];
      ui.draft = null; ctx.navigate('lifecycle', 'flows');
    }, { label: 'Delete flow' }));

    // broadcasts
    on(root, 'input', '[data-bc]', (e, el) => { ui.bc[el.dataset.bc] = el.value; });
    on(root, 'change', '#bcForm select[name=segment]', (e, el) => { ui.bc.segment = el.value; });
    on(root, 'submit', '#bcForm', (e) => {
      e.preventDefault();
      if (!ui.bc.subject.trim() || !ui.bc.body.trim()) return toast('Write a subject and a body.', 'warn');
      ctx.act(async (st) => {
        const ev = evOf(st);
        const r = await judgeEmail(ctx, ui.bc, { kind: 'broadcast', event: ev, featureTitles: featureTitles(st) });
        const out = sendBroadcastNow(st, { ...ui.bc, lint: r.lint, judge: r.judge, logMistake });
        if (!out.ok) throw new Error(out.error);
        const b = out.broadcast;
        toast(`Sent to ${b.recipients}: ${b.stats.clicked} clicks, ${b.stats.unsub} unsubscribed, ${b.stats.complaints} spam complaints.`, b.stats.complaints > 1 ? 'warn' : 'good');
        ui.bc = { subject: '', body: '', segment: ui.bc.segment };
      }, { hours: HOURS.broadcast, label: 'Lifecycle broadcast' });
    });
  },

  onDay(state) {
    const L = ensureLifecycle(state);
    const baseP = baseActivation(state);
    const out = lifecycleDay(state, { baseP, logMistake });
    for (const c of out.reactivate) {
      const old = c.sub ? subscriptionById(state, c.sub) : null;
      const plan = mainPlan(state);
      if (!plan || !c.cid) continue;
      const sub = subscribe(state, c.cid, plan, { trial: false, source: old?.source ?? 'direct' });
      c.sub = sub.id; c.status = 'paid'; c.churnDay = null;
      L.stats.reactivations++;
    }
    if (out.reactivate.length) notify(state, `Win-back: ${out.reactivate.length} churned customer${out.reactivate.length > 1 ? 's' : ''} came back.`, { type: 'good', app: 'lifecycle' });
    const m = measureLift(state, L);
    L.liftCache = { day: state.day, lift: m.lift, n: m.n };
    const mult = liftMultipliers(baseP, m.lift);
    setModifier(state, 'conversion', 'lifecycle-activation', m.n >= 20 && Math.abs(mult.conversion - 1) > 0.005 ? mult.conversion : null);
    setModifier(state, 'churn', 'lifecycle-activation', m.n >= 20 && Math.abs(mult.churn - 1) > 0.005 ? mult.churn : null);
    const te = trialEndingMult(state, L);
    setModifier(state, 'conversion', 'lifecycle-trial-ending', te !== 1 ? te : null);
    if ((L.complaintRate30 ?? 0) >= SPAM_LINE && !L.warnedSpam) { L.warnedSpam = true; notify(state, 'Spam complaints on your lifecycle mail passed 0.3%. Gmail will start sending your mail, including password resets, to spam.', { type: 'bad', app: 'lifecycle' }); }
    if ((L.complaintRate30 ?? 0) < 0.001) L.warnedSpam = false;
  },
};

// test hooks
export { isActivated };
