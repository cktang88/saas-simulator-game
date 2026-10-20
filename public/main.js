// App shell: setup flow, sidebar, top bar, routing, time controls, and the ctx handed to every app.

import { APPS } from './apps/registry.js';
import { newState, MODELS, PATHS, hoursLeft, dayCap, dayUsed, OutOfHoursError, spendHours, refundHours, log } from './core/state.js';
import { advance } from './core/clock.js';
import { seedDefaultStack, post, balance, totalCash } from './core/bank.js';
import { ensureStripe, mrr } from './core/stripe.js';
import { ensureMarket } from './core/market.js';
import { CUSTOMER_TYPES, TYPES_BY_MODEL, setCustomerType } from './core/customer-type.js';
import { saveState, saveStateOnUnload, loadState, clearState, requestPersistence } from './core/store.js';
import * as llm from './core/llm.js';
import { createHealth, recordCall, judgeStatus } from './core/llm-health.js';
import { installBusyTracking } from './core/busy.js';
import './core/niche.js'; // registers the niche:research / niche:poll jobs and the truth hooks
import { registerJob, enqueue, runJobs, pendingCount, hasJob } from './core/jobs.js';
import { unreadCount } from './core/mail.js';
import { clockNow, fmtTime } from './core/calendar.js';
import { OVERWORK, overworkPreview, weekWorked } from './core/overwork.js';
import { html, mount, on, toast, formData, modal } from './core/ui.js';
import { bindKeyField, connectionField, bindConnectionField, connectionPatch } from './core/keyui.js';
import { money, fmtDate, dateOf } from './core/util.js';
import { notify } from './core/state.js';
import {
  ensureProgress, evaluate, isAppUnlocked, isTabUnlocked, isTabGated, isNewApp, isNewTab, hasNewTab, markSeen, takeQueue, providersOf, expandKey,
  nodeStatus, nodeModelOk, appMeta, CATEGORIES,
} from './core/unlocks.js';

const $ = (s) => document.querySelector(s);
let state = null;
let saveTimer = null;
const inFlight = new Set();
// In-flight dedupe key for ctx.act: the action's code plus a stable description of the element that triggered it
// (tag, id, name, data-* attributes; survives a re-render), so a double-click on one button is ignored but two
// different actions sharing a default label ("Work") or one handler on two rows (approve draft A / draft B) do not
// block each other while one waits on the LLM.
function actKey(fn, label, hours) {
  const ev = globalThis.event;
  const t = ev?.target?.closest?.('button, a, input, select, textarea, form, [data-act]') ?? ev?.target ?? null;
  const el = t?.tagName ? `${t.tagName}#${t.id ?? ''}[${t.getAttribute?.('name') ?? ''}]${JSON.stringify({ ...(t.dataset ?? {}) })}` : '';
  return `${label}|${hours}|${el}|${String(fn)}`;
}
function flushSave({ unloading = false } = {}) {
  if (saveTimer == null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (state) (unloading ? saveStateOnUnload : saveState)(state).catch((e) => console.error('save failed', e));
}
// Write a pending save right away when the tab is hidden, closed or reloaded, so the last action isn't lost.
addEventListener('pagehide', () => flushSave({ unloading: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave({ unloading: true }); });

const ctx = {
  get state() { return state; },
  params: '',
  save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 150);
  },
  render: () => render(),
  navigate(appId, params = '') { location.hash = `#/${appId}${params ? '/' + params : ''}`; },
  enqueue(type, payload, opts) { const j = enqueue(state, type, payload, opts); kickJobs(); return j; },
  runJobs: () => kickJobs(),
  // Run a player action: optionally spend founder hours first, then save + re-render.
  // Errors (including running out of hours) are shown as toasts instead of breaking the UI.
  // A rejected action (fn throws) refunds its hours: nothing happened, so no time was spent. A second click on the
  // same action while the first is still running (e.g. waiting on an LLM judge) is ignored instead of charged again.
  // Planned hours are a plan: an action past today's plan is overtime; one that would push today past ~12 h, the week
  // past ~80 h or eat the protected day off asks first (work late / end the day and do it tomorrow / cancel).
  async act(fn, { hours = 0, label = 'Work', overtime = 0 } = {}) {
    const key = actKey(fn, label, hours);
    if (inFlight.has(key)) return undefined;
    let charged = null;
    inFlight.add(key);
    try {
      if (state.status !== 'playing') throw new Error('This company is closed. Start a new one from Settings.');
      let spreadFrom = null;
      if (hours > 0) {
        // An action longer than what is left of a day can't be crammed into one: it runs at the planned pace and
        // carries into the next days (a 30 h build is a week of work, not one night).
        if (dayUsed(state) + hours > OVERWORK.dayMax) spreadFrom = Math.max(dayCap(state), dayUsed(state));
        else {
          const choice = await confirmOverwork(hours, label);
          if (choice === 'cancel') return undefined;
          if (choice === 'tomorrow') { advance(state, 1, APPS); kickJobs(); }
        }
        const before = dayUsed(state), plan = dayCap(state);
        charged = spendHours(state, hours, label, { overtime });
        if (spreadFrom == null && before < plan - 1e-9 && dayUsed(state) > plan + 1e-9 && state.founder.planToastDay !== state.day) {
          state.founder.planToastDay = state.day;
          toast(`Past today's plan (${plan.toFixed(1)}h). You can keep going; click End day when you're done. Past ${OVERWORK.dayWarn}h a day, work gets slower and costs sleep.`, 'info');
        }
      }
      const r = await fn(state);
      if (hours > 0) rollDays(spreadFrom);
      ctx.save();
      render();
      return r;
    } catch (e) {
      if (charged) refundHours(state, charged);
      if (!(e instanceof OutOfHoursError)) console.error(e);
      toast(e.message, e instanceof OutOfHoursError ? 'warn' : 'bad');
      ctx.save();
      render();
      return undefined;
    } finally {
      inFlight.delete(key);
    }
  },
  llm,
  toast,
};
window.__ctx = ctx; // handy for debugging in the console

// What the last live calls actually did (UI only, this tab): the top bar says Failing when a key is set but every
// call falls back offline, instead of claiming Live because a key exists.
const llmHealth = createHealth();
installBusyTracking();
llm.configure({
  onUsage: ({ mock, usd = 0, error = null }) => {
    recordCall(llmHealth, { mock, error });
    if (!state) return;
    state.llmUsage.calls++;
    if (mock) state.llmUsage.mockCalls++;
    if (mock && error != null) state.llmUsage.failedCalls = (state.llmUsage.failedCalls ?? 0) + 1; // a live attempt that fell back
    state.llmUsage.usd += usd;
    renderTopbar();
  },
});
ctx.llmHealth = llmHealth;

for (const app of APPS) for (const [type, h] of Object.entries(app.jobs ?? {})) registerJob(type, h);

function kickJobs() {
  runJobs(ctx).then(() => renderTopbar());
  renderTopbar();
}

// ---------------------------------------------------------------------------
// Routing & rendering
// ---------------------------------------------------------------------------

const visibleApps = () => APPS.filter((a) => !a.models || a.models.includes(state.company.model));
// The sidebar shows only what the founder has reached (core/unlocks.js); every app still simulates every day.
const sidebarApps = () => visibleApps().filter((a) => isAppUnlocked(state, a.id));

// Sidebar items to pulse after an unlock: appId -> expiry (ms timestamp; UI only, never in game state).
const pulse = new Map();

// Announce fresh unlocks (toast + notification + pulsing sidebar item) and point to where they live.
function announceUnlocks() {
  const q = takeQueue(state);
  if (!q.length) return;
  const apps = q.filter((x) => x.kind === 'app').map((x) => appMeta(x.id)).filter(Boolean);
  const tabs = q.filter((x) => x.kind === 'tab');
  const until = performance.now() + 9000;
  for (const m of apps) pulse.set(m.id, until);
  for (const t of tabs) { const m = appMeta(t.id.split('/')[0]); if (m && isAppUnlocked(state, m.id)) pulse.set(m.id, until); }
  if (apps.length) {
    const text = apps.length === 1
      ? `Unlocked: ${apps[0].title}. Find it under ${apps[0].group} in the sidebar.`
      : `Unlocked ${apps.length} new functions: ${apps.map((m) => `${m.title} (${m.group})`).join(', ')}. They are in the sidebar.`;
    toast(text, 'good', 9000);
    notify(state, text, { type: 'good', app: apps[0].id });
    document.body.classList.add('nav-pulse');
    setTimeout(() => document.body.classList.remove('nav-pulse'), 9000);
  } else if (tabs.length) {
    const names = [...new Set(tabs.map((t) => appMeta(t.id.split('/')[0])?.title).filter(Boolean))];
    toast(`New tab${tabs.length === 1 ? '' : 's'} opened in ${names.join(', ')}.`, 'good', 6000);
  }
  ctx.save();
  setTimeout(() => { if (state) renderSidebar(); }, 9100);
}

// After an app renders, hide tab links the tree gates and the founder has not reached (unknown tabs stay visible;
// the active tab is never hidden, e.g. when a Go link or a notification deep-links into it). Freshly unlocked tabs
// carry a "New" marker until the founder opens them.
// Stat tiles are for figures. Any tile (stat() or hand-built) whose value or caption is long text gets the wide,
// clamped layout instead of wrapping one word per line (same rule as stat() in core/ui.js).
function widenLongStats(root) {
  for (const t of root.querySelectorAll('.stat:not(.long)')) {
    const v = t.querySelector('.stat-value')?.textContent.trim() ?? '';
    const sub = t.querySelector('.stat-sub')?.textContent.trim() ?? '';
    if (v.length > 22 || sub.length > 40) { t.classList.add('long'); if (v.length > 22) t.querySelector('.stat-value').title ||= v; }
  }
}

function hideLockedTabs(root, appId) {
  let seenNow = false;
  for (const bar of root.querySelectorAll('.tabs')) {
    for (const el of bar.querySelectorAll('a, button')) {
      const active = el.classList.contains('active') || el.classList.contains('primary');
      let key = null;
      const href = el.getAttribute('href');
      if (href && href.startsWith('#/')) {
        const [a, t] = href.slice(2).split('/');
        if (t) key = `${a}/${safeDecode(t)}`;
      } else {
        const attr = [...el.attributes].find((x) => x.name.startsWith('data-') && x.value && !/\s/.test(x.value));
        if (attr) key = `${appId}/${attr.value}`;
      }
      if (!key || !isTabGated(key)) continue;
      if (active) { if (markSeen(state, `tab:${key}`)) seenNow = true; continue; }
      if (!isTabUnlocked(state, key)) el.hidden = true;
      else if (isNewTab(state, key)) el.insertAdjacentHTML('beforeend', '<span class="tab-new" title="Newly unlocked">New</span>');
    }
  }
  if (seenNow) { ctx.save(); renderSidebar(); }
}

function renderLocked(el, app) {
  const prov = providersOf(app.id).filter((x) => nodeModelOk(state, x));
  const node = prov[0];
  const cat = CATEGORIES.find((c) => c.id === node?.category);
  const st = node ? nodeStatus(state, node) : null;
  mount(el, html`<div class="locked-page panel">
    <div class="locked-icon">${app.icon}</div>
    <h1>${app.title} is not set up yet</h1>
    <p class="muted">${app.group} · Functions open only when you ask for them (Todos or here), so the screen only gets busier when you want it to.</p>
    ${node ? html`<div class="callout"><b>Opens with:</b> ${node.title} <span class="muted small">(${cat?.label}${st === 'available' ? ', on your list now' : st === 'done' ? ', done' : ', later in the tree'})</span><div class="small">${node.why}</div></div>` : ''}
    <div class="app-actions"><button class="primary" id="expandNow">Expand now</button><a class="btn" href="#/todos">Open Todos</a><a class="btn" href="#/help">Help</a></div>
    <p class="hint">Expanding early is fine: it is your request to see this function now. Everything it does still costs real hours and money.</p>
  </div>`);
  on(el, 'click', '#expandNow', () => ctx.act((s) => { expandKey(s, app.id); }));
}

// A malformed escape (e.g. a hand-typed "%" in the URL) must not throw out of render: keep the raw text.
function safeDecode(t) { try { return decodeURIComponent(t); } catch { return t; } }

function route() {
  const [, id = 'home', ...rest] = (location.hash || '#/home').split('/');
  return { id, params: safeDecode(rest.join('/')) };
}

let lastRendered = null;
let deadShownFor = null; // the state whose shutdown modal was already shown (UI only)
function render() {
  if (!state) return renderSetup();
  document.body.classList.remove('setup-mode');
  ensureProgress(state);
  evaluate(state);
  const { id, params } = route();
  const app = visibleApps().find((a) => a.id === id) ?? APPS[0];
  const locked = !isAppUnlocked(state, app.id);
  if (!locked && markSeen(state, `app:${app.id}`)) { evaluate(state); ctx.save(); }
  renderTopbar();
  renderSidebar();
  ctx.params = params;
  const view = $('#view');
  // Preserve scroll position and focused field across re-renders of the same app.
  const sameApp = lastRendered === app.id;
  const scroll = sameApp ? view.scrollTop : 0;
  const focused = sameApp && document.activeElement?.id ? { id: document.activeElement.id, pos: document.activeElement.selectionStart } : null;
  view.dataset.app = app.id;
  // Fresh element per render so listeners apps attach with on(root, ...) never stack up.
  const el = document.createElement('div');
  el.className = 'app-root';
  view.replaceChildren(el);
  try {
    if (locked) renderLocked(el, app);
    else { app.render(el, ctx); hideLockedTabs(el, app.id); widenLongStats(el); }
  } catch (e) {
    console.error(e);
    mount(el, html`<div class="panel"><h2>Something broke in ${app.title}</h2><pre>${e.stack}</pre></div>`);
  }
  lastRendered = app.id;
  view.scrollTop = scroll;
  if (focused) {
    const el = document.getElementById(focused.id);
    if (el) { el.focus(); try { el.setSelectionRange?.(focused.pos, focused.pos); } catch {} }
  }
  announceUnlocks();
  // Once per company per page load: "Look around" closes it, and navigating must not pop it straight back up.
  if (state.status === 'dead' && deadShownFor !== state && !$('dialog.modal')) { deadShownFor = state; showDead(); }
  if (state.status === 'exited' && !state.flags.exitShown && !$('dialog.modal')) showExit();
}

function renderTopbar() {
  if (!state) return;
  const judges = judgeStatus(llmHealth, llm.isLive(), llm.getSettings());
  const jobs = pendingCount(state);
  const cash = totalCash(state);
  const worked = dayUsed(state);
  const cap = dayCap(state);
  const week = weekWorked(state);
  const debt = state.founder.sleepDebt ?? 0;
  const dayTone = worked > OVERWORK.dayWarn ? 'neg' : worked > cap + 0.05 ? 'warn' : '';
  mount($('#topbar'), html`
    <div class="tb-left">
      <button class="icon-btn" id="navToggle" aria-label="Menu">☰</button>
      <div><div class="tb-company">${state.company.name} <span class="badge">${MODELS[state.company.model].short}${state.company.customerType && state.company.model !== 'b2c' ? ` · ${CUSTOMER_TYPES[state.company.customerType]?.short ?? ''}` : ''}</span> <span class="badge">${PATHS[state.company.path].label}</span></div>
      <div class="tb-date">${dateOf(state).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}, ${fmtDate(state)} · <b class="tb-clock" title="Time of day: every action moves it forward by its hours, and it flows around today's meetings. Working past your plan runs into the evening and the night; click End day to sleep (the day also ends once you have worked ${OVERWORK.dayMax} h).">🕒 ${fmtTime(Math.round(clockNow(state) / 5) * 5)}</b> · day ${state.day}</div></div>
    </div>
    <div class="tb-stats">
      <div><span>Cash</span><b class="${cash < 0 ? 'neg' : ''}">${money(cash)}</b></div>
      <div><span>MRR</span><b>${money(mrr(state))}</b></div>
      <div title="Hours worked today vs today's plan (your ${state.founder.hoursPerWeek} h week spread over the days; ${hoursLeft(state).toFixed(1)} h of the plan left this week, ${week.toFixed(1)} h worked). The plan is not a limit: keep working late or on weekends if you need to, then click End day. Past ${OVERWORK.dayWarn} h a day or ${OVERWORK.weekWarn} h a week you pay for it: slower work, sleep debt, lost energy, more burnout and illness.${debt >= 1 ? ` Sleep debt: ${debt.toFixed(1)} h.` : ''}"><span>Today${state.founder.wellbeing?.dayOff && dateOf(state).getUTCDay() === 0 ? ' (day off)' : ''}</span><b class="${dayTone}">${worked.toFixed(1)} / ${cap.toFixed(1)}h${debt >= 4 ? ` · 😴${Math.round(debt)}h` : ''}</b></div>
      <div title="${judges.title}"><span>AI judges</span><b class="${judges.tone}">${judges.label}${jobs ? ` · ${jobs} thinking…` : ''}</b></div>
    </div>
    <div class="tb-time">
      <button data-adv="1" title="End the day and sleep: unused planned hours today are gone">End day</button>
      <button data-adv="7">+1 week</button>
      <button data-adv="30" class="primary">+1 month</button>
    </div>`);
}

function renderSidebar() {
  const { id } = route();
  const groups = {};
  for (const a of sidebarApps()) (groups[a.group] ??= []).push(a);
  const now = performance.now();
  mount($('#sidebar'), html`${Object.entries(groups).map(([g, apps]) => html`
    <div class="nav-group"><div class="nav-title">${g}</div>
      ${apps.map((a) => {
        let b = null;
        try { b = a.id === 'mail' ? unreadCount(state) : a.badge?.(state); } catch (e) { console.warn(`[${a.id}] badge failed`, e); }
        const fresh = isNewApp(state, a.id);
        const pulsing = (pulse.get(a.id) ?? 0) > now;
        return html`<a href="#/${a.id}" class="${a.id === id ? 'active' : ''} ${pulsing ? 'pulse' : ''}"><span class="nav-icon">${a.icon}</span>${a.title}${fresh ? html`<span class="nav-new">New</span>` : hasNewTab(state, a.id) ? html`<span class="nav-dot" title="New tab inside"></span>` : ''}${b ? html`<span class="nav-badge">${b}</span>` : ''}</a>`;
      })}
    </div>`)}`);
}

// The date moves when you end the day, or by itself once today's work reaches the physical ceiling (OVERWORK.dayMax,
// about 3am); work past it carries into the next day. A long action (spreadFrom set) runs at the planned pace instead:
// today up to max(plan, what you had already done), then each next day's plan, carrying the rest (a 30 h build is
// most of a week, not one night).
function rollDays(spreadFrom = null) {
  for (let guard = 0; guard < 31 && state.status === 'playing'; guard++) {
    const used = dayUsed(state);
    const limit = spreadFrom != null ? Math.min(OVERWORK.dayMax, spreadFrom) : OVERWORK.dayMax;
    if (used <= 0 || used < limit - 1e-9) break;
    state.founder.carryHours = Math.max(0, used - Math.max(0, limit));
    advance(state, 1, APPS);
    if (spreadFrom != null) spreadFrom = dayCap(state);
  }
  kickJobs();
}

// Ask before an action crosses a line that costs health: 12 h today, 80 h this week, or the protected day off.
// Resolves 'go' (work anyway), 'tomorrow' (end the day first, do it in the morning) or 'cancel'.
function confirmOverwork(hours, label) {
  const p = overworkPreview(state, hours);
  if (!p.crossesDay && !p.crossesWeek && !p.breaksDayOff) return Promise.resolve('go');
  const lines = [];
  if (p.crossesDay) lines.push(`This takes you to about ${p.dayAfter.toFixed(1)} h today (the clock would read ${fmtTime(Math.round((clockNow(state) + (hours + p.tax) * 60) / 5) * 5)}). Past ${OVERWORK.dayWarn} h a day every hour gets less done, you sleep less, build sleep debt that slows you for days, lose energy and get sick more often.`);
  if (p.crossesWeek) lines.push(`This takes your week past ${OVERWORK.weekWarn} h (about ${Math.round(p.weekAfter)} h). Past ~55 h a week, extra hours add almost no output (Pencavel 2014), and burnout odds climb steeply.`);
  if (p.breaksDayOff) lines.push('Today is your protected day off. Working on it forfeits its recovery this week.');
  if (p.tax > 0.05) lines.push(`Fatigue: "${label}" would take about ${(hours + p.tax).toFixed(1)} h instead of ${hours} h.`);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const { dialog } = modal({
      title: p.breaksDayOff && !p.crossesDay && !p.crossesWeek ? 'Work on your day off?' : 'Push past a healthy day?',
      body: html`${lines.map((l) => html`<p>${l}</p>`)}<p class="muted small">A stellar founder crunches rarely and on purpose (a launch, a hard deadline), not by default.</p>`,
      actions: [
        { label: p.breaksDayOff && !p.crossesDay ? 'Work anyway' : 'Work late', danger: true, onClick: () => finish('go') },
        { label: 'End the day, do it tomorrow', primary: true, onClick: () => finish('tomorrow') },
        { label: 'Cancel', onClick: () => finish('cancel') },
      ],
    });
    dialog.addEventListener('close', () => finish('cancel'));
    dialog.addEventListener('cancel', () => finish('cancel'));
  });
}

function doAdvance(days) {
  if (state.status !== 'playing') return;
  advance(state, days, APPS);
  ctx.save();
  render();
  kickJobs();
}

function showDead() {
  if (state.flags?.endReason === 'removed_by_board') return modal({
    title: 'The board removed you as CEO',
    body: html`<p>After the numbers you reported to investors turned out to be false, the board of ${state.company.name} voted to replace you on ${fmtDate(state)}.</p>
      <p class="muted">Lies about traction are rarely caught when they are told; they are caught when someone reconciles them with Stripe, the bank and the books. The Scorecard lists every claim and where it surfaced.</p>`,
    actions: [{ label: 'Look around' }, { label: 'Start a new company', primary: true, onClick: () => { newGame(); } }],
  });
  modal({
    title: 'The company is out of money',
    body: html`<p>Your bank account stayed overdrawn for two weeks. ${state.company.name} shut down on ${fmtDate(state)} with ${money(mrr(state))} MRR.</p>
      <p class="muted">Most startups die exactly like this: not from competitors, but from running out of runway before the growth engine works. Look back through Books and Analytics to see where the money went.</p>`,
    actions: [{ label: 'Look around' }, { label: 'Start a new company', primary: true, onClick: () => { newGame(); } }],
  });
}

function showExit() {
  state.flags.exitShown = true;
  ctx.save();
  const r = state.apps.fundraising?.exit?.result ?? {};
  const take = r.founderTake ?? null;
  modal({
    title: `You sold ${state.company.name}`,
    body: html`<p>${state.company.name} was acquired on ${fmtDate(state)}${r.price ? html` for <b>${money(r.price)}</b>` : ''}.</p>
      ${take != null ? html`<p>After fees, debt and investor preferences, you take home <b>${money(take)}</b>.</p>` : ''}
      <p class="muted">Most founders never get here. Look back through Analytics and Books at what worked, or start another company.</p>`,
    actions: [{ label: 'Look around' }, { label: 'Start a new company', primary: true, onClick: () => { newGame(); } }],
  });
}

async function newGame() {
  // Drop a pending debounced save first: it would fire during the delete and write the old company back.
  clearTimeout(saveTimer);
  saveTimer = null;
  await clearState();
  state = null;
  location.hash = '#/home';
  render();
}
ctx.newGame = newGame;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function renderSetup() {
  document.body.classList.add('setup-mode');
  mount($('#view'), html`
  <div class="setup">
    <h1>Start your company</h1>
    <p class="muted">You're a solo founder in November 2026. Everything you do costs time, and every tool behaves like the real one: a bank, Stripe, a CRM, an ads manager, a cap table. Use your real profile, real prospects and your real website if you have them. With an OpenRouter key (Settings), LLM-played customers and investors judge them; without one, deterministic offline heuristics stand in and the top bar says Offline.</p>
    <form id="setupForm" class="setup-form">
      <label>Company name <input name="companyName" required maxlength="40" value="" placeholder="e.g. Ledgerly" /></label>
      <label>Your name <input name="founderName" required maxlength="60" placeholder="Your real name" /></label>
      <fieldset><legend>Business model</legend>
        ${Object.entries(MODELS).map(([k, m], i) => html`<label class="radio-card"><input type="radio" name="model" value="${k}" ${i === 1 ? 'checked' : ''} /><b>${m.label}</b><span>${{
          b2c: 'Consumers pay $5–$20/month. You live and die by paid ads, creative testing, app-store-style trials, word of mouth and retention curves.',
          smb: 'Small businesses pay $30–$300/month. Founder-led outbound, cold email deliverability, demos, trials and a CRM pipeline.',
          ent: 'Companies pay $15k+/year. Long sales cycles, security reviews, champions, procurement, and fewer, bigger deals.',
        }[k]}</span></label>`)}
      </fieldset>
      <fieldset id="customerTypes"><legend>Who do you sell to?</legend>
        <p class="hint">Selling to startups, to mom-and-pop shops and to online stores are different businesses: channels, sales, pricing, onboarding, support, payments, churn and investors all change. You can move upmarket to mid-market and enterprise later.</p>
        ${Object.entries(TYPES_BY_MODEL).flatMap(([m, ids]) => ids.filter((id) => id !== 'consumers').map((id, i) => html`<label class="radio-card" data-model="${m}"><input type="radio" name="customerType" value="${id}" ${m === 'smb' && i === 0 ? 'checked' : ''} /><b>${CUSTOMER_TYPES[id].label}</b><span>${CUSTOMER_TYPES[id].blurb}</span></label>`))}
        <label class="radio-card" data-model="smb ent"><input type="radio" name="customerType" value="" /><b>Mixed / not sure yet</b><span>A generic B2B baseline. Pick a customer type later in Who you sell to.</span></label>
      </fieldset>
      <fieldset><legend>Path</legend>
        ${Object.entries(PATHS).map(([k, p], i) => html`<label class="radio-card"><input type="radio" name="path" value="${k}" ${i === 0 ? 'checked' : ''} /><b>${p.label}</b><span>${p.goal}</span></label>`)}
      </fieldset>
      <div class="grid-2">
        <label>Savings you'll set aside for the business ($) <input type="number" name="savings" value="30000" min="0" step="1000" /></label>
        <label>Hours per week you plan to work <input type="number" name="hours" value="55" min="10" max="90" /><span class="hint">Spread over the days of the week (55 h is about 8 h a day, every day). It is a plan, not a limit: you can work late or on weekends, but past 12 h a day or 80 h a week you pay for it in sleep, energy, speed and health. End each day yourself.</span></label>
      </div>
      <fieldset><legend>Your real network (drives launch reach and word of mouth)</legend>
        <div class="grid-4">
          <label>Close friends & family <input type="number" name="friends" value="50" min="0" /></label>
          <label>LinkedIn connections <input type="number" name="linkedin" value="300" min="0" /></label>
          <label>X / Bluesky followers <input type="number" name="x" value="100" min="0" /></label>
          <label>Newsletter / email list <input type="number" name="newsletter" value="0" min="0" /></label>
        </div>
      </fieldset>
      <fieldset><legend>Your personal finances (decide how long you can last and what lenders will offer)</legend>
        <div class="grid-4">
          <label>Credit score (FICO) <input type="number" name="fico" value="720" min="300" max="850" /></label>
          <label>Liquid savings left after funding the company ($) <input type="number" name="liquidSavings" value="40000" min="0" step="1000" /></label>
          <label>Monthly living costs ($) <input type="number" name="living" value="3500" min="0" step="100" /></label>
          <label>Salary before quitting ($/yr) <input type="number" name="priorIncome" value="120000" min="0" step="5000" /></label>
          <label>Your day job <select name="job"><option value="quit">Quit, full-time founder</option><option value="part_time">Kept a part-time job</option><option value="full_time">Kept my full-time job (nights &amp; weekends)</option></select></label>
          <label>Retirement savings, vested ($) <input type="number" name="retirement" value="40000" min="0" step="1000" /></label>
          <label>Home equity ($) <input type="number" name="homeEquity" value="0" min="0" step="5000" /></label>
          <label>Monthly debt payments ($) <input type="number" name="debt" value="300" min="0" step="50" /></label>
          <label>Brokerage / investments ($) <input type="number" name="brokerage" value="0" min="0" step="1000" /></label>
          <label>Partner / household income ($/yr) <input type="number" name="partnerIncome" value="0" min="0" step="1000" /></label>
          <label>Citizenship <select name="citizenship"><option value="citizen">US citizen</option><option value="resident">US permanent resident</option><option value="other">Neither (visa or outside the US)</option></select></label>
        </div>
        <p class="hint">Use your real numbers if you want the lending offers to match reality. They stay in this browser.</p>
        <p class="hint" id="runwayHint"></p>
      </fieldset>
      <label>One-liner: what you sell to whom <input name="oneLiner" maxlength="160" placeholder="e.g. Automated bookkeeping reconciliation for Shopify stores doing $1–10M/yr" /></label>
      <fieldset><legend>AI connection</legend>
        <p class="hint">LLMs play your customers, prospects and investors and research your market on the web. The hosted option needs no setup; you can change this any time in Settings.</p>
        ${connectionField({ current: llm.getConnectionInfo().connection })}
      </fieldset>
      <div class="setup-actions"><button class="primary" type="submit">Found the company</button></div>
    </form>
  </div>`);
  // Personal runway preview: most founders who quit run out of personal money before the company pays them.
  const runwayHint = () => {
    const f = formData($('#setupForm'));
    const net = f.job === 'full_time' ? (f.priorIncome / 12) * 0.72 : f.job === 'part_time' ? (f.priorIncome * 0.45 / 12) * 0.75 : 0;
    const burn = (f.living ?? 0) + (f.debt ?? 0) - net;
    const el = $('#runwayHint');
    if (burn <= 0) { el.textContent = 'Your job covers your living costs, but it also takes 20–40 hours of your week.'; el.className = 'hint'; return; }
    const months = (f.liquidSavings ?? 0) / burn;
    el.textContent = `Personal runway: about ${months.toFixed(1)} months before your savings run out (burning about $${Math.round(burn).toLocaleString()} a month). After that you go onto credit cards, then back to a job, which leaves far fewer hours for the company. Most bootstrapped companies take 12–24 months to pay a founder salary.`;
    el.className = months < 12 ? 'hint callout bad' : 'hint';
  };
  bindKeyField($('#setupForm'));
  bindConnectionField($('#setupForm'));
  $('#setupForm').addEventListener('input', runwayHint);
  runwayHint();
  // Customer types follow the business model (consumer apps have one: consumers).
  const syncTypes = () => {
    const model = formData($('#setupForm')).model;
    const box = $('#customerTypes');
    box.hidden = model === 'b2c';
    let first = null;
    for (const card of box.querySelectorAll('[data-model]')) {
      const show = card.dataset.model.split(' ').includes(model);
      card.hidden = !show;
      const input = card.querySelector('input');
      if (!show && input.checked) input.checked = false;
      if (show && !first && input.value) first = input;
    }
    if (model !== 'b2c' && !box.querySelector('input:checked') && first) first.checked = true;
  };
  $('#setupForm').addEventListener('change', (e) => { if (e.target.name === 'model') syncTypes(); });
  syncTypes();
  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    llm.setSettings(connectionPatch(f));
    llm.applyConnection().then(() => renderTopbar()); // don't hold up founding the company on a network probe
    // An emptied number field submits as null (min/max don't apply to empty inputs): fall back to the form defaults
    // so hours, FICO and money never start as null/NaN.
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    Object.assign(f, { savings: num(f.savings, 0), hours: num(f.hours, 55), fico: num(f.fico, 720), liquidSavings: num(f.liquidSavings, 0), living: num(f.living, 3500), priorIncome: num(f.priorIncome, 0), retirement: num(f.retirement, 0), homeEquity: num(f.homeEquity, 0), debt: num(f.debt, 0) });
    state = newState({ companyName: f.companyName.trim(), model: f.model, path: f.path, founderName: f.founderName.trim(), savings: f.savings, hoursPerWeek: f.hours, plans: [] }); // no price until the founder sets one in Pricing
    Object.assign(state.founder.network, { friends: f.friends ?? 0, linkedin: f.linkedin ?? 0, x: f.x ?? 0, newsletter: f.newsletter ?? 0 });
    state.company.oneLiner = f.oneLiner.trim();
    setCustomerType(state, f.model === 'b2c' ? 'consumers' : f.customerType || null);
    const job = f.job;
    Object.assign(state.personal, {
      fico: f.fico, liquidSavings: f.liquidSavings, monthlyLivingCosts: f.living, priorW2Income: f.priorIncome, job,
      incomeType: job === 'quit' ? 'none' : 'w2',
      annualIncome: job === 'full_time' ? f.priorIncome : job === 'part_time' ? Math.round(f.priorIncome * 0.45) : 0,
      retirementVested: f.retirement, homeEquity: f.homeEquity, monthlyDebtPayments: f.debt, otherDebtPayments: f.debt,
      // Ground truth for lender verification (core/personal.js STATED_FIELDS): Financing later edits only what you state.
      brokerage: num(f.brokerage, 0), partnerIncome: num(f.partnerIncome, 0),
      usCitizenOrResident: f.citizenship !== 'other', usCitizen: (f.citizenship ?? 'citizen') === 'citizen',
    });
    // A day job pays the bills but eats founder hours.
    if (job === 'full_time') state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 25);
    else if (job === 'part_time') state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 40);
    ensureStripe(state);
    ensureMarket(state);
    seedDefaultStack(state);
    // Not incorporated yet: the business money sits in the founder's own checking account (a sole proprietor can
    // still use Stripe on their SSN). Mercury opens in the company's name after Legal incorporates + gets an EIN.
    if (f.savings > 0) post(state, { amount: f.savings, counterparty: state.founder.name, description: 'Savings set aside for the business (sole proprietor, pre-incorporation)', category: 'owner_contribution', method: 'internal' });
    log(state, 'info', `Founded ${state.company.name}.`);
    // Find real competitors for this idea (web search via the Market app) as soon as the company exists.
    // Progressive disclosure: a new company starts with the core apps and its first to-dos.
    ensureProgress(state);
    evaluate(state);
    if (state.company.oneLiner && hasJob('world:competitors')) enqueue(state, 'world:competitors', { reason: 'setup' }, { label: 'Researching competitors' });
    await saveState(state);
    location.hash = '#/todos';
    render();
    kickJobs();
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

on(document.body, 'click', '[data-adv]', (e, el) => doAdvance(+el.dataset.adv));
on(document.body, 'click', '#navToggle', () => document.body.classList.toggle('nav-open'));
on(document.body, 'click', '#sidebar a', () => document.body.classList.remove('nav-open'));
window.addEventListener('hashchange', () => { lastRendered = null; render(); });
// Re-render for charts only when the width changes: a phone keyboard opening or closing changes only the height, and a
// full re-render would wipe whatever the player was typing.
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => { if (window.innerWidth === lastWidth) return; lastWidth = window.innerWidth; if (state) render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog, [contenteditable]')) return;
  if (e.key === 'n' && state) doAdvance(1);
});

(async () => {
  requestPersistence();
  // Service worker (public/sw.js): the game's files are cached on first load, so later loads are fast and play works offline.
  // Loopback hosts are secure contexts too; npm start prints http://127.0.0.1:3000, so 'localhost' alone never matched.
  try { if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch {}
  await llm.applyConnection();
  try { state = await loadState(); } catch (e) { console.error(e); }
  if (state && state.v !== 3) state = null;
  render();
  if (state) kickJobs();
})();

export { ctx };
