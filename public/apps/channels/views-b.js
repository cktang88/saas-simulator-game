// Channels app views, part 2: PR, sponsorships, review sites & directories, free tools & PLG,
// lifetime deals, cold calling & direct mail, AI search visibility.

import { html, on, formData, table, stat, badge } from '../../core/ui.js';
import { money, pct, fmtDate, round2, hash } from '../../core/util.js';
import { activeSubs } from '../../core/stripe.js';
import { hasProduct } from '../../core/market.js';
import { channelById, podcasts, creators, DIRECTORIES } from './catalog.js';
import * as M from './model.js';
import * as S from './sim.js';
import * as H from './hosted.js';
import { judgeBox, currentJudged, wireJudgeHelper, meter, designTag, draftOf } from './ui-common.js';

const statusBadge = (s) => badge(String(s).replace(/_/g, ' '), ['live', 'done', 'published', 'accepted', 'interviewed'].includes(s) ? 'good' : ['rejected', 'failed', 'missed', 'story_died'].includes(s) ? 'bad' : ['cfp', 'interview', 'booked', 'awaiting_reply', 'applied', 'building', 'in_mail', 'sent'].includes(s) ? 'warn' : '');

// ---------------------------------------------------------------------------------------------------------
// PR
// ---------------------------------------------------------------------------------------------------------

let prForm = { tier: 'trade', hook: 'product', listSize: 20, personalized: true };
export const pr = {
  id: 'pr', label: 'PR',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s);
    const funded = s.bank.txns.some((t) => t.category === 'investment');
    const j = currentJudged(s, 'pr_pitch');
    const preview = j ? M.pitchResponseProb({ words: j.words, personalized: prForm.personalized, quality: j.quality, tier: prForm.tier }) : null;
    const r = C.pr.retainer;
    return html`<div class="grid-2"><section class="panel"><h2>Pitch journalists yourself</h2>
      <p class="small muted">Journalists respond to ~2.5–3.5% of pitches (Propel, ~400k pitches); under 150 words ~5.9% vs over 500 words ~1.5%; 54% of journalists seldom or never respond (Muck Rack 2025). Coverage odds per campaign ${designTag}: tier-1 with funding news and a known lead 10–30%, product-only news 1–5%, trade outlets 20–50% with a good angle. Original data is the most reliable hook.</p>
      <form id="prForm" class="grid-2">
        <label>Outlets <select name="tier"><option value="trade" ${prForm.tier === 'trade' ? 'selected' : ''}>Trade / niche outlets</option><option value="tier1" ${prForm.tier === 'tier1' ? 'selected' : ''}>Tier-1 tech press</option></select></label>
        <label>Hook <select name="hook">${Object.entries(M.PR_HOOKS).map(([k, h]) => html`<option value="${k}" ${prForm.hook === k ? 'selected' : ''} ${h.needsFunding && !funded ? 'disabled' : ''}>${h.label}${h.needsFunding && !funded ? ' (raise first)' : ''}</option>`)}</select></label>
        <label>Reporters on your list <input type="number" name="listSize" min="5" max="150" value="${prForm.listSize}" /></label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="personalized" style="width:auto;display:inline-block" ${prForm.personalized ? 'checked' : ''}/> Personalize each (reference their recent articles)</label>
      </form>
      ${judgeBox(s, 'pr_pitch', { label: 'Your pitch', hours: 0.5, placeholder: 'Subject line\n\nHi {first_name} — you wrote about … Here\'s something your readers haven\'t seen: …' })}
      ${preview != null ? html`<p class="small">Expected reply rate for this pitch: ~${pct(preview, 1)} ${designTag}</p>` : ''}
      <button class="primary" id="prSend">Build list & send (${round2(2 + prForm.listSize * (prForm.personalized ? 0.25 : 0.03))}h)</button>
    </section>
    <section class="panel"><h2>PR agency</h2>
      <p class="small muted">Boutique retainers $3.5k–$10k/mo, startup budgets $5k–$25k/mo, 3–6 month minimums (agency sources, 2026). Risk: paying for trade mentions that send no traffic.</p>
      ${r?.active ? html`<p>${S.PR_FIRMS[r.firm].label} (${money(S.PR_FIRMS[r.firm].monthly)}/mo) since ${fmtDate(s, r.startDay)} · ${r.placements} placements · minimum term until ${fmtDate(s, r.minEndDay)}</p><button id="prCancel" class="danger">Cancel retainer</button>`
        : html`${Object.entries(S.PR_FIRMS).map(([k, F]) => html`<p><button data-firm="${k}">Hire ${F.label} — ${money(F.monthly)}/mo, ${F.minMonths}-month minimum (2h briefing)</button></p>`)}`}
    </section></div>
    <section class="panel"><h2>Campaigns</h2>${table({ columns: [
      { key: 'day', label: 'Sent', render: (c) => fmtDate(s, c.day) }, { key: 'tier', label: 'Outlets' }, { key: 'hook', label: 'Hook' },
      { key: 'listSize', label: 'Pitched', align: 'right' }, { key: 'replies', label: 'Replies', align: 'right', render: (c) => (s.day - c.day >= 7 ? c.replies : '…') },
      { key: 'status', label: 'Status', render: (c) => statusBadge(c.status === 'awaiting_reply' ? 'sent' : c.status) },
      { key: 'a', label: '', render: (c) => (c.status === 'interview' ? html`<button class="sm primary" data-interview="${c.id}">Do the interview (1h) — by ${fmtDate(s, c.interviewDeadline)}</button>` : '') },
    ], rows: C.pr.campaigns, empty: 'No pitches sent yet.' })}
    ${C.pr.pieces.length ? html`<h3>Coverage</h3><ul class="list small">${C.pr.pieces.map((p) => html`<li>${fmtDate(s, p.day)} · ${p.outlet} ${badge(p.tier === 'tier1' ? 'tier-1' : 'trade', p.tier === 'tier1' ? 'accent' : '')}</li>`)}</ul>` : ''}</section>`;
  },
  wire(root, ctx) {
    on(root, 'change', '#prForm', (e, el) => { const f = formData(el); prForm = { tier: f.tier, hook: f.hook, listSize: Math.max(5, Math.min(150, f.listSize | 0)), personalized: f.personalized }; ctx.render(); });
    on(root, 'click', '#prSend', () => {
      const j = currentJudged(ctx.state, 'pr_pitch');
      if (!j) return ctx.toast('Get feedback on the current pitch first.', 'warn');
      const f = formData(root.querySelector('#prForm'));
      prForm = { tier: f.tier, hook: f.hook, listSize: Math.max(5, Math.min(150, f.listSize | 0)), personalized: f.personalized };
      ctx.act((st) => { S.launchPitchCampaign(st, { ...prForm, judged: j }); ctx.toast('Pitches sent. Replies (if any) arrive in Mail over the next week.', 'info'); }, { hours: round2(2 + prForm.listSize * (prForm.personalized ? 0.25 : 0.03)), label: 'PR pitching' });
    });
    on(root, 'click', '[data-interview]', (e, el) => ctx.act((st) => S.doPressInterview(st, el.dataset.interview), { hours: 1, label: 'Press interview' }));
    on(root, 'click', '[data-firm]', (e, el) => ctx.act((st) => S.hirePrFirm(st, el.dataset.firm), { hours: 2, label: 'PR agency briefing' }));
    on(root, 'click', '#prCancel', () => ctx.act((st) => S.cancelPrFirm(st)));
    wireJudgeHelper(root, ctx, { pr_pitch: ['pr_pitch', 0.5, 25, () => ({ tier: prForm.tier, beat: prForm.tier === 'tier1' ? 'startups and tech' : ctx.state.company.icp || 'the industry' })] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Sponsorships
// ---------------------------------------------------------------------------------------------------------

let spSel = null, spFormat = null;
export const sponsors = {
  id: 'sponsors', label: 'Sponsorships',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s);
    const shows = [...podcasts(s), ...creators(s)];
    const show = shows.find((x) => x.id === spSel);
    const formats = show ? Object.entries(M.SPONSOR_FORMATS).filter(([, f]) => f.kind === show.kind) : [];
    if (show && !formats.some(([k]) => k === spFormat)) spFormat = formats[0][0];
    const price = show ? M.sponsorshipPrice({ audience: show.audience, cpm: show.cpm, format: spFormat }) : 0;
    const row = (x) => ({ ...x });
    return html`<section class="panel"><h2>Podcasts & YouTube creators</h2>
      <p class="small muted">Host-read podcast CPM ~$18–$40 (Libsyn/Acast); YouTube tech/B2B integrations $30–$60 CPM ($50–$100+ high intent), dedicated videos 2–3×. Attribution is weak: most listeners type your URL later, so only ~40% of signups show up under the promo code ${designTag}. Newsletter sponsorships are booked in <a href="#/organic">Organic</a>.</p>
      ${table({ columns: [
        { key: 'name', label: 'Show / creator' }, { key: 'kind', label: 'Type', render: (x) => (x.kind === 'podcast' ? '🎧 Podcast' : '▶️ YouTube') },
        { key: 'audience', label: 'Downloads / median views', align: 'right', render: (x) => x.audience.toLocaleString() },
        { key: 'cpm', label: 'CPM', align: 'right', render: (x) => money(x.cpm) },
        { key: 'fit', label: 'Audience match (media kit)', render: (x) => meter(x.fit) },
        { key: 'a', label: '', render: (x) => html`<button class="sm" data-show="${x.id}">Choose</button>` },
      ], rows: shows.map(row) })}
      ${show ? html`<div class="card"><h3>${show.name}</h3>
        <label>Placement <select id="spFormat">${formats.map(([k, f]) => html`<option value="${k}" ${spFormat === k ? 'selected' : ''}>${f.label}</option>`)}</select></label>
        <p>Price: <b>${money(price)}</b> · publishes ${M.SPONSOR_FORMATS[spFormat].lead[0]}–${M.SPONSOR_FORMATS[spFormat].lead[1]} days after booking</p>
        ${judgeBox(s, 'ad_read', { label: 'Ad read / talking points (host reads it in their voice)', hours: 0.5, placeholder: 'Why I use it, the one problem it solves, the offer, the code/URL…' })}
        <button class="primary" id="spBook">Book for ${money(price)} (0.5h)</button></div>` : ''}
    </section>
    <section class="panel"><h2>Booked placements</h2>${table({ columns: [
      { key: 'name', label: 'Show' }, { key: 'format', label: 'Placement', render: (b) => M.SPONSOR_FORMATS[b.format].label },
      { key: 'price', label: 'Cost', align: 'right', render: (b) => money(b.price) },
      { key: 'publishDay', label: 'Publishes', render: (b) => fmtDate(s, b.publishDay) },
      { key: 'status', label: 'Status', render: (b) => statusBadge(b.status) },
      { key: 'signups', label: 'Signups (all)', align: 'right' },
    ], rows: C.sponsors, empty: 'Nothing booked.' })}</section>`;
  },
  wire(root, ctx) {
    on(root, 'click', '[data-show]', (e, el) => { spSel = el.dataset.show; ctx.render(); });
    on(root, 'change', '#spFormat', (e) => { spFormat = e.target.value; ctx.render(); });
    on(root, 'click', '#spBook', () => {
      const j = currentJudged(ctx.state, 'ad_read');
      if (!j) return ctx.toast('Get feedback on the current ad read first.', 'warn');
      ctx.act((st) => { const b = S.bookSponsor(st, { showId: spSel, format: spFormat, judged: j }); ctx.toast(`Booked ${b.name}: publishes ${fmtDate(st, b.publishDay)}.`, 'good'); spSel = null; }, { hours: 0.5, label: 'Sponsorship booking' });
    });
    wireJudgeHelper(root, ctx, { ad_read: ['ad_read', 0.5, 30, () => ({ name: [...podcasts(ctx.state), ...creators(ctx.state)].find((x) => x.id === spSel)?.name })] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Review sites & directories
// ---------------------------------------------------------------------------------------------------------

export const reviews = {
  id: 'reviews', label: 'Reviews & directories',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s), Rv = C.reviews;
    const notAsked = activeSubs(s).filter((x) => !Rv.askedSubs?.[x.id]).length;
    return html`<div class="grid-2"><section class="panel"><h2>G2 / Capterra / TrustRadius</h2>
      <p class="small muted">Free profiles; a profile barely converts until it has ~10 reviews ${designTag}. G2 Starter ~$299/mo, buyer-intent data ~$40k–$50k/yr (CostBench third-party). Capterra/GetApp PPC: second-price auction, $2 minimum bid, $20+ to rank in competitive categories, CPL $30–$100+. Reviews also feed AI search: ChatGPT-cited B2B tools almost all had G2/Capterra reviews (vendor study).</p>
      ${Rv.claimed ? html`<div class="stats">${stat('Reviews', Rv.count, `${Rv.pending.length} on the way`)}${stat('Profile strength', pct(M.reviewProfileFactor(Rv.count) / 1.2, 0), Rv.count < 10 ? 'needs ~10 reviews' : 'credible')}</div>
        <form id="askReviews" class="inline"><label>Thank-you gift card <select name="incentive"><option value="0">None</option><option value="10">$10</option><option value="25">$25</option></select></label><button class="primary" ${notAsked ? '' : 'disabled'}>Ask ${notAsked} customers for a review (1h)</button></form>
        <p class="small muted">Incentives must not depend on the review being positive and must be disclosed (FTC fake-review rule, 2024; G2/Capterra policies). Asking only happy customers ("review gating") is also prohibited.</p>
        <form id="paidForm"><h3>Paid</h3><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="g2" style="width:auto;display:inline-block" ${Rv.g2Paid ? 'checked' : ''}/> G2 Starter ($299/mo)</label>
          <div class="grid-2"><label>Capterra PPC bid ($/click, 0 = off) <input type="number" name="bid" min="0" max="60" step="0.25" value="${Rv.ppc?.bid ?? 0}"/></label><label>Daily cap ($) <input type="number" name="cap" min="5" max="500" value="${Rv.ppc?.cap ?? 30}"/></label></div>
          <button>Save (0.25h)</button></form>`
        : html`<button class="primary" id="claim">Claim and fill in profiles (4h)</button>`}
    </section>
    <section class="panel"><h2>Directories & templates</h2>
      <p class="small muted">Submit once, keep the ones that send traffic. Templates/galleries let people start from your product. Volumes are game estimates ${designTag}; failure mode: directory spam with no traffic.</p>
      ${table({ columns: [{ key: 'label', label: 'Directory' }, { key: 'a', label: '', render: (d) => (C.directories.listings.some((l) => l.dirId === d.id) ? badge('listed', 'good') : html`<button class="sm" data-dir="${d.id}" data-paid="0">Submit free (0.5h)</button>${d.paidCost ? html` <button class="sm" data-dir="${d.id}" data-paid="1">Featured ${money(d.paidCost)}</button>` : ''}`) }], rows: DIRECTORIES })}
      <form id="tplForm" class="inline"><label>New template / gallery item <input name="title" placeholder="e.g. Month-end close checklist for Shopify stores"/></label><button>Publish (2h)</button></form>
      <p class="small muted">${C.directories.templates.length} templates published.</p>
    </section></div>`;
  },
  wire(root, ctx) {
    on(root, 'click', '#claim', () => ctx.act((st) => { const C = S.ensureChannels(st); C.reviews.claimed = true; C.reviews.claimedDay = st.day; }, { hours: 4, label: 'Review-site profiles' }));
    on(root, 'submit', '#askReviews', (e) => { e.preventDefault(); const inc = +formData(e.target).incentive; ctx.act((st) => { const r = S.askForReviews(st, { incentive: inc }); ctx.toast(`Asked ${r.asked} customers. Reviews trickle in over 2–3 weeks.`, 'info'); }, { hours: 1, label: 'Review requests' }); });
    on(root, 'submit', '#paidForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => S.setReviewsPaid(st, { g2Paid: f.g2, ppc: f.bid >= 2 ? { bid: f.bid, cap: f.cap } : null }), { hours: 0.25, label: 'Review-site ads' }); });
    on(root, 'click', '[data-dir]', (e, el) => ctx.act((st) => S.submitDirectory(st, el.dataset.dir, el.dataset.paid === '1'), { hours: 0.5, label: 'Directory submission' }));
    on(root, 'submit', '#tplForm', (e) => { e.preventDefault(); const t = formData(e.target).title; ctx.act((st) => S.publishTemplate(st, t), { hours: 2, label: 'Template' }); });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Free tools & PLG loops
// ---------------------------------------------------------------------------------------------------------

let toolForm = { name: '', scope: 'weekend', usesLlm: false };
export const tools = {
  id: 'tools', label: 'Free tools & PLG',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s);
    return html`<div class="grid-2"><section class="panel"><h2>Engineering as marketing</h2>
      <p class="small muted">Calculators, generators, graders adjacent to your product (HubSpot Website Grader, Shopify generators, Ahrefs free tools). In 2026 AI coding agents cut the build to days — but AI answers also satisfy many tool-style queries directly. No dated conversion benchmarks exist; volumes here are game estimates ${designTag}.</p>
      <form id="toolMeta" class="grid-2"><label>Tool name <input name="name" value="${toolForm.name}" placeholder="e.g. SaaS pricing page grader"/></label>
        <label>Scope <select name="scope">${Object.entries(S.TOOL_SCOPES).map(([k, t]) => html`<option value="${k}" ${toolForm.scope === k ? 'selected' : ''}>${t.label}</option>`)}</select></label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="usesLlm" style="width:auto;display:inline-block" ${toolForm.usesLlm ? 'checked' : ''}/> Calls an LLM (monthly API cost that grows with traffic)</label></form>
      ${judgeBox(s, 'tool_idea', { label: 'Who searches for it, what it outputs, and how it leads to your product', hours: 0.5, placeholder: 'Searchers type "…"; the tool takes … and returns …; the advanced result needs an account; it shows them why … ' })}
      <button class="primary" id="toolCreate">Start building</button>
      ${C.tools.length ? table({ columns: [
        { key: 'name', label: 'Tool' }, { key: 'status', label: 'Status', render: (t) => statusBadge(t.status) },
        { key: 'p', label: 'Progress', render: (t) => (t.status === 'building' ? html`${meter(t.hoursDone / t.hoursNeeded)} <span class="small">${t.hoursDone}/${t.hoursNeeded}h</span>` : `live since ${fmtDate(s, t.liveDay)}`) },
        { key: 'signups', label: 'Signups', align: 'right' },
        { key: 'a', label: '', render: (t) => (t.status === 'building' ? html`<button class="sm" data-build="${t.id}">Build session (4h)</button>` : '') },
      ], rows: C.tools }) : ''}
    </section>
    <section class="panel"><h2>Product-led loops</h2>
      <p class="small muted">Collaboration invites and "made with" badges add to your K-factor (typical total 0.1–0.25; see Organic). Built through your Product queue like any feature.</p>
      ${Object.entries(S.PLG_BUILDS).map(([k, B]) => { const p = C.plg[k]; const ch = channelById(B.ch); return html`<div class="card"><b>${B.label}</b> <span class="small muted">~${B.hours}h engineering · adds K ${ch.steadyStateMonthly.kFactorAdd[0]}–${ch.steadyStateMonthly.kFactorAdd[1]} ${designTag}</span><br>
        ${p ? html`${statusBadge(p.status)} ${p.k != null ? html`<span class="small">K +${p.k}</span>` : html`<a class="small" href="#/product">open Product</a>`}` : html`<button class="sm" data-plg="${k}">Add to Product build queue (0.5h)</button>`}
        <div class="small muted">${ch.failureModes[0]}</div></div>`; })}
    </section></div>`;
  },
  wire(root, ctx) {
    on(root, 'input', '#toolMeta', (e) => { const f = formData(root.querySelector('#toolMeta')); toolForm = { name: f.name, scope: f.scope, usesLlm: f.usesLlm }; });
    on(root, 'change', '#toolMeta', () => { const f = formData(root.querySelector('#toolMeta')); toolForm = { name: f.name, scope: f.scope, usesLlm: f.usesLlm }; });
    on(root, 'click', '#toolCreate', () => {
      const j = currentJudged(ctx.state, 'tool_idea');
      if (!j) return ctx.toast('Get feedback on the current idea first.', 'warn');
      ctx.act((st) => { S.createTool(st, { ...toolForm, idea: draftOf(st, 'tool_idea'), judged: j }); toolForm = { name: '', scope: 'weekend', usesLlm: false }; }, { hours: 0.25, label: 'Free tool' });
    });
    on(root, 'click', '[data-build]', (e, el) => ctx.act((st) => { const t = S.buildTool(st, el.dataset.build, 4); if (t.status === 'live') ctx.toast(`${t.name} is live. Traffic ramps over months.`, 'good'); }, { hours: 4, label: 'Building free tool' }));
    on(root, 'click', '[data-plg]', (e, el) => ctx.act((st) => S.startPlgBuild(st, el.dataset.plg), { hours: 0.5, label: 'PLG spec' }));
    wireJudgeHelper(root, ctx, { tool_idea: ['tool_idea', 0.5, 25] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Lifetime deal
// ---------------------------------------------------------------------------------------------------------

let ltdForm = { deal: 'select', price: 69, cap: 1000, limits: true };
export const ltd = {
  id: 'ltd', label: 'Lifetime deal',
  render(ctx) {
    const s = ctx.state, L = S.ensureChannels(s).ltd;
    const ch = channelById('appsumo_ltd');
    return html`<section class="panel"><h2>AppSumo-style lifetime deal</h2>
      <div class="callout warn">Cash now, costs forever. AppSumo's revenue fell ~50% over two years (AppSumo founder, 2026-02): AI makes software cheap to build and LTD trust is damaged. Partners net roughly 30–70% of gross (sources conflict). Lifetime users never pay again but keep using support and — for AI features — inference.</div>
      <ul class="small">${ch.failureModes.map((f) => html`<li>${f}</li>`)}</ul>
      ${L && !['rejected', 'ended'].includes(L.status) ? '' : html`<form id="ltdForm" class="grid-2">
        <label>Deal type <select name="deal">${Object.entries(M.LTD_DEALS).map(([k, d]) => html`<option value="${k}" ${ltdForm.deal === k ? 'selected' : ''}>${d.label} — you net ~${Math.round(d.partnerShare * 100)}%</option>`)}</select></label>
        <label>Code price <select name="price">${[49, 69, 99].map((p) => html`<option value="${p}" ${ltdForm.price === p ? 'selected' : ''}>$${p}</option>`)}</select></label>
        <label>Code cap <input type="number" name="cap" min="50" max="10000" value="${ltdForm.cap}"/></label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="limits" style="width:auto;display:inline-block" ${ltdForm.limits ? 'checked' : ''}/> Hard usage limits on LTD plans (caps your AI/compute cost)</label></form>
        ${judgeBox(s, 'ltd_app', { label: 'Application: product, who it is for, demo, support readiness, limits', hours: 1.5, rows: 7 })}
        <button class="primary" id="ltdApply" ${hasProduct(s) ? '' : 'disabled'}>Apply (0.25h)</button>`}
      ${L ? html`<div class="stats" style="margin-top:12px">
        ${stat('Status', L.status, L.status === 'applied' ? `decision ~${fmtDate(s, L.decisionDay)}` : L.launchDay ? `launch ${fmtDate(s, L.launchDay)}` : '')}
        ${stat('Codes sold', L.sold, `${L.refunded} refunded`)}${stat('Gross / your net', `${money(L.gross)} / ${money(L.net)}`, `${money(L.paidOut)} paid out`)}
        ${stat('Lifetime users', Math.max(0, L.users), `${L.upgrades} later bought a subscription`)}</div>` : ''}
    </section>`;
  },
  wire(root, ctx) {
    on(root, 'change', '#ltdForm', () => { const f = formData(root.querySelector('#ltdForm')); ltdForm = { deal: f.deal, price: +f.price, cap: f.cap, limits: f.limits }; });
    on(root, 'click', '#ltdApply', () => {
      const j = currentJudged(ctx.state, 'ltd_app');
      if (!j) return ctx.toast('Get feedback on the current application first.', 'warn');
      const f = formData(root.querySelector('#ltdForm'));
      ctx.act((st) => { S.applyLtd(st, { deal: f.deal, price: +f.price, cap: Math.max(50, f.cap | 0), limits: f.limits, judged: j }); ctx.toast('Applied. Deal scouts answer in 2–4 weeks.', 'info'); }, { hours: 0.25, label: 'LTD application' });
    });
    wireJudgeHelper(root, ctx, { ltd_app: ['ltd_application', 1.5, 60] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Cold calling & direct mail
// ---------------------------------------------------------------------------------------------------------

let mailForm = { piece: 'letter', filter: 'targets', followUp: true };
const TARGET_FILTERS = [['targets', 'Target accounts (ABM)'], ['warm', 'Warm: met you, replied or engaged'], ['senior', 'Senior titles'], ['nodeal', 'No open deal'], ['all', 'All CRM contacts']];
const targetSelect = (name, value) => html`<select name="${name}">${TARGET_FILTERS.map(([k, l]) => html`<option value="${k}" ${value === k ? 'selected' : ''}>${l}</option>`)}</select>`;
let callFilter = 'warm';
export const direct = {
  id: 'direct', label: 'Calls & mail', models: ['smb', 'ent'],
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s), K = C.calls;
    const blocks = K.blocks;
    const tot = blocks.reduce((a, b) => ({ dials: a.dials + b.dials, connects: a.connects + b.connects, meetings: a.meetings + b.meetings }), { dials: 0, connects: 0, meetings: 0 });
    const callN = H.crmCandidates(s, { filter: callFilter }).length;
    const mailN = H.crmCandidates(s, { filter: mailForm.filter }).length;
    const anyCrm = (s.apps.crm?.contacts ?? []).some((c) => !c.hidden);
    const acv = S.currentAcv(s);
    const noCrm = html`<p class="small"><b>No CRM contacts yet.</b> Calls and mail go to real people: build a list in <a href="#/crm/prospects">Prospects</a> or <a href="#/crm/import">import a CSV</a> first.</p>`;
    return html`<div class="grid-2"><section class="panel"><h2>Cold calling</h2>
      <p class="small muted">Belkins 2025: 9.9% of dials reach a live person, ~370 dials per meeting; Cognism: conversation→meeting 2.3% (2025) → 2.7% (2026). Call in 2–3 hour blocks, warm accounts first (met you at an event, replied, engaged). US: TCPA/DNC rules apply to mobiles.</p>
      <form id="dialerForm" class="inline"><label>Dialer <select name="dialer">${Object.entries(M.DIALERS).map(([k, d]) => html`<option value="${k}" ${K.dialer === k ? 'selected' : ''}>${d.label} — ~${d.perHour} dials/h${d.monthly ? `, $${d.monthly}/mo` : ''}</option>`)}</select></label><button>Use (0.5h)</button></form>
      ${anyCrm ? html`<form id="listForm" class="inline"><label>Who ${targetSelect('filter', callFilter)}</label><label>Numbers <select name="kind">${Object.entries(S.CALL_LISTS).map(([k, l]) => html`<option value="${k}">${l.label}${l.perContact ? ` — $${l.perContact}/number` : ''}</option>`)}</select></label><button ${callN ? '' : 'disabled title="Nobody in the CRM matches this filter"'}>Build list (${callN} contacts)</button></form>` : noCrm}
      ${K.list?.queue ? html`<p class="small">${K.list.left} of ${K.list.size} contacts still to reach (each is dialed up to ${S.MAX_ATTEMPTS} times).</p>` : ''}
      ${judgeBox(s, 'call_script', { label: 'Opener & script (permission opener, reason for calling, one question, ask)', hours: 1 })}
      <button id="useScript">Use this script</button> ${K.script ? badge(`script ${K.script.score}/10`, 'accent') : ''}
      <form id="callForm" class="inline"><label>Block length (hours) <input type="number" name="hours" min="1" max="3" step="0.5" value="2"/></label><button class="primary" ${K.list?.left && K.script ? '' : 'disabled'} title="${!K.list?.left ? 'Build a call list from your CRM first.' : !K.script ? 'Get feedback on a script and click Use this script.' : ''}">Start calling</button></form>
      ${blocks.length ? html`<p class="small">Totals: ${tot.dials} dials · ${tot.connects} conversations (${pct(tot.connects / Math.max(1, tot.dials), 1)}) · ${tot.meetings} meetings in the CRM (${tot.meetings ? Math.round(tot.dials / tot.meetings) : '—'} dials/meeting)${blocks[0].idle ? ` · last block: ${blocks[0].idle} dial slots idle (list too short for the block)` : ''}</p>` : ''}
    </section>
    <section class="panel"><h2>Direct mail & gifting</h2>
      <p class="small muted">ANA/DMA via vendors: ~4.4% average response (house lists 5–9%, prospect lists 2–4%); postcard ~$0.58, letter ~$0.81, dimensional/gift $8–$50 with 5–15% response for ABM. Mail without a follow-up call rarely books a meeting; gifts only pay back above roughly $15k ACV ${designTag} (yours: ${money(acv)}).</p>
      ${anyCrm ? html`<form id="mailForm" class="grid-2"><label>Piece <select name="piece">${Object.entries(M.MAIL_PIECES).map(([k, p]) => html`<option value="${k}" ${mailForm.piece === k ? 'selected' : ''}>${p.label} — ~$${p.cost}</option>`)}</select></label>
        <label>Send to ${targetSelect('filter', mailForm.filter)} <span class="small">${mailN} contacts</span></label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="followUp" style="width:auto;display:inline-block" ${mailForm.followUp ? 'checked' : ''}/> Call or email each one within a week of delivery (~5 min each)</label></form>
      ${judgeBox(s, 'mail_note', { label: 'The note inside', hours: 0.5, rows: 5 })}
      <button class="primary" id="mailSend" ${mailN ? '' : 'disabled title="Nobody in the CRM matches this filter"'}>Send to ${mailN} contacts</button>` : noCrm}
      ${C.mailCampaigns.length ? table({ columns: [{ key: 'day', label: 'Sent', render: (c) => fmtDate(s, c.day) }, { key: 'piece', label: 'Piece' }, { key: 'count', label: 'Pieces', align: 'right' }, { key: 'cost', label: 'Cost', align: 'right', render: (c) => money(c.cost) }, { key: 'status', label: 'Status', render: (c) => (c.status === 'done' ? `${c.responses} responses · ${c.qualified} meetings` : statusBadge(c.status)) }], rows: C.mailCampaigns }) : ''}
    </section></div>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#dialerForm', (e) => { e.preventDefault(); const d = formData(e.target).dialer; ctx.act((st) => S.setDialer(st, d), { hours: 0.5, label: 'Dialer setup' }); });
    on(root, 'change', '#listForm select[name=filter]', (e, el) => { callFilter = el.value; ctx.render(); });
    on(root, 'submit', '#listForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const ids = H.crmCandidates(ctx.state, { filter: f.filter }).map((r) => r.c.id).slice(0, 2000);
      ctx.act((st) => { const l = S.buyCallList(st, f.kind, ids); ctx.toast(`Call list ready: ${l.size} contacts.`, 'good'); }, { hours: round2(Math.max(0.5, ids.length / 120)), label: 'Call list' });
    });
    on(root, 'click', '#useScript', () => ctx.act((st) => { const j = currentJudged(st, 'call_script'); if (!j) throw new Error('Get feedback on the current script first.'); S.ensureChannels(st).calls.script = j; }));
    on(root, 'submit', '#callForm', (e) => { e.preventDefault(); const h = Math.max(1, Math.min(3, formData(e.target).hours || 2)); ctx.act((st) => { const r = S.callBlock(st, h); ctx.toast(`${r.dials} dials, ${r.connects} conversations, ${r.meetings} meeting(s) booked in the CRM.`, r.meetings ? 'good' : 'info'); }, { hours: h, label: 'Cold calling block' }); });
    on(root, 'change', '#mailForm', () => { const f = formData(root.querySelector('#mailForm')); mailForm = { piece: f.piece, filter: f.filter, followUp: f.followUp }; ctx.render(); });
    on(root, 'click', '#mailSend', () => {
      const j = currentJudged(ctx.state, 'mail_note');
      if (!j) return ctx.toast('Get feedback on the current note first.', 'warn');
      const f = formData(root.querySelector('#mailForm'));
      const ids = H.crmCandidates(ctx.state, { filter: f.filter }).map((r) => r.c.id).slice(0, 2000);
      ctx.act((st) => { const c = S.sendDirectMail(st, { piece: f.piece, contactIds: ids, followUp: f.followUp, judged: j }); ctx.toast(`${c.count} pieces in the mail (${money(c.cost)}). Responses in 10–30 days.`, 'info'); }, { hours: f.followUp ? round2(1 + ids.length * (5 / 60)) : 1, label: 'Direct mail campaign' });
    });
    wireJudgeHelper(root, ctx, { call_script: ['call_script', 1, 40], mail_note: ['mail_note', 0.5, 20] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// AI search visibility
// ---------------------------------------------------------------------------------------------------------

export const ai = {
  id: 'ai', label: 'AI search',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s), A = C.aiSearch;
    const share = S.aiVisibility(s);
    const last = A.checks[0];
    return html`<div class="stats">${stat('Third-party mentions', A.mentions.toFixed(1), 'reviews, listicles, press, community answers')}${stat('Est. share of buyer prompts naming you', pct(share, 0), html`top-5 incumbents keep ~68% ${designTag}`)}</div>
      <div class="grid-2"><section class="panel"><h2>Buyer prompts</h2>
        <p class="small muted">List the questions buyers ask ChatGPT, Claude, Perplexity or Google AI Mode ("best X for Y", "X alternatives"). ThriveStack (vendor, 2026-08): 84% of AI citations come from third-party sources; the top 5 brands per category take ~68%; ~74% of citations turn over weekly.</p>
        <label>One prompt per line<textarea id="aiPrompts" rows="6">${A.prompts.join('\n')}</textarea></label>
        <button id="aiSave">Save prompts (0.5h)</button> <button class="primary" id="aiCheck" ${A.prompts.length ? '' : 'disabled'}>Check answers this week (1h)</button>
        ${last ? html`<h3>Checked ${fmtDate(s, last.day)}</h3><ul class="list small">${last.rows.map((r) => html`<li>${r.named ? badge('named', 'good') : badge('not named', '')} ${r.prompt}</li>`)}</ul>` : ''}
      </section>
      <section class="panel"><h2>Earn mentions</h2>
        <p class="small muted">Get into "best tools for X" listicles (authors add newcomers 3–12% of the time ${designTag}), collect reviews (<a href="#/channels/reviews">Reviews</a>), answer Reddit/community threads and publish honest comparison pages (<a href="#/organic">Organic</a>).</p>
        ${judgeBox(s, 'listicle', { label: 'Pitch to a listicle author', hours: 0.3, rows: 5 })}
        <form id="listicleForm" class="inline"><label>Authors to pitch <input type="number" name="n" min="1" max="30" value="5"/></label><button class="primary">Send (0.15h each)</button></form>
        <p class="small">${A.pitches.filter((p) => p.accepted).length} of ${A.pitches.length} pitches accepted.</p>
      </section></div>`;
  },
  wire(root, ctx) {
    on(root, 'click', '#aiSave', () => { const lines = root.querySelector('#aiPrompts').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20); ctx.act((st) => { S.ensureChannels(st).aiSearch.prompts = lines.map((l) => l.slice(0, 160)); }, { hours: 0.5, label: 'AI search prompts' }); });
    on(root, 'click', '#aiCheck', () => ctx.act((st) => {
      const A = S.ensureChannels(st).aiSearch;
      const share = S.aiVisibility(st);
      const week = Math.floor(st.day / 7);
      // Answers reshuffle weekly; whether you're named is seeded per prompt and week.
      const rows = A.prompts.map((p) => ({ prompt: p, named: parseInt(hash(`${p}|${week}|${st.company.name}`), 36) % 1000 < share * 1000 }));
      A.checks.unshift({ day: st.day, rows, share });
      A.checks.length = Math.min(A.checks.length, 12);
    }, { hours: 1, label: 'AI answer check' }));
    on(root, 'submit', '#listicleForm', (e) => {
      e.preventDefault();
      const j = currentJudged(ctx.state, 'listicle');
      if (!j) return ctx.toast('Get feedback on the current pitch first.', 'warn');
      const n = Math.max(1, Math.min(30, formData(e.target).n | 0));
      ctx.act((st) => { let ok = 0; for (let i = 0; i < n; i++) ok += S.pitchListicle(st, j) ? 1 : 0; ctx.toast(ok ? `${ok} author(s) agreed to add you; they'll publish in 2–6 weeks.` : 'No takers this time.', ok ? 'good' : 'info'); }, { hours: round2(n * 0.15), label: 'Listicle outreach' });
    });
    wireJudgeHelper(root, ctx, { listicle: ['listicle_pitch', 0.3, 25] });
  },
};
