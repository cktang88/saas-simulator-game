// Outreach -> LinkedIn: a Sales Navigator-style workspace (sub-tabs) on top of sales/linkedin.js.
// Start here (numbered guide) | Warm signals | Search | Saved leads | Conversations | Account health | CRM contacts.
// Every action charges founder hours through ctx.act; sends are judged (LLM when live, heuristic offline).
import { html, on, stat, badge, table, toast } from '../../core/ui.js';
import { money, pct } from '../../core/util.js';
import { SALES } from './params.js';
import { ensureCrm, contactName, companyById } from './model.js';
import { BUYER_SEGMENTS } from './segments.js';
import * as LI from './linkedin.js';

const SUBS = [['guide', 'Start here'], ['warm', 'Warm signals'], ['search', 'Search'], ['leads', 'Saved leads'], ['convos', 'Conversations'], ['health', 'Account health'], ['crm', 'CRM contacts']];
const drafts = {}; // `${kind}:${id}` -> text
let filters = { ...LI.LI_FILTERS };
let openId = null;
let lastJudge = null; // { id, kind, judge }

const SIG_LABEL = { commented_your_post: ['commented on your post', 'good'], liked_your_post: ['reacted to your post', 'good'], competitor_engager: ['engaged with a competitor post', 'accent'], viewed_you: ['viewed your profile', 'good'], job_change: ['new role (90 days)', 'accent'], you_commented: ['you commented on their post', ''], shared: ['shared experience', 'accent'], posted_recently: ['posted recently', ''] };

function personStatus(s, p) {
  const L = LI.ensureLinkedin(s);
  const r = L.people[p.id] ?? {};
  const req = [...L.requests].reverse().find((x) => x.personId === p.id);
  const ct = r.contactId ? s.apps.crm?.contacts?.find((c) => c.id === r.contactId) : null;
  if (ct?.replyKind) return badge(`replied: ${ct.replyKind.replace('_', ' ')}`, ['interested', 'curious'].includes(ct.replyKind) ? 'good' : '');
  if (r.connected) return badge(r.dms ? 'messaged' : 'connected', 'good');
  if (req) return badge(req.status, req.status === 'ignored' || req.status === 'withdrawn' ? 'bad' : '');
  if (r.inmails) return badge('InMail sent');
  return html`<span class="small muted">${r.viewedDay != null ? 'profile viewed' : 'not contacted'}</span>`;
}

function flagBadges(s, p) {
  const f = LI.visibleFlags(s, p);
  const out = [];
  if (f.engaged) out.push(badge(f.engaged.competitor ? 'engaged with a competitor post' : `${f.engaged.how} your post`, f.engaged.competitor ? 'accent' : 'good'));
  if (f.viewedYou != null) out.push(badge('viewed your profile', 'good'));
  if (f.jobChange) out.push(badge('new role', 'accent'));
  if (f.posted) out.push(badge('posted in 30 days'));
  if (f.shared) out.push(badge(f.shared, 'accent'));
  if (f.follows) out.push(badge('follows your company'));
  if (LI.ensureLinkedin(s).people[p.id]?.saved) out.push(badge('saved'));
  return out;
}

function peopleTable(s, people, empty) {
  return table({
    rows: people, empty,
    columns: [
      { label: 'Person', render: (p) => html`<a href="#" data-liopen="${p.id}"><b>${p.name}</b></a><div class="small muted">${p.title} · ${p.companyName}${p.employees ? ` · ${p.employees} staff` : ''}${p.geo ? ` · ${p.geo}` : ''}</div><div class="small muted">${p.segLabel ?? ''}</div>` },
      { label: 'What LinkedIn shows', render: (p) => html`${flagBadges(s, p)}` },
      { label: 'Status', render: (p) => personStatus(s, p) },
      { label: '', render: (p) => html`<button class="sm" data-liopen="${p.id}">Open</button>` },
    ],
  });
}

/** The working panel for one person: profile, warm-up comment, note, DM, InMail. */
export function personPanel(s, id) {
  const p = LI.personOf(s, id);
  if (!p) return '';
  const L = LI.ensureLinkedin(s);
  const r = L.people[id] ?? {};
  const prof = LI.profileOf(s, p);
  const w = LI.liWindow(s);
  const pending = L.requests.some((x) => x.personId === id && x.status === 'pending');
  const ct = r.contactId ? s.apps.crm?.contacts?.find((c) => c.id === r.contactId) : (p.contactId ? s.apps.crm?.contacts?.find((c) => c.id === p.contactId) : null);
  const connected = r.connected || ct?.linkedinConnected;
  const maxNote = L.salesNav ? LI.LI.noteChars.nav : LI.LI.noteChars.free;
  const notesUsed = L.requests.filter((x) => x.note && x.day > s.day - 30).length;
  const noteBlocked = !L.salesNav && notesUsed >= SALES.linkedin.freeNotesPerMonth;
  const connectWhy = w.blocked ?? (connected ? 'Already connected.' : pending ? 'Request pending.' : !w.left ? `Weekly limit reached (${w.limit}).` : '');
  const dmWhy = w.blocked ?? (!connected ? 'Only connections can be messaged: connect first, or use InMail.' : ct?.replyKind ? 'They replied: answer in Outreach → Replies.' : '');
  const inmailWhy = w.blocked ?? (!L.salesNav ? 'InMail needs Sales Navigator (Account health).' : L.inmail.credits <= 0 ? 'No InMail credits left this month.' : connected ? 'You are connected: a DM is free.' : '');
  const commentWhy = r.viewedDay == null ? 'Open the profile first to see their recent activity.' : !prof?.topic ? 'No recent post to comment on.' : r.commentDay != null ? 'You already commented on their latest post.' : '';
  const j = lastJudge?.id === id ? lastJudge : null;
  const d = (k) => drafts[`${k}:${id}`] ?? '';
  return html`<section class="panel" id="liPanel">
    <div class="app-head"><div><h2>${p.name}</h2><p class="small muted">${p.title} · ${p.companyName}${p.employees ? ` · ${p.employees} staff` : ''}${p.geo ? ` · ${p.geo}` : ''}</p><div>${flagBadges(s, p)} ${personStatus(s, p)}</div></div>
      <div class="app-actions"><button class="sm" data-lisave="${id}">${r.saved ? 'Unsave lead' : 'Save lead'}</button><button class="sm" data-liclose="1">Close</button></div></div>
    ${prof ? html`<div class="callout"><b>Profile.</b> ${prof.headline}. ${prof.activity}.${prof.jobChange ? html` ${prof.jobChange}.` : ''}${prof.shared ? html` ${prof.shared}.` : ''}</div>`
    : html`<p><button class="primary sm" data-liview="${id}">View profile (2 min)</button> <span class="small muted">See their headline, recent posts and experience. They can see that you looked.</span></p>`}
    ${j ? html`<div class="callout ${j.judge.q >= 0.65 ? 'good' : j.judge.q < 0.4 ? 'bad' : 'warn'}"><b>Your last ${j.kind} read as ${Math.round(j.judge.q * 100)}/100${j.judge.llmWhy ? '' : ' (offline judge)'}.</b> ${j.judge.specific ? 'References something true about them. ' : ''}${j.judge.reasons.length ? j.judge.reasons.join('; ') : 'Short and human.'}${j.judge.llmWhy ? html`<div class="small muted">${j.judge.llmWhy}</div>` : ''}</div>` : ''}
    <div class="grid-2">
      <div>
        <h3>1. Warm up: comment on their post (7 min)</h3>
        <textarea rows="3" data-lidraft="comment:${id}" placeholder="Add a point of view or a question about what they wrote. Generic praise is invisible." ${commentWhy ? 'disabled' : ''}>${d('comment')}</textarea>
        <button class="sm" data-licomment="${id}" ${commentWhy ? 'disabled' : ''} title="${commentWhy}">Post comment</button>${commentWhy ? html`<div class="small muted">${commentWhy}</div>` : ''}
        <h3>2. Connect (${'≤'}${maxNote} characters)</h3>
        <textarea rows="2" maxlength="${maxNote}" data-lidraft="note:${id}" placeholder="Optional. One true, specific line about them. No pitch." ${noteBlocked ? 'disabled' : ''}>${noteBlocked ? '' : d('note')}</textarea>
        <button class="sm" data-liconnect="${id}" ${connectWhy ? 'disabled' : ''} title="${connectWhy}">Send request (${noteBlocked || !d('note') ? '1' : '3'} min)</button>
        ${connectWhy ? html`<div class="small muted">${connectWhy}</div>` : noteBlocked ? html`<div class="small muted">Free accounts get about ${SALES.linkedin.freeNotesPerMonth} personalized notes a month (used ${notesUsed}); this request goes without a note.</div>` : ''}
      </div>
      <div>
        <h3>3. Message after they accept (6 min)</h3>
        <textarea rows="4" data-lidraft="dm:${id}" placeholder="Short, about them, one question. Reference what they engaged with." ${dmWhy ? 'disabled' : ''}>${d('dm')}</textarea>
        <button class="sm" data-lidm="${id}" ${dmWhy ? 'disabled' : ''} title="${dmWhy}">Send message</button> <button class="sm" data-livoice="${id}" ${dmWhy ? 'disabled' : ''} title="${dmWhy || 'Record it on your phone (4 min)'}">Send as voice note</button>
        ${dmWhy ? html`<div class="small muted">${dmWhy}</div>` : ''}
        <h3>Or InMail (${L.salesNav ? `${L.inmail.credits} credits` : 'Sales Navigator'})</h3>
        <textarea rows="3" data-lidraft="inmail:${id}" placeholder="Reach someone you are not connected to. A credit comes back if they reply." ${inmailWhy ? 'disabled' : ''}>${d('inmail')}</textarea>
        <button class="sm" data-liinmail="${id}" ${inmailWhy ? 'disabled' : ''} title="${inmailWhy}">Send InMail (7 min)</button>${inmailWhy ? html`<div class="small muted">${inmailWhy}</div>` : ''}
      </div>
    </div>
  </section>`;
}

function guideView(s) {
  const L = LI.ensureLinkedin(s);
  const posts = (s.apps.organic?.posts ?? []).filter((p) => p.platform === 'linkedin' && p.day > s.day - 30);
  const engagers = LI.yourPosts(s).reduce((a, x) => a + x.engagers.length, 0);
  const viewers = new Set(L.viewers.filter((v) => v.day > s.day - 30).map((v) => v.id)).size;
  const st = LI.liStats(s, 30);
  const waiting = Object.values(L.people).filter((r) => r.connected && !r.dms).length;
  const w = LI.liWindow(s);
  const step = (n, title, body, link, label, done) => html`<li class="card" style="margin-bottom:8px"><div><b>${n}. ${title}</b> ${done ? badge(done, 'good') : ''}</div><div class="small">${body}</div>${link ? html`<a href="${link}">${label} →</a>` : ''}</li>`;
  return html`<section class="panel"><h2>How to find high-intent buyers on LinkedIn</h2>
    <p class="small muted">Cold connection requests average about 28% acceptance and ~10% replies (Expandi, 13.2M requests 2025-26). People who already engaged with you reply roughly three times as often. The work is finding those people and saying something true to them.</p>
    <ol style="list-style:none;padding:0">
      ${step(1, 'Post about your buyer\'s problem', 'Two or three posts a week about the problem your buyer has (not your features). Buyers who engage become your warmest list; product posts mostly attract peers, vendors and engagement bots.', '#/organic/social', 'Write a LinkedIn post', posts.length ? `${posts.length} post(s) in 30 days` : '')}
      ${step(2, 'Work the warm list first', 'People who commented on or reacted to your posts, viewed your profile, engaged with a competitor\'s post, or just started a new role. Open each profile: most engagers are not buyers.', '#/outreach/linkedin:warm', 'Warm signals', engagers || viewers ? `${engagers} engagers · ${viewers} viewers` : '')}
      ${step(3, 'Search with buyer filters plus one intent filter', 'Industry, seniority and company size narrow to buyers; "posted in 30 days", "changed jobs in 90 days" or "viewed your profile" narrow to people who are active and reachable. Intent filters need Sales Navigator.', '#/outreach/linkedin:search', 'Search', L.salesNav ? 'Sales Navigator on' : '')}
      ${step(4, 'View the profile and warm up', 'Read their recent activity. A thoughtful comment on their post (a point of view, not "great post") makes your name familiar before you connect.', '', '', '')}
      ${step(5, 'Connect with a short, true note', 'Reference one real thing about them: what they posted, what they engaged with, the new role. No pitch, no links. Inactive members accept late or never.', '', '', st.acceptance != null ? `acceptance ${pct(st.acceptance, 0)} (30d)` : '')}
      ${step(6, 'Message after they accept', 'A short, value-first message about them with one question. Talk about the product when they ask. Replies land in Outreach → Replies and the CRM.', '#/outreach/linkedin:convos', 'Conversations', waiting ? `${waiting} new connection(s) to message` : '')}
      ${step(7, 'Keep the account healthy', `About ${w.limit} invitations a week. Pitches, templates and strangers get "I don't know this person" reports; automation tools get accounts flagged, restricted and eventually closed.`, '#/outreach/linkedin:health', 'Account health', w.blocked ? '' : 'no restrictions')}
      ${step(8, 'Warm intros and referrals beat all of it', 'If someone you know knows the buyer, ask for a specific, forwardable intro instead of connecting cold.', '#/crm', 'CRM (warm intros)', '')}
    </ol></section>`;
}

function warmView(s) {
  const L = LI.ensureLinkedin(s);
  const posts = LI.yourPosts(s);
  const viewers = [...new Map(L.viewers.filter((v) => v.day > s.day - 30 && v.day <= s.day).map((v) => [v.id, v])).values()].reverse();
  const comp = LI.competitorPosts(s);
  let jobs = null;
  if (L.salesNav) { try { jobs = LI.searchPeople(s, { ...LI.LI_FILTERS, jobChange: true, segment: filters.segment, seniority: filters.seniority }, { limit: 15 }).people; } catch { jobs = []; } }
  return html`
    <section class="panel"><h2>Engaged with your posts (60 days)</h2>
      ${posts.length ? posts.map((x) => html`<details style="margin-bottom:8px" ${x.engagers.length ? 'open' : ''}><summary><b>${x.post.text.slice(0, 90)}${x.post.text.length > 90 ? '…' : ''}</b> <span class="small muted">${x.post.reach?.toLocaleString?.() ?? 0} views · ${x.post.engagements ?? 0} engagements</span></summary>
        ${peopleTable(s, x.engagers.map((e) => LI.personOf(s, e.id)).filter(Boolean), 'Nobody engaged with this post yet.')}</details>`)
      : html`<p class="empty">No LinkedIn posts in the last 60 days. The people who engage with a post about your buyer's problem are the warmest list on LinkedIn. <a href="#/organic/social">Write a post →</a></p>`}
    </section>
    <section class="panel"><h2>Viewed your profile (30 days)</h2>
      ${peopleTable(s, viewers.map((v) => LI.personOf(s, v.id)).filter(Boolean).slice(0, 25), 'Nobody yet. Views follow your posts, comments and the profiles you open.')}
    </section>
    <section class="panel"><h2>Engaged with competitor posts this week</h2>
      <p class="small muted">People evaluating the category. Reference the problem they care about, never that you watched them engage with a competitor.</p>
      ${comp.map((c) => html`<details style="margin-bottom:8px"><summary><b>${c.text}</b> <span class="small muted">${c.engagers.length} engagers</span></summary>${peopleTable(s, c.engagers.map((e) => LI.personOf(s, e.id)).filter(Boolean), 'No engagers.')}</details>`)}
    </section>
    <section class="panel"><h2>Changed jobs in the last 90 days</h2>
      ${jobs ? peopleTable(s, jobs, 'No job changes match your current search filters.') : html`<p class="empty">Job-change tracking is a Sales Navigator filter. <a href="#/outreach/linkedin:health">Turn on Sales Navigator →</a></p>`}
    </section>`;
}

function searchView(s) {
  const L = LI.ensureLinkedin(s);
  const nav = Boolean(L.salesNav);
  let res = { people: [], total: 0 }, err = '';
  try { res = LI.searchPeople(s, filters, { limit: 25 }); } catch (e) { err = e.message; }
  const chk = (k, label, needNav) => html`<label title="${needNav && !nav ? 'Sales Navigator filter' : ''}"><input type="checkbox" name="${k}" ${filters[k] ? 'checked' : ''} ${needNav && !nav ? 'disabled' : ''} /> ${label}${needNav && !nav ? html` <span class="small muted">(Sales Navigator)</span>` : ''}</label>`;
  return html`<section class="panel"><h2>Lead search</h2>
    <form id="liSearch" class="grid-3">
      <label>Title keywords <input name="title" value="${filters.title}" placeholder="owner, head of finance" /></label>
      <label>Industry <select name="segment"><option value="">Any</option>${BUYER_SEGMENTS.map((x) => html`<option value="${x.id}" ${filters.segment === x.id ? 'selected' : ''}>${x.label}</option>`)}</select></label>
      <label>Geography <select name="geo"><option value="">Any</option><option value="US" ${filters.geo === 'US' ? 'selected' : ''}>United States</option><option value="intl" ${filters.geo === 'intl' ? 'selected' : ''}>Outside the US</option></select></label>
      <label>Company size from <input name="minEmp" type="number" min="0" value="${filters.minEmp}" /></label>
      <label>to <input name="maxEmp" type="number" min="0" value="${filters.maxEmp}" /></label>
      <div><div class="small">Seniority</div>${Object.entries(LI.SENIORITY).map(([k, v]) => html`<label class="small"><input type="checkbox" name="sen_${k}" ${filters.seniority?.includes(k) ? 'checked' : ''} /> ${v}</label> `)}</div>
      <div><div class="small">Intent and relationship</div>
        ${chk('jobChange', 'Changed jobs in 90 days', true)}<br />${chk('posted', 'Posted on LinkedIn in 30 days', true)}<br />${chk('follows', 'Follows your company', true)}<br />
        ${chk('viewed', 'Viewed your profile', false)}<br />${chk('engaged', 'Engaged with your posts', false)}<br />${chk('shared', 'Shared experiences (TeamLink)', true)}<br />${chk('excludeContacted', 'Hide people already contacted', false)}</div>
      <div><button class="primary">Search (6 min)</button> ${nav ? html`<button type="button" class="sm" id="liSaveSearch">Save search + alert</button>` : ''}</div>
    </form>
    ${err ? html`<div class="callout warn">${err}</div>` : html`<p class="small muted">${res.total.toLocaleString()} result(s)${res.total > 25 ? '; showing the first 25. Narrow the filters to get to buyers who are active.' : '.'}</p>`}
    ${peopleTable(s, res.people, 'No one matches. Loosen a filter.')}
  </section>`;
}

function leadsView(s) {
  const L = LI.ensureLinkedin(s);
  const saved = Object.entries(L.people).filter(([, r]) => r.saved).map(([id]) => LI.personOf(s, id)).filter(Boolean);
  const alerts = L.alerts.filter((a) => a.day > s.day - 30).slice().reverse();
  return html`<section class="panel"><h2>Saved leads</h2>${peopleTable(s, saved, 'No saved leads. Open a person and click Save lead to track them.')}</section>
    <section class="panel"><h2>Alerts (30 days)</h2>
      ${L.salesNav ? (alerts.length ? html`<ul class="list">${alerts.map((a) => html`<li><a href="#" data-liopen="${a.id}">${a.text}</a> <span class="small muted">day ${a.day}</span></li>`)}</ul>` : html`<p class="empty">No alerts yet. Saved leads that change jobs or post show up here.</p>`) : html`<p class="empty">Lead alerts are a Sales Navigator feature. <a href="#/outreach/linkedin:health">Account health →</a></p>`}
      ${L.savedSearches.length ? html`<h3>Saved searches</h3><ul class="list">${L.savedSearches.map((x) => html`<li>${x.name} <button class="sm" data-lirun="${x.id}">Run</button></li>`)}</ul>` : ''}
    </section>`;
}

function convosView(s) {
  const L = LI.ensureLinkedin(s);
  const ids = Object.entries(L.people).filter(([, r]) => r.requestedDay != null || r.connected || r.inmails).map(([id]) => id);
  const people = ids.map((id) => LI.personOf(s, id)).filter(Boolean).sort((a, b) => (L.people[b.id].connected && !L.people[b.id].dms ? 1 : 0) - (L.people[a.id].connected && !L.people[a.id].dms ? 1 : 0));
  return html`<section class="panel"><h2>Conversations</h2><p class="small muted">New connections waiting for a first message are listed first. Replies arrive in <a href="#/outreach/replies">Outreach → Replies</a> and create CRM deals.</p>
    ${peopleTable(s, people, 'Nobody contacted on LinkedIn yet. Start with Warm signals.')}</section>`;
}

function healthView(s) {
  const L = LI.ensureLinkedin(s);
  const w = LI.liWindow(s);
  const st = LI.liStats(s, 30);
  const H = L.health;
  const reports = H.reports.filter((d) => d > s.day - 30).length;
  const hz = LI.restrictionHazard(s);
  const A = L.auto;
  return html`${w.blocked ? html`<div class="callout bad">${w.blocked}</div>` : ''}
    <section class="panel"><h2>Account health</h2><div class="stats">
      ${stat('Invitations this week', `${w.recent} / ${w.limit}`, 'rolling 7 days', w.left ? '' : 'warn')}
      ${stat('Acceptance (last 40)', w.acceptance == null ? '—' : pct(w.acceptance, 0), 'under ~30% LinkedIn lowers the limit', w.acceptance != null && w.acceptance < 0.3 ? 'bad' : '')}
      ${stat('Reports (30d)', reports, '"I don\'t know this person"', reports > 2 ? 'bad' : '')}
      ${stat('Restriction risk', hz >= 0.03 ? 'high' : hz > 0.005 ? 'elevated' : 'low', H.events.length ? `${H.events.length} past event(s)` : 'no events', hz >= 0.03 ? 'bad' : hz > 0.005 ? 'warn' : 'good')}
      ${stat('Replies (30d)', st.replies, st.replyRate == null ? '' : `${pct(st.replyRate, 0)} of messages · ${st.positive} positive`)}
    </div>
    <p class="hint">LinkedIn publishes no limit; about 100 invitations per rolling week is what most accounts observe in 2026, less after restrictions. Escalation is a warning, then a restriction of a week or more, then a closed account.</p></section>
    <section class="panel"><h2>Sales Navigator</h2>
      ${L.salesNav ? html`<p>${badge('active', 'good')} ${money(SALES.linkedin.salesNavMonthly)}/month · ${L.inmail.credits} InMail credits · intent filters, saved searches and alerts. <button class="sm" id="liNavOff">Cancel</button></p>`
      : html`<p class="muted">Lead filters for job changes, recent posts, followers and shared experiences; saved searches and alerts; ${LI.LI.inmailCredits} InMail credits a month; 300-character notes. ${money(SALES.linkedin.salesNavMonthly)}/month.</p><button class="primary" id="liNavOn">Subscribe (${money(SALES.linkedin.salesNavMonthly)}/mo)</button>`}
    </section>
    <section class="panel"><h2>Automation tool</h2>
      <p class="small muted">Expandi/Dripify-style tools send connection requests with a template note to your current search, without your time. Automation is against LinkedIn's terms; machine timing, templates and low acceptance are what get accounts flagged. ${money(LI.LI.autoMonthly)}/month.</p>
      ${A.on ? html`<p>${badge('running', 'warn')} ${A.perDay}/day · ${A.sent} sent so far. <button class="sm danger" id="liAutoOff">Turn off</button></p>`
      : html`<form id="liAuto" class="inline"><label>Per day <input name="perDay" type="number" min="1" max="100" value="20" /></label><label>Template note <input name="note" placeholder="Hi {{firstName}}, ..." /></label><button class="sm">Start on current search</button></form>`}
    </section>`;
}

function crmView(s) {
  const crm = ensureCrm(s);
  const withLi = crm.contacts.filter((c) => c.linkedin && !c.hidden && c.source !== 'linkedin');
  return html`<section class="panel"><h2>CRM contacts with a LinkedIn profile</h2>${table({
    rows: withLi, empty: 'No CRM contacts with a LinkedIn URL. Add one on the contact (CRM) or map the column on import.',
    columns: [
      { label: 'Prospect', render: (c) => html`<a href="#" data-liopen="ct:${c.id}"><b>${contactName(c)}</b></a><div class="small muted">${c.title} · ${companyById(s, c.companyId)?.name ?? ''}</div>` },
      { label: 'Status', render: (c) => (c.replyKind ? badge(`replied: ${c.replyKind.replace('_', ' ')}`) : c.linkedinConnected ? badge('connected', 'good') : badge('not connected')) },
      { label: '', render: (c) => html`<button class="sm" data-liopen="ct:${c.id}">Open</button>` },
    ],
  })}</section>`;
}

export function linkedinView(s, o, sub = 'guide') {
  LI.ensureLinkedin(s);
  const k = SUBS.some(([x]) => x === sub) ? sub : 'guide';
  const body = k === 'warm' ? warmView(s) : k === 'search' ? searchView(s) : k === 'leads' ? leadsView(s) : k === 'convos' ? convosView(s) : k === 'health' ? healthView(s) : k === 'crm' ? crmView(s) : guideView(s);
  const w = LI.liWindow(s);
  return html`<div class="tabs small">${SUBS.map(([x, l]) => html`<a href="#/outreach/linkedin:${x}" class="${x === k ? 'active' : ''}">${l}</a>`)}</div>
    <p class="small muted">${w.blocked ? html`${badge('restricted', 'bad')} ` : ''}Invitations ${w.recent}/${w.limit} this week · ${LI.ensureLinkedin(s).salesNav ? 'Sales Navigator' : 'free account'}</p>
    ${openId ? personPanel(s, openId) : ''}
    ${body}`;
}

export function wireLinkedin(root, ctx, sub = 'guide') {
  const s = ctx.state;
  const judgeOf = async (st, id, kind) => {
    const p = LI.personOf(st, id);
    const j = await LI.judgeWithLlm(ctx.llm, st, p, drafts[`${kind}:${id}`] ?? '', kind);
    lastJudge = { id, kind, judge: j };
    return j;
  };
  on(root, 'click', '[data-liopen]', (e, el) => { e.preventDefault(); openId = el.dataset.liopen; ctx.render(); globalThis.scrollTo?.(0, 0); });
  on(root, 'click', '[data-liclose]', () => { openId = null; lastJudge = null; ctx.render(); });
  on(root, 'input', '[data-lidraft]', (e, el) => { drafts[el.dataset.lidraft] = el.value; });
  on(root, 'click', '[data-liview]', (e, el) => ctx.act((st) => { LI.viewProfile(st, el.dataset.liview); }, { hours: LI.LI.hours.view, label: 'LinkedIn prospecting' }));
  on(root, 'click', '[data-lisave]', (e, el) => ctx.act((st) => { LI.saveLead(st, el.dataset.lisave); }, { hours: LI.LI.hours.save, label: 'LinkedIn prospecting' }));
  on(root, 'click', '[data-licomment]', (e, el) => {
    const id = el.dataset.licomment;
    if (!(drafts[`comment:${id}`] ?? '').trim()) return toast('Write the comment first.', 'warn');
    ctx.act(async (st) => { const j = await judgeOf(st, id, 'comment'); LI.commentOn(st, id, drafts[`comment:${id}`]); lastJudge = { id, kind: 'comment', judge: j }; delete drafts[`comment:${id}`]; }, { hours: LI.LI.hours.comment, label: 'LinkedIn engagement' });
  });
  on(root, 'click', '[data-liconnect]', (e, el) => {
    const id = el.dataset.liconnect;
    const L = LI.ensureLinkedin(s);
    const noteBlocked = !L.salesNav && L.requests.filter((x) => x.note && x.day > s.day - 30).length >= SALES.linkedin.freeNotesPerMonth;
    const note = noteBlocked ? '' : (drafts[`note:${id}`] ?? '').trim();
    ctx.act(async (st) => { const j = note ? await judgeOf(st, id, 'note') : null; LI.sendConnect(st, id, note, { judge: j }); delete drafts[`note:${id}`]; }, { hours: note ? LI.LI.hours.note : LI.LI.hours.connect, label: 'LinkedIn outreach' });
  });
  const dm = (id, voice) => ctx.act(async (st) => { const j = await judgeOf(st, id, 'dm'); LI.sendDm(st, id, drafts[`dm:${id}`] ?? '', { voice, judge: j }); delete drafts[`dm:${id}`]; }, { hours: voice ? LI.LI.hours.voice : LI.LI.hours.dm, label: 'LinkedIn outreach' });
  on(root, 'click', '[data-lidm]', (e, el) => dm(el.dataset.lidm, false));
  on(root, 'click', '[data-livoice]', (e, el) => dm(el.dataset.livoice, true));
  on(root, 'click', '[data-liinmail]', (e, el) => {
    const id = el.dataset.liinmail;
    ctx.act(async (st) => { const j = await judgeOf(st, id, 'inmail'); LI.sendInMail(st, id, drafts[`inmail:${id}`] ?? '', { judge: j }); delete drafts[`inmail:${id}`]; }, { hours: LI.LI.hours.inmail, label: 'LinkedIn outreach' });
  });
  on(root, 'submit', '#liSearch', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    filters = { title: fd.get('title') ?? '', segment: fd.get('segment') ?? '', geo: fd.get('geo') ?? '', minEmp: fd.get('minEmp') ?? '', maxEmp: fd.get('maxEmp') ?? '', seniority: Object.keys(LI.SENIORITY).filter((k) => fd.get(`sen_${k}`) === 'on'), ...Object.fromEntries(['jobChange', 'posted', 'follows', 'viewed', 'engaged', 'shared', 'excludeContacted'].map((k) => [k, fd.get(k) === 'on'])) };
    ctx.act(() => {}, { hours: LI.LI.hours.search, label: 'LinkedIn prospecting' });
  });
  on(root, 'click', '#liSaveSearch', () => ctx.act((st) => { LI.saveSearch(st, `${filters.title || 'Search'} ${filters.segment || ''}`.trim(), filters); toast('Saved. Alerts appear under Saved leads.', 'good'); }, { hours: LI.LI.hours.alert, label: 'LinkedIn prospecting' }));
  on(root, 'click', '[data-lirun]', (e, el) => { const x = LI.ensureLinkedin(s).savedSearches.find((q) => q.id === el.dataset.lirun); if (x) { filters = { ...LI.LI_FILTERS, ...x.filters }; ctx.navigate('outreach', 'linkedin:search'); } });
  on(root, 'click', '#liNavOn', () => ctx.act((st) => LI.setSalesNav(st, true), { hours: 0.1, label: 'LinkedIn setup' }));
  on(root, 'click', '#liNavOff', () => ctx.act((st) => LI.setSalesNav(st, false)));
  on(root, 'submit', '#liAuto', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    ctx.act((st) => { LI.setAutomation(st, { on: true, perDay: Number(fd.get('perDay')) || 20, note: String(fd.get('note') ?? ''), filters: { ...filters } }); }, { hours: LI.LI.hours.autoSetup, label: 'LinkedIn setup' });
  });
  on(root, 'click', '#liAutoOff', () => ctx.act((st) => { LI.setAutomation(st, { on: false }); }));
  void sub;
}
