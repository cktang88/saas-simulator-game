// Owned audience: waitlist, newsletter, signup forms and lead magnets, consent, hygiene, growth tactics, launches to the
// list and sponsorship. founder.network.newsletter is the active list size. Engine: audience/model.js.
// Research: docs/research/plg-email/p3-lists-newsletters.md.

import { html, mount, on, formData, toast, table } from '../core/ui.js';
import { pct, money, round2 } from '../core/util.js';
import { registerOperatorReader } from '../core/operator.js';
import { NEWSLETTER_SYSTEM, NEWSLETTER_SCHEMA, issueHeuristic, issueScore } from './audience/judge.js';
import {
  PLATFORMS, AUD, ensureAudience, audienceDay, audienceMetrics, audienceOperatorRead, setupList, setCompliance, addForm, createMagnet, setWaitlist, setReferrals,
  setNurture, promote, purchaseList, buyAds, swap, sunset, processUnsubscribes, sendIssue, launchToList, queueSponsor, lintIssue, totalActive, engagedCount,
} from './audience/model.js';
import { NEWSLETTER_CRITERIA } from './growth/rubrics.js';

export { audienceEvents, AUDIENCE_ACTIONS } from './audience/model.js';
registerOperatorReader('owned_audience', audienceOperatorRead);

const TABS = [['setup', 'Setup & consent'], ['capture', 'Forms & magnets'], ['write', 'Write'], ['grow', 'Grow'], ['clean', 'List health'], ['launch', 'Launch & sponsors']];
const ui = { subject: '', body: '', kind: 'value', segment: 'engaged', ls: '', lb: '' };

async function judgeIssue(ctx, subject, body) {
  const res = await ctx.llm.ask({
    task: 'newsletter_issue_judge', rubric: NEWSLETTER_CRITERIA,
    system: NEWSLETTER_SYSTEM,
    prompt: `Subject: ${subject}\n\n${body.slice(0, 4000)}\n\nScore each criterion, quote evidence for the low ones, and give the one fix a stellar editor would make first.`,
    schema: NEWSLETTER_SCHEMA, temperature: 0.3, maxTokens: 600,
    fallback: () => issueHeuristic(ctx.state, { subject, body }),
  });
  return res.mock ? null : { score: issueScore(res.data), fix: res.data.fix };
}

function header(s, A) {
  const m = audienceMetrics(s);
  return html`<div class="stats">
    <div class="stat"><div class="stat-label">List size</div><div class="stat-value">${m.size.toLocaleString('en-US')}</div><div class="stat-sub">= founder.network.newsletter · ${m.engaged.toLocaleString('en-US')} engaged (${m.engagedShare == null ? '-' : pct(m.engagedShare, 0)})</div></div>
    <div class="stat"><div class="stat-label">Last issue</div><div class="stat-value">${m.lastClickRate == null ? '-' : pct(m.lastClickRate, 1)}</div><div class="stat-sub">click rate · opens ${m.lastOpenRate == null ? '-' : pct(m.lastOpenRate, 0)} are inflated by Apple Mail</div></div>
    <div class="stat ${m.complaintRate >= 0.003 ? 'bad' : m.complaintRate >= 0.001 ? 'warn' : ''}"><div class="stat-label">Spam complaints (30d)</div><div class="stat-value">${m.complaintRate == null ? '-' : `${(m.complaintRate * 100).toFixed(2)}%`}</div><div class="stat-sub">Gmail: under 0.10%, never 0.30%</div></div>
    <div class="stat"><div class="stat-label">Cadence</div><div class="stat-value">${pct(m.cadence, 0)}</div><div class="stat-sub">of the last 8 weeks had an issue</div></div>
    <div class="stat"><div class="stat-label">Customers from the list</div><div class="stat-value">${m.signups}</div><div class="stat-sub">${m.revenue ? `${money(m.revenue)} sponsorship` : 'trial signups'}</div></div></div>`;
}

function setupView(s, A) {
  const c = A.compliance;
  return html`<div class="grid-2"><section class="panel"><h2>List platform</h2>
      ${Object.entries(PLATFORMS).map(([k, p]) => html`<label class="radio-card"><input type="radio" name="plat" data-plat="${k}" ${A.platform === k ? 'checked' : ''} /><b>${p.label}</b><span>${p.note}</span></label>`)}
      <p class="small muted">${A.platform ? '' : 'Setup takes about 2 hours. '}If you already have an email list in Settings, it arrives as "the list you brought": engaged ~30%, consent unknown.</p></section>
    <section class="panel"><h2>Consent and compliance</h2>
      <form id="compForm">
        <label>How you record consent <select name="consent">${[['none', 'Not recorded'], ['checkbox', 'Checkbox with a stated purpose'], ['logged', 'Checkbox plus a record (time, source, wording)']].map(([k, l]) => html`<option value="${k}" ${c.consent === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="inline"><input type="checkbox" name="address" ${c.address ? 'checked' : ''} /> Valid postal address in every email footer (CAN-SPAM)</label>
        <label class="inline"><input type="checkbox" name="oneClick" ${c.oneClick ? 'checked' : ''} /> One-click unsubscribe header plus a visible link</label>
        <label class="inline"><input type="checkbox" name="preference" ${c.preference ? 'checked' : ''} /> Preference center (topics and frequency)</label>
        <label>Opt-outs are handled <select name="honor"><option value="auto" ${c.honor === 'auto' ? 'selected' : ''}>Automatically by the platform</option><option value="manual" ${c.honor === 'manual' ? 'selected' : ''}>By hand, when I get to it</option></select></label>
        <label class="inline"><input type="checkbox" name="fromProductDomain" ${A.fromProductDomain ? 'checked' : ''} /> Newsletter sends from the same domain as login mail</label>
        <button class="primary sm">Save (${AUD.hours.compliance} h)</button></form>
      <p class="small muted">US: honor opt-outs within 10 business days (Yahoo asks for 2); each violating email can be penalised up to $53,088 (FTC). Canada's CASL needs express consent; UK PECR allows a soft opt-in only for existing customers; EU GDPR needs consent or a documented basis. Not legal advice.</p></section></div>`;
}

function captureView(s, A) {
  return html`<div class="grid-2"><section class="panel"><h2>Lead magnets</h2>
      <p class="small muted">A magnet that solves the job your product solves fills the list with buyers. A generic "ultimate guide" fills it with students and competitors.</p>
      <form id="magForm"><label>Title <input name="title" /></label><label>Kind <select name="kind">${Object.keys(AUD.hours.magnet).map((k) => html`<option value="${k}">${k} (${AUD.hours.magnet[k]} h)</option>`)}</select></label><label>What it contains <textarea name="body" rows="3"></textarea></label><button class="primary sm">Produce it</button></form>
      ${table({ columns: [{ label: 'Magnet', render: (m) => html`${m.title}<div class="small neg">${m.issues[0] ?? ''}</div>` }, { label: 'Quality', align: 'right', render: (m) => pct(m.q, 0) }, { label: 'Signups', align: 'right', render: (m) => m.signups }], rows: A.magnets, empty: 'No magnets yet.' })}</section>
    <section class="panel"><h2>Signup forms</h2>
      <form id="formForm"><label>Type <select name="type">${['footer', 'popup', 'landing', 'exit'].map((k) => html`<option>${k}</option>`)}</select></label>
        <label>Fields <select name="fields"><option>1</option><option>2</option><option>3</option></select></label>
        <label>Opt-in <select name="optin"><option value="single">Single opt-in</option><option value="double">Double opt-in (fewer signups, more engaged, fewer bounces)</option></select></label>
        <label>Lead magnet <select name="magnetId"><option value="">None (generic "subscribe")</option>${A.magnets.map((m) => html`<option value="${m.id}">${m.title}</option>`)}</select></label>
        <button class="primary sm">Add form (${AUD.hours.form} h)</button></form>
      ${table({ columns: [{ label: 'Form', render: (f) => `${f.type}, ${f.fields} field(s), ${f.optin}` }, { label: 'Signups', align: 'right', render: (f) => f.n }], rows: A.forms, empty: 'No forms yet. Forms convert your site traffic and the launches you post.' })}
      <p class="small muted">Landing pages convert a median 6.6% (top quartile 11.4%) [Unbounce Q4 2024 via ClickMinded]; a generic ask 0.5-1.5%, a specific asset 5-15% [unverified].</p>
      <h3>Pre-launch waitlist</h3>
      <form id="wlForm"><label>Ask them <input name="question" value="${A.waitlist.question}" placeholder="What do you use today?" /></label><label>Offer <select name="offer">${[['none', 'Nothing'], ['founding', 'Founding-member price'], ['deposit', 'Refundable deposit']].map(([k, l]) => html`<option value="${k}" ${A.waitlist.offer === k ? 'selected' : ''}>${l}</option>`)}</select></label><button class="sm">Save (3 h)</button></form>
      <button class="sm" id="promote" ${A.forms.length ? '' : 'disabled'}>Post the signup page to your network (${AUD.hours.promote} h)</button></section></div>`;
}

function writeView(s, A) {
  const last = A.issues.slice(-5).reverse();
  return html`<section class="panel"><h2>Write the issue</h2>
    <p class="small muted">A weekly issue costs a solo founder about 4-8 hours. One idea, real numbers, at most one soft call to action. Same day every week. Sell on clicks, not opens.</p>
    <form id="issueForm"><label>Subject <input name="subject" value="${ui.subject}" /></label><label>Body <textarea name="body" rows="10">${ui.body}</textarea></label>
      <label>Kind <select name="kind">${[['value', 'Value issue'], ['launch', 'Launch or product pitch'], ['sponsor', 'Sponsored issue']].map(([k, l]) => html`<option value="${k}" ${ui.kind === k ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label>Send to <select name="segment"><option value="engaged" ${ui.segment === 'engaged' ? 'selected' : ''}>Engaged readers</option><option value="all" ${ui.segment === 'all' ? 'selected' : ''}>Everyone</option></select></label>
      <button class="primary">Send (${AUD.hours.issue} h)</button></form></section>
    ${table({ columns: [{ label: 'Issue', render: (i) => html`${i.subject}<div class="small neg">${i.issues[0] ?? ''}</div>` }, { label: 'Quality', align: 'right', render: (i) => pct(i.q, 0) }, { label: 'Sent', align: 'right', render: (i) => Math.round(i.stats.sent) }, { label: 'Clicks', align: 'right', render: (i) => (i.stats.delivered ? pct(i.stats.clicked / i.stats.delivered, 1) : '-') }, { label: 'Unsub / spam', align: 'right', render: (i) => `${Math.round(i.stats.unsub)} / ${Math.round(i.stats.complaints)}` }, { label: 'Trials', align: 'right', render: (i) => i.stats.conv }], rows: last, empty: 'No issues sent yet.' })}`;
}

function growView(s, A) {
  const plat = PLATFORMS[A.platform];
  return html`<div class="grid-2"><section class="panel"><h2>Referrals, swaps and ads</h2>
      <form id="refForm"><label class="inline"><input type="checkbox" name="qualityCheck" ${A.referrals.qualityCheck ? 'checked' : ''} /> Only count referrals who open after 14 days</label><label>Reward <select name="reward"><option value="feature">A feature or perk</option><option value="cash">Cash ($2 each)</option></select></label><button class="sm" ${plat?.referrals ? '' : 'disabled'}>${A.referrals.enabled ? 'Update' : 'Start the referral program'} (${AUD.hours.referrals} h)</button> ${plat && !plat.referrals ? html`<span class="small muted">${plat.label} has no referral program</span>` : ''}</form>
      <form id="swapForm"><label>Partner list size <input type="number" name="size" value="3000" /></label><label>How well their audience matches your buyer <select name="fit"><option value="0.8">Same buyer</option><option value="0.5">Adjacent</option><option value="0.2">Different audience</option></select></label><label class="inline"><input type="checkbox" name="paid" /> Paid recommendation ($0.50-5 a subscriber)</label><button class="sm">Run a swap (${AUD.swap.hours} h)</button></form>
      <form id="adForm"><label>Budget $ <input type="number" name="budget" value="300" /></label><label>Audience <select name="audience"><option value="interest">Interest</option><option value="lookalike">Lookalike</option><option value="broad">Broad</option></select></label><button class="sm">Buy subscribers with ads</button><div class="hint">$1-5 each for a consumer list, $10-50 for B2B; most paid B2B subscribers never buy [design].</div></form></section>
    <section class="panel"><h2>Nurture and the shortcut</h2>
      <form id="nurForm"><label>Onboarding sequence quality (0-1 you can defend: one action per email, exits on conversion) <input type="number" step="0.1" min="0" max="1" name="q" value="${A.nurture.q || 0.6}" /></label><button class="sm">Build the sequence (${AUD.hours.nurture} h)</button></form>
      <h3>Buy a list</h3><p class="small">A broker offers 5,000 "targeted" addresses for $300. <button class="sm" id="buy">Buy it anyway</button></p>
      <p class="small muted">Purchased lists have no consent, 8-10% bounces and spam traps. Platforms suspend the account; GDPR and CASL make it unlawful. The game will let you.</p></section></div>`;
}

function cleanView(s, A) {
  const eng = engagedCount(A), n = totalActive(A);
  return html`<section class="panel"><h2>List health</h2>
    <p class="small">${Math.round(n).toLocaleString('en-US')} on the list, ${Math.round(eng).toLocaleString('en-US')} engaged. Sunset after 90-180 days without engagement: a re-engagement email first, then suppress the silent ones. The list gets smaller and the numbers you sell on get better.</p>
    <div class="inline"><button class="primary sm" id="sunset">Re-engage and sunset (${AUD.hours.sunset} h)</button><button class="sm" id="unsubs">Process opt-outs (${AUD.hours.unsubs} h)</button></div>
    ${A.pendingUnsubs > 0 ? html`<p class="callout bad small">${Math.round(A.pendingUnsubs)} people unsubscribed and are still on the list.</p>` : ''}
    ${table({ columns: [{ label: 'Cohort', render: (c) => c.label }, { label: 'Active', align: 'right', render: (c) => Math.round(c.n) }, { label: 'Engaged', align: 'right', render: (c) => pct(c.engaged, 0) }, { label: 'Consent', render: (c) => c.consent }, { label: 'Fit', align: 'right', render: (c) => pct(c.fit, 0) }], rows: A.cohorts, empty: 'No subscribers yet.' })}</section>`;
}

function launchView(s, A) {
  const eng = engagedCount(A);
  return html`<div class="grid-2"><section class="panel"><h2>Launch to the list</h2>
      <p class="small">Waitlist-to-paid is 3-5% for a median launch and 10-15% when you used a founding price or deposit, launched in waves and wrote to the top referrers personally [design from unverified blog ranges]. A cold list and a discount blast earn complaints.</p>
      <form id="launchForm"><label>Subject <input name="subject" value="${ui.ls}" /></label><label>Body <textarea name="body" rows="6">${ui.lb}</textarea></label><label>Waves <select name="waves"><option value="1">One send</option><option value="2">Two waves, engaged first</option></select></label><label class="inline"><input type="checkbox" name="personalTop" /> Write to the top referrers personally (3 h)</label><button class="primary sm">Launch</button></form></section>
    <section class="panel"><h2>Sponsorship</h2>
      <p class="small">Needs ${AUD.sponsor.minEngaged}+ engaged readers; you have ${Math.round(eng)}. CPM $15-35 consumer, $50-100+ B2B [beehiiv guide]. Sell on click data. Disclose every placement.</p>
      <form id="spForm"><label>Sponsor <input name="name" value="Acme Tools" /></label><label>Fit with your readers <select name="fit"><option value="relevant">Relevant</option><option value="misfit">Not relevant</option></select></label><label class="inline"><input type="checkbox" name="disclosed" checked /> Clearly labelled "Sponsored"</label><button class="sm">Book a placement (${AUD.sponsor.hours} h)</button></form>
      <p class="small muted">Then send a "Sponsored issue" in Write. Queued: ${A.sponsors.queued.length}. Earned so far ${money(A.sponsors.earned)}.</p></section></div>`;
}

export default {
  id: 'audience',
  title: 'Owned audience',
  icon: '📬',
  group: 'Growth',
  badge: (state) => { const A = state.apps?.audience; return A && (A.pendingUnsubs > 0 || (A.complaintRate30 ?? 0) >= AUD.spamLine) ? '!' : null; },

  render(root, ctx) {
    const s = ctx.state;
    const A = ensureAudience(s);
    const tab = TABS.some(([k]) => k === ctx.params) ? ctx.params : 'setup';
    mount(root, html`
      <div class="app-head"><div><h1>Owned audience</h1><p>Your waitlist and newsletter: the list you own. Consent first, one promise, a steady cadence, a clean list. List size is not the product; clicks and customers are.</p></div></div>
      ${header(s, A)}
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/audience/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${!A.platform && tab !== 'setup' ? html`<p class="callout warn">Choose a list platform on the first tab.</p>` : tab === 'setup' ? setupView(s, A) : tab === 'capture' ? captureView(s, A) : tab === 'write' ? writeView(s, A) : tab === 'grow' ? growView(s, A) : tab === 'clean' ? cleanView(s, A) : launchView(s, A)}`);
    const act = (fn, hours, label) => ctx.act(async (st) => { const r = await fn(st); if (r && r.ok === false) throw new Error(r.error); return r; }, { hours, label });
    on(root, 'change', '[data-plat]', (e, el) => act((st) => setupList(st, el.dataset.plat), AUD.hours.setup, 'Set up the list platform'));
    on(root, 'submit', '#compForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => setCompliance(st, { consent: f.consent, address: f.address, oneClick: f.oneClick, preference: f.preference, honor: f.honor, fromProductDomain: f.fromProductDomain }), AUD.hours.compliance, 'List compliance'); });
    on(root, 'submit', '#magForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => createMagnet(st, f), AUD.hours.magnet[f.kind] ?? 10, 'Produce a lead magnet'); });
    on(root, 'submit', '#formForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => addForm(st, { type: f.type, fields: Number(f.fields), optin: f.optin, magnetId: f.magnetId || null }), AUD.hours.form, 'Add a signup form'); });
    on(root, 'submit', '#wlForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => setWaitlist(st, { question: f.question, offer: f.offer }), 3, 'Set up the waitlist'); });
    on(root, 'click', '#promote', () => act((st) => { const r = promote(st); toast(`${r.signups ?? 0} signups from your network.`, 'info'); return r; }, AUD.hours.promote, 'Promote the signup page'));
    on(root, 'submit', '#issueForm', (e) => {
      e.preventDefault(); const f = formData(e.target); Object.assign(ui, { subject: f.subject, body: f.body, kind: f.kind, segment: f.segment });
      if (!f.subject.trim() || !f.body.trim()) return toast('Write a subject and a body.', 'warn');
      act(async (st) => {
        const judge = await judgeIssue(ctx, f.subject, f.body);
        const sp = f.kind === 'sponsor' ? ensureAudience(st).sponsors.queued.shift() : null;
        if (f.kind === 'sponsor' && !sp) return { ok: false, error: 'Book a sponsor in Launch & sponsors first.' };
        const r = sendIssue(st, { subject: f.subject, body: f.body, kind: f.kind, segment: f.segment, judge, sponsor: sp });
        if (r.ok) { toast(`Sent: ${r.issue.stats.clicked} clicks, ${r.issue.stats.unsub} unsubscribed, ${r.issue.stats.complaints} spam complaints.`, r.issue.stats.complaints > 2 ? 'warn' : 'good'); ui.subject = ''; ui.body = ''; }
        return r;
      }, AUD.hours.issue, 'Write and send the newsletter');
    });
    on(root, 'submit', '#refForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => setReferrals(st, { qualityCheck: f.qualityCheck, reward: f.reward }), AUD.hours.referrals, 'Newsletter referral program'); });
    on(root, 'submit', '#swapForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => { const r = swap(st, { partnerSize: f.size, partnerFit: Number(f.fit), paid: f.paid }); toast(`${r.signups} subscribers from the swap.`, Number(f.fit) < 0.4 ? 'warn' : 'good'); return r; }, AUD.swap.hours, 'Newsletter swap'); });
    on(root, 'submit', '#adForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => { const r = buyAds(st, { budget: f.budget, audience: f.audience }); if (r.ok) toast(`${r.signups} subscribers at $${r.cac} each.`, 'info'); return r; }, 1.5, 'Subscriber ads'); });
    on(root, 'submit', '#nurForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => setNurture(st, { q: f.q }), AUD.hours.nurture, 'Build the nurture sequence'); });
    on(root, 'click', '#buy', () => act((st) => purchaseList(st, { n: 5000 }), 0.5, 'Buy a list'));
    on(root, 'click', '#sunset', () => act((st) => { const r = sunset(st); toast(`Suppressed ${r.removed} silent subscribers.`, 'good'); return r; }, AUD.hours.sunset, 'Re-engage and sunset'));
    on(root, 'click', '#unsubs', () => act((st) => processUnsubscribes(st), AUD.hours.unsubs, 'Process opt-outs'));
    on(root, 'submit', '#launchForm', (e) => { e.preventDefault(); const f = formData(e.target); Object.assign(ui, { ls: f.subject, lb: f.body }); act(async (st) => { const judge = await judgeIssue(ctx, f.subject, f.body); const r = launchToList(st, { subject: f.subject, body: f.body, waves: Number(f.waves), personalTop: f.personalTop, judge }); if (r.ok) toast(`${r.signups} trials from the launch.`, 'good'); return r; }, 5 + (f.personalTop ? 3 : 0), 'Launch to the list'); });
    on(root, 'submit', '#spForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => queueSponsor(st, { name: f.name, fit: f.fit, disclosed: f.disclosed }), AUD.sponsor.hours, 'Sell a sponsorship'); });
  },

  onDay(state) { if (state.apps?.audience?.platform) audienceDay(state); },
};
