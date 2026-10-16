// Launch playbook UI: Playbook (funnel and payback by channel), App & store, Paywall, Creators, Clipping, Meta app ads.

import { html, mount, on, formData, toast, table, stat, badge } from '../../core/ui.js';
import { pct, round2, fmtDate } from '../../core/util.js';
import { ensureConsumer, saturation } from './state.js';
import { STACKS, REVIEW, PAYWALL, CREATORS, CLIPPING, PAID, ACCOUNTS, EAS } from './params.js';
import { MOBILE } from '../../core/mobile.js';
import { chooseStack, buildApp, buildHours, enrollApple, enrollGoogle, appleReady, setEasPlan, runBeta, setListing, differentiation, reviewRisks, submitForReview, hasAgent, mobileOn, mobileLive } from './store.js';
import { setPaywall, setQuiz, setMode, setTooling, enrollSmallBusiness, judgeDisclosure, planMix, expectedFunnel, currentCommission, startPaywallTest, concludePaywallTest, paywallTestVerdict } from './monetize.js';
import { postBrief, hireCreators, auditDisclosure, promoteToAds, setMarketplace, creatorStats } from './creators.js';
import { launchCampaign as launchClip, closeCampaign, clippingStats, crackdownDays, marketCpm, fraudShare } from './clipping.js';
import { launchCampaign as launchMeta, setBudget, pauseCampaign, addAppCreative, setTarget, campaignRows, paidStats } from './paid.js';
import { playbookSummary } from './funnel.js';
import { ensureAds } from '../growth/adsEngine.js';

const TABS = [['playbook', 'Playbook'], ['app', 'App & store'], ['paywall', 'Paywall'], ['creators', 'Creators'], ['clipping', 'Clipping'], ['ads', 'Meta app ads']];
const drafts = {};
const usd = (n) => (n == null ? '—' : `$${Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : round2(n).toFixed(2)}`);
const x2 = (n) => (n == null ? '—' : `${n.toFixed(2)}x`);

// Run an engine action: hours are charged up front by ctx.act and refunded if the engine says no.
function run(ctx, hours, label, fn, okMsg = null) {
  return ctx.act((st) => {
    const r = fn(st);
    if (r && r.ok === false) throw new Error(r.error || 'Not possible right now.');
    const msg = okMsg ?? r?.note;
    if (msg) toast(msg, 'good');
    return r;
  }, { hours, label });
}
const sel = (name, opts, cur) => html`<select name="${name}">${opts.map(([k, l]) => html`<option value="${k}" ${String(cur) === String(k) ? 'selected' : ''}>${l}</option>`)}</select>`;

export function render(root, ctx) {
  const s = ctx.state;
  const C = ensureConsumer(s);
  const tab = TABS.some(([k]) => k === ctx.params) ? ctx.params : 'playbook';
  mount(root, html`
    <div class="app-head"><div><h1>Launch playbook</h1><p>Compose any acquisition stack with any monetization and read it as one funnel. The 2026 consumer-app recipe (AI agent + Expo + hard paywall + Meta ads + creator marketplace + clipping) is one path through it. Survivorship warning: about 17% of new subscription apps reach $1k MRR and about 4.6% reach $10k (RevenueCat, via the research notes); founder posts come from the top of that curve.</p></div></div>
    ${s.company.model !== 'b2c' ? html`<div class="callout warn">This module is for consumer (B2C) subscription apps. Your company is set up as ${s.company.model.toUpperCase()}; creators and clipping still deliver web visitors, but the store path is off.</div>` : ''}
    <div class="tabs">${TABS.map(([k, l]) => html`<button data-ltab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`)}</div>
    <div id="lpBody"></div>`);
  on(root, 'click', '[data-ltab]', (e, el) => ctx.navigate('launch', el.dataset.ltab));
  on(root, 'input', '[data-draft]', (e, el) => { drafts[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value; });
  const body = root.querySelector('#lpBody');
  ({ playbook, app: appTab, paywall, creators, clipping, ads })[tab](body, ctx, C);
}

// ---------------------------------------------------------------- playbook

function playbook(body, ctx, C) {
  const s = ctx.state;
  const P = playbookSummary(s);
  const t = P.totals;
  const sat = saturation(s);
  mount(body, html`
    <div class="stats">
      ${stat('Installs (all channels)', t.installs.toLocaleString(), `${t.views.toLocaleString()} content views`)}
      ${stat('Paying customers', t.paying.toLocaleString(), `${t.retained.toLocaleString()} still subscribed`)}
      ${stat('Blended CAC', usd(t.blendedCac), `paid-only ${usd(t.paidCac)} · spend ${usd(t.spend)}`)}
      ${stat('Payback', P.payback == null ? 'not within a year' : `${P.payback} days`, 'cumulative net revenue per payer vs CAC')}
      ${stat('Category saturation', pct(sat, 0), 'many apps run this playbook [design]')}
    </div>
    <section class="panel"><h2>Funnel by channel</h2>
      ${table({ columns: [
        { label: 'Channel', render: (r) => r.label },
        { label: 'Views', align: 'right', render: (r) => r.views ? r.views.toLocaleString() : '—' },
        { label: 'Installs', align: 'right', render: (r) => r.installs.toLocaleString() },
        { label: 'Paywall views', align: 'right', render: (r) => r.pwViews.toLocaleString() },
        { label: 'Starts', align: 'right', render: (r) => r.starts.toLocaleString() },
        { label: 'Paying', align: 'right', render: (r) => r.paying },
        { label: 'Retained', align: 'right', render: (r) => r.retained },
        { label: 'Spend', align: 'right', render: (r) => usd(r.spend) },
        { label: 'Cost / install', align: 'right', render: (r) => usd(r.cpi) },
        { label: 'Cost / start', align: 'right', render: (r) => usd(r.costPerStart) },
        { label: 'CAC', align: 'right', render: (r) => usd(r.cac) },
      ], rows: P.rows, empty: 'No channel has delivered yet. Build the app, get through review, then start a channel.' })}
      <p class="small muted">Founder hours are not in the cost columns; check the time log. Every channel feeds the same paywall and plan mix, so a stronger paywall lifts all of them and a weak one wastes them all.</p>
    </section>
    <div class="grid-2">
      <section class="panel"><h2>LTV by plan (12 months, per subscriber)</h2>
        ${table({ columns: [{ label: 'Plan', render: (r) => r.n }, { label: 'Price', align: 'right', render: (r) => usd(r.price) }, { label: 'Gross', align: 'right', render: (r) => usd(r.gross) }, { label: 'Net of store', align: 'right', render: (r) => usd(r.net) }, { label: 'Share of buyers', align: 'right', render: (r) => pct(P.mix[r.n] ?? 0, 0) }], rows: Object.entries(P.ltv).map(([n, v]) => ({ n, ...v })) })}
        <p class="small muted">Retention curves: weekly ~3% at one year, monthly ~11%, annual ~28% (RevenueCat medians). Net of ${pct(1 - P.roas.net, 0)} store commission and refunds.</p>
      </section>
      <section class="panel"><h2>Paid payback (Meta, mature cohorts)</h2>
        ${table({ columns: [{ label: 'Window', render: (r) => r.k }, { label: 'Spend', align: 'right', render: (r) => usd(r.v.spend) }, { label: 'Revenue', align: 'right', render: (r) => usd(r.v.revenue) }, { label: 'ROAS gross', align: 'right', render: (r) => x2(r.v.roas) }, { label: 'ROAS net', align: 'right', render: (r) => x2(r.v.netRoas) }], rows: [{ k: 'D7', v: P.roas.d7 }, { k: 'D30', v: P.roas.d30 }] })}
        <p class="small muted">Target D7 ROAS ${C.paid.target.d7Roas}x on ${C.paid.target.basis} revenue. Ad platforms report iOS late and low; this table uses true revenue from Stripe cohorts.</p>
      </section>
    </div>
    <section class="panel"><h2>Expected funnel on your paywall (median product fit)</h2>
      <p class="small">${Object.entries(P.expected).map(([k, r]) => `${k === 'meta' ? 'Meta ad install' : 'Store search install'}: ${pct(r.pView, 0)} see the paywall, ${pct(r.pStart, 1)} start, ${pct(r.installToPaid, 1)} become paying`).join(' · ')}.</p>
      <p class="small muted">Median anchors: hard paywall ~12% download-to-paid by Day 35 vs freemium ~2%; Day-60 revenue per install $3.09 vs $0.38 (RevenueCat 2026). Your fit, hook and paywall move you around them.</p>
    </section>`);
}

// ---------------------------------------------------------------- app and store

function appTab(body, ctx, C) {
  const s = ctx.state;
  const A = C.app;
  const stack = A.stack ? STACKS[A.stack] : null;
  const risks = A.built ? reviewRisks(s, 'ios') : null;
  mount(body, html`
    <section class="panel"><h2>Platform stack</h2>
      ${hasAgent(s) ? html`<div class="callout good">An AI coding agent is configured in Product: JS stacks build in about half the hours.</div>` : html`<div class="callout">No AI coding agent configured in Product yet. With one, Expo reaches an MVP in roughly half the hours.</div>`}
      <form id="stackForm" class="inline">${sel('stack', [['', 'Choose…'], ...Object.entries(STACKS).map(([k, v]) => [k, `${v.label} (~${buildHours(s, k)} h)`])], A.stack ?? '')} <button class="primary">${A.stack ? 'Switch stack' : 'Choose'}</button></form>
      ${stack ? html`<p class="small muted">${stack.note}</p>` : ''}
      ${A.stack && !A.built ? html`<button class="primary" id="buildApp">Build the MVP (${buildHours(s)} h)</button>` : A.built ? html`<p>${badge('Built', 'good')} on day ${A.builtDay}${A.withAgent ? ' with your agent' : ''}.</p>` : ''}
    </section>
    ${stack?.store ? html`
    <div class="grid-2">
      <section class="panel"><h2>Developer accounts and builds</h2>
        <p>Apple Developer Program $${ACCOUNTS.appleYear}/yr: ${A.apple.day != null ? badge(appleReady(s) ? 'Enrolled' : 'Pending', appleReady(s) ? 'good' : 'warn') : html`<button id="enrollApple">Enroll</button>`}</p>
        <p>Google Play Console $${ACCOUNTS.googleOnce} once: ${A.google.enrolled ? badge('Registered', 'good') : html`<button id="enrollGoogle">Register</button>`}</p>
        <p>EAS plan: <select id="easPlan"><option value="free" ${A.eas.plan === 'free' ? 'selected' : ''}>Free (${EAS.freeBuilds.ios} iOS + ${EAS.freeBuilds.android} Android builds/month)</option><option value="starter" ${A.eas.plan === 'starter' ? 'selected' : ''}>Starter $${EAS.starterMonthly}/mo</option></select> <span class="small muted">[prices unverified, check expo.dev/pricing]</span></p>
        <p>TestFlight / beta rounds: ${A.beta.rounds} ${A.built ? html`<button id="beta">Run a beta round (${REVIEW.testflightHours} h)</button>` : ''}</p>
      </section>
      <section class="panel"><h2>Store listing</h2>
        <form id="listForm"><label>What makes this different from the category leaders? (judged for 4.3 spam / copycat risk)<textarea name="differentiation" rows="3" data-draft="diff">${drafts.diff ?? A.listing.differentiation}</textarea></label>
          <label class="inline"><input type="checkbox" name="privacyUrl" ${A.listing.privacyUrl ? 'checked' : ''}/> Privacy policy URL</label>
          <label class="inline"><input type="checkbox" name="privacyLabel" ${A.listing.privacyLabel ? 'checked' : ''}/> Privacy nutrition label and permission strings</label>
          <button class="primary">Save listing (0.75 h)</button> <span class="small muted">Differentiation now ${Math.round(differentiation(s) * 100)}%; category saturation ${pct(saturation(s), 0)}.</span></form>
      </section>
    </div>
    <section class="panel"><h2>App Review</h2>
      ${A.pending ? html`<div class="callout">In review (${A.pending.store === 'ios' ? 'App Store' : 'Google Play'}), decision around day ${A.pending.decideDay}. Most submissions clear in 24-48 h.</div>` : ''}
      ${risks ? table({ columns: [{ label: 'Guideline', render: (r) => r.g }, { label: 'What it checks', render: (r) => REVIEW.guidelines[r.g] }, { label: 'Your odds of rejection today [design]', align: 'right', render: (r) => pct(r.p, 0) }], rows: Object.entries(risks).map(([g, p]) => ({ g, p })) }) : html`<p class="muted">Build the app to see where it would be rejected.</p>`}
      <div class="inline"><button class="primary" id="subIos" ${!A.built || A.pending ? 'disabled' : ''}>Submit to App Store</button><button id="subPlay" ${!A.built || A.pending ? 'disabled' : ''}>Submit to Google Play</button>
        <span class="small muted">Status: ${A.status}. ${A.live.ios ? 'Live on iOS. ' : ''}${A.live.play ? 'Live on Android.' : ''}</span></div>
      ${A.history.length ? table({ columns: [{ label: 'Day', render: (r) => fmtDate(s, r.day) }, { label: 'Store', render: (r) => r.store }, { label: 'Result', render: (r) => (r.result === 'approved' ? badge('Approved', 'good') : badge(`Rejected ${r.guideline}`, 'bad')) }], rows: A.history.slice().reverse().slice(0, 8) }) : ''}
    </section>` : A.stack ? html`<div class="callout">A web app has no App Store review, no store fee and no in-app purchase: money goes through Stripe on the web, and discovery is up to your other channels.</div>` : ''}`);
  on(body, 'submit', '#stackForm', (e) => { e.preventDefault(); const v = formData(e.target).stack; if (v) run(ctx, 0.5, 'Choose platform stack', (st) => chooseStack(st, v)); });
  on(body, 'click', '#buildApp', () => run(ctx, buildHours(s), 'Build the mobile MVP', (st) => buildApp(st)));
  on(body, 'click', '#enrollApple', () => run(ctx, 1.5, 'Apple Developer enrollment', (st) => enrollApple(st)));
  on(body, 'click', '#enrollGoogle', () => run(ctx, 1, 'Google Play registration', (st) => enrollGoogle(st)));
  on(body, 'change', '#easPlan', (e, el) => run(ctx, 0.2, 'EAS plan', (st) => setEasPlan(st, el.value)));
  on(body, 'click', '#beta', () => run(ctx, REVIEW.testflightHours, 'TestFlight beta round', (st) => runBeta(st)));
  on(body, 'submit', '#listForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, 0.75, 'Store listing', (st) => setListing(st, { differentiation: f.differentiation, privacyUrl: f.privacyUrl, privacyLabel: f.privacyLabel })); });
  on(body, 'click', '#subIos', () => run(ctx, 0.75, 'Submit to App Store', (st) => submitForReview(st, 'ios')));
  on(body, 'click', '#subPlay', () => run(ctx, 0.75, 'Submit to Google Play', (st) => submitForReview(st, 'play')));
}

// ---------------------------------------------------------------- paywall

function paywall(body, ctx, C) {
  const s = ctx.state;
  const pw = C.monet.paywall;
  const d = pw.disclosure ?? judgeDisclosure(pw);
  const ef = expectedFunnel(s, 'ads:meta');
  const mix = planMix(s, pw);
  const quizText = drafts.quiz ?? (pw.quiz?.steps ?? []).join('\n');
  const t = C.monet.tests[C.monet.tests.length - 1];
  mount(body, html`
    <div class="stats">
      ${stat('Install to paying', pct(ef.installToPaid, 1), `${PAYWALL.types[pw.type].label}`)}
      ${stat('Revenue / install (D60)', usd(ef.revPerInstall60), 'gross, median-fit expectation')}
      ${stat('Store commission', pct(currentCommission(s), 0), C.app.apple.sbp ? 'Small Business Program' : 'enroll for 15% under $1M')}
      ${stat('Disclosure score', pct(d.score, 0), d.issues.length ? `${d.issues.length} issue(s)` : 'clear')}
    </div>
    <section class="panel"><h2>Paywall design</h2>
      <form id="pwForm"><div class="grid-3">
        <label>Type ${sel('type', Object.entries(PAYWALL.types).map(([k, v]) => [k, v.label]), pw.type)}</label>
        <label>Trial days (hard + trial) <input type="number" name="trialDays" min="1" max="14" value="${pw.trialDays}"/></label>
        <label>Highlighted plan ${sel('default', ['weekly', 'monthly', 'annual'].map((k) => [k, k]), pw.default)}</label></div>
        ${['weekly', 'monthly', 'annual'].map((n) => html`<div class="inline"><label class="inline"><input type="checkbox" name="on_${n}" ${pw.plans[n].on ? 'checked' : ''}/> ${n}</label><label>$ <input type="number" step="0.01" name="price_${n}" value="${pw.plans[n].price}" style="width:90px"/></label><span class="small muted">${pw.plans[n].on ? pct(mix[n] ?? 0, 0) + ' of buyers' : 'off'}</span></div>`)}
        <fieldset><legend>Aggressive tactics (lift conversion, cost refunds, reviews and rejections)</legend>${Object.entries(PAYWALL.dark).map(([k, v]) => html`<label class="inline"><input type="checkbox" name="dark_${k}" ${pw.dark?.[k] ? 'checked' : ''}/> ${v.label}</label>`)}</fieldset>
        <fieldset><legend>Paywall copy (App Review and the FTC read this)</legend>
          ${['headline', 'price', 'renewal', 'trial', 'cancel', 'legal'].map((k) => html`<label>${k}<input name="copy_${k}" value="${drafts['copy_' + k] ?? pw.copy[k] ?? ''}" data-draft="copy_${k}" placeholder="${{ price: '$5.99 per week or $29.99 per year', renewal: 'Subscription renews automatically until cancelled', trial: '3-day free trial, then $29.99 per year', cancel: 'Cancel anytime in Settings > Apple ID > Subscriptions', legal: 'Terms · Privacy · Restore purchases' }[k] ?? ''}"/></label>`)}</fieldset>
        <button class="primary">Save paywall (0.75 h)</button></form>
      ${d.issues.length ? html`<div class="callout warn"><b>Disclosure issues</b><ul>${d.issues.map((i) => html`<li>${i}</li>`)}</ul></div>` : html`<div class="callout good">Price, period, renewal, trial end and cancel path are all stated.</div>`}
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Onboarding quiz before the paywall</h2>
        <form id="quizForm"><label>One question per line (aim for 7-12)<textarea name="steps" rows="7" data-draft="quiz">${quizText}</textarea></label><button class="primary">Save quiz</button></form>
        ${pw.quiz ? html`<p class="small">Quiz score ${Math.round(pw.quiz.score * 100)}%, completion ${pct(pw.quiz.completion, 0)}. ${pw.quiz.issues.join(' ')}</p><p class="small muted">No sourced lift exists; vendors describe it qualitatively [unverified].</p>` : ''}
      </section>
      <section class="panel"><h2>Money, tooling and tests</h2>
        <p>Checkout: <select id="mode"><option value="iap" ${C.monet.mode === 'iap' ? 'selected' : ''}>In-app purchase (Apple/Google commission)</option><option value="web" ${C.monet.mode === 'web' ? 'selected' : ''}>Web checkout via Stripe (US link-out rules unsettled [unverified])</option></select></p>
        <p>Subscription tool: <select id="tool">${Object.entries(MOBILE.tooling).map(([k, v]) => html`<option value="${k}" ${C.monet.tooling === k ? 'selected' : ''}>${v.label}</option>`)}</select></p>
        <p>${C.app.apple.sbp ? badge('Small Business Program enrolled', 'good') : html`<button id="sbp">Enroll in the Small Business Program (0.5 h)</button>`} <span class="small muted">15% under $1M of proceeds, 30% above. Proceeds reach you roughly 33-45 days after month end [verify].</span></p>
        <h3>Paywall A/B test</h3>
        ${t && t.status === 'running' ? html`<p>Running "${t.name}": A ${t.arms.a.starts}/${t.arms.a.views} vs B ${t.arms.b.starts}/${t.arms.b.views} (needs ${PAYWALL.tests.minViewsPerArm} paywall views per arm). Verdict: ${paywallTestVerdict(t).verdict}.</p><button id="shipB">Ship B</button> <button id="keepA">Keep A</button>` : html`<form id="testForm" class="inline"><label>Arm B <select name="variant"><option value="trial">Hard paywall with 3-day trial</option><option value="notrial">Hard paywall, no trial</option><option value="annual">Highlight annual</option><option value="weekly">Highlight weekly</option></select></label><button>Start test (${PAYWALL.testHours} h)</button></form>`}
        ${C.monet.tests.filter((x) => x.status === 'done').slice(-3).map((x) => html`<p class="small muted">Done: "${x.name}" ${x.verdict}, decision ${x.decision}.</p>`)}
      </section>
    </div>`);
  on(body, 'submit', '#pwForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const patch = { type: f.type, trialDays: f.trialDays, default: f.default, plans: Object.fromEntries(['weekly', 'monthly', 'annual'].map((n) => [n, { on: f[`on_${n}`], price: f[`price_${n}`] }])), dark: Object.fromEntries(Object.keys(PAYWALL.dark).map((k) => [k, f[`dark_${k}`]])), copy: Object.fromEntries(['headline', 'price', 'renewal', 'trial', 'cancel', 'legal'].map((k) => [k, f[`copy_${k}`] ?? ''])) };
    run(ctx, 0.75, 'Paywall design', (st) => setPaywall(st, patch));
  });
  on(body, 'submit', '#quizForm', (e) => { e.preventDefault(); const steps = String(formData(e.target).steps).split('\n').map((x) => x.trim()).filter(Boolean); run(ctx, 0.4 + 0.12 * steps.length, 'Onboarding quiz', (st) => setQuiz(st, steps)); });
  on(body, 'change', '#mode', (e, el) => run(ctx, 2, 'Checkout mode', (st) => setMode(st, el.value)));
  on(body, 'change', '#tool', (e, el) => run(ctx, MOBILE.tooling[el.value].setupHours, 'Subscription tooling', (st) => setTooling(st, el.value)));
  on(body, 'click', '#sbp', () => run(ctx, 0.5, 'Small Business Program', (st) => enrollSmallBusiness(st)));
  on(body, 'submit', '#testForm', (e) => {
    e.preventDefault();
    const v = formData(e.target).variant;
    const patch = { trial: { type: 'hard_trial' }, notrial: { type: 'hard_no_trial' }, annual: { default: 'annual' }, weekly: { default: 'weekly' } }[v];
    run(ctx, PAYWALL.testHours, 'Paywall test', (st) => startPaywallTest(st, { name: `Paywall: ${v}`, patch }));
  });
  on(body, 'click', '#shipB', () => run(ctx, 0.25, 'Conclude paywall test', (st) => concludePaywallTest(st, t.id, 'ship_b')));
  on(body, 'click', '#keepA', () => run(ctx, 0.25, 'Conclude paywall test', (st) => concludePaywallTest(st, t.id, 'keep_a')));
}

// ---------------------------------------------------------------- creators

function creators(body, ctx, C) {
  const s = ctx.state;
  const st = creatorStats(s);
  const posts = C.creators.posts.slice().reverse().slice(0, 14);
  mount(body, html`
    <div class="stats">
      ${stat('Posts', st.posts, `${st.breakouts} broke out (${st.posts ? pct(st.breakouts / st.posts, 0) : '—'})`)}
      ${stat('Views / installs', `${st.views.toLocaleString()} / ${st.installs}`, `top 10% of posts = ${pct(st.topDecileShare, 0)} of views`)}
      ${stat('Cost per install', usd(st.cpi), `${usd(st.spent)} fees and bonuses`)}
      ${stat('Disclosed', pct(st.disclosedShare, 0), `${st.strikes} strike(s)`, st.disclosedShare < 0.9 ? 'warn' : '')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Post a brief</h2>
        <p class="small muted">Creators post on their own accounts. Marketplace posts run $${CREATORS.fee[0]}-${CREATORS.fee[1]} each plus $${CREATORS.bonusPer1k[0]}-${CREATORS.bonusPer1k[1]} per 1,000 views (vendor blog [unverified]). Most posts flop; a minority break out [design 5-10%].</p>
        <form id="briefForm"><label>Hook options (one per line, up to 5; test different angles)<textarea name="hooks" rows="4" data-draft="hooks">${drafts.hooks ?? ''}</textarea></label>
          <label>Key message<textarea name="message" rows="2" data-draft="msg">${drafts.msg ?? ''}</textarea></label>
          <label>Shots, length, dos and don'ts, CTA, disclosure rules<textarea name="notes" rows="3" data-draft="notes" placeholder="15-30 s vertical. Show the screen. Don't claim guaranteed results. Add #ad / paid partnership label. CTA: link in bio.">${drafts.notes ?? ''}</textarea></label>
          <div class="inline"><label>Fee $ <input type="number" name="fee" value="100" style="width:80px"/></label><label>Bonus $/1k views <input type="number" step="0.5" name="bonus" value="2" style="width:70px"/></label></div>
          <button class="primary">Save brief (0.5 h+)</button></form></section>
      <section class="panel"><h2>Hire creators</h2>
        <p>Marketplace: <select id="mkt">${Object.entries(CREATORS.subs).map(([k, v]) => html`<option value="${k}" ${C.creators.sub === k ? 'selected' : ''}>${v.label}${v.monthly ? ` $${v.monthly}/mo` : ''}</option>`)}</select></p>
        ${C.creators.briefs.length ? html`<form id="hireForm" class="inline"><label>Brief ${sel('brief', C.creators.briefs.map((b) => [b.id, `${b.id}: ${b.hooks.length} hook(s), brief ${Math.round(b.score * 100)}%`]), '')}</label><label># creators <input type="number" name="n" value="10" min="1" max="60" style="width:70px"/></label><button class="primary">Hire (0.12 h each)</button></form>` : html`<p class="muted">Write a brief first.</p>`}
        <p><button id="audit">Audit disclosure on live posts</button> <span class="small muted">Undisclosed paid posts risk platform strikes and FTC attention.</span></p>
      </section>
    </div>
    <section class="panel"><h2>Posts and hooks</h2>
      ${table({ columns: [{ label: 'Hook', render: (p) => p.hook.slice(0, 60) }, { label: 'Creator', render: (p) => `${p.creator.name} · ${p.creator.niche}` }, { label: 'Status', render: (p) => (p.status === 'queued' ? `posts day ${p.postDay}` : p.breakout ? badge('breakout', 'good') : p.status) }, { label: 'Views', align: 'right', render: (p) => p.views.toLocaleString() }, { label: 'Installs', align: 'right', render: (p) => p.installs }, { label: 'Label', render: (p) => (p.disclosed == null ? '' : p.disclosed ? 'yes' : badge('missing', 'bad')) }, { label: '', render: (p) => (p.status !== 'queued' ? html`<button class="sm" data-promote="${p.id}">Promote to Meta</button>` : '') }], rows: posts, empty: 'No posts yet.' })}
      <h3>Hooks tested</h3>
      ${table({ columns: [{ label: 'Hook', render: (h) => h.hook.slice(0, 70) }, { label: 'Posts', align: 'right', render: (h) => h.posts }, { label: 'Views', align: 'right', render: (h) => h.views.toLocaleString() }, { label: 'Installs', align: 'right', render: (h) => h.installs }, { label: 'Breakouts', align: 'right', render: (h) => h.breakouts }], rows: C.creators.hooksTested.slice().sort((a, b) => b.views - a.views), empty: 'Hook results appear as posts go live.' })}
      <p class="small muted">Promote a disclosed post to Meta as a Partnership ad. A hook that already broke out is a proven creative: ${st.promoted} promoted so far.</p>
    </section>`);
  on(body, 'submit', '#briefForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, 0.6, 'Creator brief', (stt) => postBrief(stt, { hooks: String(f.hooks).split('\n'), message: f.message, notes: f.notes, fee: f.fee, bonusPer1k: f.bonus })); });
  on(body, 'change', '#mkt', (e, el) => run(ctx, 0.25, 'Creator marketplace', (stt) => setMarketplace(stt, el.value)));
  on(body, 'submit', '#hireForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, Math.max(0.12, 0.12 * (f.n || 1)), 'Hire creators', (stt) => hireCreators(stt, { briefId: f.brief, count: f.n })); });
  on(body, 'click', '#audit', () => run(ctx, 0.5 + 0.05 * C.creators.posts.length, 'Disclosure audit', (stt) => auditDisclosure(stt)));
  on(body, 'click', '[data-promote]', (e, el) => run(ctx, 0.5, 'Promote hook to Meta', (stt) => promoteToAds(stt, el.dataset.promote)));
}

// ---------------------------------------------------------------- clipping

function clipping(body, ctx, C) {
  const s = ctx.state;
  const st = clippingStats(s);
  const waves = crackdownDays(s).filter((d) => d >= s.day - 30).slice(0, 2);
  mount(body, html`
    <div class="stats">
      ${stat('Campaigns', st.campaigns)}${stat('Effective CPM', usd(st.effectiveCpm), 'per 1,000 real views, all fees')}${stat('Cost per install', usd(st.cpi), `${st.installs} installs from ${st.realViews.toLocaleString()} views`)}${stat('Botted clips caught', st.detected, `${st.fakePaid.toLocaleString()} fake views paid`)}
    </div>
    <section class="panel"><h2>Fund a clipping campaign</h2>
      <p class="small muted">Clippers post clips and slideshows on their own accounts and are paid per 1,000 views ($${CLIPPING.cpm[0]}-${CLIPPING.cpm[1]} typical [unverified]) plus a ~${pct(CLIPPING.platformFee, 0)} platform fee. Clippers expect about $${marketCpm(s).toFixed(2)} now in this category (saturation ${pct(saturation(s), 0)}). Views are cheap; installs per view are low. YouTube's July 2025 inauthentic-content policy and TikTok enforcement demote templated accounts.</p>
      <form id="clipForm"><div class="grid-3"><label>Name <input name="name" value="Launch clips"/></label><label>Budget $ <input type="number" name="budget" value="500" min="${CLIPPING.minBudget}"/></label><label>CPM $ <input type="number" step="0.05" name="cpm" value="1"/></label>
        <label>Max pay per clip $ <input type="number" name="maxPerClip" value="50"/></label><label>Clips are about ${sel('content', [['demo_slideshow', 'Product demo / slideshow'], ['problem_hook', 'The problem the app solves (hook first)'], ['reaction', 'Reaction clips'], ['podcast_clips', 'Podcast clips'], ['meme', 'Memes']], 'demo_slideshow')}</label><label>Verification ${sel('verification', Object.entries(CLIPPING.verification).map(([k, v]) => [k, v.label]), 'basic')}</label></div>
        <label>Hook the clips should use<input name="hook" data-draft="clipHook" value="${drafts.clipHook ?? ''}"/></label>
        <label>Content rules<textarea name="rules" rows="3" data-draft="clipRules" placeholder="Original voiceover or commentary on every clip. Show the app screen. No reposting the same video across accounts. Add #ad.">${drafts.clipRules ?? ''}</textarea></label>
        <button class="primary">Fund campaign (1.5 h)</button> <span class="small muted">Expected botted-view share at this CPM: ${pct(fraudShare(1), 0)} [design, anecdotal].</span></form>
      ${waves.length ? html`<p class="small muted">Platform enforcement waves happen; templated campaigns lose the most views.</p>` : ''}
    </section>
    <section class="panel"><h2>Campaigns</h2>
      ${table({ columns: [{ label: 'Campaign', render: (c) => c.name }, { label: 'Status', render: (c) => c.status }, { label: 'Clips', align: 'right', render: (c) => c.clips }, { label: 'Real views', align: 'right', render: (c) => c.realViews.toLocaleString() }, { label: 'Reported', align: 'right', render: (c) => c.reportedViews.toLocaleString() }, { label: 'Paid out', align: 'right', render: (c) => usd(c.paid + c.fees) }, { label: 'Installs', align: 'right', render: (c) => c.installs }, { label: 'Caught', align: 'right', render: (c) => c.detected }, { label: 'View level', align: 'right', render: (c) => pct(c.viewMult, 0) }, { label: '', render: (c) => (c.status !== 'closed' ? html`<button class="sm" data-closeclip="${c.id}">Close</button>` : '') }], rows: C.clipping.campaigns.slice().reverse(), empty: 'No campaigns yet.' })}
    </section>`);
  on(body, 'submit', '#clipForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, 1.5, 'Fund clipping campaign', (stt) => launchClip(stt, f)); });
  on(body, 'click', '[data-closeclip]', (e, el) => run(ctx, 0.25, 'Close clipping campaign', (stt) => closeCampaign(stt, el.dataset.closeclip)));
}

// ---------------------------------------------------------------- Meta app ads

function ads(body, ctx, C) {
  const s = ctx.state;
  const A = ensureAds(s);
  const ps = paidStats(s);
  const rows = campaignRows(s);
  const creatives = A.creatives.filter((c) => c.status !== 'rejected');
  mount(body, html`
    <div class="stats">
      ${stat('Spend', usd(ps.spend))}${stat('True CPI', usd(ps.cpi), `platform-reported ${usd(ps.reportedCpi)} (iOS arrives late and low)`)}${stat('D7 ROAS (true)', x2(ps.roas.d7.roas), `net of store fee ${x2(ps.roas.d7.netRoas)} · target ${C.paid.target.d7Roas}x ${C.paid.target.basis}`)}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Creatives</h2>
        <form id="crForm"><label>Hook<input name="hook" data-draft="adHook" value="${drafts.adHook ?? ''}"/></label><label>Message<input name="message" data-draft="adMsg" value="${drafts.adMsg ?? ''}"/></label><button class="primary">Add creative (${PAID.hoursPerCreative} h)</button></form>
        <p class="small muted">The library is shared with the Ads app. A hook proven by a creator break-out becomes a Partnership-ad creative with a better quality draw (Creators tab).</p>
        ${table({ columns: [{ label: 'Creative', render: (c) => c.name }, { label: 'Source', render: (c) => c.source }, { label: 'Hook', render: (c) => c.hook.slice(0, 50) }], rows: creatives.slice(-8), empty: 'No creatives.' })}</section>
      <section class="panel"><h2>New app campaign</h2>
        ${!mobileOn(s) ? html`<div class="callout warn">Choose a store stack in App & store first: installs need a store listing.</div>` : !mobileLive(s) ? html`<div class="callout warn">The app is not live in a store yet. Ads now would be wasted.</div>` : ''}
        <form id="mcForm"><div class="grid-3"><label>Name <input name="name" value="Installs US"/></label><label>Objective ${sel('objective', Object.entries(PAID.objective).map(([k, v]) => [k, v.label]), 'install')}</label><label>Country tier ${sel('geo', Object.entries(PAID.geo).map(([k, v]) => [k, `${v.label} · CPI ~$${v.cpi}`]), 't1')}</label><label>Daily budget $ <input type="number" name="budget" value="50"/></label><label class="inline"><input type="checkbox" name="advantage"/> Advantage+ app campaign</label></div>
          ${creatives.length ? html`<fieldset><legend>Creatives</legend>${creatives.slice(-10).map((c) => html`<label class="inline"><input type="checkbox" name="cr_${c.id}"/> ${c.name}</label>`)}</fieldset>` : ''}
          <button class="primary">Launch (${PAID.hoursPerCampaign} h)</button></form>
        <form id="tgtForm" class="inline"><label>Target D7 ROAS <input type="number" step="0.05" name="roas" value="${C.paid.target.d7Roas}" style="width:80px"/></label><label>Measured on ${sel('basis', [['net', 'net of store fee'], ['gross', 'gross revenue']], C.paid.target.basis)}</label><button>Set</button></form>
      </section>
    </div>
    <section class="panel"><h2>Campaigns</h2>
      ${table({ columns: [{ label: 'Campaign', render: (c) => c.name }, { label: 'Status', render: (c) => `${c.status} · ${c.e.learning.status}` }, { label: 'Budget/day', align: 'right', render: (c) => html`<input type="number" value="${c.budget}" data-bud="${c.id}" style="width:80px"/>` }, { label: 'Expected CPI', align: 'right', render: (c) => usd(c.e.cpi) }, { label: 'Spend', align: 'right', render: (c) => usd(c.spend) }, { label: 'Installs', align: 'right', render: (c) => c.installs }, { label: 'Reported', align: 'right', render: (c) => c.reportedInstalls }, { label: '', render: (c) => html`<button class="sm" data-pause="${c.id}" data-on="${c.status === 'active' ? '' : '1'}">${c.status === 'active' ? 'Pause' : 'Resume'}</button>` }], rows: rows.slice().reverse(), empty: 'No campaigns yet.' })}
      <p class="small muted">Learning phase needs ~${PAID.learning.threshold} optimisation events a week per ad set; winners fatigue after ~${PAID.fatigue.meanDays} days (CPA ~${PAID.fatigue.mult}x after). Raising the budget over ${Math.round(PAID.scaleStep * 100)}% before payback is proven is the classic way to burn cash.</p>
    </section>`);
  on(body, 'submit', '#crForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, PAID.hoursPerCreative, 'App creative', (stt) => addAppCreative(stt, { hook: f.hook, message: f.message })); });
  on(body, 'submit', '#mcForm', (e) => { e.preventDefault(); const f = formData(e.target); const ids = Object.keys(f).filter((k) => k.startsWith('cr_') && f[k]).map((k) => k.slice(3)); run(ctx, PAID.hoursPerCampaign, 'Meta app campaign', (stt) => launchMeta(stt, { name: f.name, objective: f.objective, geo: f.geo, budget: f.budget, advantage: f.advantage, creativeIds: ids })); });
  on(body, 'submit', '#tgtForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, 0.1, 'Payback target', (stt) => setTarget(stt, { d7Roas: f.roas, basis: f.basis })); });
  on(body, 'change', '[data-bud]', (e, el) => run(ctx, 0.15, 'Campaign budget', (stt) => setBudget(stt, el.dataset.bud, +el.value)));
  on(body, 'click', '[data-pause]', (e, el) => run(ctx, 0.05, 'Pause or resume', (stt) => pauseCampaign(stt, el.dataset.pause, !!el.dataset.on)));
}

