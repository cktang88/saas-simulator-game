// Organic growth: launch to your real network, build in public on X/LinkedIn, content for SEO and LLM answer
// engines (GEO), communities, Product Hunt, referral program & word of mouth, and newsletter sponsorships.
// The player writes the actual posts/articles; AI judges score them; ./growth/organicEngine.js turns the
// judged work into reach, visits and real Stripe trials / CRM leads.

import { writingHours } from '../core/calendar.js';
import { html, mount, on, formData, table, stat, badge, lineChart, toast } from '../core/ui.js';
import { money, pct, fmtDate, words } from '../core/util.js';
import { activeSubs } from '../core/stripe.js';
import { trialConversion, hasProduct } from '../core/market.js';
import { ORGANIC } from './growth/params.js';
import { keywordMetrics, networkLaunchPlan, viralMultiplier, kFactor } from './growth/organicModel.js';
import { keywordInsight, keywordLabel } from './searchtools/tools.js';
import { kwInsightHtml } from './searchtools/view.js';
import { judgePost, judgeArticle, judgeCommunityPost, creativeHeuristic, creativeSkill, judgeAso } from './growth/judges.js';
import { ensureOrganic, organicDay, launchToNetwork, publishPost, publishArticle, communityPost, launchProductHunt, setReferral, currentK, bookSponsorship, launchContext, launchShowHN, announceRelease, appStoreState, setReviewPrompt, setAsoListing } from './growth/organicEngine.js';
import { renderAppStore } from './growth/asoUi.js';
import { LAUNCHES } from './growth/params.js';
import { registerOperatorReader, hasOperatorReader, tierFromScore, shrink, trapCoaching } from '../core/operator.js';
import { ensureGrowth } from './growth/acquire.js';
import { publishedPanel, seoHealthTab, writersTab } from './growth/seoUi.js';

// Operator read for launches, communities and referrals (ARCHITECTURE principle 7): from what the player did.
function readLaunches(state) {
  const O = state.apps.organic;
  const L = O?.launches ?? [];
  const cps = O?.community?.posts ?? [];
  if (!L.length && !cps.length) return { tier: 'unknown', evidence: [], coaching: ['Launch more than once: every meaningful release is a new shot.'] };
  const legit = L.filter((l) => l.legit);
  const years = Math.max(0.5, (state.day - (L[0]?.day ?? state.day)) / 365);
  const cadence = Math.min(1, legit.length / years / 4);
  const legitShare = L.length ? legit.length / L.length : 0.5;
  const helpful = cps.length ? cps.filter((p) => !p.removed && (p.judge?.helpfulness ?? 0) >= 0.6).length / cps.length : 0.5;
  const referral = O.referral?.enabled ? (O.referral.twoSided ? 1 : 0.6) : 0.3;
  const raw = 0.35 * legitShare + 0.3 * cadence + 0.2 * helpful + 0.15 * referral;
  const score = shrink(raw, L.length + cps.length, 0.5, 3);
  const coaching = [];
  if (legitShare < 1) coaching.push(trapCoaching('launch_community_referral', 'single_launch_day', 'Launch when something meaningful ships, not to re-announce the same thing.'));
  if (cadence < 0.5) coaching.push('Stellar founders take ≥4 real launch shots a year: Show HN, a Product Hunt relaunch after a big change, release posts, a new product.');
  if (cps.some((p) => p.removed)) coaching.push(trapCoaching('launch_community_referral', 'link_in_ten_communities', 'Post one useful thing per community.'));
  return { tier: tierFromScore(score), score, n: L.length + cps.length, evidence: [`${L.length} launches (${legit.length} with real change) over ${years.toFixed(1)} years`, `${cps.length} community posts, ${Math.round(helpful * 100)}% helpful and kept up`, `referral program: ${O.referral?.enabled ? O.referral.reward : 'off'}`], coaching };
}
if (!hasOperatorReader('launch_community_referral')) registerOperatorReader('launch_community_referral', readLaunches);

const drafts = {};
const d = (k, fallback = '') => drafts[k] ?? fallback;
const TABS = [['overview', 'Overview'], ['network', 'Network launch'], ['launches', 'Launches'], ['appstore', 'App Store'], ['social', 'Build in public'], ['content', 'Content, SEO & GEO'], ['seo', 'SEO health & links'], ['writers', 'Writers & agencies'], ['community', 'Communities'], ['ph', 'Product Hunt'], ['referral', 'Referrals & WOM'], ['newsletters', 'Newsletter ads']];
const SOURCES = { network: 'Personal network', 'organic:social': 'Build in public', 'organic:seo': 'SEO', 'organic:llm': 'LLM answers (GEO)', 'organic:community': 'Communities', 'product-hunt': 'Product Hunt', 'organic:wom': 'Word of mouth', referral: 'Referral program', newsletter: 'Newsletter sponsorships', 'organic:hn': 'Hacker News', 'organic:appstore': 'App Store search & browse' };

export default {
  id: 'organic',
  title: 'Organic',
  icon: '🌱',
  group: 'Growth',
  onDay(state) { organicDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    ensureOrganic(s);
    ensureGrowth(s);
    const tabs = TABS.filter(([k]) => k !== 'appstore' || s.company.model === 'b2c');
    const tab = tabs.some(([k]) => k === ctx.params) ? ctx.params : 'overview';
    mount(root, html`
      <div class="app-head"><div><h1>Organic growth</h1><p>Free channels cost time instead of money and compound slowly. In 2026: AI Overviews eat informational clicks, LinkedIn suppresses links, Reddit bans stealth ads, and Product Hunt is a one-day spike. Word of mouth only works on top of a product people keep using.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<button data-otab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`)}</div>
      <div id="orgBody"></div>`);
    on(root, 'click', '[data-otab]', (e, el) => ctx.navigate('organic', el.dataset.otab));
    on(root, 'input', '[data-draft]', (e, el) => { drafts[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value; });
    on(root, 'change', '[data-draft]', (e, el) => { drafts[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value; });
    const body = root.querySelector('#orgBody');
    ({ overview, network, launches, appstore, social, content, seo: (b, c) => seoHealthTab(b, c, drafts), writers: (b, c) => writersTab(b, c, drafts), community, ph, referral, newsletters })[tab](body, ctx);
  },
};

const needProduct = (s) => (!hasProduct(s) ? html`<div class="callout warn">Nothing is shipped yet: visitors can look but can't sign up. Organic work still builds audience, rankings and backlinks.</div>` : '');

// ---------------------------------------------------------------- overview

function overview(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const last30 = O.daily.filter((x) => x.d > s.day - 30);
  const v30 = {};
  for (const day of last30) for (const [k, n] of Object.entries(day.src)) v30[k] = (v30[k] ?? 0) + n;
  const g = ensureGrowth(s);
  const sig = {};
  for (const [w, bucket] of Object.entries(g.cohorts)) if (+w * 7 > s.day - 30) for (const [k, e] of Object.entries(bucket)) sig[k] = (sig[k] ?? 0) + e.tr + e.ld;
  const rows = Object.keys(SOURCES).map((k) => ({ k, visits: v30[k] ?? 0, signups: sig[k] ?? 0, total: O.stats[k]?.signups ?? 0 }));
  const k = currentK(s);
  const days = Array.from({ length: Math.min(60, s.day + 1) }, (_, i) => s.day - Math.min(60, s.day + 1) + 1 + i);
  const byDay = new Map(O.daily.map((x) => [x.d, Object.values(x.src).reduce((a, b) => a + b, 0)]));
  mount(body, html`
    ${needProduct(s)}
    <div class="stats">
      ${stat('Organic visits (30d)', Math.round(Object.values(v30).reduce((a, b) => a + b, 0)).toLocaleString())}
      ${stat('K-factor (est.)', k.toFixed(2), `×${viralMultiplier(k).toFixed(2)} on every acquired customer`)}
      ${stat('Domain rating', Math.round(O.dr), `${O.articles.length} articles · ${O.citations.toFixed(1)} LLM-citable mentions`)}
      ${stat('Audience', `${s.founder.network.x.toLocaleString()} X`, `${s.founder.network.linkedin.toLocaleString()} LinkedIn · ${s.founder.network.newsletter.toLocaleString()} email`)}
    </div>
    <section class="panel"><h2>Website visits from organic channels</h2><canvas id="orgChart" style="width:100%"></canvas></section>
    <section class="panel"><h2>Channels</h2>
      ${table({ columns: [
        { label: 'Channel', render: (r) => SOURCES[r.k] },
        { label: 'Visits (30d)', align: 'right', render: (r) => Math.round(r.visits).toLocaleString() },
        { label: s.company.model === 'ent' ? 'Leads (30d)' : 'Signups (30d)', align: 'right', render: (r) => r.signups },
        { label: 'Signups (all time)', align: 'right', render: (r) => r.total },
      ], rows })}
      <p class="small muted">Paying customers and revenue by channel: Ads Manager → Cohorts & truth → pick the channel.</p>
    </section>`);
  lineChart(body.querySelector('#orgChart'), [{ values: days.map((x) => byDay.get(x) ?? 0), color: '--good' }], { format: (v) => v.toFixed(0), labels: days.length ? [fmtDate(s, days[0]), fmtDate(s, days.at(-1))] : null });
}

// ---------------------------------------------------------------- network launch

function network(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const n = s.founder.network;
  const lc = launchContext(s, 'network');
  const prev = O.launch ? html`<section class="panel"><h2>Last announcement: ${fmtDate(s, O.launch.day)}</h2>
      <p>${O.launch.friendsTrying} friends and family said they'd try it; about ${O.launch.expectedVisits} people clicked through from your posts.</p>
      <p class="muted">Network signups so far: ${O.stats.network?.signups ?? 0}. Friends produce first users and honest feedback; they rarely become paying customers unless they're the ICP. Ask them for intros to people who are.</p>
      <blockquote class="card">${O.launch.message}</blockquote></section>` : '';
  const plan = networkLaunchPlan({ network: n, channels: { friends: true, linkedin: true, x: true, newsletter: n.newsletter > 0 }, model: s.company.model, skill: 0.5 });
  mount(body, html`
    ${needProduct(s)}
    ${prev}
    <section class="panel"><h2>${O.launch ? 'Re-announce to your network' : 'Launch to your personal network'}</h2>
      ${O.launch ? html`<div class="callout ${lc.legit ? '' : 'bad'}">${lc.legit ? `${lc.change} features shipped since your last announcement: a legitimate update. Each repeat reaches fewer people (×${Math.pow(LAUNCHES.repeatDecay, lc.n).toFixed(2)}).` : `Only ${lc.change} feature(s) shipped since your last announcement ${lc.daysSince} days ago. Asking again without real change annoys people and costs reputation.`}</div>` : ''}
      <p class="muted">You have ${n.friends} close friends & family, ${n.linkedin.toLocaleString()} LinkedIn connections, ${n.x.toLocaleString()} X/Bluesky followers and ${n.newsletter.toLocaleString()} email subscribers. Founder reports are consistent: a typical network gives a first handful of users and feedback, and 0–3 paying customers unless your friends are the ICP. You get one first impression; later announcements need real news.</p>
      <form id="launchForm">
        <label><input type="checkbox" name="friends" checked /> Personal messages to friends & family (~2h)</label>
        <label><input type="checkbox" name="linkedin" checked /> LinkedIn announcement post (~45 min)</label>
        <label><input type="checkbox" name="x" checked /> X / Bluesky post (~30 min)</label>
        ${n.newsletter > 0 ? html`<label><input type="checkbox" name="newsletter" checked /> Email your list (~1h)</label>` : ''}
        <label>Your announcement (used for posts; DMs get personalized versions) <textarea id="launchMsg" data-draft="launch" name="message" rows="6" placeholder="Say who it's for, the problem in their words, what you'd like from them (try it, feedback, an intro).">${d('launch')}</textarea></label>
        <p class="hint">Rough reach with an average message${O.launch ? ', before the repeat decay' : ''}: ~${Math.round(plan.trials.friends)} friends try it, ~${Math.round(plan.visits)} clicks from posts.</p>
        <button class="primary">${O.launch ? 'Announce' : 'Launch'}</button>
      </form>
    </section>`);
  on(body, 'submit', '#launchForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (words(f.message) < 15) return toast('Write a real announcement (at least a few sentences).', 'warn');
    const ch = { friends: f.friends, linkedin: f.linkedin, x: f.x, newsletter: f.newsletter };
    const hours = (ch.friends ? 2 : 0) + (ch.linkedin ? 0.75 : 0) + (ch.x ? 0.5 : 0) + (ch.newsletter ? 1 : 0);
    await ctx.act(async (st) => {
      const j = await judgePost(ctx, f.message, ch.linkedin ? 'linkedin' : 'x', 'launch announcement to personal network');
      launchToNetwork(st, { channels: ch, message: f.message, skill: j.skill });
      drafts.launch = '';
      toast(`Launched. Message score ${Math.round(j.skill * 100)}/100${j.mock ? ' (offline judge)' : ''}.`, 'good');
      return true;
    }, { hours, label: 'Network launch' });
  });
}

// ---------------------------------------------------------------- launches (many shots)

const KIND_LABEL = { network: 'Network announcement', product_hunt: 'Product Hunt', show_hn: 'Show HN', release: 'Release announcement' };
function launches(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const hn = launchContext(s, 'show_hn'), rel = launchContext(s, 'release');
  const warn = (lc, what) => (lc.last && !lc.legit ? html`<div class="callout bad">Only ${lc.change} feature(s) shipped since your last ${what} (${lc.daysSince} days ago). Without real news this gets flagged or ignored and costs reputation.</div>` : '');
  mount(body, html`
    ${needProduct(s)}
    <p class="muted">Successful founders take many shots: a launch every time something meaningful ships (Show HN, Product Hunt relaunch, a release post, a new product), not one launch day. Each repeat for the same product draws less (×${LAUNCHES.repeatDecay} per repeat), and launching with nothing new is a mistake: moderators flag it and your audience tunes out.</p>
    <div class="grid-2">
      <section class="panel"><h2>Show HN</h2>
        ${warn(hn, 'Show HN')}
        <form id="hnForm">
          <label>Title <input name="title" maxlength="80" data-draft="hnTitle" value="${d('hnTitle', `Show HN: ${s.company.name} – `)}" /></label>
          <label>First comment: what it is, how it works, what you want feedback on <textarea name="text" rows="6" data-draft="hnText">${d('hnText')}</textarea></label>
          <button class="primary">Post (~3h incl. answering comments)</button>
        </form>
        <p class="hint">Most Show HN posts get a few points and sink; a small share reach the front page (game estimate ~5–10%, higher for developer tools). HN readers are skeptical buyers.</p>
      </section>
      <section class="panel"><h2>Release announcement</h2>
        ${warn(rel, 'release announcement')}
        <p class="small">${rel.change ? `${rel.change} feature(s) shipped since the last announcement.` : 'Nothing shipped since the last announcement.'}</p>
        <form id="relForm">
          <label>Platform <select name="platform"><option value="x">X / Bluesky</option><option value="linkedin">LinkedIn</option></select></label>
          <label>What shipped, for whom, and why it matters <textarea name="text" rows="6" data-draft="relText">${d('relText')}</textarea></label>
          <button class="primary">Announce (~45 min)</button>
        </form>
      </section>
    </div>
    <section class="panel"><h2>Launch history</h2>
      ${table({ columns: [
        { label: 'Date', render: (l) => fmtDate(s, l.day) },
        { label: 'Kind', render: (l) => KIND_LABEL[l.kind] ?? l.kind },
        { label: 'Repeat', align: 'right', render: (l) => (l.n ? `#${l.n + 1}` : 'first') },
        { label: 'Shipped since last', align: 'right', render: (l) => l.change },
        { label: 'Result', render: (l) => (l.kind === 'product_hunt' ? `#${l.rank}, ~${l.signups} signups` : l.kind === 'show_hn' ? (l.front ? `front page, ${l.points} points` : `${l.points} points${l.flagged ? ', flagged' : ''}`) : l.kind === 'network' ? `${l.friends} friends tried it` : `${(l.reach ?? 0).toLocaleString()} reach`) },
        { label: '', render: (l) => (l.legit ? '' : badge('no real change', 'bad')) },
      ], rows: O.launches.slice().reverse(), empty: 'No launches yet.' })}
    </section>`);
  on(body, 'submit', '#hnForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!/^show hn/i.test(f.title) || words(f.text) < 40) return toast('Start the title with "Show HN:" and write a real first comment.', 'warn');
    await ctx.act(async (st) => {
      const j = await judgePost(ctx, `${f.title}\n\n${f.text}`, 'x', 'Show HN post and first comment for Hacker News readers');
      launchShowHN(st, { title: f.title, text: f.text, skill: j.skill });
      drafts.hnText = '';
      return true;
    }, { hours: 3, label: 'Show HN' });
  });
  on(body, 'submit', '#relForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (words(f.text) < 15) return toast('Say what shipped and why it matters.', 'warn');
    await ctx.act(async (st) => {
      const j = await judgePost(ctx, f.text, f.platform, 'product release announcement');
      const p = announceRelease(st, { platform: f.platform, text: f.text, skill: j.skill, judge: j });
      drafts.relText = '';
      toast(`Announced: ${p.reach.toLocaleString()} impressions.`, 'good');
      return true;
    }, { hours: 0.75, label: 'Release announcement' });
  });
}

// ---------------------------------------------------------------- App Store (B2C)
// App Store + Google Play optimization lives in ./growth/asoUi.js (engine ./growth/aso.js).

function appstore(body, ctx) { renderAppStore(body, ctx); }

// ---------------------------------------------------------------- build in public

function social(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const fit = ORGANIC.social.audienceFit[s.company.model];
  mount(body, html`
    <div class="grid-2">
      <section class="panel"><h2>Write a post</h2>
        <form id="postForm">
          <label>Platform <select name="platform" data-draft="postPlat"><option value="x" ${d('postPlat') === 'x' ? 'selected' : ''}>X / Bluesky (${s.founder.network.x.toLocaleString()} followers)</option><option value="linkedin" ${d('postPlat') === 'linkedin' ? 'selected' : ''}>LinkedIn (${s.founder.network.linkedin.toLocaleString()} connections)</option></select></label>
          <label>Post <textarea id="postText" name="text" data-draft="post" rows="8" placeholder="First line is the hook. Real numbers, real story, a real lesson. Links in the comments, not the post.">${d('post')}</textarea></label>
          <button class="primary">Post</button>
        </form>
        <p class="small">Audience attention: X ${pct(O.attention.x ?? 1, 0)} · LinkedIn ${pct(O.attention.linkedin ?? 1, 0)} <span class="muted">(each post spends it; generic posts burn it fast; it recovers ~2%/day)</span></p>
        <p class="hint">Reach scales with your follower count, the post's quality and how tired your audience is of you; followers grow slowly. LinkedIn organic reach fell ~47% in 2025 and posts with external links reach 20–50% fewer people. ${fit < 1 ? 'Build in public mostly reaches other builders, not consumers: expect few signups for a consumer app.' : ''}</p>
      </section>
      <section class="panel"><h2>Recent posts</h2>
        ${O.posts.length ? html`<ul class="list">${O.posts.slice(0, 12).map((p) => html`<li>
          <div class="small muted">${fmtDate(s, p.day)} · ${p.platform === 'x' ? 'X' : 'LinkedIn'} · score ${Math.round(p.skill * 100)} ${p.breakout ? badge('Took off', 'good') : ''} ${p.hasLink ? badge('link penalty', 'warn') : ''}</div>
          <div>${p.text.slice(0, 160)}${p.text.length > 160 ? '…' : ''}</div>
          <div class="small">${p.reach.toLocaleString()} impressions · ${p.engagements} engagements · ~${Math.round(p.visits)} site visits · +${p.newFollowers} followers</div>
          ${[...new Set((p.judge?.results ?? []).map((r) => r.reaction))].slice(0, 1).map((t) => html`<div class="small muted">"${t}"</div>`)}</li>`)}</ul>` : html`<p class="empty">No posts yet.</p>`}
      </section>
    </div>`);
  on(body, 'submit', '#postForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (words(f.text) < 8) return toast('Write a real post.', 'warn');
    await ctx.act(async (st) => {
      const j = await judgePost(ctx, f.text, f.platform);
      const p = publishPost(st, { platform: f.platform, text: f.text, skill: j.skill, judge: j });
      drafts.post = '';
      toast(`Posted: ${p.reach.toLocaleString()} impressions so far.`, 'good');
      writingHours(st, ORGANIC.social.hours[f.platform]); // commit the focus-block use
      return true;
    }, { hours: writingHours(ctx.state, ORGANIC.social.hours[f.platform], { commit: false }), label: 'Build in public post' });
  });
}

// ---------------------------------------------------------------- content / SEO / GEO

function content(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const q = d('query');
  const km = q.trim() ? keywordInsight(s, q) : null; // only what your tools show (Search & AI visibility)
  mount(body, html`
    <div class="grid-2">
      <section class="panel"><h2>Write an article</h2>
        <form id="artForm">
          <label>Target query <input id="artQuery" name="query" data-draft="query" value="${q}" placeholder="e.g. how to reconcile shopify payouts in quickbooks" /></label>
          <div id="kwBox">${km ? kwInsightHtml(km) : html`<p class="hint">Type a query to see what your tools know about its search volume and difficulty (Search & AI visibility).</p>`}</div>
          <label>Title <input name="title" data-draft="title" value="${d('title')}" /></label>
          <label>Outline & body (Markdown) <textarea name="body" data-draft="body" rows="14" placeholder="## What you'll need&#10;First-hand detail, your own data, screenshots you took, opinions. Not a rewrite of the top 10 results.">${d('body')}</textarea></label>
          <p class="hint">${words(d('body'))} words · writing time ≈ ${articleHours(d('body')).toFixed(1)}h</p>
          <button class="primary">Publish</button>
        </form>
      </section>
      <section class="panel"><h2>How search works in 2026</h2>
        <ul class="small">
          <li>Only ~5.7% of new pages reached the top 10 within a year in Ahrefs' study (newer estimates are lower). Long-tail, low-difficulty queries can rank in 3–6 months; competitive terms take 12–24.</li>
          <li>AI Overviews cut position-1 CTR ~58% on informational queries. Bottom-funnel pages (comparisons, "alternatives", pricing, "X for Y") lose less and convert better.</li>
          <li>LLM answer engines (ChatGPT, Perplexity, AI Mode) send ~0.3–1% of traffic, but it converts well. They cite pages with clear facts, comparisons, pricing and original data, plus third-party mentions (Reddit, listicles, review sites).</li>
          <li>AI slop gets discounted by both Google and readers. Write what only you know. Mass-produced thin pages risk a site-wide spam demotion.</li>
          <li>Pages decay with age (often after 6–12 months); substantive refreshes usually win traffic back, date bumps don't. Google ships 2–4 core updates a year that re-judge every page.</li>
        </ul>
      </section>
    </div>
    <div id="pubBox"></div>`);
  publishedPanel(body.querySelector('#pubBox'), ctx, drafts);
  on(body, 'input', '#artQuery', (e) => {
    const k = e.target.value.trim() ? keywordInsight(s, e.target.value) : null;
    body.querySelector('#kwBox').innerHTML = String(k ? kwInsightHtml(k) : '');
  });
  on(body, 'submit', '#artForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.query.trim() || !f.title.trim() || words(f.body) < 150) return toast('Add a target query, a title and at least ~150 words.', 'warn');
    await ctx.act(async (st) => {
      const j = await judgeArticle(ctx, f);
      const a = publishArticle(st, { ...f, judge: j });
      drafts.query = drafts.title = drafts.body = '';
      toast(`Published. Editor score ${Math.round(j.quality * 100)}${j.slop > 0.5 ? ', reads like AI slop' : ''}${j.mock ? ' (offline judge)' : ''}. Rankings take months.`, j.slop > 0.5 ? 'warn' : 'good', 8000);
      writingHours(st, articleHours(f.body));
      return a;
    }, { hours: writingHours(ctx.state, articleHours(f.body), { commit: false }), label: 'SEO article' });
  });
}
const articleHours = (text) => Math.min(10, Math.max(2, 1 + words(text) / 600));
const kwBox = (k) => html`<p class="small">Est. volume <b>${k.volume.toLocaleString()}/mo</b> · keyword difficulty <b>${k.kd}</b> (${k.tier === 'long' ? 'long-tail: 3–6 months to rank' : k.tier === 'mid' ? 'medium: ~6–12 months' : 'competitive: 12–24 months, rarely in year 1'}) · ${k.commercial ? 'commercial intent' : 'informational: expect an AI Overview'}</p>`;

// ---------------------------------------------------------------- communities

function community(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  mount(body, html`
    <div class="grid-2">
      <section class="panel"><h2>Post in a community</h2>
        <form id="comForm">
          <div class="grid-2">
            <label>Community <input name="community" data-draft="comName" value="${d('comName')}" placeholder="r/smallbusiness, Indie Hackers Discord…" /></label>
            <label>Type <select name="kind" data-draft="comKind">${['Reddit', 'Discord', 'Slack', 'Facebook group', 'Forum'].map((k) => html`<option ${d('comKind') === k ? 'selected' : ''}>${k}</option>`)}</select></label>
            <label>Size <select name="size" data-draft="comSize">${[['small', '~5k members'], ['medium', '~50k members'], ['large', '500k+ members']].map(([k, l]) => html`<option value="${k}" ${d('comSize', 'medium') === k ? 'selected' : ''}>${l}</option>`)}</select></label>
          </div>
          <label>Title <input name="title" data-draft="comTitle" value="${d('comTitle')}" /></label>
          <label>Body <textarea name="body" data-draft="comBody" rows="8" placeholder="Answer a real question or share a real lesson. Mods remove ads; members can smell a stealth pitch.">${d('comBody')}</textarea></label>
          <button class="primary">Post (~1h incl. replies)</button>
        </form>
        <p class="hint">Value-first posts get upvotes, a long tail from Google and LLM citations (Reddit threads are heavily cited). Self-promotion with links gets removed, and repeat offenders get banned.</p>
      </section>
      <section class="panel"><h2>Your posts</h2>
        ${O.community.posts.length ? html`<ul class="list">${O.community.posts.slice(0, 15).map((p) => html`<li>
          <div class="small muted">${fmtDate(s, p.day)} · ${p.community} (${p.kind})</div><b>${p.title}</b>
          <div class="small">${p.banned ? badge('Removed + banned', 'bad') : p.removed ? badge('Removed by mods', 'bad') : html`${p.reach.toLocaleString()} views · ~${Math.round(p.visits)} visits ${p.tail ? badge('long tail', 'good') : ''}`}</div>
          ${[...new Set((p.judge?.results ?? []).map((r) => r.reaction))].slice(0, 1).map((t) => html`<div class="small muted">"${t}"</div>`)}</li>`)}</ul>` : html`<p class="empty">No posts yet.</p>`}
        ${Object.keys(O.community.banned).length ? html`<p class="small neg">Banned from: ${Object.keys(O.community.banned).join(', ')}</p>` : ''}
      </section>
    </div>`);
  on(body, 'submit', '#comForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.community.trim() || words(f.body) < 20) return toast('Pick a community and write a real post.', 'warn');
    await ctx.act(async (st) => {
      const j = await judgeCommunityPost(ctx, f);
      const p = communityPost(st, { ...f, judge: j });
      drafts.comTitle = drafts.comBody = '';
      toast(p.removed ? `Removed by the mods${p.banned ? ' and you were banned' : ''}.` : `Posted: ${p.reach.toLocaleString()} views.`, p.removed ? 'bad' : 'good');
      return true;
    }, { hours: ORGANIC.community.hours, label: 'Community post' });
  });
}

// ---------------------------------------------------------------- Product Hunt

function ph(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const lc = launchContext(s, 'product_hunt');
  const r = O.ph;
  const prev = r ? html`<section class="panel"><h2>Last launch on Product Hunt: ${fmtDate(s, r.day)}</h2>
      <div class="stats">${stat('Rank of the day', `#${r.rank}`)}${stat('Upvotes', r.upvotes)}${stat('Signups (est.)', r.signups, '~60% on day one')}${stat('Paid conversion', pct(r.paidConv, 1), 'of launch signups')}</div>
      <p class="muted">A launch is a one-day spike, backlinks and feedback, not a growth channel. Most launch signups are other makers and tire-kickers.</p></section>` : '';
  if (r && lc.last && lc.daysSince < LAUNCHES.phMinDays) {
    mount(body, html`${prev}<p class="muted">Product Hunt allows a relaunch about 6 months after the last one, with significant changes: ${LAUNCHES.phMinDays - lc.daysSince} days to go.</p>`);
    return;
  }
  mount(body, html`
    ${needProduct(s)}${prev}
    <section class="panel"><h2>${r ? 'Relaunch on Product Hunt' : 'Launch on Product Hunt'}</h2>
    ${r ? html`<div class="callout ${lc.legit ? '' : 'bad'}">${lc.legit ? `${lc.change} features shipped since the last launch: a legitimate relaunch, though repeat launches draw less (×${Math.pow(LAUNCHES.repeatDecay, lc.n).toFixed(2)}).` : `Only ${lc.change} feature(s) since the last launch. Relaunching without significant change gets flagged and costs reputation.`}</div>` : ''}
      <p class="muted">~18 founder hours: assets, a maker comment, rallying your network, and replying all day. Finishing top 3 has a <5% base rate; ranking weights engagement over raw upvotes. A top-10 launch brings ~300–1,000 signups that convert to paid at ~0.25–2%, plus backlinks.</p>
      <form id="phForm">
        <label>Tagline (60 chars) <input name="tagline" maxlength="60" data-draft="phTag" value="${d('phTag')}" /></label>
        <label>Description <textarea name="description" rows="3" data-draft="phDesc">${d('phDesc')}</textarea></label>
        <label>Maker's first comment (why you built it) <textarea name="firstComment" rows="6" data-draft="phComment">${d('phComment')}</textarea></label>
        <label><input type="checkbox" name="weekend" /> Launch on a weekend (less competition, less traffic)</label>
        <button class="primary">Launch (18h over prep + launch day)</button>
      </form>
    </section>`);
  on(body, 'submit', '#phForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.tagline.trim() || words(f.firstComment) < 30) return toast('Write a tagline and a real maker comment.', 'warn');
    await ctx.act(async (st) => {
      const j = await judgePost(ctx, `${f.tagline}\n\n${f.description}\n\n${f.firstComment}`, 'x', 'Product Hunt launch page and maker comment');
      launchProductHunt(st, { ...f, skill: j.skill, judge: { mock: j.mock } });
      return true;
    }, { hours: ORGANIC.ph.prepHours + ORGANIC.ph.dayHours, label: 'Product Hunt launch' });
  });
}

// ---------------------------------------------------------------- referrals & WOM

function referral(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  const r = O.referral;
  const k = currentK(s);
  const kBase = kFactor({ model: s.company.model, productFactor: 1, referral: null });
  const active = activeSubs(s).length;
  mount(body, html`
    <div class="grid-2">
      <section class="panel"><h2>Referral program</h2>
        <form id="refForm">
          <label><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''} /> Program live (in-app invite at a moment of delight)</label>
          <label>Reward <select name="reward">${Object.entries(ORGANIC.referral).filter(([, v]) => v.label).map(([key, v]) => html`<option value="${key}" ${r.reward === key ? 'selected' : ''}>${v.label}</option>`)}</select></label>
          <label><input type="checkbox" name="twoSided" ${r.twoSided ? 'checked' : ''} /> Two-sided (the friend gets something too)</label>
          <label>Cash amount per side ($, cash rewards only) <input type="number" name="cashAmount" min="0" value="${r.cashAmount}" /></label>
          <button class="primary">${O.referralBuilt ? 'Save (15 min)' : 'Build & save (~4h with your AI coding agent)'}</button>
        </form>
        <p class="hint">Two-sided rewards tied to the product's value (credits, a free month) beat cash. Expect a program to add ~0.05–0.3 to K, not to make you viral. Rewards cost real money: free months and credits are applied as billing credits to the referred customer and the referrer once the referred customer pays, and cash is paid out. This is one program shared with Channels → Customer referrals.</p>
      </section>
      <section class="panel"><h2>Word of mouth</h2>
        <div class="stats">
          ${stat('K-factor (est.)', k.toFixed(2), r.enabled ? 'with referral program' : 'no referral program')}
          ${stat('Viral multiplier', `×${viralMultiplier(k).toFixed(2)}`, '1 / (1 − K)')}
          ${stat('Active customers', active, `trial→paid ${pct(trialConversion(s), 0)}`)}
        </div>
        <p class="small muted">New signups from word of mouth are proportional to active customers × product fit × your referral program. Typical SaaS K is 0.1–0.25; good referral programs reach 0.4–0.7; sustained K > 1 is essentially unheard of. Your baseline at average product fit would be ${kBase.toFixed(2)}.</p>
        <p class="small">WOM signups so far: ${O.stats['organic:wom']?.signups ?? 0} · referral program signups: ${O.stats.referral?.signups ?? 0}</p>
      </section>
    </div>`);
  on(body, 'submit', '#refForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    await ctx.act((st) => {
      setReferral(st, { enabled: f.enabled, reward: f.reward, twoSided: f.twoSided, cashAmount: Math.max(0, f.cashAmount || 0) });
      st.apps.organic.referralBuilt = true;
      toast('Referral program saved.', 'good');
      return true;
    }, { hours: O.referralBuilt ? 0.25 : 4, label: 'Referral program' });
  });
}

// ---------------------------------------------------------------- newsletter sponsorships

function newsletters(body, ctx) {
  const s = ctx.state;
  const O = s.apps.organic;
  mount(body, html`
    <section class="panel"><h2>Newsletter sponsorships</h2>
      <p class="muted small">Pay per send for a primary placement in a niche newsletter. Prices here use an assumed $25–60 per 1,000 subscribers (game assumption, not a researched benchmark). Write the ad yourself: one specific promise for that audience.</p>
      ${table({ columns: [
        { label: 'Newsletter', render: (n) => html`<b>${n.name}</b><div class="small muted">${n.niche}</div>` },
        { label: 'Subscribers', align: 'right', render: (n) => n.subs.toLocaleString() },
        { label: 'Avg open rate', align: 'right', render: (n) => pct(n.open, 0) },
        { label: 'Price / send', align: 'right', render: (n) => money(n.price) },
        { label: 'Next slot', render: (n) => `in ${n.leadDays} days` },
        { label: '', render: (n) => html`<button class="sm" data-book="${n.id}">Book</button>` },
      ], rows: O.newsletters })}
    </section>
    <section class="panel" id="bookPanel" ${d('book') ? '' : 'hidden'}><h2>Write the sponsorship ad${d('book') ? `: ${O.newsletters.find((n) => n.id === d('book'))?.name ?? ''}` : ''}</h2>
      <form id="bookForm">
        <label>Headline <input name="headline" data-draft="spHead" value="${d('spHead')}" /></label>
        <label>Body (~80 words) <textarea name="body" rows="5" data-draft="spBody">${d('spBody')}</textarea></label>
        <label>Call to action <input name="cta" data-draft="spCta" value="${d('spCta', 'Start your free trial')}" /></label>
        <button class="primary">Pay & book (~1h)</button> <button type="button" data-cancelbook>Cancel</button>
      </form>
    </section>
    <section class="panel"><h2>Bookings</h2>
      ${table({ columns: [
        { label: 'Newsletter', render: (b) => b.name },
        { label: 'Send date', render: (b) => fmtDate(s, b.sendDay) },
        { label: 'Price', align: 'right', render: (b) => money(b.price) },
        { label: 'Clicks', align: 'right', render: (b) => b.clicks ?? '—' },
        { label: 'Signups', align: 'right', render: (b) => b.signups ?? '—' },
        { label: 'Status', render: (b) => badge(b.status, b.status === 'sent' ? 'good' : 'warn') },
      ], rows: O.sponsorships, empty: 'No bookings yet.' })}
    </section>`);
  on(body, 'click', '[data-book]', (e, el) => { drafts.book = el.dataset.book; ctx.render(); });
  on(body, 'click', '[data-cancelbook]', () => { drafts.book = ''; ctx.render(); });
  on(body, 'submit', '#bookForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.headline.trim() || words(f.body) < 15) return toast('Write a headline and body.', 'warn');
    await ctx.act(async (st) => {
      const c = { hook: f.headline, primaryText: f.body, headline: f.headline, cta: f.cta, format: 'static' };
      const skill = creativeSkill([creativeHeuristic(st, c)]);
      bookSponsorship(st, { newsletterId: drafts.book, headline: f.headline, body: f.body, cta: f.cta, skill });
      drafts.book = drafts.spHead = drafts.spBody = '';
      toast('Booked. You\'ll see clicks on the send date.', 'good');
      return true;
    }, { hours: 1, label: 'Newsletter sponsorship' });
  });
}


