// CRM → Prospects tab (Apollo / Clay style UI). Logic lives in prospector.js.
import { html, on, stat, badge, toast, table } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import { BUYER_SEGMENTS } from './segments.js';
import { addContact, companyById, contactName } from './model.js';
import { verifyContacts } from './model.js';
import { post } from '../../core/bank.js';
import { SALES } from './params.js';
import {
  PLANS, PROVIDERS, PHONE, SIGNALS, HOURS_P, TECH, SENIORITY, FUNDING_LABEL, DEFAULT_FILTERS, ensureProspector, search, recordSearch, filterShape,
  maskEmail, accuracyHint, reveal, testFive, estimateCredits, revealPhones, analyzePrompt, runAiColumn, saveList, reasonCheck, dropAccount,
  setMonitor, setPlan, listHealth, suggestLine,
} from './prospector.js';
import { emitSalesEvent } from './events.js';
import { burnSummary, isBurned } from './market-burn.js';

const ui = { sub: 'search', filters: { ...DEFAULT_FILTERS }, sel: new Set(), prompt: '', listName: '', reasons: {}, page: 0, lastTest: null };
const PAGE = 50;

function planPanel(s, p) {
  const plan = PLANS[p.plan];
  return html`<section class="panel"><h2>Database plan</h2>
    <div class="inline">${Object.entries(PLANS).map(([id, pl]) => html`<button class="sm ${id === p.plan ? 'primary' : ''}" data-plan="${id}" ${id === p.plan ? 'disabled' : ''}>${pl.label}${pl.monthly ? ` · $${pl.monthly}/mo` : ''}</button>`)}</div>
    <p class="small muted">${plan.note ?? ''} ${plan.credits ? `${plan.credits.toLocaleString('en-US')} credits/month; email reveal 1 credit, phone ~${PHONE.cost} [unverified]. ${plan.rollover ? 'Unused credits roll over up to one month.' : 'Unused credits expire at the end of the month.'}${plan.topUp ? ` Top-ups ~$${plan.topUp}/credit (250 minimum).` : ''}` : 'Without a database you add prospects by hand (6 min each + research) or import a CSV.'}</p>
    <div class="stats">${stat('Credits left', p.credits.toLocaleString('en-US'))}${stat('Used', p.stats.creditsUsed.toLocaleString('en-US'))}${stat('Expired unused', p.stats.wasted.toLocaleString('en-US'), '', p.stats.wasted ? 'warn' : '')}${stat('Revealed', p.stats.revealed)}</div></section>`;
}

function filterForm(f) {
  const seg = BUYER_SEGMENTS;
  return html`<form id="pfilters" class="panel"><h2>Filters</h2>
    <div class="grid-3">
      <label>Niche / keywords <input name="niche" value="${f.niche ?? ''}" placeholder="multi-location dental practices in Texas using Dentrix" /></label>
      <label>Job title contains <input name="title" value="${f.title}" placeholder="owner, founder, head of ops" /></label>
      <label>Industry / segment <select name="segment"><option value="">Any</option>${seg.map((x) => html`<option value="${x.id}" ${f.segment === x.id ? 'selected' : ''}>${x.label}</option>`)}</select></label>
      <label>Location <select name="geo"><option value="">Any</option><option value="US" ${f.geo === 'US' ? 'selected' : ''}>United States</option><option value="intl" ${f.geo === 'intl' ? 'selected' : ''}>Outside the US</option></select></label>
      <label>Headcount min <input type="number" name="minEmp" value="${f.minEmp}" min="1" /></label>
      <label>Headcount max <input type="number" name="maxEmp" value="${f.maxEmp}" min="1" /></label>
      <label>Technology used <select name="tech"><option value="">Any</option>${TECH.map((t) => html`<option ${f.tech === t ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label>Funding <select name="funding"><option value="">Any</option><option value="funded" ${f.funding === 'funded' ? 'selected' : ''}>Venture-funded</option><option value="recent" ${f.funding === 'recent' ? 'selected' : ''}>Raised in the last 90 days</option></select></label>
    </div>
    <p>${Object.entries(SENIORITY).map(([k, l]) => html`<label class="inline" style="display:inline-flex;margin-right:10px"><input type="checkbox" name="sen_${k}" ${f.seniority.includes(k) ? 'checked' : ''} /> ${l}</label>`)}
      <label class="inline" style="display:inline-flex;margin-right:10px"><input type="checkbox" name="hiring" ${f.hiring ? 'checked' : ''} /> Hiring signal</label>
      <label class="inline" style="display:inline-flex;margin-right:10px"><input type="checkbox" name="excludeOwned" ${f.excludeOwned ? 'checked' : ''} /> Exclude accounts in CRM</label>
      <label class="inline" style="display:inline-flex"><input type="checkbox" name="excludeBurned" ${f.excludeBurned ? 'checked' : ''} /> Exclude burned accounts</label></p>
    <button class="primary sm">Search (6 min)</button></form>`;
}

function searchView(s, p) {
  const f = ui.filters;
  const rows = search(s, f);
  const shape = filterShape(f);
  const shown = rows.slice(ui.page * PAGE, ui.page * PAGE + PAGE);
  const selIds = [...ui.sel];
  const plan = PLANS[p.plan];
  const aiA = ui.prompt ? analyzePrompt(ui.prompt) : null;
  return html`${filterForm(f)}
    <section class="panel"><h2>${rows.length.toLocaleString('en-US')} people · ${shape.count} filter${shape.count === 1 ? '' : 's'}${shape.trigger ? ' incl. a trigger' : ''}</h2>
      <p class="hint">The database never tells you who will buy. Fit comes from the filters you choose: industry, size, the person who signs, and a reason to talk now (hiring, a raise, the tech they use). Broad lists look like pipeline and burn your market.</p>
      <div class="inline">
        <button class="sm" id="selPage">Select this page</button>
        <label style="max-width:150px;margin:0">Select first <input type="number" id="selN" min="1" max="5000" value="100" /></label><button class="sm" id="selFirst">Select</button>
        <button class="sm" id="selNone">Clear (${ui.sel.size})</button>
      </div>
      <div class="inline" style="margin-top:6px">
        <button class="sm" id="test5" ${ui.sel.size && p.plan !== 'none' ? '' : 'disabled'}>Run on 5 rows first</button>
        <button class="sm primary" id="revealDb" ${ui.sel.size && p.plan !== 'none' ? '' : 'disabled'}>Reveal emails (~${estimateCredits(s, selIds)} credits)</button>
        ${plan.waterfall ? html`<button class="sm" id="revealWf" ${ui.sel.size ? '' : 'disabled'}>Waterfall (~${estimateCredits(s, selIds, { mode: 'waterfall' })} credits)</button>` : ''}
        ${plan.phone ? html`<button class="sm" id="phones" ${ui.sel.size ? '' : 'disabled'}>Reveal phones (${PHONE.cost} credits each)</button>` : ''}
      </div>
      ${ui.lastTest ? html`<p class="small">5-row test: ${ui.lastTest.found} found, ${ui.lastTest.missed} missed, ${ui.lastTest.credits} credits. Check them before running the rest.</p>` : ''}
      ${plan.waterfall ? html`<details><summary class="small">Waterfall providers (misses cost nothing)</summary>${p.waterfall.order.map((id) => html`<label class="small"><input type="checkbox" data-wf="${id}" ${p.waterfall.on[id] ? 'checked' : ''} /> ${PROVIDERS[id].label}: ~${Math.round(PROVIDERS[id].hit * 100)}% find rate, ${PROVIDERS[id].cost} credit${PROVIDERS[id].cost > 1 ? 's' : ''}/hit [design]</label>`)}</details>` : ''}
      ${plan.ai ? html`<details ${ui.prompt ? 'open' : ''}><summary class="small">AI research column (Claygent-style)</summary>
        <textarea id="aiPrompt" rows="2" placeholder="Read the company profile and job posts: are they hiring for bookkeeping or finance ops? Answer yes, no or unknown with a one-line reason.">${ui.prompt}</textarea>
        ${aiA ? html`<p class="small muted">Asks about: ${aiA.topic} · ${aiA.format ? 'structured answer' : 'free-form answer'} · ${aiA.creditsPerRow} credits/row · selected rows: ~${aiA.creditsPerRow * ui.sel.size} credits</p>` : ''}
        <button class="sm" id="runAi" ${ui.sel.size ? '' : 'disabled'}>Run on selected</button></details>` : ''}
      <div class="table-wrap"><table><thead><tr><th></th><th>Person</th><th>Company</th><th>Size · location</th><th>Email</th>${plan.ai ? html`<th>AI</th>` : ''}</tr></thead><tbody>
        ${shown.map((r) => { const rv = p.revealed[r.id]; const ai = p.ai.answers[r.id]; return html`<tr>
          <td><input type="checkbox" data-psel="${r.id}" ${ui.sel.has(r.id) ? 'checked' : ''} /></td>
          <td>${r.p.first} ${r.p.last}<div class="small muted">${r.p.title}</div></td>
          <td>${r.co.name}<div class="small muted">${r.co.industry} · ${r.co.techs.join(', ')}${r.co.hiringShown ? ' · hiring' : ''}${r.co.recentRaise ? ` · raised ${FUNDING_LABEL[r.co.funding]}` : ''}</div></td>
          <td class="small">${r.co.employees} · ${r.co.geo}</td>
          <td class="small">${rv ? html`${rv.email} ${badge(rv.provider)}` : html`${maskEmail(r.p.email)}<div class="muted">${accuracyHint(r)}</div>`}</td>
          ${plan.ai ? html`<td class="small">${ai ? badge(`${ai.answer} · ${ai.conf}`, ai.answer === 'yes' ? 'good' : ai.answer === 'no' ? 'bad' : '') : ''}</td>` : ''}</tr>`; })}
      </tbody></table></div>
      <div class="inline"><button class="sm" id="prevPage" ${ui.page ? '' : 'disabled'}>← Prev</button><span class="small">Page ${ui.page + 1} / ${Math.max(1, Math.ceil(rows.length / PAGE))}</span><button class="sm" id="nextPage" ${(ui.page + 1) * PAGE < rows.length ? '' : 'disabled'}>Next →</button></div>
      <h3>Save revealed rows to the CRM</h3>
      <form id="saveList" class="inline"><label>List name <input name="name" value="${ui.listName}" placeholder="Shopify owners hiring ops, Oct" /></label><button class="sm primary" ${[...ui.sel].some((id) => p.revealed[id]) ? '' : 'disabled'}>Save ${[...ui.sel].filter((id) => p.revealed[id]).length} revealed</button></form>
      <p class="hint">Then verify them (Contacts) before enrolling them in a sequence. Database emails are ~88% right in the US and far worse abroad; a list that bounces over 5% burns your domain.</p>
    </section>`;
}

function listsView(s, p) {
  const crm = s.apps.crm;
  const burn = burnSummary(s);
  return html`${burn.burned || burn.hotSegments.length ? html`<div class="callout warn"><b>Market burn.</b> ${burn.burned} account(s) burned (over-contacted, spam or repeated opt-outs: they have stopped answering). ${burn.hotSegments.length ? `Replies have cooled in: ${burn.hotSegments.map((x) => x.id).join(', ')}.` : ''}</div>` : ''}
    ${p.lists.length ? p.lists.slice().reverse().map((list) => {
    const h = listHealth(s, list);
    const cos = [...new Set(list.contactIds.map((id) => crm.contacts.find((c) => c.id === id)?.companyId))].map((id) => companyById(s, id)).filter(Boolean);
    return html`<section class="panel"><h2>${list.name} <span class="small muted">${fmtDate(s, list.day)} · ${h.n} people</span></h2>
      <div class="stats">${stat('Sent', h.sent)}${stat('Bounced', pct(h.bounceRate), 'healthy < 2%', h.bounceRate > 0.05 ? 'bad' : h.bounceRate > 0.02 ? 'warn' : 'good')}${stat('Verified', pct(h.verifiedShare, 0), '', h.verifiedShare < 0.9 ? 'warn' : 'good')}${stat('Reasons written', `${h.reasons}/${cos.length}`)}</div>
      <div class="inline"><button class="sm" data-verifylist="${list.id}">Verify list (${money(h.n * SALES.verify.costPerEmail, { cents: true })})</button></div>
      <div class="table-wrap"><table><thead><tr><th>Account</th><th>Why this account (one line)</th><th></th></tr></thead><tbody>
      ${cos.slice(0, 150).map((co) => { const chk = co.prospect?.reason ? reasonCheck(co) : null; return html`<tr><td><a href="#/crm/company:${co.id}">${co.name}</a>${isBurned(s, co) ? html` ${badge('burned', 'bad')}` : ''}${co.prospect?.dropped ? html` ${badge('dropped')}` : ''}<div class="small muted">${co.industry} · ${co.employees} · ${(co.prospect?.techs ?? []).join(', ')}</div></td>
        <td><input data-reason="${co.id}" value="${ui.reasons[co.id] ?? co.prospect?.reason ?? ''}" placeholder="Hiring a bookkeeper; on Shopify; 12 people" />${chk ? html`<div class="small ${chk.ok ? 'pos' : 'neg'}">${chk.ok ? '✓' : '✗'} ${chk.why}</div>` : ''}</td>
        <td>${co.prospect?.dropped ? '' : html`<button class="sm" data-drop="${co.id}">Drop</button>`}</td></tr>`; })}
      </tbody></table></div><button class="sm primary" data-savereasons="${list.id}">Save reasons</button></section>`;
  }) : html`<p class="empty">No saved lists yet.</p>`}`;
}

function signalsView(s, p) {
  const plan = PLANS[p.plan];
  const sigs = p.signals.filter((x) => x.delivered && !x.unpaid).slice(-40).reverse();
  return html`<section class="panel"><h2>Signals on your saved accounts</h2>
    <p class="small muted">For visitor ID, intent data, competitor reviews and champion job changes on a target-account list, see <a href="#/crm/abm">Target accounts</a>.</p>
    ${plan.signals ? '' : html`<div class="callout">Signals need a Clay-style plan.</div>`}
    <p class="small muted">Each result costs 1 credit. Checking daily catches a trigger while it is fresh (a real trigger used within ~3 weeks lifts replies); monthly checks hand you old news. Some results are false positives (board or advisor roles read as job changes) [design].</p>
    <ul class="list">${Object.entries(SIGNALS.types).map(([k, l]) => html`<li>${l} <select data-monitor="${k}" ${plan.signals ? '' : 'disabled'}><option value="">Off</option>${Object.keys(SIGNALS.cadenceDays).map((c) => html`<option value="${c}" ${p.monitors[k] === c ? 'selected' : ''}>${c}</option>`)}</select></li>`)}</ul>
    <h3>Recent results</h3>
    ${sigs.length ? html`<ul class="list small">${sigs.map((x) => { const co = companyById(s, x.companyId); return html`<li><a href="#/crm/company:${x.companyId}">${co?.name ?? ''}</a> · ${SIGNALS.types[x.type]} · happened ${fmtDate(s, x.day)}, seen ${fmtDate(s, x.seenDay)}<div class="muted">Suggested first line: “${x.suggestion ?? suggestLine(x.type, co ?? {})}”</div></li>`; })}</ul>` : html`<p class="empty">No signals yet.</p>`}</section>`;
}

function creditsView(s, p) {
  return html`<section class="panel"><h2>Credit ledger</h2>${table({ rows: p.ledger.slice(0, 80), empty: 'No credit activity.', columns: [{ label: 'Day', render: (x) => fmtDate(s, x.day) }, { label: 'Change', align: 'right', render: (x) => html`<span class="${x.delta < 0 ? 'neg' : 'pos'}">${x.delta > 0 ? '+' : ''}${x.delta}</span>` }, { label: 'What', render: (x) => x.what }] })}</section>`;
}

export function prospectsView(s) {
  const p = ensureProspector(s);
  const subs = [['search', 'Search'], ['lists', `Saved lists (${p.lists.length})`], ['signals', 'Signals'], ['credits', 'Credits']];
  return html`${planPanel(s, p)}
    <div class="tabs">${subs.map(([k, l]) => html`<a href="#" data-psub="${k}" class="${ui.sub === k ? 'active' : ''}">${l}</a>`)}</div>
    ${ui.sub === 'lists' ? listsView(s, p) : ui.sub === 'signals' ? signalsView(s, p) : ui.sub === 'credits' ? creditsView(s, p) : searchView(s, p)}`;
}

export function wireProspects(root, ctx) {
  const s = ctx.state;
  on(root, 'click', '[data-psub]', (e, el) => { e.preventDefault(); ui.sub = el.dataset.psub; ctx.render(); });
  on(root, 'click', '[data-plan]', (e, el) => ctx.act((st) => setPlan(st, el.dataset.plan), { hours: 0.1, label: 'Prospect database setup' }));
  on(root, 'submit', '#pfilters', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    ui.filters = { niche: fd.get('niche') ?? '', title: fd.get('title') ?? '', segment: fd.get('segment') ?? '', geo: fd.get('geo') ?? '', minEmp: fd.get('minEmp') ?? '', maxEmp: fd.get('maxEmp') ?? '', tech: fd.get('tech') ?? '', funding: fd.get('funding') ?? '', hiring: fd.get('hiring') === 'on', excludeOwned: fd.get('excludeOwned') === 'on', excludeBurned: fd.get('excludeBurned') === 'on', seniority: Object.keys(SENIORITY).filter((k) => fd.get(`sen_${k}`) === 'on') };
    ui.sel = new Set(); ui.page = 0;
    ctx.act((st) => recordSearch(st, ui.filters), { hours: HOURS_P.search, label: 'Prospecting' });
  });
  on(root, 'change', '[data-psel]', (e, el) => { if (el.checked) ui.sel.add(el.dataset.psel); else ui.sel.delete(el.dataset.psel); ctx.render(); });
  on(root, 'click', '#selPage', () => { for (const el of root.querySelectorAll('[data-psel]')) ui.sel.add(el.dataset.psel); ctx.render(); });
  on(root, 'click', '#selFirst', () => { const n = Number(root.querySelector('#selN').value) || 100; ui.sel = new Set(search(s, ui.filters).slice(0, n).map((r) => r.id)); ctx.render(); });
  on(root, 'click', '#selNone', () => { ui.sel = new Set(); ctx.render(); });
  on(root, 'click', '#prevPage', () => { ui.page = Math.max(0, ui.page - 1); ctx.render(); });
  on(root, 'click', '#nextPage', () => { ui.page++; ctx.render(); });
  const doReveal = (mode) => { const ids = [...ui.sel]; ctx.act((st) => { const r = reveal(st, ids, { mode }); toast(`${r.found} emails found, ${r.missed} not found (${r.credits} credits).`, 'good'); }, { hours: HOURS_P.revealBase + ids.length * HOURS_P.revealPer, label: 'Prospecting (enrichment)' }); };
  on(root, 'click', '#revealDb', () => doReveal('db'));
  on(root, 'click', '#revealWf', () => doReveal('waterfall'));
  on(root, 'click', '#test5', () => { const ids = [...ui.sel]; ctx.act((st) => { ui.lastTest = testFive(st, ids, { mode: PLANS[ensureProspector(st).plan].waterfall ? 'waterfall' : 'db' }); }, { hours: HOURS_P.test5, label: 'Prospecting (5-row test)' }); });
  on(root, 'click', '#phones', () => { const ids = [...ui.sel]; ctx.act((st) => toast(`${revealPhones(st, ids)} mobile numbers found.`), { hours: 0.05, label: 'Prospecting (enrichment)' }); });
  on(root, 'change', '[data-wf]', (e, el) => ctx.act((st) => { ensureProspector(st).waterfall.on[el.dataset.wf] = el.checked; }, { hours: HOURS_P.waterfallSetup / 3, label: 'Prospecting (waterfall setup)' }));
  on(root, 'input', '#aiPrompt', (e) => { ui.prompt = e.target.value; });
  on(root, 'click', '#runAi', () => { const ids = [...ui.sel]; const prompt = root.querySelector('#aiPrompt').value; ui.prompt = prompt; ctx.act((st) => { const r = runAiColumn(st, ids, prompt); toast(`AI column ran on ${r.n} rows (${r.creditsPerRow * r.n} credits).`); }, { hours: HOURS_P.aiWrite + ids.length * HOURS_P.aiReviewPer, label: 'Prospecting (AI research)' }); });
  on(root, 'submit', '#saveList', (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    ui.listName = name;
    const ids = [...ui.sel].filter((id) => ensureProspector(s).revealed[id]);
    ctx.act((st) => { const l = saveList(st, ids, name, { addContact }); ui.sel = new Set(); ui.sub = 'lists'; toast(`Saved ${l.contactIds.length} people to "${l.name}". Verify before sending.`, 'good'); }, { hours: HOURS_P.saveBase + ids.length * HOURS_P.savePer, label: 'Prospecting (save list)' });
  });
  on(root, 'input', '[data-reason]', (e, el) => { ui.reasons[el.dataset.reason] = el.value; });
  on(root, 'click', '[data-savereasons]', () => {
    const entries = Object.entries(ui.reasons);
    ctx.act((st) => { for (const [id, r] of entries) { const co = companyById(st, id); if (co?.prospect) co.prospect.reason = r.trim(); } ui.reasons = {}; }, { hours: entries.length * HOURS_P.reasonPer, label: 'Prospecting (account reasons)' });
  });
  on(root, 'click', '[data-drop]', (e, el) => ctx.act((st) => dropAccount(st, companyById(st, el.dataset.drop)), { hours: HOURS_P.drop, label: 'List hygiene' }));
  on(root, 'click', '[data-verifylist]', (e, el) => ctx.act((st) => {
    const list = ensureProspector(st).lists.find((x) => x.id === el.dataset.verifylist);
    const todo = list.contactIds.map((id) => st.apps.crm.contacts.find((c) => c.id === id)).filter((c) => c && !c.verification);
    if (!todo.length) return;
    post(st, { amount: -Math.max(0.5, todo.length * SALES.verify.costPerEmail), counterparty: 'Email verifier', description: `Verified ${todo.length} addresses`, category: 'software', method: 'card' });
    verifyContacts(st, todo);
    emitSalesEvent(st, 'list_verified', { listId: list.id, n: todo.length }, `verified:${list.id}:${st.day}`);
    toast(`Verified ${todo.length}: ${todo.filter((c) => c.verification === 'invalid').length} invalid.`, 'good');
  }, { hours: 0.05, label: 'List hygiene' }));
  on(root, 'change', '[data-monitor]', (e, el) => ctx.act((st) => setMonitor(st, el.dataset.monitor, el.value || null), { hours: HOURS_P.monitorSetup, label: 'Prospecting (signals)' }));
}

export { contactName };
