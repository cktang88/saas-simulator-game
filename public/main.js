// App shell: setup flow, sidebar, top bar, routing, time controls, and the ctx handed to every app.

import { APPS } from './apps/registry.js';
import { newState, MODELS, PATHS, hoursLeft, OutOfHoursError, spendHours, log } from './core/state.js';
import { advance } from './core/clock.js';
import { seedDefaultStack, post, balance, totalCash } from './core/bank.js';
import { ensureStripe, mrr } from './core/stripe.js';
import { ensureMarket } from './core/market.js';
import { saveState, loadState, clearState } from './core/store.js';
import * as llm from './core/llm.js';
import { registerJob, enqueue, runJobs, pendingCount, hasJob } from './core/jobs.js';
import { unreadCount } from './core/mail.js';
import { html, mount, on, toast, formData, modal } from './core/ui.js';
import { money, fmtDate, dateOf } from './core/util.js';

const $ = (s) => document.querySelector(s);
let state = null;
let saveTimer = null;

const ctx = {
  get state() { return state; },
  params: '',
  save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(state).catch((e) => console.error('save failed', e)), 150);
  },
  render: () => render(),
  navigate(appId, params = '') { location.hash = `#/${appId}${params ? '/' + params : ''}`; },
  enqueue(type, payload, opts) { const j = enqueue(state, type, payload, opts); kickJobs(); return j; },
  runJobs: () => kickJobs(),
  // Run a player action: optionally spend founder hours first, then save + re-render.
  // Errors (including running out of hours) are shown as toasts instead of breaking the UI.
  async act(fn, { hours = 0, label = 'Work' } = {}) {
    try {
      if (state.status !== 'playing') throw new Error('This company is closed. Start a new one from Settings.');
      if (hours > 0) spendHours(state, hours, label);
      const r = await fn(state);
      ctx.save();
      render();
      return r;
    } catch (e) {
      if (!(e instanceof OutOfHoursError)) console.error(e);
      toast(e.message, e instanceof OutOfHoursError ? 'warn' : 'bad');
      ctx.save();
      render();
      return undefined;
    }
  },
  llm,
  toast,
};
window.__ctx = ctx; // handy for debugging in the console

llm.configure({
  onUsage: ({ mock, usd = 0 }) => {
    if (!state) return;
    state.llmUsage.calls++;
    if (mock) state.llmUsage.mockCalls++;
    state.llmUsage.usd += usd;
  },
});

for (const app of APPS) for (const [type, h] of Object.entries(app.jobs ?? {})) registerJob(type, h);

function kickJobs() {
  runJobs(ctx).then(() => renderTopbar());
  renderTopbar();
}

// ---------------------------------------------------------------------------
// Routing & rendering
// ---------------------------------------------------------------------------

const visibleApps = () => APPS.filter((a) => !a.models || a.models.includes(state.company.model));

function route() {
  const [, id = 'home', ...rest] = (location.hash || '#/home').split('/');
  return { id, params: decodeURIComponent(rest.join('/')) };
}

let lastRendered = null;
function render() {
  if (!state) return renderSetup();
  document.body.classList.remove('setup-mode');
  renderTopbar();
  renderSidebar();
  const { id, params } = route();
  const app = visibleApps().find((a) => a.id === id) ?? APPS[0];
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
    app.render(el, ctx);
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
  if (state.status === 'dead' && !$('dialog.modal')) showDead();
  if (state.status === 'exited' && !state.flags.exitShown && !$('dialog.modal')) showExit();
}

function renderTopbar() {
  if (!state) return;
  const live = llm.isLive();
  const jobs = pendingCount(state);
  const cash = totalCash(state);
  const h = hoursLeft(state);
  mount($('#topbar'), html`
    <div class="tb-left">
      <button class="icon-btn" id="navToggle" aria-label="Menu">☰</button>
      <div><div class="tb-company">${state.company.name} <span class="badge">${MODELS[state.company.model].short}</span> <span class="badge">${PATHS[state.company.path].label}</span></div>
      <div class="tb-date">${dateOf(state).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}, ${fmtDate(state)} · day ${state.day}</div></div>
    </div>
    <div class="tb-stats">
      <div><span>Cash</span><b class="${cash < 0 ? 'neg' : ''}">${money(cash)}</b></div>
      <div><span>MRR</span><b>${money(mrr(state))}</b></div>
      <div title="Founder hours left this week. Every real action costs time."><span>Hours left</span><b class="${h < 5 ? 'warn' : ''}">${h.toFixed(1)} / ${state.founder.hoursPerWeek}</b></div>
      <div title="${live ? `Live LLM judges: ${llm.getSettings().models.join(', ')}` : 'No OpenRouter key: using offline heuristic judges. Add a key in Settings.'}"><span>AI judges</span><b class="${live ? 'pos' : 'warn'}">${live ? 'Live' : 'Offline'}${jobs ? ` · ${jobs} thinking…` : ''}</b></div>
    </div>
    <div class="tb-time">
      <button data-adv="1">+1 day</button>
      <button data-adv="7">+1 week</button>
      <button data-adv="30" class="primary">+1 month</button>
    </div>`);
}

function renderSidebar() {
  const { id } = route();
  const groups = {};
  for (const a of visibleApps()) (groups[a.group] ??= []).push(a);
  mount($('#sidebar'), html`${Object.entries(groups).map(([g, apps]) => html`
    <div class="nav-group"><div class="nav-title">${g}</div>
      ${apps.map((a) => {
        const b = a.id === 'mail' ? unreadCount(state) : a.badge?.(state);
        return html`<a href="#/${a.id}" class="${a.id === id ? 'active' : ''}"><span class="nav-icon">${a.icon}</span>${a.title}${b ? html`<span class="nav-badge">${b}</span>` : ''}</a>`;
      })}
    </div>`)}`);
}

function doAdvance(days) {
  if (state.status !== 'playing') return;
  advance(state, days, APPS);
  ctx.save();
  render();
  kickJobs();
}

function showDead() {
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
    <p class="muted">You're a solo founder in November 2026. Everything you do costs time, and every tool behaves like the real one: a bank, Stripe, a CRM, an ads manager, a cap table. Use your real profile, real prospects and your real website if you have them. AI customers and investors (Claude Haiku 5.5 and Jev via OpenRouter) will judge them.</p>
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
      <fieldset><legend>Path</legend>
        ${Object.entries(PATHS).map(([k, p], i) => html`<label class="radio-card"><input type="radio" name="path" value="${k}" ${i === 0 ? 'checked' : ''} /><b>${p.label}</b><span>${p.goal}</span></label>`)}
      </fieldset>
      <div class="grid-2">
        <label>Personal savings you'll put in ($) <input type="number" name="savings" value="30000" min="0" step="1000" /></label>
        <label>Hours per week you can work <input type="number" name="hours" value="55" min="10" max="90" /></label>
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
          <label>Liquid savings left after funding the company ($) <input type="number" name="liquidSavings" value="20000" min="0" step="1000" /></label>
          <label>Monthly living costs ($) <input type="number" name="living" value="3500" min="0" step="100" /></label>
          <label>Salary before quitting ($/yr) <input type="number" name="priorIncome" value="120000" min="0" step="5000" /></label>
          <label>Your day job <select name="job"><option value="quit">Quit, full-time founder</option><option value="part_time">Kept a part-time job</option><option value="full_time">Kept my full-time job (nights &amp; weekends)</option></select></label>
          <label>Retirement savings, vested ($) <input type="number" name="retirement" value="40000" min="0" step="1000" /></label>
          <label>Home equity ($) <input type="number" name="homeEquity" value="0" min="0" step="5000" /></label>
          <label>Monthly debt payments ($) <input type="number" name="debt" value="300" min="0" step="50" /></label>
        </div>
        <p class="hint">Use your real numbers if you want the lending offers to match reality. They stay in this browser.</p>
      </fieldset>
      <label>One-liner: what you sell to whom <input name="oneLiner" maxlength="160" placeholder="e.g. Automated bookkeeping reconciliation for Shopify stores doing $1–10M/yr" /></label>
      <div class="setup-actions"><button class="primary" type="submit">Found the company</button></div>
    </form>
  </div>`);
  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    state = newState({ companyName: f.companyName.trim(), model: f.model, path: f.path, founderName: f.founderName.trim(), savings: f.savings, hoursPerWeek: f.hours });
    Object.assign(state.founder.network, { friends: f.friends ?? 0, linkedin: f.linkedin ?? 0, x: f.x ?? 0, newsletter: f.newsletter ?? 0 });
    state.company.oneLiner = f.oneLiner.trim();
    const job = f.job;
    Object.assign(state.personal, {
      fico: f.fico, liquidSavings: f.liquidSavings, monthlyLivingCosts: f.living, priorW2Income: f.priorIncome, job,
      incomeType: job === 'quit' ? 'none' : 'w2',
      annualIncome: job === 'full_time' ? f.priorIncome : job === 'part_time' ? Math.round(f.priorIncome * 0.45) : 0,
      retirementVested: f.retirement, homeEquity: f.homeEquity, monthlyDebtPayments: f.debt,
    });
    // A day job pays the bills but eats founder hours.
    if (job === 'full_time') state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 25);
    else if (job === 'part_time') state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 40);
    ensureStripe(state);
    ensureMarket(state);
    seedDefaultStack(state);
    if (f.savings > 0) post(state, { amount: f.savings, counterparty: state.founder.name, description: 'Initial owner contribution', category: 'owner_contribution', method: 'ach' });
    log(state, 'info', `Founded ${state.company.name}.`);
    // Find real competitors for this idea (web search via the Market app) as soon as the company exists.
    if (state.company.oneLiner && hasJob('world:competitors')) enqueue(state, 'world:competitors', { reason: 'setup' }, { label: 'Researching competitors' });
    await saveState(state);
    location.hash = '#/home';
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
window.addEventListener('resize', () => { if (state) render(); });
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog, [contenteditable]')) return;
  if (e.key === 'n' && state) doAdvance(1);
});

(async () => {
  await llm.checkServerKey();
  try { state = await loadState(); } catch (e) { console.error(e); }
  if (state && state.v !== 3) state = null;
  render();
  if (state) kickJobs();
})();

export { ctx };
