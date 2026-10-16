// CRM -> Target accounts: the ABM workspace and the signal inbox. Logic and hidden truth live in abm.js; this view
// shows only what a real founder would see (database facts, alerts with their age, research notes, replies) and
// charges founder hours for every action through ctx.act.
import { html, on, stat, badge, toast } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import { BUYER_SEGMENTS, roleLabel } from './segments.js';
import { TECH } from './prospector.js';
import { adviceBlock } from '../../core/adviceUi.js';
import {
  ABM_TIERS, HOURS, SOURCES, SIGNAL_TYPES, INITIATIVES, MONTHS, ADS, ensureAbm, targets, accountById, accountCandidates, addTargetAccount, setTier, setReason,
  dropTarget, reasonQuality, researchAccount, findMember, subscribeSource, pruneSource, sourceScoreboard, sourceMonthly, setAdsBudget, awareness,
  visibleSignals, signalStrength, verifySignal, dismissSignal, judgeMessage, sendTouch, runClusterPlay, accountEngagement, abmSummary,
  isAccountBurned, trackableChampions, FUNDING_LABEL,
} from './abm.js';
import './abm-readers.js';

const ui = { add: { segment: '', minEmp: '', maxEmp: '', trigger: '', tech: '' }, addTier: 2, addReason: {}, draft: { accountId: null, memberKey: '', signalId: '', text: '' }, cluster: { segment: '', text: '', sel: new Set() }, check: null };

const sigLabel = (sig) => SIGNAL_TYPES[sig.type]?.label ?? sig.type;
const strengthBar = (x) => html`<span class="meter" style="display:inline-block;width:60px;vertical-align:middle" title="${Math.round(x * 100)}% of a fresh signal"><span style="display:block;height:6px;width:${Math.round(x * 100)}%;background:currentColor;opacity:.6"></span></span>`;
const verifiedBadge = (sig) => (sig.verified === 'confirmed' ? badge('checked: true', 'good') : sig.verified === 'not_true' ? badge('checked: not true', 'bad') : sig.verified === 'unverifiable' ? badge('cannot be checked', 'warn') : '');

function personOf(acc, key) { return acc?.members.find((m) => m.key === key) ?? null; }
function whoText(acc, sig) {
  if (sig.companyLevel) return 'company-level match (no person-level ID outside the US)';
  const m = personOf(acc, sig.personKey);
  return m ? `${m.first} ${m.last}, ${m.title}` : 'account-level';
}

function guide(s, a) {
  const open = !targets(s).length || !Object.values(a.sources).some((x) => x.on);
  return html`<details class="panel" ${open ? 'open' : ''}><summary><b>How ABM and signal-based outreach work here</b></summary>
    <ol class="small">
      <li><a href="#/crm/abm:add">Pick target accounts</a> from the prospect database and write one line on why each fits. The database never says who is buying now; fit and a checkable reason decide which accounts are worth hours.</li>
      <li>Tier them: <b>1:1</b> (5-10 accounts, researched brief and a note per person), <b>1:few</b> (clusters sharing one angle, see <a href="#/crm/abm:cluster">Cluster plays</a>), <b>1:many</b> (matched-account ads below keep you in front of the rest).</li>
      <li><a href="#/crm/abm:sources">Choose signal sources</a>: each has a monthly price, a precision (false alarms, wrong people), a lag before the alert, and a half-life after which it is worth half.</li>
      <li>Open an account to <b>research</b> it and <b>map the buying group</b> (champion, economic buyer, users, blockers). Only research or a reply tells you what they are working on.</li>
      <li>Work the signal inbox below: check the fact, pick the right person, and write about their problem. Accounts are only sometimes in market; a fresh signal at a fitting account is the best clue you get.</li>
      <li>Watch the <a href="#/crm/abm:sources">source scoreboard</a>: signals, replies and meetings per source, and what each costs. Positive replies book calls in <a href="#/meetings">Meetings</a> and open deals in the <a href="#/crm/pipeline">Pipeline</a>, with the buying group you mapped.</li>
    </ol>
    <p class="small muted">Numbers here are game estimates within vendor-reported ranges (docs/research/cold-email-alternatives-2026.md); vendor claims are unverified.</p></details>`;
}

function inbox(s, a) {
  const sigs = visibleSignals(s).filter((x) => !x.dismissed && !x.actedDay && s.day - x.seenDay <= 21 && x.accountId).sort((x, y) => y.seenDay - x.seenDay).slice(0, 40);
  const anyOn = Object.values(a.sources).some((x) => x.on);
  return html`<section class="panel" id="signals"><h2>Signal inbox ${sigs.length ? badge(String(sigs.length), 'accent') : ''}</h2>
    ${!sigs.length ? html`<p class="empty">${anyOn ? 'No new signals. Alerts arrive after each source\'s lag; quiet weeks are normal for a short list.' : html`No signal sources yet. <a href="#/crm/abm:sources">Subscribe to one</a> to see alerts here.`}</p>` : html`
    <div class="table-wrap"><table><thead><tr><th>Account</th><th>Signal</th><th>Who</th><th>Happened</th><th>Worth now</th><th>Stack (14 d)</th><th></th></tr></thead><tbody>
    ${sigs.map((sig) => {
      const acc = accountById(s, sig.accountId);
      const stackN = new Set(visibleSignals(s, sig.accountId).filter((x) => s.day - x.day <= 14 && !x.dismissed).map((x) => x.source)).size;
      return html`<tr>
        <td><a href="#/crm/abm:${acc?.id}">${acc?.name ?? '?'}</a>${acc?.status === 'suggested' ? html` ${badge('suggested', 'warn')}` : acc ? html` <span class="small muted">${ABM_TIERS[acc.tier].short}</span>` : ''}</td>
        <td>${sigLabel(sig)} <div class="small muted">${SOURCES[sig.source]?.label}</div> ${verifiedBadge(sig)}</td>
        <td class="small">${whoText(acc, sig)}</td>
        <td class="small">${s.day - sig.day} d ago<div class="muted">alert ${s.day - sig.seenDay} d ago</div></td>
        <td>${strengthBar(signalStrength(s, sig))}<div class="small muted">half-life ~${SIGNAL_TYPES[sig.type].halfLife} d</div></td>
        <td>${stackN}</td>
        <td><button class="sm" data-verify="${sig.id}" ${sig.verified ? 'disabled' : ''} title="${sig.verified ? 'Already checked' : 'Open the press release, job post or profile'}">Check (6 min)</button>
          <button class="sm primary" data-act-sig="${sig.id}">Write</button>
          <button class="sm" data-dismiss="${sig.id}">Dismiss</button></td></tr>`;
    })}</tbody></table></div>`}</section>`;
}

function accountTable(s, a) {
  const list = targets(s);
  const sugg = a.accounts.filter((x) => x.status === 'suggested');
  return html`<section class="panel"><h2>Target accounts</h2>
    ${!list.length ? html`<p class="empty">No target accounts yet. <a href="#/crm/abm:add">Add accounts</a> from the prospect database (filters by segment, size, triggers and tools).</p>` : html`
    <div class="table-wrap"><table><thead><tr><th>Account</th><th>Tier</th><th>Size · segment</th><th>Engagement</th><th>People found</th><th>Last touch</th><th>Status</th></tr></thead><tbody>
    ${list.sort((x, y) => x.tier - y.tier || accountEngagement(s, y).score - accountEngagement(s, x).score).map((acc) => {
      const e = accountEngagement(s, acc);
      const found = acc.members.filter((m) => m.found).length;
      const last = Math.max(-1, ...acc.members.map((m) => m.lastTouchDay ?? -1));
      return html`<tr><td><a href="#/crm/abm:${acc.id}">${acc.name}</a><div class="small muted">${acc.reason || 'no reason written'}</div></td>
        <td><select data-tier="${acc.id}">${[1, 2, 3].map((t) => html`<option value="${t}" ${acc.tier === t ? 'selected' : ''}>${ABM_TIERS[t].short}</option>`)}</select></td>
        <td class="small">${acc.employees} · ${acc.segLabel}</td>
        <td>${e.score}<div class="small muted">${e.signals} signal${e.signals === 1 ? '' : 's'} / ${e.sources} source${e.sources === 1 ? '' : 's'}</div></td>
        <td>${found}/${acc.members.length}</td>
        <td class="small">${last >= 0 ? `${s.day - last} d ago` : '—'}</td>
        <td>${acc.oppDealId ? badge('opportunity', 'good') : isAccountBurned(s, acc) ? badge('burned', 'bad') : acc.members.some((m) => m.replied === 'positive') ? badge('engaged', 'good') : ''}</td></tr>`;
    })}</tbody></table></div>`}
    ${sugg.length ? html`<h3>Suggested by job-change alerts</h3><ul class="list small">${sugg.map((acc) => html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span><b>${acc.name}</b> · ${acc.members.find((m) => m.warm)?.first ?? 'A past champion'} started there (${acc.employees} people, ${acc.segLabel})</span><span><a class="btn sm" href="#/crm/abm:${acc.id}">Open</a> <button class="sm" data-adopt="${acc.id}">Add as tier 1</button></span></li>`)}</ul>` : ''}
  </section>`;
}

function adsPanel(s, a) {
  const n = targets(s).length;
  const aw = awareness(s);
  return html`<section class="panel"><h2>1:many · matched-account ads</h2>
    <p class="small muted">Upload the target list as a company audience (LinkedIn-style matched accounts, CPM ~$25-60 [unverified]). Ads do not book meetings; they make your name familiar so later notes and signals land better. Spend posts to the bank monthly.</p>
    <div class="inline"><label style="max-width:180px;margin:0">Monthly budget ($) <input type="number" id="adsBudget" min="0" step="100" value="${a.ads.monthly || ''}" placeholder="0" /></label>
      <button class="sm" id="setAds" ${n ? '' : 'disabled'} title="${n ? '' : 'Add target accounts first: the audience is your account list.'}">Save budget${a.ads.monthly ? '' : ` (${HOURS.adsSetup} h setup)`}</button></div>
    <p class="small">${n ? `${n} accounts in the audience · about ${Math.round((a.ads.monthly / ADS.cpm) * 1000 / Math.max(1, n)).toLocaleString('en-US')} impressions per account per month · awareness ${pct(aw, 0)}` : 'Why disabled: no target accounts yet.'}</p></section>`;
}

function overview(s, a) {
  const sum = abmSummary(s);
  return html`${guide(s, a)}
    <div class="stats">
      ${stat('Target accounts', sum.targets, `${sum.byTier[0]} · ${sum.byTier[1]} · ${sum.byTier[2]} by tier`)}
      ${stat('Positive replies', sum.positives, sum.resolved ? `${pct(sum.replyRate, 1)} of ${sum.resolved} answered or expired` : 'none yet')}
      ${stat('Opportunities', sum.opportunities, 'from target accounts')}
      ${stat('Founder hours', sum.hours.toFixed(1), 'on ABM and signals')}
      ${stat('Burned accounts', sum.burned, 'too many unanswered touches', sum.burned ? 'bad' : '')}
    </div>
    <div class="inline" style="margin:8px 0"><a class="btn sm" href="#/crm/abm:add">+ Add accounts</a> <a class="btn sm" href="#/crm/abm:sources">Signal sources</a> <a class="btn sm" href="#/crm/abm:cluster">Cluster plays (1:few)</a> <a class="btn sm" href="#/crm/prospects">Prospect database</a></div>
    ${inbox(s, a)}
    ${accountTable(s, a)}
    ${adsPanel(s, a)}`;
}

function addView(s) {
  const f = ui.add;
  const rows = accountCandidates(s, { ...f, limit: 40 });
  return html`<p><a href="#/crm/abm">← Target accounts</a></p>
    <form id="abmAdd" class="panel"><h2>Add target accounts</h2>
    <p class="small muted">Rows come from the prospect database (what Apollo/Clay show: industry, size, location, tools, funding, a hiring flag that is sometimes stale). Nothing here says who is buying now.</p>
    <div class="grid-3">
      <label>Segment <select name="segment"><option value="">Any</option>${BUYER_SEGMENTS.map((x) => html`<option value="${x.id}" ${f.segment === x.id ? 'selected' : ''}>${x.label}</option>`)}</select></label>
      <label>Headcount min <input type="number" name="minEmp" value="${f.minEmp}" min="1" /></label>
      <label>Headcount max <input type="number" name="maxEmp" value="${f.maxEmp}" min="1" /></label>
      <label>Tool used <select name="tech"><option value="">Any</option>${TECH.map((t) => html`<option ${f.tech === t ? 'selected' : ''}>${t}</option>`)}</select></label>
      <label>Trigger <select name="trigger"><option value="">Any</option><option value="hiring" ${f.trigger === 'hiring' ? 'selected' : ''}>Hiring flag</option><option value="raised" ${f.trigger === 'raised' ? 'selected' : ''}>Raised in the last 90 days</option></select></label>
      <label>Add as <select id="addTier">${[1, 2, 3].map((t) => html`<option value="${t}" ${ui.addTier === t ? 'selected' : ''}>${ABM_TIERS[t].label}</option>`)}</select></label>
    </div><button class="sm">Filter</button></form>
    <section class="panel"><h2>${rows.length} companies</h2>
    ${!rows.length ? html`<p class="empty">No companies match. Widen the size band or drop a filter.</p>` : html`<div class="table-wrap"><table><thead><tr><th>Company</th><th>Size · where</th><th>Tools · funding</th><th>Why this account (one line)</th><th></th></tr></thead><tbody>
      ${rows.map((co) => html`<tr><td>${co.name}<div class="small muted">${co.industry}</div></td><td class="small">${co.employees} · ${co.geo}</td>
        <td class="small">${co.techs.join(', ')}${co.hiringShown ? ' · hiring' : ''}${co.recentRaise ? ` · raised ${FUNDING_LABEL[co.funding]}` : ''}</td>
        <td><input data-reason="${co.key}" value="${ui.addReason[co.key] ?? ''}" placeholder="e.g. hiring RevOps; runs HubSpot" /></td>
        <td><button class="sm" data-addacct="${co.key}">Add (3 min)</button></td></tr>`)}</tbody></table></div>`}</section>`;
}

function sourcesView(s, a) {
  const board = sourceScoreboard(s);
  const champs = trackableChampions(s).length;
  const n = targets(s).length;
  return html`<p><a href="#/crm/abm">← Target accounts</a></p>
    <section class="panel"><h2>Signal sources</h2>
    <p class="small muted">Each source watches your target accounts (job-change alerts watch past champions). Precision, lag and half-life differ; none of them tells you an account is buying. Subscriptions post to the bank monthly; manual watches take founder time every week.</p>
    <div class="grid-2">${board.map((r) => {
      const types = SOURCES[r.id].types.map((t) => SIGNAL_TYPES[t]);
      const why = r.id === 'job_change' && !champs ? 'Nobody to track yet: people who replied with interest, met you or bought appear here.' : r.id !== 'job_change' && !n ? 'Add target accounts first: sources watch your account list.' : '';
      const monthly = sourceMonthly(s, r.id);
      return html`<div class="card"><h3>${r.label} ${r.on ? badge('on', 'good') : r.pruned != null ? badge('cancelled', '') : ''}</h3>
        <p class="small">${r.vendor} · ${monthly ? `${money(monthly)}/mo` : 'no fee'}${SOURCES[r.id].weeklyHours ? ` · ${SOURCES[r.id].weeklyHours} h/week` : ''} · ${r.level}</p>
        <p class="small muted">${SOURCES[r.id].note}</p>
        <p class="small">Half-life ${types.map((t) => `~${t.halfLife} d`).join(' / ')} · alert lag ${types.map((t) => `${t.lag[0]}-${t.lag[1]} d`).join(' / ')}</p>
        ${r.id === 'job_change' ? html`<p class="small">${champs} past champion${champs === 1 ? '' : 's'} trackable.</p>` : ''}
        ${r.on ? html`<button class="sm" data-prune="${r.id}">Cancel</button>` : html`<button class="sm primary" data-sub="${r.id}" ${why ? 'disabled' : ''} title="${why}">Subscribe (${HOURS.sourceSetup} h setup)</button>${why ? html`<p class="small muted">Why disabled: ${why}</p>` : ''}`}</div>`;
    })}</div></section>
    <section class="panel"><h2>Source scoreboard</h2>
    ${board.some((r) => r.since != null) ? html`<div class="table-wrap"><table><thead><tr><th>Source</th><th>Signals</th><th>Acted on</th><th>Positive replies</th><th>Meetings</th><th>Reply rate</th><th>Spend</th></tr></thead><tbody>
      ${board.filter((r) => r.since != null).map((r) => html`<tr><td>${r.label}</td><td>${r.signals}</td><td>${r.acted}</td><td>${r.positives}</td><td>${r.meetings}</td><td>${r.replyRate == null ? '—' : pct(r.replyRate, 0)}</td><td>${money(r.spend)}</td></tr>`)}
      </tbody></table></div><p class="small muted">Acted on = signals you wrote about. Few replies after a dozen tries is a pattern, not bad luck.</p>` : html`<p class="empty">No sources yet. Results per source show up here once you act on their signals.</p>`}</section>`;
}

function clusterView(s, a) {
  const c = ui.cluster;
  const t2 = targets(s).filter((x) => x.tier === 2 && (!c.segment || x.segId === c.segment));
  const segs = [...new Set(targets(s).filter((x) => x.tier === 2).map((x) => x.segId))];
  const canRun = c.sel.size && c.text.trim().split(/\s+/).length >= 15;
  const why = !t2.length ? 'no tier-2 accounts yet' : !c.sel.size ? 'select accounts' : !canRun ? 'write the message (15+ words)' : '';
  return html`<p><a href="#/crm/abm">← Target accounts</a></p>
    <section class="panel"><h2>Cluster play (1:few)</h2>
    <p class="small muted">One message for a cluster of tier-2 accounts that share a problem. {first} and {company} are filled in; it goes to the best person you have found at each account. Writing the cluster asset takes ~${HOURS.clusterAsset} h, then ${Math.round(HOURS.clusterSend * 60)} min per account.</p>
    <label>Cluster (segment) <select id="clSeg"><option value="">All tier-2 accounts</option>${segs.map((id) => html`<option value="${id}" ${c.segment === id ? 'selected' : ''}>${BUYER_SEGMENTS.find((x) => x.id === id)?.label ?? id}</option>`)}</select></label>
    ${!t2.length ? html`<p class="empty">No tier-2 accounts${c.segment ? ' in this cluster' : ''}. Set accounts to 1:few in the <a href="#/crm/abm">account list</a>.</p>` : html`<ul class="list small">${t2.map((acc) => html`<li><label><input type="checkbox" data-clsel="${acc.id}" ${c.sel.has(acc.id) ? 'checked' : ''} ${isAccountBurned(s, acc) ? 'disabled' : ''} /> ${acc.name} · ${acc.employees} people · ${acc.members.filter((m) => m.found).length} found${isAccountBurned(s, acc) ? ' · burned' : ''}</label></li>`)}</ul>`}
    <textarea id="clText" rows="6" placeholder="Hi {first}, ...">${c.text}</textarea>
    <button class="primary sm" id="clRun" ${canRun ? '' : 'disabled'}>Send to ${c.sel.size} account${c.sel.size === 1 ? '' : 's'}</button>${why ? html` <span class="small muted">Why disabled: ${why}.</span>` : ''}</section>`;
}

function accountView(s, a, acc) {
  if (!acc) return html`<p><a href="#/crm/abm">← Target accounts</a></p><p class="empty">That account is gone.</p>`;
  const rq = reasonQuality(acc);
  const e = accountEngagement(s, acc);
  const sigs = visibleSignals(s, acc.id).sort((x, y) => y.day - x.day);
  const touches = a.touches.filter((t) => t.accountId === acc.id).slice().reverse();
  const d = ui.draft.accountId === acc.id ? ui.draft : (ui.draft = { accountId: acc.id, memberKey: acc.members.find((m) => m.found && !m.optedOut)?.key ?? '', signalId: '', text: '' });
  const burned = isAccountBurned(s, acc);
  const target = acc.status === 'target';
  const check = ui.check?.accountId === acc.id ? ui.check : null;
  const unfoundRoles = [...new Set(acc.members.filter((m) => !m.found).map((m) => m.role))];
  return html`<p><a href="#/crm/abm">← Target accounts</a></p>
    <section class="panel"><h2>${acc.name} ${target ? badge(ABM_TIERS[acc.tier].label, 'accent') : badge(acc.status, 'warn')} ${burned ? badge(`burned for ${acc.burnedUntil - s.day} d`, 'bad') : ''} ${acc.oppDealId ? html`<a class="btn sm" href="#/crm/pipeline">Opportunity →</a>` : ''}</h2>
      <p class="small">${acc.industry} · ${acc.employees} people · ${acc.geo} · ${acc.techs.join(', ')}${acc.hiringShown ? ' · hiring flag' : ''}${acc.recentRaise ? ` · raised ${FUNDING_LABEL[acc.funding]}` : ''}</p>
      ${target ? '' : html`<button class="sm primary" data-adopt="${acc.id}">Add as tier 1</button>`}
      <div class="inline"><label style="flex:1;margin:0">Why this account <input id="acctReason" value="${acc.reason}" placeholder="one line: fit and a reason to buy now" /></label><button class="sm" id="saveReason">Save</button></div>
      <p class="small">Reason check: ${badge(rq.why, rq.score >= 1 ? 'good' : rq.score >= 0.5 ? '' : 'warn')} · Engagement ${e.score}/100</p>
      ${target ? html`<button class="sm" id="dropAcct">Remove from targets</button>` : ''}</section>
    <div class="grid-2">
      <section class="panel"><h2>Research</h2>
        <div class="inline"><button class="sm" data-research="light">Quick look: site and news (${Math.round(HOURS.researchLight * 60)} min)</button><button class="sm" data-research="deep">Account brief (${HOURS.researchDeep} h)</button></div>
        <p class="small">${acc.research.initiative ? html`Working on: <b>${INITIATIVES[acc.research.initiative].label}</b>` : 'What they are working on: not known yet.'}${acc.research.budgetKnown ? ` · Budgets set around ${MONTHS[acc.truth.budgetMonth]}.` : ''}</p>
        ${acc.research.notes.length ? html`<ul class="list small">${acc.research.notes.slice(0, 6).map((n) => html`<li>${fmtDate(s, n.day)} · ${n.depth}: ${n.text}</li>`)}</ul>` : html`<p class="empty">No research yet. A brief is where tier-1 notes get their substance.</p>`}
      </section>
      <section class="panel"><h2>Buying group (${acc.members.filter((m) => m.found).length}/${acc.members.length} found)</h2>
        <ul class="list small">${acc.members.map((m) => html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span>${badge(roleLabel(m.role), 'accent')} ${m.canBlock ? badge('can block', 'warn') : ''} ${m.found ? html`<b>${m.first} ${m.last}</b> · ${m.title}${m.warm ? html` ${badge('past champion', 'good')}` : ''}` : html`<span class="muted">not found yet</span>`}
          <span class="muted">${m.touches ? ` · ${m.touches} touch${m.touches === 1 ? '' : 'es'}` : ''}${m.replied ? ` · replied: ${m.replied}` : ''}${m.optedOut ? ' · opted out' : ''}</span></span></li>`)}</ul>
        ${unfoundRoles.length ? html`<div class="inline">${unfoundRoles.map((r) => html`<button class="sm" data-find="${r}">Find ${roleLabel(r).toLowerCase()} (${Math.round(HOURS.findPerson * 60)} min)</button>`)}</div>` : ''}
      </section></div>
    <section class="panel"><h2>Signals at this account</h2>
      ${sigs.length ? html`<ul class="list small">${sigs.slice(0, 12).map((sig) => html`<li>${sigLabel(sig)} · ${whoText(acc, sig)} · ${s.day - sig.day} d ago ${strengthBar(signalStrength(s, sig))} ${verifiedBadge(sig)} ${sig.actedDay != null ? badge('acted', 'good') : sig.dismissed ? badge('dismissed') : ''}</li>`)}</ul>` : html`<p class="empty">No signals here yet. They come from the <a href="#/crm/abm:sources">sources</a> you subscribe to.</p>`}
    </section>
    <section class="panel"><h2>Write to someone at ${acc.name}</h2>
      ${!target ? html`<p class="empty">Add the account to your targets first.</p>` : burned ? html`<p class="empty">Why disabled: too many unanswered touches; the account is not responding for now.</p>` : !acc.members.some((m) => m.found && !m.optedOut) ? html`<p class="empty">Why disabled: nobody found yet. Use Find above or an account brief.</p>` : html`
      <div class="grid-2"><label>To <select id="dTo">${acc.members.filter((m) => m.found && !m.optedOut).map((m) => html`<option value="${m.key}" ${d.memberKey === m.key ? 'selected' : ''}>${m.first} ${m.last} · ${roleLabel(m.role)}</option>`)}</select></label>
        <label>Acting on <select id="dSig"><option value="">No specific signal</option>${sigs.filter((x) => !x.dismissed).map((x) => html`<option value="${x.id}" ${d.signalId === x.id ? 'selected' : ''}>${sigLabel(x)} (${s.day - x.day} d ago)</option>`)}</select></label></div>
      <textarea id="dText" rows="7" placeholder="Hi ${acc.members.find((m) => m.key === d.memberKey)?.first ?? ''}, ...">${d.text}</textarea>
      <div class="inline"><button class="sm" id="dCheck">Check draft</button><button class="sm primary" id="dSend">Send (${Math.round(HOURS.message * 60)} min)</button></div>
      ${check ? html`<ul class="small">${check.notes.length ? check.notes.map((n) => html`<li>${n}</li>`) : html`<li>No obvious problems in the wording.</li>`}</ul>` : ''}`}
    </section>
    <section class="panel"><h2>Touches</h2>
      ${touches.length ? html`<div class="table-wrap"><table><thead><tr><th>Day</th><th>To</th><th>Play</th><th>Message score</th><th>Outcome</th><th>What the judge saw</th></tr></thead><tbody>${touches.map((t) => {
        const m = personOf(acc, t.memberKey);
        return html`<tr><td class="small">${fmtDate(s, t.day)}</td><td class="small">${m ? `${m.first} ${m.last}` : '?'} · ${roleLabel(t.role)}</td><td>${t.play}</td><td>${Math.round(t.q * 100)}</td>
          <td>${t.outcome ? badge(t.outcome === 'none' ? 'no reply' : t.outcome, t.outcome === 'positive' ? 'good' : t.outcome === 'negative' ? 'bad' : '') : badge('waiting')}</td>
          <td class="small">${t.notes.join(' ')}${t.eventAge != null ? ` Acted ${t.eventAge} d after the event.` : ''}</td></tr>`;
      })}</tbody></table></div>
      ${adviceBlock(s, 'account_based_marketing', acc.tier === 1 && acc.members.filter((m) => m.touches).length < 2 ? ['A tier-1 account is worth reaching the champion, the economic buyer and a user, each with their own angle.'] : [])}
      ${adviceBlock(s, 'signal_outreach', touches.some((t) => t.flags.creepy) ? ['Write about their problem and use the tracking only to decide whom and when.'] : touches.some((t) => (t.eventAge ?? 0) > 7) ? ['Acting within a day or two of an alert keeps the reference true and the timing right.'] : [])}` : html`<p class="empty">No touches yet.</p>`}
    </section>`;
}

/** The tab body. id: undefined (overview) | 'add' | 'sources' | 'cluster' | an account id. */
export function abmView(s, id) {
  const a = ensureAbm(s);
  const head = html`<p class="small muted">Account-based marketing: a short list of accounts, worked as buying groups, timed by intent signals.</p>`;
  if (!id) return html`${head}${overview(s, a)}`;
  if (id === 'add') return addView(s);
  if (id === 'sources') return sourcesView(s, a);
  if (id === 'cluster') return clusterView(s, a);
  return accountView(s, a, accountById(s, id));
}

export function wireAbm(root, ctx) {
  const s = ctx.state;
  const [, id] = ctx.params.split(':');
  const act = (fn, hours, label, msg) => ctx.act((st) => { const r = fn(st); if (msg) toast(typeof msg === 'function' ? msg(r) : msg, 'good'); return r; }, { hours, label });
  on(root, 'submit', '#abmAdd', (e, form) => { e.preventDefault(); const fd = new FormData(form); ui.add = { segment: fd.get('segment') ?? '', minEmp: fd.get('minEmp') ?? '', maxEmp: fd.get('maxEmp') ?? '', tech: fd.get('tech') ?? '', trigger: fd.get('trigger') ?? '' }; ctx.render(); });
  on(root, 'change', '#addTier', (e, el) => { ui.addTier = Number(el.value); });
  on(root, 'input', '[data-reason]', (e, el) => { ui.addReason[el.dataset.reason] = el.value; });
  on(root, 'click', '[data-addacct]', (e, el) => act((st) => addTargetAccount(st, el.dataset.addacct, { tier: ui.addTier, reason: ui.addReason[el.dataset.addacct] ?? '' }), HOURS.addAccount, 'Target accounts', 'Added to target accounts.'));
  on(root, 'change', '[data-tier]', (e, el) => act((st) => setTier(st, el.dataset.tier, el.value), 0, 'Target accounts'));
  on(root, 'click', '[data-adopt]', (e, el) => act((st) => { const acc = accountById(st, el.dataset.adopt); addTargetAccount(st, acc.key, { tier: 1, reason: acc.reason || 'a past champion just joined' }); }, HOURS.addAccount, 'Target accounts', 'Added as a tier-1 account.'));
  on(root, 'click', '[data-sub]', (e, el) => act((st) => subscribeSource(st, el.dataset.sub), HOURS.sourceSetup, 'Signal source setup', `Subscribed: ${SOURCES[el.dataset.sub].label}.`));
  on(root, 'click', '[data-prune]', (e, el) => act((st) => pruneSource(st, el.dataset.prune), 0, 'Signal sources', 'Cancelled.'));
  on(root, 'click', '[data-verify]', (e, el) => act((st) => verifySignal(st, el.dataset.verify), HOURS.verifySignal, 'Checking a signal', (r) => (r.result === 'confirmed' ? 'Checked: it happened.' : r.result === 'not_true' ? 'Checked: the alert was wrong.' : 'Intent data cannot be checked against a public source.')));
  on(root, 'click', '[data-dismiss]', (e, el) => act((st) => dismissSignal(st, el.dataset.dismiss), HOURS.dismissSignal, 'Signal triage'));
  on(root, 'click', '[data-act-sig]', (e, el) => {
    const sig = ensureAbm(s).signals.find((x) => x.id === el.dataset.actSig);
    const acc = sig && accountById(s, sig.accountId);
    if (!acc) return;
    ui.draft = { accountId: acc.id, memberKey: (sig.personKey && acc.members.find((m) => m.key === sig.personKey && m.found)?.key) || acc.members.find((m) => m.found && !m.optedOut)?.key || '', signalId: sig.id, text: '' };
    ctx.navigate('crm', `abm:${acc.id}`);
  });
  on(root, 'click', '#setAds', () => { const v = Number(root.querySelector('#adsBudget')?.value || 0); const first = !ensureAbm(s).ads.monthly && v > 0; act((st) => setAdsBudget(st, v), first ? HOURS.adsSetup : 0, 'Matched-account ads', v ? `Budget set: ${money(v)}/month.` : 'Ads stopped.'); });
  // Cluster
  on(root, 'change', '#clSeg', (e, el) => { ui.cluster.segment = el.value; ui.cluster.sel = new Set(); ctx.render(); });
  on(root, 'change', '[data-clsel]', (e, el) => { el.checked ? ui.cluster.sel.add(el.dataset.clsel) : ui.cluster.sel.delete(el.dataset.clsel); ctx.render(); });
  on(root, 'input', '#clText', (e, el) => { ui.cluster.text = el.value; });
  on(root, 'click', '#clRun', () => {
    const ids = [...ui.cluster.sel];
    const cl = ensureAbm(s).clusters[ui.cluster.segment || 'all'];
    const hours = (cl?.text === ui.cluster.text ? 0 : HOURS.clusterAsset) + ids.length * HOURS.clusterSend;
    act((st) => runClusterPlay(st, ui.cluster.segment || 'all', ids, ui.cluster.text), +hours.toFixed(2), 'Cluster play (1:few)', (r) => `Sent to ${r.sent.length} account(s)${r.skipped.length ? `; skipped ${r.skipped.length} (nobody found or burned)` : ''}.`);
  });
  if (!id || ['add', 'sources', 'cluster'].includes(id)) return;
  // Account page
  const acc = accountById(s, id);
  if (!acc) return;
  on(root, 'click', '#saveReason', () => act((st) => setReason(st, acc.id, root.querySelector('#acctReason')?.value ?? ''), 0, 'Target accounts', 'Saved.'));
  on(root, 'click', '#dropAcct', () => act((st) => dropTarget(st, acc.id), 0, 'Target accounts', 'Removed from targets.'));
  on(root, 'click', '[data-research]', (e, el) => act((st) => researchAccount(st, acc.id, el.dataset.research), el.dataset.research === 'deep' ? HOURS.researchDeep : HOURS.researchLight, 'Account research', (r) => r.found.join(' · ')));
  on(root, 'click', '[data-find]', (e, el) => act((st) => findMember(st, acc.id, el.dataset.find), HOURS.findPerson, 'Mapping the buying group', (r) => r.text));
  on(root, 'change', '#dTo', (e, el) => { ui.draft.memberKey = el.value; });
  on(root, 'change', '#dSig', (e, el) => { ui.draft.signalId = el.value; });
  on(root, 'input', '#dText', (e, el) => { ui.draft.text = el.value; });
  on(root, 'click', '#dCheck', () => {
    const m = acc.members.find((x) => x.key === ui.draft.memberKey);
    if (!m) return;
    const j = judgeMessage(s, acc, m, ui.draft.text);
    // Before sending you only learn what the wording shows, not whether a signal is true (that needs a check or a reply).
    const notes = j.notes.filter((n) => !/not true|actually working on/.test(n));
    if (j.flags.template) notes.push('This reads like a template you used elsewhere.');
    ui.check = { accountId: acc.id, notes: [...new Set(notes)] };
    ctx.render();
  });
  on(root, 'click', '#dSend', () => ctx.act(async (st) => {
    const ac = accountById(st, acc.id);
    const m = ac.members.find((x) => x.key === ui.draft.memberKey);
    if (!m) throw new Error('Pick who to write to.');
    let llmScore = null;
    if (ctx.llm?.ask) {
      const fallback = () => ({ specificity: 0.5, relevance: 0.5, comment: 'offline' });
      try {
        const r = await ctx.llm.ask({
          task: 'abm_message_judge',
          system: `You are ${m.first} ${m.last}, ${m.title} at a ${ac.employees}-person ${ac.industry.toLowerCase()} company. You get many vendor emails and reply to few. Judge only the writing in front of you.`,
          prompt: `Score this message from a vendor you do not know.\n\n${ui.draft.text}\n\nspecificity: 0-1, how specific to you and your company it is (not to companies in general). relevance: 0-1, how relevant the problem it raises is to someone in your role. comment: one short sentence.`,
          schema: { type: 'object', additionalProperties: false, required: ['specificity', 'relevance', 'comment'], properties: { specificity: { type: 'number' }, relevance: { type: 'number' }, comment: { type: 'string' } } },
          fallback, cache: st.cache,
        });
        if (r && !r.mock && r.data) llmScore = (Number(r.data.specificity) + Number(r.data.relevance)) / 2;
      } catch { llmScore = null; }
    }
    const res = sendTouch(st, ac.id, m.key, { text: ui.draft.text, signalId: ui.draft.signalId || null, llmScore });
    ui.draft.text = '';
    ui.check = null;
    toast(`Sent to ${m.first}. Message score ${Math.round(res.touch.q * 100)}/100${llmScore == null ? ' (offline judge)' : ''}. Replies usually come within a few days.`, 'good');
    return res;
  }, { hours: HOURS.message, label: 'Writing a personal note' }));
}

/** Badge for the CRM tab: unread signals from the last 3 days. */
export function abmBadge(s) {
  const a = s.apps?.crm?.abm;
  if (!a) return 0;
  return a.signals.filter((x) => x.seenDay <= s.day && s.day - x.seenDay <= 3 && !x.dismissed && x.actedDay == null && x.accountId && !x.unpaid).length;
}
