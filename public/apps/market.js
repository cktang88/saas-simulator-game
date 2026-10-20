// Market & competitors: your real competitive landscape (web search; offline: labelled fictional stand-ins) plus the
// competitors you add yourself, and its moves, the world
// events that hit a real 2026 SaaS (competitors, platforms, AI labs, macro, reputation) with response choices,
// battlecards / comparison pages you write, and an exposure view of what could hit your business this year.
// Engine: ./marketworld/engine.js · pure model: ./marketworld/model.js · LLM: ./marketworld/llm.js

import { html, mount, on, formData, table, stat, badge, toast } from '../core/ui.js';
import { money, pct, fmtDate, words } from '../core/util.js';
import { ensureWorld, worldDay, respond, eventById, exposureTable, savePage, activeRivals, worldDealMult, seedLandscape } from './marketworld/engine.js';
import { writeNews, judgePage } from './marketworld/llm.js';
import { discoverCompetitors, isReal, markPending, competitorsFor, playerCompetitors, addPlayerCompetitor, removePlayerCompetitor, fetchCompetitorSite, FUNDING_STAGES, ADD_HOURS, TIER_BANDS } from './marketworld/competitors.js';
import { profile, threatOf } from './marketworld/model.js';

const TABS = [['news', 'News & events'], ['competitors', 'Competitors'], ['pages', 'Battlecards & pages'], ['exposure', 'Exposure']];
const CAT = { competitor: ['Competitor', 'warn'], platform: ['Platform', 'accent'], ai_lab: ['AI lab', 'accent'], macro: ['Macro', ''], reputation: ['Reputation', ''] };
const FUND = { bootstrapped: 'Bootstrapped', seed: 'Seed', series_a: 'Series A', series_b_plus: 'Series B+', public_incumbent: 'Incumbent' };
const PAGE_KIND = { battlecard: 'Internal sales battlecard', vs: 'Public "Us vs Them" page', alternatives: 'Public "Them alternatives" page' };
const drafts = {};
const pending = (W) => W.active.filter((i) => i.status === 'active' && !i.response && eventById(i.eventId)?.playerResponses?.length);

export default {
  id: 'market',
  title: 'Market & competitors',
  icon: '🧭',
  group: 'Growth',
  badge: (state) => (state.apps.world ? pending(state.apps.world).length : 0),
  onDay(state) { worldDay(state); },
  jobs: {
    'world:news': async (ctx, { newsId }) => writeNews(ctx, newsId),
    'world:competitors': async (ctx, { reason }) => { await discoverCompetitors(ctx, { reason }); },
  },
  render(root, ctx) {
    const s = ctx.state;
    const W = ensureWorld(s);
    if (!W.landscape) seedLandscape(s);
    const tab = TABS.some(([k]) => k === ctx.params) ? ctx.params : 'news';
    mount(root, html`
      <div class="app-head"><div><h1>Market & competitors</h1><p>Your market moves without asking you: rivals launch, raise and cut prices; Google, Meta and Apple change rules; AI labs ship features that overlap yours or make your inference cheaper. You can't control it. You can respond well.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<button data-mtab="${k}" class="${k === tab ? 'active' : ''}">${l}${k === 'news' && pending(W).length ? html` <span class="badge warn">${pending(W).length}</span>` : ''}</button>`)}</div>
      <div id="mBody"></div>`);
    on(root, 'click', '[data-mtab]', (e, el) => ctx.navigate('market', el.dataset.mtab));
    on(root, 'input', '[data-draft]', (e, el) => { drafts[el.dataset.draft] = el.value; });
    on(root, 'change', '[data-draft]', (e, el) => { drafts[el.dataset.draft] = el.value; });
    const body = root.querySelector('#mBody');
    ({ news, competitors, pages, exposure })[tab](body, ctx);
  },
};

// ---------------------------------------------------------------- news & events

function news(body, ctx) {
  const s = ctx.state;
  const W = s.apps.world;
  const open = pending(W);
  const live = W.active.filter((i) => i.status === 'active' && (i.response || !open.includes(i)));
  mount(body, html`
    ${open.length ? html`<section class="panel"><h2>Needs a decision</h2>${open.map((i) => eventCard(s, i, true))}</section>` : ''}
    <section class="panel"><h2>News feed</h2>
      ${W.news.length ? html`<ul class="list">${W.news.slice(0, 40).map((n) => html`<li>
        <div class="small muted">${fmtDate(s, n.day)} · ${n.source}${n.mock ? ' · offline writer' : ''} ${badge(CAT[n.category]?.[0] ?? n.category, CAT[n.category]?.[1] ?? '')} ${n.simulated ? badge('simulated event', '') : ''} ${n.threadId ? html`<a href="#/mail">in Mail</a>` : ''}</div>
        <details ${n.read ? '' : 'open'} data-read="${n.id}"><summary><b>${n.pending ? 'Writing…' : n.headline}</b></summary><p class="small" style="white-space:pre-wrap">${n.body}</p></details></li>`)}</ul>` : html`<p class="empty">Quiet so far. Most weeks nothing happens; then several things happen at once.</p>`}
    </section>
    ${live.length ? html`<section class="panel"><h2>In effect now</h2>${live.map((i) => eventCard(s, i, false))}</section>` : ''}`);
  on(body, 'click', '[data-respond]', (e, el) => {
    const [instId, rid] = el.dataset.respond.split('|');
    const inst = W.active.find((i) => i.id === instId);
    const r = eventById(inst.eventId).playerResponses.find((x) => x.id === rid);
    ctx.act((st) => { const out = respond(st, instId, rid); toast(out.note, 'info', 8000); return true; }, { hours: r.hours, label: `Respond: ${eventById(inst.eventId).label}` });
  });
  on(body, 'toggle', '[data-read]', (e, el) => { const n = W.news.find((x) => x.id === el.dataset.read); if (n && !n.read) { n.read = true; ctx.save(); } });
}

function effectSummary(e) {
  const parts = [];
  const pctm = (v) => `${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`;
  if (e.conversionMult != null && e.conversionMult !== 1) parts.push(`conversion ${pctm(e.conversionMult)}`);
  if (e.signupMult != null && e.signupMult !== 1) parts.push(`signups ${pctm(e.signupMult)}`);
  if (e.churnMult != null && e.churnMult !== 1) parts.push(`churn ${pctm(e.churnMult)}`);
  if (e.voluntaryChurnMult != null && e.voluntaryChurnMult !== 1) parts.push(`churn ${pctm(e.voluntaryChurnMult)}`);
  if (e.organicTrafficMult != null && e.organicTrafficMult !== 1) parts.push(`organic traffic ${pctm(e.organicTrafficMult)}`);
  if (e.organicShareMult != null && e.organicShareMult !== 1) parts.push(`organic share ${pctm(e.organicShareMult)}`);
  if (e.paidCpcMult != null && e.paidCpcMult !== 1) parts.push(`paid CPC ${pctm(e.paidCpcMult)}`);
  if (e.salesCycleMult != null && e.salesCycleMult !== 1) parts.push(`sales cycle ${pctm(e.salesCycleMult)}`);
  if (e.inferenceCostMult != null && e.inferenceCostMult !== 1) parts.push(`AI inference cost ${pctm(e.inferenceCostMult)}`);
  if (e.raiseOddsMult != null && e.raiseOddsMult !== 1) parts.push(`fundraising odds ${pctm(e.raiseOddsMult)}`);
  if (e.paidMetaSpendMult === 0) parts.push('Meta ads stopped');
  if (e.permanent) parts.push('permanent');
  return parts.join(' · ');
}

function eventCard(s, inst, decide) {
  const W = s.apps.world;
  const ev = eventById(inst.eventId);
  if (!ev) return html`<div class="card"><b>${inst.note}</b> <span class="small muted">until ${fmtDate(s, inst.endDay)}</span></div>`;
  const rival = inst.rivalId ? W.rivals.find((c) => c.id === inst.rivalId) : null;
  const n = W.news.find((x) => x.id === inst.newsId);
  const est = effectSummary(inst.effects);
  return html`<div class="card">
    <div class="inline" style="justify-content:space-between"><b>${ev.label}${rival ? `: ${rival.name}` : ''}</b>${rival?.real ? html` ${badge('simulated event', '')}` : ''}${badge(CAT[ev.category][0], CAT[ev.category][1])}</div>
    <div class="small muted">${fmtDate(s, inst.startDay)} · ${inst.endDay - s.day > 2000 ? 'lasting' : `until ~${fmtDate(s, inst.endDay)}`}${n && !n.pending ? ` · "${n.headline}"` : ''}</div>
    <p class="small">${ev.effects.text}</p>
    ${est ? html`<p class="small"><b>Estimated impact:</b> ${est} <span class="muted">(game estimate)</span></p>` : ''}
    ${inst.response ? html`<p class="small"><b>Your call:</b> ${ev.playerResponses.find((r) => r.id === inst.response)?.label ?? 'none'}. <span class="muted">${inst.note}</span></p>` : ''}
    ${decide ? html`<div class="grid-3">${ev.playerResponses.map((r) => html`<div class="card"><b class="small">${r.label}</b><p class="small muted">${r.outcome}</p>
      <button class="sm ${r.id === ev.playerResponses[0].id ? '' : ''}" data-respond="${inst.id}|${r.id}">${r.hours ? `${r.hours}h` : 'No time'}${r.cost ? ` · ${money(r.cost)}` : ''}</button></div>`)}</div>
      <p class="hint">If you don't decide within 14 days, the do-nothing option applies.</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- competitors

const SEARCH_HOURS = 1.5; // a real founder's first pass: search, skim 8-15 sites and pricing pages, note who matters
const fundLabel = (c) => (c.fundingStage === 'unknown' ? 'funding unknown' : c.fundingStage.replace(/_/g, ' ').replace('b plus', 'B+'));
const tierBadge = (c) => (c.tier ? badge(TIER_BANDS[c.tier]?.label ?? c.tier, c.tier === 'big_player' ? 'warn' : c.tier === 'well_funded' ? 'accent' : '') : '');
const isLiveCtx = (ctx) => { try { return Boolean(ctx.llm?.isLive?.()); } catch { return false; } };

function competitors(body, ctx) {
  const s = ctx.state;
  const W = s.apps.world;
  const C = W.competitors;
  const real = isReal(s);
  const pend = W.discovery?.pending;
  const mine = playerCompetitors(s);
  const refresh = html`<button data-refresh ${pend ? 'disabled' : ''}>${pend ? 'Searching the web…' : real ? `Search the web again (${SEARCH_HOURS}h)` : `Search the web for real competitors (${SEARCH_HOURS}h)`}</button>`;
  const deal = s.company.model !== 'b2c' ? stat('Deal odds modifier', `×${worldDealMult(s).toFixed(2)}`, 'landscape, events, battlecards') : '';
  const pressure = stat('Competitive pressure', W.lastPressure ? `${W.lastPressure >= 1 ? '+' : '−'}${Math.abs(Math.round((W.lastPressure - 1) * 100))}%` : '—', 'on visitor → signup vs a typical niche');
  let top;
  if (!real) {
    const L = W.landscape;
    const why = pend ? 'A web search for your real competitors is running.'
      : !String(s.company.oneLiner ?? '').trim() && !String(s.company.icp ?? '').trim() ? html`Add a <a href="#/settings">one-liner and ICP</a> so the search knows what you compete on.`
        : C?.error ? `The last web search failed (${C.error}).`
          : C?.offline ? 'No OpenRouter key or server: add a key in Settings to search the web for what really competes with you (incumbents, big players, well-funded startups, adjacent tools, the status quo).'
            : 'Real competitors are found by web search from your one-liner, ICP, customer type and website.';
    top = html`
      <div class="callout warn"><b>Offline: fictional stand-ins until web search runs.</b> ${why} The rivals below are invented placeholders so the simulation has someone to compete with; none of them is a real company. ${refresh}</div>
      <div class="stats">${stat('Category', L?.category || ({ vertical: 'Vertical B2B', horizontal: 'Horizontal SMB tool', consumer: 'Consumer app', enterprise: 'Enterprise category' })[L?.nicheType] || '—', 'placeholder template')}${stat('Products in the niche', `~${L?.total ?? 0}`, `${activeRivals(s).filter((r) => !r.player).length} placeholders`)}${pressure}${deal}</div>
      <section class="panel"><h2>Placeholder landscape (offline: fictional stand-ins)</h2>
      ${table({
        columns: [
          { label: 'Company', render: (c) => html`<div style="min-width:150px"><b>${c.name}</b> ${badge('placeholder', '')}</div>` },
          { label: 'Funding', render: (c) => FUND[c.funding] ?? c.funding },
          { label: 'Price', align: 'right', render: (c) => (c.researched ? `$${c.priceMonthly}/mo` : html`<span class="muted">?</span>`) },
          { label: 'Positioning', render: (c) => html`<div class="small" style="min-width:200px">${c.positioning}</div>` },
          { label: 'Teardown', render: (c) => (c.researched ? html`<div class="small">+ ${c.strengths.join(', ')}<br>− ${c.weaknesses.join(', ')}</div>` : html`<button class="sm" data-teardown="${c.id}">Teardown (1.5h)</button>`) },
          { label: 'Moves', render: (c) => movesCell(s, c) },
        ], rows: W.rivals.filter((r) => !r.player), empty: 'None yet.',
      })}</section>`;
  } else {
    const list = C.list.filter((c) => !mine.some((m) => m.name.toLowerCase() === c.name.toLowerCase())).sort((a, b) => b.marketShare - a.marketShare || b.awareness - a.awareness);
    const all = competitorsFor(s);
    const other = Math.max(0, 1 - C.statusQuoShare - all.reduce((a, c) => a + c.marketShare, 0));
    const big = list.filter((c) => c.tier === 'big_player').length, funded = list.filter((c) => c.tier === 'well_funded').length;
    top = html`
      ${C.stale ? html`<div class="callout warn">The last re-run of the web search failed${C.staleError ? ` (${C.staleError})` : ''}; showing the landscape found on ${fmtDate(s, C.discoveredDay)}.</div>` : ''}
      <div class="stats">
        ${stat('Category', C.category || '—', `${C.marketMaturity} market · ${String(C.crowdedness).replace('_', ' ')} crowding`)}
        ${stat('Status quo', C.statusQuo || '—', `${pct(C.statusQuoShare, 0)} of the niche · ${pct(other, 0)} other/nothing`)}
        ${stat('Competitors found', C.list.length, `${big} big players · ${funded} well-funded · web search ${fmtDate(s, C.discoveredDay)}${C.cached ? ' (cached)' : ''}`)}
        ${pressure}${deal}
      </div>
      <section class="panel">
        <div class="inline"><h2 style="flex:1">Your real competitive set</h2>${refresh}</div>
        <p class="small muted">${C.reasoning} Awareness = share of your ICP who have heard of it; share = share of your niche using it. Both are AI estimates from public evidence, held inside a band set by size and funding signals (big player, well-funded startup, small tool; a game assumption). Check the sources. Funding is shown only when a source states it. Prospects, customers and investors in the game know these companies in proportion to those numbers. Moves marked <b>simulated</b> are game events, not real news.</p>
        ${table({
          columns: [
            { label: 'Company', render: (c) => html`<div style="min-width:160px"><a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer"><b>${c.name}</b></a> ${tierBadge(c)}<div class="small muted">${c.kind.replace(/_/g, '-')} · ${c.segment}${c.founded ? ` · since ${c.founded}` : ''}</div></div>` },
            { label: 'Positioning', render: (c) => html`<div class="small" style="min-width:220px">${c.positioning}</div>` },
            { label: 'Pricing', render: (c) => html`<div class="small" style="min-width:110px">${c.pricingText}${c.freeTier ? html`<br>free tier` : ''}</div>` },
            { label: 'Funding / size', render: (c) => html`<div class="small">${fundLabel(c)}${c.fundingTotalUSD ? html`<br>${money(c.fundingTotalUSD)} raised` : ''}${c.employeesEstimate ? html`<br>~${c.employeesEstimate} staff` : ''}</div>` },
            { label: 'Awareness', align: 'right', render: (c) => pct(c.awareness, 0) },
            { label: 'Share', align: 'right', render: (c) => pct(c.marketShare, c.marketShare < 0.01 ? 1 : 0) },
            { label: 'Momentum', render: (c) => badge(c.momentum, c.momentum === 'rising' ? 'warn' : '') },
            { label: 'Strengths / weaknesses', render: (c) => html`<div class="small" style="min-width:180px"><span class="pos">+ ${c.strengths.join(', ')}</span><br><span class="neg">− ${c.weaknesses.join(', ')}</span></div>` },
            { label: 'Teardown', render: (c) => teardownCell(W, c) },
            { label: 'Simulated moves', render: (c) => { const r = rivalFor(W, c); return r ? movesCell(s, r) : ''; } },
            { label: 'Sources', render: (c) => html`<div class="small">${c.sources.slice(0, 3).map((u, i) => html`<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">[${i + 1}]</a> `)} <span class="muted">${c.confidence}</span></div>` },
          ], rows: list,
        })}
        ${C.citations?.length ? html`<details><summary class="small">Web citations (${C.citations.length})</summary><ul class="small">${C.citations.slice(0, 30).map((c) => html`<li><a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer">${c.title || c.url}</a></li>`)}</ul></details>` : ''}
      </section>`;
  }
  mount(body, html`${top}
    ${W.rivals.some((r) => !r.real && r.newEntrant) && real ? html`<section class="panel"><h2>Simulated new entrants</h2><p class="small muted">Fictional newcomers created by game events.</p>${W.rivals.filter((r) => !r.real && r.newEntrant).map((r) => html`<div class="card"><b>${r.name}</b> ${badge('fictional', '')} <span class="small">${r.positioning}</span></div>`)}</section>` : ''}
    <section class="panel"><h2>Competitors you added</h2>
      <p class="small muted">Prospects, customers, investors, world events, battlecards and pricing comparisons use these exactly like the ones found by web search. Awareness and share come from the size and funding you give (a game assumption): a big player is known by far more buyers than a small tool.</p>
      ${table({
        columns: [
          { label: 'Company', render: (c) => html`<div style="min-width:150px">${c.url ? html`<a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer"><b>${c.name}</b></a>` : html`<b>${c.name}</b>`} ${badge('added by you', '')} ${tierBadge(c)}<div class="small muted">${c.segment || 'segment not given'}${c.siteFetched ? ' · site fetched' : ''}</div></div>` },
          { label: 'What they do', render: (c) => html`<div class="small" style="min-width:200px">${c.description || c.positioning || html`<span class="muted">not given</span>`}</div>` },
          { label: 'Price', render: (c) => html`<div class="small">${c.pricingText}</div>` },
          { label: 'Funding / size', render: (c) => html`<div class="small">${fundLabel(c)}${c.fundingTotalUSD ? html`<br>${money(c.fundingTotalUSD)} raised` : ''}${c.employeesEstimate ? html`<br>~${c.employeesEstimate} staff` : ''}</div>` },
          { label: 'Awareness / share', align: 'right', render: (c) => html`${pct(c.awareness, 0)} / ${pct(c.marketShare, 1)}` },
          { label: 'Teardown', render: (c) => teardownCell(W, c) },
          { label: 'Simulated moves', render: (c) => { const r = rivalFor(W, c); return r ? movesCell(s, r) : ''; } },
          { label: '', render: (c) => html`<button class="sm" data-remove-comp="${c.id}">Remove</button>` },
        ], rows: mine, empty: 'None added yet. Add the tools your prospects actually mention.',
      })}
      <form id="addComp">
        <h3>Add your own competitor</h3>
        <div class="grid-2">
          <label>Name <input name="name" required maxlength="80" /></label>
          <label>Website (optional) <input name="url" placeholder="example.com" /></label>
          <label>What they do <input name="description" maxlength="240" /></label>
          <label>Who they sell to <input name="segment" maxlength="120" placeholder="e.g. Shopify stores under $5M GMV" /></label>
          <label>Price <input name="price" placeholder="e.g. $49/mo, $300/yr, free plan" /></label>
          <label>How big / funded <select name="fundingStage">${FUNDING_STAGES.map((f) => html`<option value="${f}">${{ unknown: 'Unknown', bootstrapped: 'Bootstrapped / small', seed: 'Seed', series_a: 'Series A', series_b_plus: 'Series B or later', public: 'Public / big incumbent', acquired: 'Acquired by a larger company' }[f]}</option>`)}</select></label>
          <label>Total raised (optional) <input name="raised" placeholder="e.g. $12M; leave empty if unknown" /></label>
          <label>Employees (optional) <input name="employees" type="number" min="0" /></label>
          <label>Kind <select name="kind"><option value="direct">Direct competitor</option><option value="adjacent">Adjacent tool</option><option value="incumbent">Incumbent / suite</option><option value="substitute">Substitute (agency, spreadsheet...)</option><option value="ai_native">AI-native newcomer</option></select></label>
          <label>Strengths / weaknesses (optional) <input name="strengths" placeholder="strengths, comma separated" /><input name="weaknesses" placeholder="weaknesses, comma separated" /></label>
        </div>
        <p class="hint">${ADD_HOURS.base * 60} min to write it up; ${ADD_HOURS.withSite * 60} min with a website (the game fetches the page to fill in what you left blank${isLiveCtx(ctx) ? '' : '; offline, nothing is fetched'}).</p>
        <button class="primary">Add competitor</button>
      </form>
    </section>`);
  on(body, 'click', '[data-teardown]', (e, el) => ctx.act((st) => { const c = st.apps.world.rivals.find((x) => x.id === el.dataset.teardown); c.researched = true; toast(c.real ? `Teardown of ${c.name}: now actually sign up${c.domain ? ` at ${c.domain}` : ''} and read their pricing page and reviews.` : `Teardown of ${c.name} done.`, 'good', 7000); return true; }, { hours: 1.5, label: 'Competitor teardown' }));
  on(body, 'click', '[data-refresh]', () => {
    if (!isLiveCtx(ctx)) return toast('Offline: add an OpenRouter key in Settings to search the web for real competitors. No time spent.', 'warn');
    return ctx.act(async (st) => {
      markPending(st, 'manual');
      ctx.render();
      const r = await discoverCompetitors(ctx, { reason: 'manual' });
      toast(r.offline ? `The web search failed${r.error ? ` (${r.error})` : ''}; the placeholders stay.` : r.stale ? 'The web search failed; kept the last real landscape.' : `Found ${r.list.length} competitors.`, r.offline || r.stale ? 'warn' : 'good');
      return true;
    }, { hours: SEARCH_HOURS, label: 'Competitor research (web)' });
  });
  on(body, 'submit', '#addComp', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!String(f.name ?? '').trim()) return toast('Give the competitor a name.', 'warn');
    const url = String(f.url ?? '').trim();
    return ctx.act(async (st) => {
      const site = url ? await fetchCompetitorSite(url, { cache: st.cache }) : null;
      const c = addPlayerCompetitor(st, f, site);
      toast(`${c.name} added (${TIER_BANDS[c.tier].label}).${url ? (site ? ' Filled blanks from their site.' : ' Could not fetch the site (offline or blocked); saved what you typed.') : ''}`, 'good', 7000);
      return true;
    }, { hours: url ? ADD_HOURS.withSite : ADD_HOURS.base, label: 'Add competitor' });
  });
  on(body, 'click', '[data-remove-comp]', (e, el) => ctx.act((st) => { removePlayerCompetitor(st, el.dataset.removeComp); return true; }, { hours: 0, label: 'Remove competitor' }));
}
const rivalFor = (W, c) => W.rivals.find((r) => r.realId === c.id);
function teardownCell(W, c) {
  const r = rivalFor(W, c);
  return r?.researched ? badge('done', 'good') : r ? html`<button class="sm" data-teardown="${r.id}">Teardown (1.5h)</button>` : '';
}
const safeUrl = (u) => (/^https?:\/\//i.test(String(u)) ? u : `https://${String(u).replace(/^[a-z]+:/i, '')}`);
function movesCell(s, c) {
  return html`<div class="small">${c.moves.slice(-3).reverse().map((m) => html`<div>${fmtDate(s, m.day)}: ${eventById(m.eventId)?.label ?? m.eventId.replace('_', ' ')}${m.simulated ? html` ${badge('simulated', '')}` : ''}</div>`)}${c.status !== 'active' ? html`<div>${badge(c.status === 'acquired' ? 'acquired (simulated)' : 'shut down (simulated)', '')}</div>` : ''}</div>`;
}

// ---------------------------------------------------------------- battlecards & comparison pages

function pages(body, ctx) {
  const s = ctx.state;
  const W = s.apps.world;
  const researched = W.rivals.filter((c) => c.researched && c.status === 'active');
  const hours = (t) => Math.min(5, Math.max(1.5, 1 + words(t) / 400));
  mount(body, html`
    <div class="grid-2">
      <section class="panel"><h2>Write one</h2>
        ${researched.length ? html`<form id="pageForm">
          <label>Competitor <select name="rivalId" data-draft="rival">${researched.map((c) => html`<option value="${c.id}" ${drafts.rival === c.id ? 'selected' : ''}>${c.name}</option>`)}</select></label>
          <label>Type <select name="kind" data-draft="kind">${Object.entries(PAGE_KIND).map(([k, l]) => html`<option value="${k}" ${drafts.kind === k ? 'selected' : ''}>${l}</option>`)}</select></label>
          <label>Title <input name="title" data-draft="title" value="${drafts.title ?? ''}" /></label>
          <label>Content <textarea name="text" data-draft="text" rows="12" placeholder="Who each product is for. Concrete, checkable differences (price, setup time, a workflow, an integration). Where they are the better choice. Common objections and answers.">${drafts.text ?? ''}</textarea></label>
          <p class="hint">${words(drafts.text ?? '')} words · ≈${hours(drafts.text ?? '').toFixed(1)}h. Battlecards help B2B deals; public pages help buyers who are comparing (and get cited by AI answers). Trash talk backfires.</p>
          <button class="primary">Publish & get feedback</button></form>` : html`<p class="muted">Do a teardown of at least one competitor first (Competitors tab). You can't write an honest comparison of a product you haven't used.</p>`}
      </section>
      <section class="panel"><h2>Published</h2>
        ${table({ columns: [
          { label: 'Title', render: (p) => html`${p.title}<div class="small muted">${PAGE_KIND[p.kind]} · vs ${W.rivals.find((c) => c.id === p.rivalId)?.name ?? '?'}</div>` },
          { label: 'Date', render: (p) => fmtDate(s, p.day) },
          { label: 'Score', align: 'right', render: (p) => html`${Math.round(p.score * 100)}${p.mock ? html`<div class="small muted">offline</div>` : ''}` },
          { label: 'Feedback', render: (p) => html`<div class="small" style="min-width:200px">${[...new Set(p.results.map((r) => r.feedback))].slice(0, 1)}</div>` },
        ], rows: W.pages, empty: 'Nothing yet.' })}
      </section>
    </div>`);
  on(body, 'submit', '#pageForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.title.trim() || words(f.text) < 80) return toast('Give it a title and at least ~80 words.', 'warn');
    await ctx.act(async (st) => {
      const rival = st.apps.world.rivals.find((c) => c.id === f.rivalId);
      const j = await judgePage(ctx, { rival, kind: f.kind, title: f.title, text: f.text });
      savePage(st, { ...f, judge: j });
      drafts.title = drafts.text = '';
      toast(`Score ${Math.round(j.score * 100)}/100${j.mock ? ' (offline judge)' : ''}. ${j.results[0]?.feedback ?? ''}`, j.score >= 0.5 ? 'good' : 'warn', 9000);
      return true;
    }, { hours: hours(f.text), label: 'Competitive page' });
  });
}

// ---------------------------------------------------------------- exposure

function exposure(body, ctx) {
  const s = ctx.state;
  const W = s.apps.world;
  const p = profile(s);
  const flags = Object.entries(p.flags).filter(([, v]) => v).map(([k]) => k);
  const rows = exposureTable(s);
  mount(body, html`
    <section class="panel"><h2>Your risk profile today</h2>
      <p>Model <b>${p.model}</b> · stage <b>${p.stage}</b> · path <b>${p.path}</b> · AI dependence <b>${p.aiDependence}</b> <span class="muted small">(share of shipped features that call an LLM at runtime)</span></p>
      <p class="small">Exposure: ${flags.length ? flags.map((f) => badge(f, 'accent')) : html`<span class="muted">none yet</span>`}</p>
      <div class="inline">
        <button data-verify ${W.verifiedBusiness ? 'disabled' : ''}>${W.verifiedBusiness ? 'Business verified on Meta + 2FA admins' : 'Verify your business on Meta and turn on admin 2FA (1h)'}</button>
      </div>
      <p class="hint">Rates below are game estimates anchored on 2023–2026 evidence (docs/research/world-ops-support-life.md). Several have no published base rate at all (Meta restrictions, rival funding effects); treat them as orders of magnitude.</p>
    </section>
    <section class="panel"><h2>What could happen in the next 12 months</h2>
      ${table({ columns: [
        { label: 'Event', render: (x) => html`${x.ev.label}<div class="small muted">${x.ev.effects.text.slice(0, 140)}${x.ev.effects.text.length > 140 ? '…' : ''}</div>` },
        { label: 'Type', render: (x) => badge(CAT[x.ev.category][0], CAT[x.ev.category][1]) },
        { label: 'Expected / yr', align: 'right', render: (x) => x.rate.toFixed(2) },
        { label: 'Chance in 12 mo', align: 'right', render: (x) => html`<b class="${x.rate > 0.7 ? 'warn' : ''}">${pct(1 - Math.exp(-x.rate), 0)}</b>` },
      ], rows: rows.filter((x) => x.rate > 0) })}
      <p class="small muted">Not shown here: incidents, card testing, leaked secrets (Helpdesk / Insights) and life events (your wellbeing).</p>
    </section>`);
  on(body, 'click', '[data-verify]', () => ctx.act((st) => { st.apps.world.verifiedBusiness = true; return true; }, { hours: 1, label: 'Meta business verification' }));
}

