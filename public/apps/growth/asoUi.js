// App Store tab of the Organic app: App Store Connect / Play Console-style listing editor with a validator that
// teaches the real field rules, review status, keyword ranks and research (tool-dependent), screenshots and
// creative tests (PPO / Play experiments), custom product pages, ratings, localization, tools and ASO help.

import { html, mount, on, formData, table, stat, badge, toast } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import { reviewFor } from '../../core/advice.js';
import { hasProduct } from '../../core/market.js';
import { ASO, STAGES } from './asoParams.js';
import * as M from './asoModel.js';
import {
  ensureAso, STORES, submitMetadata, submitScreenshots, startTest, stopTest, applyTest, createCpp, localize, enablePlay, setPromptPlan,
  ratingPlanInfo, replyToReviews, resetRatings, buyReviews, setIncentive, incentiveActive, setTool, setHelp, termIntel, manualRank, reviewCheck,
  starsOf, categoryOf, readAso, stageOf, currentListing,
} from './aso.js';
import { judgeAso } from './judges.js';

const ui = { store: 'ios', section: 'listing', research: null };
export const setAsoView = (patch) => Object.assign(ui, patch);
const drafts = {};
const dv = (k, f = '') => drafts[k] ?? f;
const SECTIONS = [['listing', 'Listing & review'], ['keywords', 'Keywords'], ['creative', 'Screenshots & tests'], ['ratings', 'Ratings'], ['growth', 'Markets, tools & ads']];
const PROMPTS = { none: 'No prompt (only volunteers rate)', after_aha: 'After a success moment (e.g. 3rd completed session)', timer: 'After N days, whatever happened', on_open: 'When the app opens' };

function last30(st, i) { return st.daily.slice(-30).reduce((a, x) => a + x[i], 0); }

function validationBlock(store, v) {
  return html`<div class="small">
    ${v.errors.map((e) => html`<div class="callout bad">${e}</div>`)}
    ${store === 'ios' ? html`<div class="muted">Keyword field: ${v.usedChars}/100 characters, ${v.wastedChars} wasted.</div>` : ''}
    ${v.warnings.length ? html`<ul>${v.warnings.map((w) => html`<li>${w}</li>`)}</ul>` : html`<div class="muted">No rule problems found.</div>`}
  </div>`;
}

export function renderAppStore(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const S = ensureAso(O.appstore);
  const store = S.stores[ui.store]?.enabled ? ui.store : 'ios';
  const st = S.stores[store];
  const stars = starsOf(S);
  const views = last30(st, 1), inst = last30(st, 2), imps = last30(st, 3);
  const status = st.terminated ? badge('Account terminated', 'bad') : st.removedUntil != null && s.day < st.removedUntil ? badge(`Removed until ${fmtDate(s, st.removedUntil)}`, 'bad') : st.pending ? badge(`In review until ${fmtDate(s, st.pending.decideDay)}`, 'warn') : st.live ? badge('Live', 'good') : badge('Default listing', 'warn');
  mount(body, html`
    ${!hasProduct(s) ? html`<div class="callout warn">Nothing is shipped yet: there is no app in the store. Listing work still counts once you ship.</div>` : ''}
    <div class="tabs">${Object.entries(STORES).map(([k, l]) => html`<button data-astore="${k}" class="${k === store ? 'active' : ''}">${l}${S.stores[k].enabled ? '' : ' (set up)'}</button>`)}</div>
    <div class="stats">
      ${stat('Impressions (30d)', Math.round(imps).toLocaleString(), STORES[store])}
      ${stat('Product page views (30d)', Math.round(views).toLocaleString(), `conversion ${views ? pct(inst / views) : '—'}`)}
      ${stat('Installs (30d)', Math.round(inst).toLocaleString(), `${O.stats['organic:appstore']?.signups ?? 0} trials all time`)}
      ${stat('Rating', stars == null ? '—' : `${stars.toFixed(1)}★`, `${S.reviews} ratings${S.reviews < ASO.noStars.minRatings ? ' (no stars shown yet)' : ''}`)}
      ${stat('Status', status, st.live ? `since ${fmtDate(s, st.live.day)}` : 'name only')}
    </div>
    <p class="muted small">Installs come from searches you rank for (rank × searches × page conversion), people searching your name, and browse. Ranks follow how well your words match the query, recent install velocity and ratings. There is no fixed ceiling: the volume is what your keywords and conversion earn (game model, not real statistics).</p>
    <div class="tabs">${SECTIONS.map(([k, l]) => html`<button data-asec="${k}" class="${k === ui.section ? 'active' : ''}">${l}</button>`)}</div>
    <div id="asoBody"></div>`);
  on(body, 'click', '[data-astore]', (e, el) => {
    const k = el.dataset.astore;
    if (!S.stores[k].enabled) {
      if (k === 'play') ctx.act((x) => { enablePlay(x, ensureAso(x.apps.organic.appstore)); ui.store = 'play'; toast('Google Play developer account registered ($25). Write the listing next.', 'good'); return true; }, { hours: 3, label: 'Set up Google Play' });
      return;
    }
    ui.store = k; ctx.render();
  });
  on(body, 'click', '[data-asec]', (e, el) => { ui.section = el.dataset.asec; ctx.render(); });
  on(body, 'input', '[data-adraft]', (e, el) => { drafts[el.dataset.adraft] = el.type === 'checkbox' ? el.checked : el.value; });
  on(body, 'change', '[data-adraft]', (e, el) => { drafts[el.dataset.adraft] = el.type === 'checkbox' ? el.checked : el.value; });
  const inner = body.querySelector('#asoBody');
  ({ listing, keywords, creative, ratings, growth })[ui.section](inner, ctx, S, store);
}

// ---------------- listing & review ----------------

function listing(root, ctx, S, store) {
  const s = ctx.state, st = S.stores[store];
  const L = st.pending?.listing ?? st.live ?? currentListing(s, store);
  const lim = ASO.limits[store];
  const k = (f) => `${store}:${f}`;
  const cur = { name: dv(k('name'), L.name), subtitle: dv(k('subtitle'), L.subtitle), keywords: dv(k('keywords'), L.keywords ?? ''), description: dv(k('description'), L.description ?? '') };
  const first = !st.submissions.length;
  const hours = store === 'play' ? ASO.hours.play : first ? ASO.hours.firstMetadata : ASO.hours.refresh;
  const v = M.validateMetadata(store, cur, { brand: s.company.name, category: categoryOf(s) });
  mount(root, html`<div class="grid-2">
    <section class="panel"><h2>${store === 'ios' ? 'App Store Connect: product page' : 'Play Console: main store listing'}</h2>
      <form id="asoForm">
        <label>${store === 'ios' ? 'Name' : 'App name'} (${lim.name}) <input name="name" maxlength="${lim.name + 10}" data-adraft="${k('name')}" value="${cur.name}" /></label>
        <label>${store === 'ios' ? 'Subtitle' : 'Short description'} (${lim.subtitle}) <input name="subtitle" maxlength="${lim.subtitle + 10}" data-adraft="${k('subtitle')}" value="${cur.subtitle}" /></label>
        ${store === 'ios' ? html`<label>Keywords (100, comma-separated, no spaces) <input name="keywords" maxlength="120" data-adraft="${k('keywords')}" value="${cur.keywords}" /></label>` : ''}
        <label>${store === 'ios' ? 'Description (not indexed by Apple)' : 'Full description (indexed by Google Play)'} <textarea name="description" rows="5" data-adraft="${k('description')}">${cur.description}</textarea></label>
        <div id="asoVal">${validationBlock(store, v)}</div>
        <button class="primary" ${st.pending || st.terminated ? 'disabled' : ''}>${store === 'ios' ? `Submit new version for review (~${hours}h)` : `Publish changes (~${hours}h)`}</button>
      </form>
      <p class="hint">${store === 'ios' ? 'Name, subtitle and keywords only change with a new app version, and App Review takes 1-3 days. Other apps\' names, prices and "#1" claims get updates rejected (guideline 2.3.7). After approval, ranks take 1-4 weeks to settle: change metadata once per release, not every few days.' : 'Play reviews listing changes within hours to a day and indexes the full description: use your terms naturally, a few times, never as a list. No "free", prices or "best" in the title.'}</p>
    </section>
    <section class="panel"><h2>Review history</h2>
      ${st.pending ? html`<div class="callout warn">In review: submitted ${fmtDate(s, st.pending.submitDay)}, decision expected ${fmtDate(s, st.pending.decideDay)}.</div>` : ''}
      ${st.live ? html`<p><b>${st.live.name}</b><br><span class="muted">${st.live.subtitle}</span>${st.live.keywords ? html`<br><code class="small">${st.live.keywords}</code>` : ''}</p>
        ${st.live.score != null ? html`<p class="small">Listing copy score ${Math.round(st.live.score * 100)}/100. ${st.live.feedback ?? ''}</p>` : ''}` : html`<p class="muted">Only your app name is live: you rank for almost nothing.</p>`}
      <p class="small muted">${st.submissions.length} submissions, ${S.stats.rejections} rejected (all stores).</p>
      ${operatorNote(s)}
    </section>
  </div>`);
  on(root, 'input', '#asoForm input, #asoForm textarea', () => {
    const f = formData(root.querySelector('#asoForm'));
    mount(root.querySelector('#asoVal'), validationBlock(store, M.validateMetadata(store, f, { brand: s.company.name, category: categoryOf(s) })));
  });
  on(root, 'submit', '#asoForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    await ctx.act(async (x) => {
      const Sx = ensureAso(x.apps.organic.appstore);
      const vv = M.validateMetadata(store, f, { brand: x.company.name, category: categoryOf(x) });
      if (vv.errors.length) throw new Error(vv.errors[0]);
      const [j, risk] = await Promise.all([judgeAso(ctx, { title: f.name, subtitle: f.subtitle, keywords: f.keywords ?? '', description: f.description }), reviewCheck(ctx, store, f)]);
      const r = submitMetadata(x, Sx, store, f, { score: j.score, feedback: j.feedback, rejectP: risk.rejectP, termFit: risk.termFit });
      if (!r.ok) throw new Error(r.errors[0]);
      for (const key of Object.keys(drafts)) if (key.startsWith(`${store}:`)) delete drafts[key];
      toast(`Submitted. Copy score ${Math.round(j.score * 100)}/100${j.mock || risk.mock ? ' (offline judge)' : ''}. Decision in ${r.days || 'under 1'} day(s).`, j.score >= 0.6 ? 'good' : 'warn');
      return true;
    }, { hours, label: `${STORES[store]} metadata` });
  });
}

function operatorNote(s) {
  const r = readAso(s);
  if (r.tier === 'unknown') return '';
  // The tier and the prescriptions are hidden truth: they come from a recruited source (or learning mode), not the dashboard.
  const rev = reviewFor(s, 'app_store_optimization', r);
  if (!rev.covered) return '';
  return html`<div class="small"><b>${rev.reviewer}:</b> ${rev.tier ? html`${rev.tier}. ` : ''}${rev.items.slice(0, 2).map((a) => html`<div>${a.text} <span class="muted">(${a.from})</span></div>`)}</div>`;
}

// ---------------- keywords ----------------

function keywords(root, ctx, S, store) {
  const s = ctx.state, st = S.stores[store];
  const T = ASO.tools[S.tool];
  const rows = Object.entries(st.ranks).map(([term, r]) => ({ term, r: r.r, pop: r.pop })).sort((a, b) => a.r - b.r).slice(0, 40);
  const intel = ui.research ? termIntel(s, store, ui.research) : null;
  mount(root, html`<div class="grid-2">
    <section class="panel"><h2>Keyword research</h2>
      <form id="kwForm" class="inline"><input name="term" placeholder="e.g. reading tracker for kids" value="${ui.research ?? ''}" /><button>Look up (~15 min)</button></form>
      ${intel ? html`<div class="small">
        <p><b>${intel.term}</b>: ${intel.popularity != null ? html`popularity ≈ ${intel.popularity}/100${intel.difficulty != null ? html`, difficulty ≈ ${intel.difficulty}/100` : ''} <span class="muted">(${T.label} estimate)</span>` : intel.bucket ? html`Apple Ads search popularity: <b>${intel.bucket}</b>` : html`<span class="muted">No volume data with the free consoles. Store autocomplete shows people search it; an ASO tool or an Apple Ads account shows how much.</span>`}</p>
        ${intel.competitors.length ? table({ columns: [{ label: 'Top apps', render: (c) => `${c.rank}. ${c.name}` }, { label: 'Ratings', align: 'right', render: (c) => c.ratings.toLocaleString() }, { label: 'Stars', align: 'right', render: (c) => c.stars }], rows: intel.competitors }) : ''}
        <button data-track="${intel.term}">${S.tracked.includes(intel.term) ? 'Tracked' : 'Track this term'}</button> <button data-check="${intel.term}">Search it in the store (~15 min)</button>
      </div>` : ''}
      <p class="hint">A new app with few ratings wins long-tail phrases first; one-word head terms belong to apps with velocity and thousands of ratings. Estimates from tools are models, not truth: they disagree with each other.</p>
    </section>
    <section class="panel"><h2>Ranked terms</h2>
      ${T.ranks ? table({ columns: [{ label: 'Term', key: 'term' }, { label: 'Rank', align: 'right', render: (x) => (x.r >= ASO.unranked - 1 ? '—' : Math.round(x.r)) }], rows, empty: 'Nothing indexed yet.' })
        : html`<p class="muted small">The consoles show totals (impressions, page views, conversion), not ranks per keyword. Search a term yourself, or add a rank-tracking tool. ${Object.keys(st.ranks).length} terms are indexed from your metadata.</p>`}
      ${S.tracked.length ? html`<p class="small">Tracked: ${S.tracked.join(', ')}</p>` : ''}
    </section>
  </div>`);
  on(root, 'submit', '#kwForm', (e) => {
    e.preventDefault();
    const term = String(formData(e.target).term ?? '').trim();
    if (!term) return;
    ctx.act(() => { ui.research = M.tokensOf(term).join(' '); return true; }, { hours: ASO.hours.manualCheck, label: 'Keyword research' });
  });
  on(root, 'click', '[data-track]', (e, el) => ctx.act((x) => { const Sx = ensureAso(x.apps.organic.appstore); if (!Sx.tracked.includes(el.dataset.track)) Sx.tracked.push(el.dataset.track); Sx.tracked = Sx.tracked.slice(-20); return true; }, { hours: 0, label: 'Track keyword' }));
  on(root, 'click', '[data-check]', (e, el) => ctx.act((x) => { const r = manualRank(x, store, el.dataset.check); toast(r == null ? `You don't show up in the first 200 results for "${el.dataset.check}".` : `You appear around #${r} for "${el.dataset.check}" (your own search, personalised).`, r && r <= 10 ? 'good' : 'info'); return true; }, { hours: ASO.hours.manualCheck, label: 'Manual store search' }));
}

// ---------------- screenshots, tests, CPPs ----------------

function creative(root, ctx, S, store) {
  const s = ctx.state, st = S.stores[store];
  const running = st.tests.find((t) => t.status === 'running');
  const views = last30(st, 1) / 30;
  const testName = store === 'ios' ? 'Product Page Optimization' : 'Store listing experiment';
  const appleSets = (s.apps?.ads?.adsets ?? []).filter((x) => x.p === 'apple');
  mount(root, html`<div class="grid-2">
    <section class="panel"><h2>Screenshots</h2>
      <p class="small">Current set: ${Math.round(st.shots.q * 100)}/100 (${st.shots.production})${st.shots.video ? ', with a preview video' : ''}${st.shotsPending ? html` · ${badge('new set in review', 'warn')}` : ''}.</p>
      <form id="shotForm">
        ${[0, 1, 2, 3, 4].map((i) => html`<label>Caption ${i + 1}${i < 3 ? ' (seen in search results)' : ''} <input name="c${i}" data-adraft="cap${i}" value="${dv(`cap${i}`, st.shots.captions[i] ?? '')}" /></label>`)}
        <label>Made by <select name="production">
          <option value="self">You, in Figma or a screenshot tool (~${ASO.screenshotCost.self.hours}h)</option>
          <option value="freelancer">Freelance designer ($${ASO.screenshotCost.freelancer.usd}, ~${ASO.screenshotCost.freelancer.hours}h briefing)</option>
          <option value="agency">Creative agency ($${ASO.screenshotCost.agency.usd.toLocaleString()}, ~${ASO.screenshotCost.agency.hours}h)</option>
        </select></label>
        <label><input type="checkbox" name="video" ${st.shots.video ? 'checked disabled' : ''} /> Add a 30-second preview video ($${ASO.videoCost.usd.toLocaleString()}, freelance)</label>
        <button class="primary">Ship screenshots${store === 'ios' ? ' with the next version' : ''}</button>
      </form>
      <p class="hint">The first three captions do the selling in search results: name the outcome for your user ("Read 20 minutes every night"), not the screen ("Home dashboard").</p>
    </section>
    <section class="panel"><h2>${testName}</h2>
      ${running ? testCard(s, running, store, true) : html`<form id="testForm">
          <p class="small">Up to ${ASO.test.maxTreatments} treatments against your current page; traffic is split evenly. Your page gets about ${Math.round(views)} views a day: ${views < 50 ? 'too few for a test to reach 90% confidence on a typical 5-10% lift.' : views < 300 ? 'a real lift can show in a few weeks.' : 'enough to read most tests in 1-3 weeks.'}</p>
          <label>Test <select name="kind"><option value="screenshots">Screenshots</option><option value="icon">Icon</option><option value="video">Preview video</option></select></label>
          ${[0, 1, 2].map((i) => html`<label>Treatment ${i + 1} captions (separate with |) <input name="t${i}" data-adraft="t${i}" value="${dv(`t${i}`, '')}" placeholder="${i ? '(optional)' : 'Read 20 min a night | Streaks with your kids | Every book in one place'}" /></label>`)}
          <button class="primary">Start test (~${ASO.test.setupHours}h + design)</button>
        </form>`}
      ${st.tests.filter((t) => t.status !== 'running').slice(0, 4).map((t) => testCard(s, t, store, false))}
      <p class="hint">Most tests are null or a few percent. Ship a treatment only when it wins with confidence; a "looks better" treatment that never won applies its real effect, which is often negative.</p>
    </section>
    ${store === 'ios' ? html`<section class="panel"><h2>Custom product pages</h2>
      <p class="small">A page per ad theme for Apple Search Ads traffic (AppTweak 2025: tap-to-install 58.7% with a CPP vs 55.5% default). ${S.cpps.length}/${ASO.cpp.max} created.</p>
      <form id="cppForm" class="inline"><input name="theme" placeholder="Theme, e.g. bedtime reading" /><select name="adset"><option value="">No ad group yet</option>${appleSets.map((a) => html`<option value="${a.id}">${a.name}</option>`)}</select><button>Create (~${ASO.hours.cpp}h)</button></form>
      ${S.cpps.length ? html`<ul class="small">${S.cpps.map((c) => html`<li>${c.theme} → ${appleSets.find((a) => a.id === c.adsetId)?.name ?? 'not linked'}</li>`)}</ul>` : ''}
    </section>` : ''}
  </div>`);
  on(root, 'submit', '#shotForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const c = ASO.screenshotCost[f.production];
    const captions = [0, 1, 2, 3, 4].map((i) => f[`c${i}`]).filter(Boolean);
    ctx.act((x) => { submitScreenshots(x, ensureAso(x.apps.organic.appstore), store, { production: f.production, captions, video: !!f.video }); toast('Screenshot set submitted.', 'good'); return true; }, { hours: c.hours + (f.video ? ASO.videoCost.hours : 0), label: 'Store screenshots' });
  });
  on(root, 'submit', '#testForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const treatments = [0, 1, 2].map((i) => String(f[`t${i}`] ?? '').trim()).filter(Boolean).map((t, i) => ({ label: `Treatment ${i + 1}`, captions: t.split('|').map((x) => x.trim()), production: 'self' }));
    if (!treatments.length && f.kind !== 'screenshots') treatments.push({ label: f.kind === 'icon' ? 'New icon' : 'Preview video', captions: [] });
    if (!treatments.length) { toast('Write at least one treatment.', 'warn'); return; }
    ctx.act((x) => { const r = startTest(x, ensureAso(x.apps.organic.appstore), store, { kind: f.kind, treatments }); if (!r.ok) throw new Error(r.error); toast('Test started.', 'good'); return true; }, { hours: ASO.test.setupHours + (f.kind === 'screenshots' ? 4 * treatments.length : 3), label: testName });
  });
  on(root, 'click', '[data-apply]', (e, el) => {
    const [id, arm] = el.dataset.apply.split(':');
    ctx.act((x) => { const r = applyTest(x, ensureAso(x.apps.organic.appstore), store, id, +arm); toast(r?.significant ? 'Winner set as the default page.' : 'Shipped without a significant result.', r?.significant ? 'good' : 'warn'); return true; }, { hours: ASO.test.readHours, label: 'Apply test result' });
  });
  on(root, 'click', '[data-stop]', (e, el) => ctx.act((x) => { stopTest(x, ensureAso(x.apps.organic.appstore), store, el.dataset.stop); return true; }, { hours: 0.25, label: 'Stop test' }));
  on(root, 'submit', '#cppForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((x) => { const r = createCpp(x, ensureAso(x.apps.organic.appstore), { theme: f.theme || 'Custom page', adsetId: f.adset || null }); if (!r.ok) throw new Error(r.error); return true; }, { hours: ASO.hours.cpp, label: 'Custom product page' });
  });
}

function testCard(s, t, store, live) {
  const ctl = t.arms[0];
  const res = M.testVerdict(t, store);
  return html`<div class="card small"><b>${t.kind}</b> · day ${t.days}${live ? '' : ` · ${t.verdict}`}${t.by !== 'founder' ? ` · run by ${ASO.help[t.by]?.label ?? t.by}` : ''}
    ${table({ columns: [{ label: 'Arm', key: 'label' }, { label: 'Views', align: 'right', render: (a) => a.views.toLocaleString() }, { label: 'Conv.', align: 'right', render: (a) => (a.views ? pct(a.installs / a.views) : '—') }, { label: 'vs current', align: 'right', render: (a) => (a === ctl || !a.views || !ctl.views || !ctl.installs ? '' : `${((a.installs / a.views) / (ctl.installs / ctl.views) * 100 - 100).toFixed(0)}% (z ${(a.z ?? 0).toFixed(1)})`) }], rows: t.arms })}
    ${live ? html`<p class="muted">${res.verdict === 'running' ? `Needs z ≥ ${ASO.test.z} (90% confidence) after at least ${ASO.test.minDays} days; ends at ${ASO.test.maxDays[store]} days.` : ''}</p><button data-stop="${t.id}" class="sm">Stop</button>` : ''}
    ${!live && t.applied == null ? t.arms.slice(1).map((a, i) => html`<button class="sm" data-apply="${t.id}:${i + 1}">Ship ${a.label}</button>`) : ''}
  </div>`;
}

// ---------------- ratings ----------------

function ratings(root, ctx, S) {
  const s = ctx.state;
  const y = ratingPlanInfo(S);
  const stars = starsOf(S);
  mount(root, html`<div class="grid-2">
    <section class="panel"><h2>In-app rating prompt</h2>
      <form id="promptForm">
        ${Object.entries(PROMPTS).map(([k, l]) => html`<label><input type="radio" name="strategy" value="${k}" ${S.promptPlan.strategy === k ? 'checked' : ''} /> ${l}</label>`)}
        <label>Ask each user up to <input type="number" name="perYear" min="1" max="12" value="${S.promptPlan.perYear}" /> times a year</label>
        <button class="primary">Ship it (~${ASO.hours.promptChange}h)</button>
      </form>
      <p class="small">Apple shows at most ${ASO.promptCap} prompts per user per 365 days and may skip any of them: you ask ${y.asked}×, users see at most ${y.shownPerUser}×.</p>
      <label class="small"><input type="checkbox" id="wrl" ${S.writeReviewLink ? 'checked' : ''} /> Permanent "Write a review" link in settings (?action=write-review, not rate-limited)</label>
    </section>
    <section class="panel"><h2>Reviews</h2>
      <p>${stars == null ? 'No ratings yet.' : html`${stars.toFixed(2)}★ from ${S.reviews} ratings${stars < 4 ? html` ${badge('below 4.0: conversion cliff', 'bad')}` : ''}`}</p>
      <button data-reply ${s.day <= S.replies.until ? 'disabled' : ''}>${s.day <= S.replies.until ? `Replying until ${fmtDate(s, S.replies.until)}` : `Reply to this week's 1-3★ reviews (~${ASO.replyHours}h)`}</button>
      <button data-reset>Reset the rating with the next version</button>
      <details class="small"><summary>Grow ratings faster</summary>
        <p class="muted">Review services and rewards for 5★ ratings exist. Apple can remove the app or end your developer membership for paid, incentivized or fake reviews, and the FTC rule (16 CFR 465) bans buying them.</p>
        <button data-buy class="sm">Buy 50 five-star reviews ($${50 * ASO.fake.buy.usdPerReview})</button>
        <button data-incent class="sm">${incentiveActive(S) ? 'Stop the 5★ reward' : 'Give a free month for a 5★ rating'}</button>
      </details>
      <p class="hint">Stars follow product fit. Prompting after a success moment gets more and better ratings; volunteers skew negative; replying to low reviews within 48 hours wins some back.</p>
    </section>
  </div>`);
  on(root, 'submit', '#promptForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((x) => { const r = setPromptPlan(x, ensureAso(x.apps.organic.appstore), { strategy: f.strategy, perYear: f.perYear }); toast(f.strategy === 'on_open' ? 'Shipped. Expect fewer stars.' : `Shipped: users see it at most ${r.shownPerUser}× a year.`, f.strategy === 'on_open' ? 'warn' : 'good'); return true; }, { hours: ASO.hours.promptChange, label: 'Rating prompt' });
  });
  on(root, 'change', '#wrl', (e) => ctx.act((x) => { ensureAso(x.apps.organic.appstore).writeReviewLink = e.target.checked; return true; }, { hours: 0.5, label: 'Write-review link' }));
  on(root, 'click', '[data-reply]', () => ctx.act((x) => { replyToReviews(x, ensureAso(x.apps.organic.appstore)); return true; }, { hours: ASO.replyHours, label: 'Review replies' }));
  on(root, 'click', '[data-reset]', () => { if (!confirm('Reset the summary rating for every storefront? It cannot be undone; written reviews stay.')) return; ctx.act((x) => { resetRatings(x, ensureAso(x.apps.organic.appstore)); return true; }, { hours: 0.25, label: 'Rating reset' }); });
  on(root, 'click', '[data-buy]', () => ctx.act((x) => { buyReviews(x, ensureAso(x.apps.organic.appstore), 50); toast('Ordered. They will trickle in over 10 days.', 'warn'); return true; }, { hours: 0.5, label: 'Review service' }));
  on(root, 'click', '[data-incent]', () => ctx.act((x) => { const Sx = ensureAso(x.apps.organic.appstore); setIncentive(x, Sx, !incentiveActive(Sx)); return true; }, { hours: 1, label: 'Rating reward' }));
}

// ---------------- markets, tools, people, ads ----------------

function growth(root, ctx, S, store) {
  const s = ctx.state;
  const stage = stageOf(s);
  const paid = Math.round(S.asa.paidInstalls), cann = Math.round(S.asa.cannibalized);
  mount(root, html`<div class="grid-2">
    <section class="panel"><h2>Localization</h2>
      ${table({ columns: [{ label: 'Market', render: (r) => r.label }, { label: 'Listing', render: (r) => S.locales[r.code] ?? 'English' }, { label: '', render: (r) => html`<select data-loc="${r.code}"><option value="">Localize…</option><option value="machine">Machine-translate (free, ~${ASO.hours.localeMachine}h)</option><option value="human">Translator ($${ASO.localeQuality.human.usd}, ~${ASO.hours.localeHuman}h)</option><option value="adapted">Cultural adaptation ($${ASO.localeQuality.adapted.usd.toLocaleString()}, ~${ASO.hours.localeAdapted}h)</option></select>` }], rows: Object.entries(ASO.locales).map(([code, l]) => ({ code, ...l })) })}
      <p class="hint">The often-quoted "+128% downloads per localized country" is an old study whose original we could not find [unverified]; treat lifts as uncertain. Machine translation reaches some of the market; native keywords reach more.</p>
    </section>
    <section class="panel"><h2>ASO tools</h2>
      ${Object.entries(ASO.tools).map(([id, t]) => html`<label class="small"><input type="radio" name="tool" data-tool="${id}" ${S.tool === id ? 'checked' : ''} /> <b>${t.label}</b> ${t.usd ? `${money(t.usd)}/mo` : ''}: ${t.note}</label>`)}
      <p class="hint">Tools reveal estimated popularity, difficulty and competitor ranks. They don't move your rank; estimates carry error.</p>
      <h3>Help</h3>
      ${S.help ? html`<p class="small">${ASO.help[S.help.kind].label} since ${fmtDate(s, S.help.since)} (${money(ASO.help[S.help.kind].usd)}/mo, ${money(S.help.paid)} paid). <button data-help="">End retainer</button></p>`
        : Object.entries(ASO.help).map(([k, h]) => html`<button class="sm" data-help="${k}">Hire ${h.label} (${money(h.usd)}/mo, ${h.note})</button> `)}
    </section>
    <section class="panel"><h2>Apple Search Ads and organic</h2>
      <p class="small">Paid installs (all time) ${paid.toLocaleString()} · organic installs your ads took instead ≈ ${cann.toLocaleString()} (brand bidding mostly buys people already searching your name). Paid installs also raise your install velocity and bring ratings, which lifts organic ranks a little.</p>
      <p class="small">Your category's typical cost per tap: ${money((ASO.asa.cpt[categoryOf(s)] ?? ASO.asa.defaultCpt), { cents: true })} (AppTweak 2025 US medians; Finance is far higher). Measure incrementality by pausing brand campaigns for 2 weeks.</p>
    </section>
    <section class="panel"><h2>What ASO looks like at your stage</h2>
      ${table({ columns: [{ label: 'Stage', render: (r) => (r.id === stage.id ? html`<b>${r.label}</b>` : r.label) }, { label: 'Owner', key: 'owner' }, { label: 'Tools', key: 'tools' }, { label: 'Tests', key: 'tests' }, { label: 'Budget', key: 'budget' }], rows: STAGES })}
      <p class="hint">Game estimates from vendor ranges, not benchmarks.</p>
    </section>
  </div>`);
  on(root, 'change', '[data-loc]', (e, el) => {
    const q = el.value; if (!q) return;
    ctx.act((x) => { localize(x, ensureAso(x.apps.organic.appstore), el.dataset.loc, q); return true; }, { hours: { machine: ASO.hours.localeMachine, human: ASO.hours.localeHuman, adapted: ASO.hours.localeAdapted }[q], label: 'Store localization' });
  });
  on(root, 'change', '[data-tool]', (e, el) => ctx.act((x) => { setTool(x, ensureAso(x.apps.organic.appstore), el.dataset.tool); return true; }, { hours: 0.25, label: 'ASO tool' }));
  on(root, 'click', '[data-help]', (e, el) => ctx.act((x) => { setHelp(x, ensureAso(x.apps.organic.appstore), el.dataset.help || null); return true; }, { hours: 1, label: 'ASO help' }));
}

