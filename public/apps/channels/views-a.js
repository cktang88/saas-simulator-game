// Channels app views, part 1: overview, performance, affiliates, referrals, marketplaces, resellers/agencies,
// co-marketing & webinars.

import { html, on, formData, table, stat, badge } from '../../core/ui.js';
import { money, pct, fmtDate, round2 } from '../../core/util.js';
import { activeSubs, mrr } from '../../core/stripe.js';
import { CHANNELS } from '../../data/channels.js';
import { ensureOrganic } from '../growth/organicEngine.js';
import { STORES, channelById, partnerProspects, coPartners } from './catalog.js';
import * as M from './model.js';
import * as S from './sim.js';
import { judgeBox, runJudge, currentJudged, wireJudgeHelper, meter, designTag } from './ui-common.js';
import { personaReply } from './judge.js';

const fitBadge = (fit) => (fit >= 0.7 ? badge('strong fit', 'good') : fit >= 0.4 ? badge('ok fit', '') : badge('weak fit', 'warn'));
const cacText = (ch, model) => { const r = ch?.cacRange?.[model]; return r ? `${money(r[0])}–${money(r[1])}` : 'n/a'; };
const statusBadge = (s) => badge(s.replace(/_/g, ' '), ['live', 'producing', 'done', 'published', 'accepted', 'signed', 'scheduled'].includes(s) ? 'good' : ['rejected', 'failed', 'missed', 'stalled', 'declined', 'story_died', 'banned'].includes(s) ? 'bad' : ['review', 'building', 'cfp', 'interview', 'pitched', 'booked', 'awaiting_reply', 'applied'].includes(s) ? 'warn' : '');

// ---------------------------------------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------------------------------------

const OBSOLETE = [
  ['Affiliate program = passive revenue', 'Most affiliates never sell; the top ~10% drive most revenue; recurring commissions attract fraud.'],
  ['App stores = free distribution', '4 in 5 Shopify apps have <10 reviews; review queues ~30 days in 2026; fees are changing.'],
  ['Get on TechCrunch and you\'re made', 'Journalists answer ~3% of pitches; coverage spikes last days.'],
  ['Trade-show booth for awareness', '$15k–$50k all-in; ~80% of leads never followed up. Book meetings instead.'],
  ['AppSumo LTD = cheap launch fuel', 'Platform revenue down ~50%; lifetime users carry AI compute cost forever.'],
  ['Big-company partnership will make us', 'Most seed-stage strategic deals stall; sell direct first.'],
  ['SEO-only content', 'AI answers cite third-party sources (84%): reviews, Reddit, listicles, comparison pages.'],
];

export const overview = {
  id: 'overview', label: 'Overview',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s), model = s.company.model;
    const perf = S.performance(s, 90);
    const fees = Object.values(C.monthlyFees);
    const cats = [
      ['affiliates', '🤝 Affiliates', 'affiliate_program', C.affiliates.program?.active ? `${C.affiliates.list.filter((a) => a.status === 'active').length} affiliates` : 'not set up'],
      ['referrals', '🎁 Referrals', 'customer_referral', s.apps.organic?.referral?.enabled ? `on · ${pct(S.referralParticipation(s))} participate` : 'off'],
      ['marketplaces', '🧩 Marketplaces', 'shopify_app_store', `${Object.values(C.stores).filter((x) => x.status === 'live').length} live listings`],
      ['partners', '🏢 Resellers & agencies', 'resellers_var_msp', `${C.partners.list.filter((p) => p.status !== 'dropped').length} partners`],
      ['comarketing', '📣 Co-marketing & webinars', 'tech_comarketing', `${C.comarketing.filter((c) => c.status === 'scheduled').length} upcoming`],
      ['events', '🎤 Events', 'conference_booth', `${C.events.list.filter((e) => !['done', 'missed', 'rejected'].includes(e.status)).length} upcoming`],
      ['pr', '📰 PR', 'diy_pr', `${C.pr.pieces.length} pieces of coverage`],
      ['sponsors', '🎧 Sponsorships', 'podcast_sponsorship', `${C.sponsors.length} placements`],
      ['reviews', '⭐ Reviews & directories', 'review_sites', `${C.reviews.count} reviews`],
      ['tools', '🛠️ Free tools & PLG', 'free_tools', `${C.tools.filter((t) => t.status === 'live').length} tools live`],
      ['ltd', '💸 Lifetime deal', 'appsumo_ltd', C.ltd ? C.ltd.status : 'none'],
      ['direct', '📞 Calls & mail', 'cold_calling', `${C.calls.blocks.length} call blocks`],
      ['ai', '🤖 AI search', 'ai_search_optimization', `${pct(S.aiVisibility(s), 0)} of answers`],
    ].filter(([id]) => !(model === 'b2c' && ['partners', 'direct'].includes(id)));
    return html`
      <div class="stats">
        ${stat('Channel spend (90d)', money(perf.reduce((a, r) => a + r.sp, 0)))}
        ${stat('Customers from these channels (90d)', perf.reduce((a, r) => a + r.customers, 0))}
        ${stat('Recurring channel costs', `${money(fees.reduce((a, f) => a + (f.amount ?? 0), 0))}/mo`, fees.map((f) => f.vendor).join(', ') || 'none')}
        ${stat('Active customers', activeSubs(s).length, `${money(mrr(s))} MRR`)}
      </div>
      <div class="ch-cards">${cats.map(([id, label, chId, st]) => {
        const ch = channelById(chId);
        return html`<a class="card" href="#/channels/${id}" style="text-decoration:none;color:inherit"><h4>${label}</h4>
          <div class="small">${fitBadge(ch?.fit?.[model] ?? 0.5)} <span class="muted">first results ${ch?.daysToFirstResult?.[0]}–${ch?.daysToFirstResult?.[1]} days</span></div>
          <div class="small muted">Typical CAC ${cacText(ch, model)} ${designTag}</div>
          <div class="small"><b>${st}</b></div></a>`;
      })}</div>
      <section class="panel" style="margin-top:14px"><h2>2016 advice vs 2026 reality</h2>
        ${table({ columns: [{ key: 'a', label: 'Old playbook' }, { key: 'b', label: '2026' }], rows: OBSOLETE.map(([a, b]) => ({ a, b })) })}
        <p class="small muted">Sources: docs/research/channels-partnerships-pricing.md §4. Paid ads, SEO, communities, Product Hunt and newsletter sponsorships live in Ads and Organic.</p></section>`;
  },
  wire() {},
};

// ---------------------------------------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------------------------------------

let perfDays = 90;
export const performance = {
  id: 'performance', label: 'Performance',
  render(ctx) {
    const s = ctx.state, model = s.company.model;
    const rows = S.performance(s, perfDays || null);
    return html`<section class="panel"><div class="inline" style="justify-content:space-between"><h2>Channel performance</h2>
      <label style="flex:0 0 auto">Period <select id="perfDays">${[[30, '30 days'], [90, '90 days'], [365, '12 months'], [0, 'All time']].map(([v, l]) => html`<option value="${v}" ${perfDays === v ? 'selected' : ''}>${l}</option>`)}</select></label></div>
      ${table({
        columns: [
          { key: 'label', label: 'Channel' },
          { key: 'sp', label: 'Spend', align: 'right', render: (r) => money(r.sp) },
          { key: 'ld', label: 'Leads / signups', align: 'right', render: (r) => Math.round(r.ld) },
          { key: 'tr', label: 'Trials', align: 'right', render: (r) => Math.round(r.tr) },
          { key: 'customers', label: 'Customers', align: 'right' },
          { key: 'cac', label: 'CAC', align: 'right', render: (r) => (r.cac != null ? money(r.cac) : r.sp ? '∞' : '—') },
          { key: 'bench', label: 'Typical CAC', align: 'right', render: (r) => cacText(channelById(S.KEYS[r.key]?.ch), model) },
          { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => money(r.revenue) },
          { key: 'mrr', label: 'MRR now', align: 'right', render: (r) => money(r.mrr) },
          { key: 'payback', label: 'Payback', align: 'right', render: (r) => (r.payback != null ? `${r.payback.toFixed(1)} mo` : '—') },
        ],
        rows, empty: 'No channel activity yet.',
      })}
      <p class="small muted">Spend includes tool fees, commissions, marketplace revenue share, sponsorships and event costs. Customers count paid conversions attributed to each channel (CRM deals are matched by the lead's email). Sponsorship and podcast listeners who typed your URL later show up as direct traffic${rows.some((r) => r.untracked) ? html` (<b>${rows.reduce((a, r) => a + (r.untracked ?? 0), 0)}</b> untracked signups this period)` : ''}. Payback assumes 80% gross margin. "Typical CAC" ranges are game estimates bounded by research, not benchmarks.</p></section>`;
  },
  wire(root, ctx) { on(root, 'change', '#perfDays', (e) => { perfDays = +e.target.value; ctx.render(); }); },
};

// ---------------------------------------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------------------------------------

export const affiliates = {
  id: 'affiliates', label: 'Affiliates',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s), A = C.affiliates, P = A.program;
    const ch = channelById('affiliate_program');
    const setupForm = html`<form id="affForm" class="grid-3">
      <label>Affiliate software <select name="tool">${Object.entries(M.AFFILIATE_TOOLS).map(([k, t]) => html`<option value="${k}" ${P?.tool === k ? 'selected' : ''}>${t.label} — ${money(t.monthly)}/mo</option>`)}</select><span class="hint">${Object.values(M.AFFILIATE_TOOLS).map((t) => `${t.label}: ${t.note}`).join(' · ')}</span></label>
      <label>Commission (% of revenue) <input type="number" name="rate" min="5" max="60" step="1" value="${Math.round((P?.rate ?? 0.25) * 100)}" /><span class="hint">Rewardful sample: ~22% small programs, ~24.5% at $1M+ (vendor). SMB tools 20–40%.</span></label>
      <label>Duration <select name="months">${[[3, '3 months'], [6, '6 months'], [12, '12 months (most common)'], [24, '24 months'], [0, 'Lifetime (~20% of programs)']].map(([v, l]) => html`<option value="${v}" ${(P?.months ?? 12) === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label>Cookie window <select name="cookie">${[30, 60, 90].map((d) => html`<option value="${d}" ${(P?.cookieDays ?? 60) === d ? 'selected' : ''}>${d} days</option>`)}</select></label>
      <label>Payout delay <select name="delay">${[[0, 'Pay immediately'], [30, 'Net-30 (after refund window)'], [60, 'Net-60']].map(([v, l]) => html`<option value="${v}" ${(P?.payoutDelay ?? 30) === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label style="display:flex;gap:6px;align-items:flex-start"><input type="checkbox" name="terms" style="width:auto;display:inline-block;margin-top:3px" ${P?.terms ? 'checked' : ''}/> I wrote affiliate terms: no brand-keyword bidding, no coupon sites, no self-referrals, payouts after the refund window</label>
      <div><button class="primary">${P ? 'Update terms (0.5h)' : 'Launch program (6h: tool, Stripe integration, terms)'}</button></div></form>`;
    if (!P?.active) {
      return html`<section class="panel"><h2>Affiliate program</h2>
        <p class="muted">Pay creators, bloggers and consultants a share of revenue for customers they refer. ${fitBadge(ch.fit[s.company.model])} First affiliate sale typically 1–4 months after launch ${designTag}. Most recruits never promote: plan on 5–15% ever selling ${designTag}, with the top ~10% producing most sales (vendor blogs).</p>
        ${setupForm}</section>`;
    }
    const list = A.list;
    const producing = list.filter((a) => (a.signups > 0 || a.claims > 0) && a.status === 'active').length;
    const pending = C.payables.filter((p) => p.key === 'affiliate' && p.status === 'pending');
    const brief = currentJudged(s, 'aff_brief');
    return html`
      <div class="stats">
        ${stat('Affiliates', list.filter((a) => a.status === 'active').length, `${A.recruited} recruited · ${A.pendingJoins.length ? 'applications trickling in' : 'no pending applications'}`)}
        ${stat('Producing', producing, `${list.length ? pct(producing / list.length, 0) : '—'} of affiliates`)}
        ${stat('Commissions earned', money(list.reduce((a, x) => a + x.earned, 0)), `${money(list.reduce((a, x) => a + x.paid, 0))} paid`)}
        ${stat('Pending payouts', money(pending.reduce((a, p) => a + p.amount, 0)), `${pending.length} items, paid on the 1st`)}
      </div>
      <div class="grid-2">
        <section class="panel"><h2>1 · Partner kit / affiliate brief</h2>
          <p class="small muted">What affiliates get: who the product is for, commission terms, cookie, payout timing, prohibited tactics, links, demo video, example angles. A good brief raises the share of affiliates who actually promote.</p>
          ${judgeBox(s, 'aff_brief', { label: 'Affiliate brief', hours: 2, rows: 8, placeholder: 'Who it is for, why their audience cares, commission & cookie, payout timing, what is not allowed (brand bidding, coupon sites), assets and example angles…' })}
        </section>
        <section class="panel"><h2>2 · Recruit affiliates</h2>
          <p class="small muted">DM people who already write or record about your category. Personalized DMs (~8 min each) join far more often than templated blasts (~2 min each) ${designTag}.</p>
          ${judgeBox(s, 'aff_dm', { label: 'Recruitment DM (use {first_name} and something specific about their content)', hours: 0.25, rows: 5, placeholder: 'Hi {first_name} — loved your breakdown of …' })}
          <form id="recruitForm" class="inline"><label>Prospects to DM <input type="number" name="count" min="1" max="200" value="20" /></label>
            <label style="display:flex;gap:6px;align-items:center;flex:0 0 auto"><input type="checkbox" name="personalized" checked style="width:auto;display:inline-block"/> Personalize each</label>
            <button class="primary">Send DMs</button></form>
          ${brief ? '' : html`<p class="small warn">No current brief yet — affiliates who join will mostly stay idle.</p>`}
        </section>
      </div>
      <section class="panel"><div class="inline" style="justify-content:space-between"><h2>Your affiliates</h2><span><button id="fraudReview">Review conversions for fraud (1h)</button> <button class="danger" id="closeAff">Close program</button></span></div>
        ${table({
          columns: [
            { key: 'name', label: 'Affiliate' },
            { key: 'joinedDay', label: 'Joined', render: (a) => fmtDate(s, a.joinedDay) },
            { key: 'status', label: 'Status', render: (a) => statusBadge(a.status) },
            { key: 'signups', label: 'Referred signups', align: 'right', render: (a) => a.signups + (a.claims ? ` (+${a.claims} claimed)` : '') },
            { key: 'customers', label: 'Customers', align: 'right' },
            { key: 'earned', label: 'Earned', align: 'right', render: (a) => money(a.earned) },
            { key: 'act', label: '', render: (a) => (a.status === 'active' && !a.activated ? html`<button class="sm" data-activate="${a.id}">Activate personally (1.5h)</button>` : a.activated ? badge('activated', 'accent') : '') },
          ],
          rows: list.slice().sort((a, b) => b.signups - a.signups).slice(0, 80), empty: 'Nobody has joined yet. Joins arrive 3–28 days after your DMs.',
        })}
        <p class="small muted">"Claimed" conversions are customers a coupon site or brand bidder took credit for — you'd have won them anyway. Self-referral fraud shows up as conversions that never become real customers. Fraud review catches more when your terms forbid these tactics; a 30-day payout delay blocks many fake payouts.</p></section>
      <section class="panel"><h2>Terms</h2>${setupForm}</section>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#affForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const first = !S.ensureChannels(ctx.state).affiliates.program;
      ctx.act((st) => { S.launchAffiliates(st, { tool: f.tool, rate: f.rate / 100, months: +f.months, cookieDays: +f.cookie, payoutDelay: +f.delay, terms: f.terms }); ctx.toast(first ? 'Affiliate program launched. Now write the brief and recruit.' : 'Terms updated.', 'good'); }, { hours: first ? 6 : 0.5, label: 'Affiliate program setup' });
    });
    on(root, 'submit', '#recruitForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const j = currentJudged(ctx.state, 'aff_dm');
      if (!j) return ctx.toast('Get feedback on your current DM first (the panel judges the version you send).', 'warn');
      const count = Math.max(1, Math.min(200, f.count | 0));
      const hours = round2(count * (f.personalized ? 8 : 2) / 60);
      ctx.act((st) => { const joins = S.recruitAffiliates(st, { count, personalized: f.personalized, judged: j }); ctx.toast(`Sent ${count} DMs. ${joins ? 'A few replied positively — applications will arrive over the next weeks.' : 'Crickets so far.'}`, joins ? 'good' : 'info'); }, { hours, label: 'Affiliate recruitment DMs' });
    });
    on(root, 'click', '[data-activate]', (e, el) => ctx.act((st) => S.activateAffiliate(st, el.dataset.activate), { hours: 1.5, label: 'Affiliate activation' }));
    on(root, 'click', '#fraudReview', () => ctx.act((st) => { const c = S.reviewAffiliateFraud(st); ctx.toast(c.length ? `Banned ${c.length} affiliate(s) for prohibited tactics; their pending payouts are blocked.` : 'Nothing suspicious found this time.', c.length ? 'warn' : 'info'); }, { hours: 1, label: 'Affiliate fraud review' }));
    on(root, 'click', '#closeAff', () => { if (confirm('Close the affiliate program and cancel the tool?')) ctx.act((st) => S.closeAffiliates(st)); });
    wireJudgeHelper(root, ctx, { aff_brief: ['affiliate_brief', 2, 60], aff_dm: ['affiliate_outreach', 0.25, 20] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Referrals (full program; shares state.apps.organic.referral with the Organic app's word-of-mouth engine)
// ---------------------------------------------------------------------------------------------------------

export const referrals = {
  id: 'referrals', label: 'Referrals',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s), O = ensureOrganic(s), R0 = C.referral;
    const part = S.referralParticipation(s);
    const active = activeSubs(s).length;
    const perMonth = M.referralSignupsPerMonth(active, part);
    const newCust = (s.stripe?.events ?? []).filter((e) => e.type === 'new' && e.day > s.day - 90);
    const refShare = newCust.length ? newCust.filter((e) => e.source === 'referral').length / newCust.length : null;
    const organicOn = s.apps.organic?.lastK != null;
    return html`<div class="stats">
        ${stat('Program', O.referral.enabled ? 'On' : 'Off', O.referral.enabled ? `${O.referral.twoSided ? 'double-sided' : 'one-sided'} · ${O.referral.reward.replace('_', ' ')}` : '')}
        ${stat('Est. participation', pct(part, 1), html`share of customers who invite someone / month ${designTag}`)}
        ${stat('Est. referral signups', perMonth.toFixed(1), `per month from ${active} customers`)}
        ${stat('Referral share of new customers', refShare == null ? '—' : pct(refShare, 0), 'last 90 days · new programs 5–15%, best-in-class 20–30% (vendor)')}
        ${stat('Rewards given', money(C.stats.referral?.credits ?? 0), 'credits / free months (revenue you didn\'t bill)')}
      </div>
      <div class="grid-2"><section class="panel"><h2>Program design</h2>
        <form id="refForm">
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="enabled" style="width:auto;display:inline-block" ${O.referral.enabled ? 'checked' : ''}/> Program on</label>
          <div class="grid-2">
            <label>Reward <select name="reward">${[['free_month', 'Free month (product credit)'], ['credit', 'Account credit / extra usage'], ['cash', 'Cash']].map(([v, l]) => html`<option value="${v}" ${O.referral.reward === v ? 'selected' : ''}>${l}</option>`)}</select><span class="hint">Credits/extra usage reportedly beat cash (vendor compilations).</span></label>
            <label>Reward size (% of first-year value, credit) <input type="number" name="rewardPct" min="5" max="50" value="${Math.round(R0.rewardPct * 100)}" /><span class="hint">Typical 15–25%.</span></label>
            <label>Cash amount per side ($) <input type="number" name="cash" min="5" max="500" value="${O.referral.cashAmount ?? 20}" /></label>
            <label>Tool <select name="tool">${Object.entries(S.REFERRAL_TOOLS).map(([k, t]) => html`<option value="${k}" ${R0.tool === k ? 'selected' : ''}>${t.label}${t.monthly ? ` — $${t.monthly}/mo` : ''}</option>`)}</select></label>
          </div>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="twoSided" style="width:auto;display:inline-block" ${O.referral.twoSided ? 'checked' : ''}/> Double-sided (both referrer and friend get the reward)</label>
          <fieldset><legend>Where you ask</legend>${Object.entries(M.REFERRAL_PLACEMENTS).map(([k, p]) => html`<label style="display:flex;gap:6px;align-items:flex-start"><input type="checkbox" name="pl_${k}" style="width:auto;display:inline-block;margin-top:3px" ${R0.placements.includes(k) ? 'checked' : ''}/> ${p.label} <span class="muted small">(${S.PLACEMENT_HOURS[k]}h to build)</span></label>`)}</fieldset>
          <button class="primary">Save program</button>
        </form>
        <p class="small muted">${organicOn ? 'The Organic app\'s word-of-mouth engine already turns your program into referral signups (K-factor). This tab adds the uplift from where and how you ask, launch campaigns, and books reward costs.' : 'Referral signups are simulated here from participation × ~3 invites × ~12% accept (game estimates within vendor ranges).'} Failure mode: launched before customers love the product, participation stays at 1–3%.</p>
      </section>
      <section class="panel"><h2>Announce it to customers</h2>
        <p class="small muted">One email to existing customers right after a good moment. Expect a two-week burst; repeat no more than every 60 days.</p>
        ${judgeBox(s, 'ref_email', { label: 'Announcement email', hours: 0.75, placeholder: 'Subject + body: what both sides get, the link, why now…' })}
        <button id="refLaunch" class="primary" ${O.referral.enabled ? '' : 'disabled'}>Send to ${active} customers (0.25h)</button>
        ${R0.launches.length ? html`<ul class="list small">${R0.launches.slice(-5).reverse().map((l) => html`<li>${fmtDate(s, l.day)} · ${l.active} customers · feedback ${l.score}/10 · ~${l.expected.toFixed(1)} expected signups</li>`)}</ul>` : ''}
      </section></div>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#refForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const C = S.ensureChannels(ctx.state);
      const placements = Object.keys(M.REFERRAL_PLACEMENTS).filter((k) => f[`pl_${k}`]);
      const added = placements.filter((p) => !C.referral.placements.includes(p));
      const toolHours = f.tool !== C.referral.tool ? S.REFERRAL_TOOLS[f.tool].hours : 0;
      const hours = round2(added.reduce((a, p) => a + S.PLACEMENT_HOURS[p], 0) + toolHours + 0.25);
      ctx.act((st) => S.configureReferral(st, { enabled: f.enabled, reward: f.reward, twoSided: f.twoSided, cashAmount: f.cash, rewardPct: (f.rewardPct ?? 20) / 100, placements, tool: f.tool }), { hours, label: 'Referral program' });
    });
    on(root, 'click', '#refLaunch', () => {
      const j = currentJudged(ctx.state, 'ref_email');
      if (!j) return ctx.toast('Get feedback on the current email first.', 'warn');
      ctx.act((st) => { const x = S.launchReferralEmail(st, j); ctx.toast(`Sent. Expect ~${x.toFixed(1)} referral signups over two weeks.`, 'good'); }, { hours: 0.25, label: 'Referral announcement' });
    });
    wireJudgeHelper(root, ctx, { ref_email: ['referral_email', 0.75, 30] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Marketplaces & app stores
// ---------------------------------------------------------------------------------------------------------

export const marketplaces = {
  id: 'marketplaces', label: 'Marketplaces',
  render(ctx) {
    const s = ctx.state, model = s.company.model;
    const sel = ctx.params.split(':')[1];
    if (sel && STORES[sel]) return storeDetail(ctx, sel);
    const rows = Object.entries(STORES).map(([id, St]) => ({ id, St, st: S.storeState(s, id), ch: channelById(St.channel) }));
    return html`<section class="panel"><h2>Integration marketplaces & app stores</h2>
      <p class="muted">Build the integration (engineering hours go into your Product build queue), write the listing, pass review, then fight the cold start: a listing gets ~0–2 organic installs a week until it has ~10 reviews. Ramp to steady state takes 6–18 months ${designTag}.</p>
      ${table({
        columns: [
          { key: 'n', label: 'Store', render: (r) => html`<a href="#/channels/marketplaces:${r.id}">${r.St.label}</a>` },
          { key: 'fit', label: 'Fit', render: (r) => fitBadge(r.ch.fit[model]) },
          { key: 'fee', label: 'Fees', render: (r) => html`<span class="small">${r.St.feeText}</span>` },
          { key: 'rev', label: 'Review', render: (r) => `${r.St.review[0]}–${r.St.review[1]} days` },
          { key: 'setup', label: 'Build', align: 'right', render: (r) => `~${Math.round(r.ch.setupHours * 0.8)}h eng + ${Math.round(r.ch.setupHours * 0.2)}h` },
          { key: 'st', label: 'Status', render: (r) => statusBadge(r.st.status) },
          { key: 'inst', label: 'Installs', align: 'right', render: (r) => r.st.installs },
          { key: 'revs', label: 'Reviews', align: 'right', render: (r) => r.st.reviews },
        ], rows,
      })}</section>`;
  },
  wire(root, ctx) {
    const id = ctx.params.split(':')[1];
    if (!id || !STORES[id]) return;
    const St = STORES[id];
    on(root, 'click', '#storeStart', () => {
      const ch = channelById(St.channel);
      ctx.act((st) => { const r = S.startStoreBuild(st, id); ctx.toast(`Added "${r.feature.title}" (${r.feature.effortHours}h human-equivalent) to your Product build queue.`, 'good'); }, { hours: Math.round(ch.setupHours * 0.2), label: `${St.label}: partner program, docs & listing assets` });
    });
    on(root, 'click', '#storeTop', () => ctx.act((st) => { const q = st.apps.product.buildQueue; const fid = S.storeState(st, id).featureId; st.apps.product.buildQueue = [fid, ...q.filter((x) => x !== fid)]; }));
    on(root, 'click', '#storeSubmit', () => {
      const sens = root.querySelector('#sensitive')?.checked;
      ctx.act((st) => { const d = S.submitStore(st, id, { sensitiveScopes: sens }); ctx.toast(`Submitted. Review typically takes days to weeks (this one: you'll know in ~${d} days).`, 'info'); }, { hours: 1, label: `${St.label} submission` });
    });
    on(root, 'submit', '#recruitInstalls', (e) => {
      e.preventDefault();
      const n = Math.max(1, Math.min(100, formData(e.target).n | 0));
      ctx.act((st) => { const r = S.recruitInstalls(st, id, n); ctx.toast(`${r.installs} installed, ${r.reviews} left a review.`, 'good'); }, { hours: round2(n * 0.25), label: `${St.label}: hand-recruiting installs` });
    });
    on(root, 'click', '#useListing', () => ctx.act((st) => { const j = currentJudged(st, `listing_${id}`); if (!j) throw new Error('Get feedback on the current listing first.'); S.storeState(st, id).listing = j; ctx.toast('Listing saved.', 'good'); }, { hours: 0.1, label: 'Listing' }));
    wireJudgeHelper(root, ctx, { [`listing_${id}`]: ['listing', 1.5, 60, { context: `Marketplace: ${St.label}` }] });
  },
};

function storeDetail(ctx, id) {
  const s = ctx.state, St = STORES[id], st = S.storeState(s, id), ch = channelById(St.channel);
  const prog = S.storeBuildProgress(s, id);
  const live = st.status === 'live';
  return html`<p><a href="#/channels/marketplaces">← All marketplaces</a></p>
    <section class="panel"><h2>${St.label}</h2>
      <div class="kv"><b>Fees</b><span>${St.feeText}</span><b>Review</b><span>${St.review[0]}–${St.review[1]} days${St.reviewFee ? ` · $${St.reviewFee} per security review` : ''}</span><b>Notes</b><span>${St.notes}</span>
      <b>Install → paid</b><span>${pct(ch.steadyStateMonthly.conversionToPaid[0], 1)}–${pct(ch.steadyStateMonthly.conversionToPaid[1], 1)} ${designTag}</span><b>Status</b><span>${statusBadge(st.status)}${st.rejectReason && st.status === 'rejected' ? html` <span class="small bad">${st.rejectReason}</span>` : ''}</span></div>
      ${st.status === 'none' ? html`<p><button class="primary" id="storeStart">Start integration (${Math.round(ch.setupHours * 0.2)}h docs & listing assets now; ~${Math.round(ch.setupHours * 0.8)}h engineering via Product)</button></p>` : ''}
      ${st.status === 'building' ? html`<p>Engineering: ${pct(prog.pct, 0)} ${meter(prog.pct)}</p><p class="small"><a href="#/product">Open Product</a> to run build sessions · <button class="sm" id="storeTop">Move to top of build queue</button></p>` : ''}
    </section>
    ${['built', 'rejected', 'building'].includes(st.status) ? html`<section class="panel"><h2>Listing</h2>
      <p class="small muted">Store search drives most installs: lead with the keyword buyers type, one clear outcome, how setup works, pricing/trial, and proof.</p>
      ${judgeBox(s, `listing_${id}`, { label: 'Name, tagline and description', hours: 1.5, rows: 8, placeholder: 'App name — tagline\n\nWhat it does in one sentence…\nHow it works (3 steps)…\nPricing & free trial…' })}
      <button id="useListing">Use this listing</button> ${st.listing ? badge(`saved listing ${st.listing.score}/10`, 'accent') : ''}
      ${st.status !== 'building' ? html`<p>${id === 'google_workspace' ? html`<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="sensitive" style="width:auto;display:inline-block"/> Requests sensitive Gmail/Drive scopes (extra verification, can take months)</label>` : ''}
        <button class="primary" id="storeSubmit" ${st.listing ? '' : 'disabled'}>Submit for review (1h${St.reviewFee ? `, $${St.reviewFee}` : ''})</button></p>` : ''}
    </section>` : ''}
    ${st.status === 'review' ? html`<section class="panel"><p>In review. Decision expected around ${fmtDate(s, st.reviewDay)}.</p></section>` : ''}
    ${live ? html`<div class="stats">${stat('Installs', st.installs, `${st.handInstalls ?? 0} hand-recruited`)}${stat('Reviews', st.reviews, st.reviews < 10 ? 'cold start: <10 reviews' : 'past the cold start')}${stat('Revenue via store', money(st.lifetimeRev))}${stat('Rev share accrued', money(st.feeAccrued), 'charged on the 1st')}</div>
      <section class="panel"><h2>Break the cold start</h2><p class="small muted">Hand-recruit the first 20–50 installs (merchant groups, agencies, your own customers) and ask each for a review. ~15 min per person ${designTag}.</p>
        <form id="recruitInstalls" class="inline"><label>People to contact <input type="number" name="n" min="1" max="100" value="10" /></label><button class="primary">Reach out</button></form>
        ${st.native ? html`<div class="callout bad">The platform shipped a native feature that overlaps yours on ${fmtDate(s, st.native)}. Installs dropped ~70%.</div>` : ''}${st.certified ? html`<div class="callout good">Certified: better placement.</div>` : ''}</section>` : ''}`;
}

// ---------------------------------------------------------------------------------------------------------
// Resellers & agencies
// ---------------------------------------------------------------------------------------------------------

let pitchTarget = null;
export const partners = {
  id: 'partners', label: 'Resellers & agencies', models: ['smb', 'ent'],
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s);
    const prospects = partnerProspects(s);
    const target = prospects.find((p) => p.id === pitchTarget);
    return html`<div class="grid-2">${Object.entries(S.PARTNER_TERMS).map(([k, T]) => {
        const prog = C.partners.program[k];
        return html`<section class="panel"><h2>${T.label} program</h2><p class="small muted">${T.note}. ${k === 'reseller' ? 'Reseller margins 20–40% (Monetizely/Reditus, vendor); Microsoft Dynamics partner median 30.7%.' : 'Referral fees 10–25% of first-year revenue or 15–30% recurring (vendor guides).'}</p>
          <form class="inline" data-prog="${k}"><label>${k === 'reseller' ? 'Reseller margin %' : 'Referral fee % of first-year revenue'} <input type="number" name="margin" min="5" max="60" value="${Math.round((prog?.margin ?? T.margin) * 100)}"/></label>
          <button class="${prog ? '' : 'primary'}">${prog ? 'Update (0.25h)' : `Set up (${T.setupHours}h${T.setupCost ? `, $${T.setupCost.toLocaleString()} legal` : ''})`}</button></form></section>`;
      })}</div>
      <section class="panel"><h2>Partner prospects</h2><p class="small muted">Agencies, consultants, MSPs and VARs already selling to your ICP. ${designTag} First partner-sourced deal 3–9 months after signing; only ~1 in 3–5 partners ever closes one; enablement 5–10 h/week per active partner during ramp. Partner involvement lifts win rates ~12% (Crossbeam, vendor).</p>
        ${table({ columns: [
          { key: 'name', label: 'Company' }, { key: 'type', label: 'Type' }, { key: 'clients', label: 'Clients', align: 'right' },
          { key: 'fit', label: 'ICP overlap', render: (p) => meter(p.fit) },
          { key: 'st', label: '', render: (p) => { const pt = C.partners.pitched[p.id]; return pt ? (pt.done ? (pt.signs ? badge('signed', 'good') : badge('declined', 'bad')) : badge('pitched', 'warn')) : html`<button class="sm" data-pitch="${p.id}">Pitch</button>`; } },
        ], rows: prospects })}
        ${target ? html`<div class="card"><h3>Pitch ${target.name} (${target.type})</h3>
          ${judgeBox(s, 'partner_pitch', { label: 'Partner pitch email', hours: 0.5, placeholder: 'Why their clients need this, what they earn (margin/fee), how you support them (training, co-selling, deal registration)…' })}
          <button class="primary" id="sendPitch">Send pitch (0.1h)</button></div>` : ''}
      </section>
      <section class="panel"><h2>Signed partners</h2>
        ${table({ columns: [
          { key: 'name', label: 'Partner' }, { key: 'kind', label: 'Kind' },
          { key: 'signedDay', label: 'Signed', render: (p) => fmtDate(s, p.signedDay) },
          { key: 'eng', label: 'Engagement', render: (p) => meter(p.engagement, p.engagement < M.PARTNER.stall ? 'bad' : '') },
          { key: 'status', label: 'Status', render: (p) => statusBadge(p.status) },
          { key: 'deals', label: 'Deals', align: 'right' }, { key: 'sessions', label: 'Sessions', align: 'right' },
          { key: 'a', label: '', render: (p) => (p.status === 'dropped' ? '' : html`<button class="sm" data-enable="${p.id}">Enablement session (2h)</button> <button class="sm danger" data-drop="${p.id}">Drop</button>`) },
        ], rows: C.partners.list, empty: 'No partners yet.' })}
        <p class="small muted">Engagement decays every week without enablement (training, co-selling their first deals, deal reviews). Below the line, partners quietly go back to selling what they already know.</p></section>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '[data-prog]', (e, el) => {
      e.preventDefault();
      const k = el.dataset.prog;
      const first = !S.ensureChannels(ctx.state).partners.program[k];
      ctx.act((st) => S.setupPartnerProgram(st, k, formData(el).margin / 100), { hours: first ? S.PARTNER_TERMS[k].setupHours : 0.25, label: `${S.PARTNER_TERMS[k].label} program` });
    });
    on(root, 'click', '[data-pitch]', (e, el) => { pitchTarget = el.dataset.pitch; ctx.render(); });
    on(root, 'click', '#sendPitch', () => {
      const p = partnerProspects(ctx.state).find((x) => x.id === pitchTarget);
      const j = currentJudged(ctx.state, 'partner_pitch');
      if (!j) return ctx.toast('Get feedback on the current pitch first.', 'warn');
      ctx.act((st) => { S.pitchPartner(st, p, j); pitchTarget = null; ctx.toast(`Pitched ${p.name}. Expect an answer in 1–3 weeks (in Mail).`, 'info'); }, { hours: 0.1, label: 'Partner pitch' });
    });
    on(root, 'click', '[data-enable]', (e, el) => ctx.act((st) => S.enablePartner(st, el.dataset.enable), { hours: 2, label: 'Partner enablement' }));
    on(root, 'click', '[data-drop]', (e, el) => ctx.act((st) => { const p = S.ensureChannels(st).partners.list.find((x) => x.id === el.dataset.drop); if (p) p.status = 'dropped'; }));
    wireJudgeHelper(root, ctx, { partner_pitch: ['partner_pitch', 0.5, 30, () => { const p = partnerProspects(ctx.state).find((x) => x.id === pitchTarget); return { name: p?.name, type: p?.type, recipient: p?.name }; }] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Co-marketing & webinars
// ---------------------------------------------------------------------------------------------------------

let cmTarget = null, cmType = 'webinar';
export const comarketing = {
  id: 'comarketing', label: 'Co-marketing & webinars',
  render(ctx) {
    const s = ctx.state, C = S.ensureChannels(s);
    const ours = Math.round(S.ourAudience(s));
    const list = coPartners(s);
    const target = list.find((p) => p.id === cmTarget);
    return html`<section class="panel"><h2>Partners with an overlapping audience</h2>
      <p class="small muted">Co-webinars, newsletter swaps and joint launch posts are mostly founder time (10–25h per activity ${designTag}). They work between companies of similar audience size — big partners rarely reciprocate for a seed startup. Your reachable audience: ~${ours.toLocaleString()}.</p>
      ${table({ columns: [
        { key: 'name', label: 'Company' }, { key: 'category', label: 'What they make' },
        { key: 'audience', label: 'Audience', align: 'right', render: (p) => p.audience.toLocaleString() },
        { key: 'ratio', label: 'Size vs you', render: (p) => { const r = p.audience / Math.max(50, ours); return r > 10 ? badge(`${Math.round(r)}× bigger`, 'warn') : badge(`${r.toFixed(1)}×`, ''); } },
        { key: 'overlap', label: 'Overlap', render: (p) => meter(p.overlap) },
        { key: 'a', label: '', render: (p) => html`<button class="sm" data-cm="${p.id}">Propose…</button>` },
      ], rows: list })}
      ${target ? html`<div class="card"><h3>Proposal to ${target.contact} at ${target.name}</h3>
        <label>Activity <select id="cmType">${Object.entries(S.COMARKETING_TYPES).map(([k, t]) => html`<option value="${k}" ${cmType === k ? 'selected' : ''}>${t.label}</option>`)}</select></label>
        ${judgeBox(s, 'cm_proposal', { label: 'Your proposal email', hours: 0.75, placeholder: 'Why your audiences overlap, the specific idea and date range, what each side promotes, what they get…' })}
        <button class="primary" id="cmSend">Send proposal</button></div>` : ''}
      <p><button id="soloWebinar">Host your own webinar (0.5h to set up)</button> <span class="small muted">Registrations come from your own list; a seed startup without a list gets 20–100 ${designTag}. Live attendance 40–60% of registrants (Goldcast/ON24 platform data).</span></p>
    </section>
    <section class="panel"><h2>Activities</h2>${table({ columns: [
      { key: 'p', label: 'With', render: (c) => c.partnerName ?? 'Solo' },
      { key: 'type', label: 'Type', render: (c) => S.COMARKETING_TYPES[c.type].label },
      { key: 'status', label: 'Status', render: (c) => statusBadge(c.status) },
      { key: 'day', label: 'Date', render: (c) => (c.eventDay != null ? fmtDate(s, c.eventDay) : c.status === 'pitched' ? 'awaiting reply' : '—') },
      { key: 'res', label: 'Result', render: (c) => (c.registrants != null ? `${c.registrants} registered · ${c.attendees} attended` : '') },
      { key: 'a', label: '', render: (c) => (c.status === 'scheduled' ? html`${c.prep ? badge('prepared', 'good') : html`<button class="sm" data-prep="${c.id}">${c.type === 'swap' ? 'Write your feature' : 'Prepare content'} (${S.COMARKETING_TYPES[c.type].prepHours}h)</button>`} ${S.COMARKETING_TYPES[c.type].promoHours ? (c.promo ? badge('promoted', 'good') : html`<button class="sm" data-promo="${c.id}">Promote to your list (${S.COMARKETING_TYPES[c.type].promoHours}h)</button>`) : ''}` : '') },
    ], rows: C.comarketing, empty: 'Nothing yet.' })}</section>`;
  },
  wire(root, ctx) {
    on(root, 'click', '[data-cm]', (e, el) => { cmTarget = el.dataset.cm; ctx.render(); });
    on(root, 'change', '#cmType', (e) => { cmType = e.target.value; });
    on(root, 'click', '#cmSend', () => {
      const p = coPartners(ctx.state).find((x) => x.id === cmTarget);
      const j = currentJudged(ctx.state, 'cm_proposal');
      if (!j) return ctx.toast('Get feedback on the current proposal first.', 'warn');
      ctx.act(async (st) => {
        const c = S.proposeComarketing(st, { partnerId: p.id, type: cmType, judged: j });
        // Persona writes the reply consistent with the decision the game already made.
        const r = await personaReply(ctx, { persona: `${p.contact} at ${p.name}, a ${p.category} with an audience of ~${p.audience}`, situation: `A smaller company (${st.company.name}: ${st.company.oneLiner}) proposed a ${S.COMARKETING_TYPES[cmType].label.toLowerCase()}:\n${j.text}`, decision: c.accept ? 'yes, interested, propose next steps' : 'no, politely decline', fallback: () => ({ subject: '', body: '' }) });
        const m = S.ensureChannels(st).mail.find((x) => x.refId === c.id);
        if (m && r.body) m.body = r.body;
        cmTarget = null;
        ctx.toast(`Sent to ${p.name}. Their reply will land in Mail within a week.`, 'info');
      }, { hours: 0.1, label: 'Co-marketing proposal' });
    });
    on(root, 'click', '#soloWebinar', () => ctx.act((st) => { S.proposeComarketing(st, { partnerId: null, type: 'webinar', judged: { quality: 0.5 } }); ctx.toast('Webinar scheduled ~3 weeks out and added to your calendar. Prepare and promote it.', 'good'); }, { hours: 0.5, label: 'Webinar setup' }));
    on(root, 'click', '[data-prep]', (e, el) => { const c = S.ensureChannels(ctx.state).comarketing.find((x) => x.id === el.dataset.prep); ctx.act((st) => S.prepComarketing(st, c.id, 'prep'), { hours: S.COMARKETING_TYPES[c.type].prepHours, label: 'Co-marketing prep' }); });
    on(root, 'click', '[data-promo]', (e, el) => { const c = S.ensureChannels(ctx.state).comarketing.find((x) => x.id === el.dataset.promo); ctx.act((st) => S.prepComarketing(st, c.id, 'promo'), { hours: S.COMARKETING_TYPES[c.type].promoHours, label: 'Webinar promotion' }); });
    wireJudgeHelper(root, ctx, { cm_proposal: ['comarketing', 0.75, 30, () => { const p = coPartners(ctx.state).find((x) => x.id === cmTarget); return { ...p, recipient: p?.contact }; }] });
  },
};

export { CHANNELS };
