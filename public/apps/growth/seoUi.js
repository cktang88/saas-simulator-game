// Organic app UI for SEO dynamics: published pages with status and actions (refresh, prune, pillar), site health
// (Google updates, penalties, technical setup, audits, migrations, overlaps), link building, and writers / agencies.
// Engine: ./seoDynamics.js. Every action charges realistic founder hours through ctx.act.

import { html, mount, on, formData, table, stat, badge, toast } from '../../core/ui.js';
import { money, fmtDate, words } from '../../core/util.js';
import { writingHours } from '../../core/calendar.js';
import { judgeArticle } from './judges.js';
import {
  ensureSeo, SEO_DYN, WRITERS, AGENCIES, liveArticles, isDecaying, isIndexed, helpfulness, shownPosition, seoSiteMult, decayMult,
  refreshArticle, refreshHours, pruneArticle, setPillar, mergeGroup, technicalSetup, runAudit, fixIssue, migrateSite,
  pitchGuestPost, answerJournalists, runDigitalPR, buyLinks, removeBoughtLinks, requestReconsideration, hasLinkableAsset,
  commissionArticle, startAgency, cancelAgency, reviewDraft, setContentPlan, briefQuality,
} from './seoDynamics.js';

const PT = { informational: 'informational', comparison: 'comparison (X vs Y)', alternatives: 'alternatives', bofu: 'bottom-funnel' };

export function statusBadges(s, a) {
  const S = s.apps.organic.seo;
  const out = [];
  if (a.status === 'merged') return badge('merged (301)', '');
  if (a.status === 'pruned') return badge('removed', '');
  if (a.stuck) out.push(badge('not indexed', 'bad'));
  else if (!isIndexed(s, a)) out.push(badge('awaiting index', 'warn'));
  if (isDecaying(s, a)) out.push(badge('decaying', 'warn'));
  if (a.cannibalMult < 1) out.push(badge('overlaps', 'warn'));
  if (a.coreMult < 0.8) out.push(badge('core update hit', 'bad'));
  else if (a.coreMult > 1.1) out.push(badge('core update win', 'good'));
  if (a.isPillar) out.push(badge('pillar', 'accent'));
  else if (a.pillarId) out.push(badge('in cluster', ''));
  if (a.refreshes?.length) out.push(html`<span class="small muted">refreshed ${fmtDate(s, a.refreshes.at(-1).day)}</span>`);
  if (S?.penalty) out.push(badge('site penalty', 'bad'));
  return out;
}

export function positionCell(s, a) {
  const p = shownPosition(a, s.day);
  if (!isIndexed(s, a)) return html`<span class="muted">—</span>`;
  if (p == null) return html`<span class="muted">not ranking yet</span>`;
  return p <= 10 ? html`<b>#${p}</b>` : `#${p}`;
}

// Published pages: status, actions. drafts is the Organic module's draft store (keeps text across re-renders).
export function publishedPanel(body, ctx, drafts) {
  const s = ctx.state;
  const O = s.apps.organic;
  ensureSeo(s);
  const rows = O.articles;
  const ref = drafts.refresh ? O.articles.find((a) => a.id === drafts.refresh) : null;
  const html0 = html`
    ${ref ? html`<section class="panel"><h2>Refresh: ${ref.title}</h2>
      <p class="small muted">Published ${fmtDate(s, ref.day)}${ref.refreshes?.length ? `, last refreshed ${fmtDate(s, ref.refreshes.at(-1).day)}` : ''} · "${ref.query}" · traffic factor from age ×${decayMult(ref, s.day).toFixed(2)}. Substantive updates (new facts, structure, intent match, more than ~10% of the text) lift most pages; a date bump does nothing; about 1 in 10 refreshes backfires.</p>
      <form id="refForm">
        <label>Title <input name="title" value="${drafts.refTitle ?? ref.title}" data-draft="refTitle" /></label>
        <label>Updated body <textarea name="body" rows="14" data-draft="refBody">${drafts.refBody ?? ref.body ?? ''}</textarea></label>
        ${!ref.body ? html`<p class="hint">The original text was not kept for this page: paste the current version and edit it.</p>` : ''}
        <p class="hint">${words(drafts.refBody ?? ref.body ?? '')} words · ≈ ${refreshHours(ref.body ?? '', drafts.refBody ?? ref.body ?? '').toFixed(2)}h</p>
        <button class="primary">Republish</button> <button type="button" data-refcancel>Cancel</button>
      </form></section>` : ''}
    <section class="panel"><h2>Published</h2>
      ${table({ columns: [
        { label: 'Page', render: (a) => html`${a.title}<div class="small muted">"${a.query}" · ${a.volume?.toLocaleString?.() ?? '?'}/mo · KD ${a.kd} · ${PT[a.pageType] ?? a.pageType}${a.source && a.source !== 'founder' ? ` · by ${a.source.split(':')[0]}` : ''}</div><div>${statusBadges(s, a)}</div>` },
        { label: 'Published', render: (a) => fmtDate(s, a.day) },
        { label: 'Quality', align: 'right', render: (a) => html`${Math.round((a.quality ?? 0) * 100)}${a.slop > 0.5 ? html` ${badge('AI slop', 'bad')}` : ''}` },
        { label: 'Position', align: 'right', render: (a) => positionCell(s, a) },
        { label: 'LLM-cited', render: (a) => (a.cited ? badge('Cited', 'good') : '—') },
        { label: 'Visits', align: 'right', render: (a) => Math.round(a.visits ?? 0).toLocaleString() },
        { label: 'Signups', align: 'right', render: (a) => a.signups ?? 0 },
        { label: '', render: (a) => ((a.status ?? 'live') === 'live' && a.tier ? html`<button class="sm" data-refresh="${a.id}">Refresh</button> <button class="sm" data-pillar="${a.id}">Make pillar</button> <button class="sm" data-prune="${a.id}">Remove</button>` : '') },
      ], rows, empty: 'No articles yet.' })}
      <p class="small muted">Pages decay as they age (often after 6–12 months), drift month to month, get pushed down when competitors publish better pages, and are re-judged at every Google core update. "Make pillar" interlinks the related pages into a topic cluster (a small, unquantified boost in the research, so small here too).</p>
    </section>`;
  mount(body, html0);
  on(body, 'click', '[data-refresh]', (e, el) => { drafts.refresh = el.dataset.refresh; drafts.refTitle = drafts.refBody = undefined; ctx.render(); });
  on(body, 'click', '[data-refcancel]', () => { drafts.refresh = ''; ctx.render(); });
  on(body, 'click', '[data-prune]', (e, el) => ctx.act((st) => { const r = pruneArticle(st, el.dataset.prune); if (!r.ok) throw new Error(r.error); toast('Removed from the index (410).', 'info'); return true; }, { hours: 0.25, label: 'Remove page' }));
  on(body, 'click', '[data-pillar]', (e, el) => {
    const dry = setPillar(ctx.state, el.dataset.pillar, { dryRun: true });
    if (!dry.ok) return toast(dry.error, 'warn');
    ctx.act((st) => { const r = setPillar(st, el.dataset.pillar); toast(r.linked ? `Linked ${r.linked} related page(s) into the cluster${r.bonus ? '' : ' (no boost yet: a cluster needs 3+ related pages and a decent pillar)'}.` : 'No related pages to link: write the cluster first.', r.bonus ? 'good' : 'info'); return true; }, { hours: dry.hoursCost, label: 'Topic cluster internal links' });
  });
  on(body, 'submit', '#refForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const a = ctx.state.apps.organic.articles.find((x) => x.id === drafts.refresh);
    if (!a) return;
    if (words(f.body) < 100) return toast('Paste the full updated page.', 'warn');
    const h = refreshHours(a.body ?? '', f.body);
    await ctx.act(async (st) => {
      const j = h > 0.25 ? await judgeArticle(ctx, { query: a.query, title: f.title, body: f.body }) : null;
      const r = refreshArticle(st, a.id, { title: f.title, body: f.body, judge: j });
      drafts.refresh = ''; drafts.refTitle = drafts.refBody = undefined;
      toast(r.kind === 'date_only' ? 'Republished with a new date. Nothing else changed, so Google has nothing new to reward.' : `Refreshed (${Math.round(r.change * 100)}% of the text changed). Traffic ${r.lift >= 1 ? '+' : ''}${Math.round((r.lift - 1) * 100)}% over the next weeks${j?.mock ? ' (offline judge)' : ''}.`, r.lift > 1.05 ? 'good' : r.kind === 'date_only' ? 'warn' : 'info', 8000);
      writingHours(st, h);
      return true;
    }, { hours: writingHours(ctx.state, h, { commit: false }), label: 'Refresh article' });
  });
}

// ---------------------------------------------------------------- site health & links

export function seoHealthTab(body, ctx, drafts) {
  const s = ctx.state;
  const O = s.apps.organic;
  const S = ensureSeo(s);
  const T = S.tech;
  const arts = liveArticles(s);
  const found = T.found ?? [];
  const groups = Object.entries(S.groups);
  const P = S.penalty;
  const site = seoSiteMult(s);
  const asset = hasLinkableAsset(s);
  mount(body, html`
    <div class="stats">
      ${stat('Domain rating', Math.round(O.dr), `${O.linkEvents ?? 0} referring links · ${S.links.earned} earned, ${S.links.bought} paid`)}
      ${stat('Live pages', arts.length, `${arts.filter((a) => isDecaying(s, a)).length} decaying · ${arts.filter((a) => a.stuck).length} not indexed`)}
      ${stat('Site-wide factor', `×${site.toFixed(2)}`, P ? `penalty: ${P.manual ? 'manual action' : 'algorithmic'} (${P.kind === 'links' ? 'links' : 'scaled content'})` : S.migration ? 'migration recovery' : 'no site-wide issue known')}
      ${stat('Last audit', T.lastAudit != null ? fmtDate(s, T.lastAudit) : 'never', T.gsc ? 'Search Console verified' : 'no Search Console')}
    </div>
    ${P ? html`<div class="callout bad"><b>${P.manual ? 'Manual action' : 'Algorithmic demotion'}: ${P.kind === 'links' ? 'unnatural links' : 'scaled content abuse'}</b> since ${fmtDate(s, P.since)}. ${P.liftDay != null ? 'Lifting now; rankings recover over the next weeks.' : P.manual ? (P.reconsider ? `Reconsideration request under review (decision around ${fmtDate(s, P.reconsider.decideDay)}).` : 'Fix the cause, then request reconsideration.') : 'It lifts only at a later spam update, after the cleanup.'}
      ${P.manual && !P.reconsider && P.liftDay == null ? html` <button class="sm" data-recon>Request reconsideration (${SEO_DYN.reconsideration.hours}h)</button>` : ''}</div>` : ''}
    <div class="grid-2">
      <section class="panel"><h2>Technical setup</h2>
        <form id="techForm">
          <label><input type="checkbox" name="gsc" ${T.gsc ? 'checked disabled' : 'checked'} /> Verify Google Search Console and Bing Webmaster Tools (free)</label>
          <label><input type="checkbox" name="sitemap" ${T.sitemap ? 'checked disabled' : 'checked'} /> XML sitemap, indexable templates, canonical tags, internal links</label>
          <label><input type="checkbox" name="deployChecks" ${T.deployChecks ? 'checked disabled' : ''} /> SEO check in every deploy (robots.txt / noindex / status codes)</label>
          <button class="primary" ${T.gsc && T.sitemap && T.deployChecks ? 'disabled' : ''}>Set up</button>
        </form>
        <p class="hint">Without Search Console you learn about indexing errors, noindex accidents and manual actions from a traffic chart, weeks late. Marketing site rendering: ${T.rendering === 'csr' ? 'client-side (slower, fragile indexing)' : 'static / server-rendered'}.</p>
        <p><button data-audit>Run a technical audit (2h, Search Console + free crawler)</button></p>
        ${T.lastAudit != null ? html`<h3>Found on ${fmtDate(s, T.lastAudit)}</h3>${found.length ? html`<ul class="list small">${found.map((i) => html`<li>${badge(i.severity, i.severity === 'bad' ? 'bad' : i.severity === 'warn' ? 'warn' : '')} <b>${i.label}</b> <span class="muted">${i.detail}</span>
          ${i.id === 'noindex' && S.noindex && S.noindex.fixedDay == null ? html` <button class="sm" data-fix="noindex">Fix (1h)</button>` : ''}
          ${i.id === 'not_indexed' ? html` <button class="sm" data-fix="not_indexed">Improve & request indexing</button>` : ''}</li>`)}</ul>` : html`<p class="small">No issues found.</p>`}` : ''}
      </section>
      <section class="panel"><h2>Google updates</h2>
        ${S.updates.length ? html`<ul class="list small">${S.updates.slice(0, 8).map((u) => html`<li>${fmtDate(s, u.day)} · ${u.kind === 'core' ? `Core update (${u.rollout}-day rollout)` : 'Spam update'}${u.kind === 'core' && u.pages ? ` · your pages: ${T.gsc ? `${u.change >= 0 ? '+' : ''}${Math.round(u.change * 100)}%` : 'connect Search Console to see the effect'}` : ''}${u.kind === 'spam' && u.outcome !== 'no effect' ? ` · ${u.outcome}` : ''}</li>`)}</ul>` : html`<p class="small muted">None yet. Google ships 2–4 core updates and 1–2 spam updates a year; each core update re-judges every page on its own helpfulness, and losers usually wait for the next one to recover.</p>`}
        <h3>Overlapping pages</h3>
        ${groups.length ? html`<ul class="list small">${groups.map(([k, g]) => html`<li>${g.ids.map((id) => O.articles.find((a) => a.id === id)?.title).join(' · ')} <button class="sm" data-merge="${k}">Merge + 301 (${(SEO_DYN.cannibal.mergeHours * (g.ids.length - 1)).toFixed(1)}h)</button></li>`)}</ul>` : html`<p class="small muted">${T.lastAudit != null ? 'No overlapping pages.' : 'Run an audit to check for pages competing for the same query.'}</p>`}
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Earn links</h2>
        <form id="guestForm">
          <label>Guest post for <input name="site" data-draft="gpSite" value="${drafts.gpSite ?? ''}" placeholder="a relevant industry blog" /></label>
          <label>Title <input name="title" data-draft="gpTitle" value="${drafts.gpTitle ?? ''}" /></label>
          <label>Post <textarea name="body" rows="6" data-draft="gpBody" placeholder="Something only you can write for their audience: data, a teardown, a lesson with numbers.">${drafts.gpBody ?? ''}</textarea></label>
          <button>Write & pitch (writing + ${SEO_DYN.links.pitchHours}h outreach)</button>
        </form>
        <p><button data-haro>Answer journalist requests: Featured / Qwoted / Source of Sources (${SEO_DYN.links.haroHours}h)</button></p>
        <form id="prForm" class="inline">
          <label>Digital PR campaign budget ($) <input type="number" name="budget" min="${SEO_DYN.links.prMin}" step="500" value="${drafts.prBudget ?? 3000}" data-draft="prBudget" /></label>
          <button>Brief a PR agency (${SEO_DYN.links.prHours}h)</button>
        </form>
        <p class="hint">Benchmark: ~$597 per earned link (BuzzStream 2025), and only when there is something worth linking to: ${asset ? 'you have a linkable asset (a live free tool or an original-data page).' : 'you have no linkable asset yet (a free tool or an original data study).'}</p>
      </section>
      <section class="panel"><h2>Buy links</h2>
        <p class="small muted">Paid links violate Google's link spam policy. Most are simply ignored; obvious patterns get a manual action that demotes the whole site until you remove them and Google accepts a reconsideration request.</p>
        <form id="buyForm">
          <label>Package <select name="pack">${Object.entries(SEO_DYN.links.packs).map(([k, p]) => html`<option value="${k}">${p.label}: ${money(p.n * p.usdEach)}</option>`)}</select></label>
          <button>Buy (1h)</button>
        </form>
        <p><button data-removelinks>${S.links.bought ? `Remove / disavow the ${S.links.bought} paid links (${SEO_DYN.links.removeHours}h)` : `Disavow "toxic" links (${SEO_DYN.links.removeHours}h)`}</button></p>
      </section>
    </div>
    <section class="panel"><h2>Migrate the marketing site</h2>
      <form id="migForm">
        <label><input type="checkbox" name="redirectMap" checked /> Map every old URL to its new URL with 301s, then recrawl (~${SEO_DYN.migration.mapHours}h)</label>
        <label>New site rendering <select name="rendering"><option value="static">static / server-rendered</option><option value="csr">client-side single-page app</option></select></label>
        <button>Migrate domain / CMS</button>
      </form>
      <p class="hint">Migration studies: mean ~500 days to regain traffic and 14–17% never fully recover; a full redirect map keeps the dip to roughly 5–15%.</p>
    </section>`);
  on(body, 'submit', '#techForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const opts = { gsc: T.gsc || !!f.gsc, sitemap: T.sitemap || !!f.sitemap, deployChecks: T.deployChecks || !!f.deployChecks };
    const dry = technicalSetup(ctx.state, { ...opts, dryRun: true });
    ctx.act((st) => { technicalSetup(st, opts); toast('Technical basics in place.', 'good'); return true; }, { hours: dry.hoursCost, label: 'Technical SEO setup' });
  });
  on(body, 'click', '[data-audit]', () => ctx.act((st) => { const r = runAudit(st); toast(`Audit done: ${r.issues.length} issue(s).`, r.issues.some((i) => i.severity === 'bad') ? 'warn' : 'info'); return true; }, { hours: 2, label: 'Technical SEO audit' }));
  on(body, 'click', '[data-fix]', (e, el) => {
    const id = el.dataset.fix;
    const h = id === 'noindex' ? 1 : Math.max(0.25, 0.25 * arts.filter((a) => a.stuck).length);
    ctx.act((st) => { const r = fixIssue(st, id); if (!r.ok) throw new Error(r.error); toast(id === 'noindex' ? 'Fixed. Google needs a few weeks to recrawl and reindex.' : `${r.fixed} page(s) resubmitted${r.stillStuck ? `; ${r.stillStuck} too thin to be indexed` : ''}.`, 'good'); return true; }, { hours: h, label: 'Fix SEO issue' });
  });
  on(body, 'click', '[data-merge]', (e, el) => {
    const dry = mergeGroup(ctx.state, el.dataset.merge, { dryRun: true });
    if (!dry.ok) return toast(dry.error, 'warn');
    ctx.act((st) => { const r = mergeGroup(st, el.dataset.merge); toast(`Merged ${r.merged} page(s) into the strongest one.`, 'good'); return true; }, { hours: dry.hoursCost, label: 'Merge overlapping pages' });
  });
  on(body, 'click', '[data-recon]', () => ctx.act((st) => { const r = requestReconsideration(st); if (!r.ok) throw new Error(r.error); toast(`Submitted. Google reviews it in a few weeks (around ${fmtDate(st, r.decideDay)}).`, 'info'); return true; }, { hours: SEO_DYN.reconsideration.hours, label: 'Reconsideration request' }));
  on(body, 'click', '[data-haro]', () => ctx.act((st) => { answerJournalists(st); toast('Pitches sent. Journalists use a few of them, weeks later.', 'info'); return true; }, { hours: SEO_DYN.links.haroHours, label: 'Journalist requests' }));
  on(body, 'click', '[data-removelinks]', () => ctx.act((st) => { const r = removeBoughtLinks(st); toast(r.needless ? 'Disavowed. Google already ignored most of those links.' : `Removed / disavowed ${r.removed} paid links.`, r.needless ? 'warn' : 'info'); return true; }, { hours: SEO_DYN.links.removeHours, label: 'Remove paid links' }));
  on(body, 'submit', '#guestForm', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.title.trim() || words(f.body) < 300) return toast('Write the actual guest post (300+ words).', 'warn');
    const h = Math.min(10, Math.max(2, 1 + words(f.body) / 600)) + SEO_DYN.links.pitchHours;
    await ctx.act(async (st) => {
      const j = await judgeArticle(ctx, { query: f.title, title: f.title, body: f.body });
      pitchGuestPost(st, { site: f.site.trim() || 'an industry blog', judge: j });
      drafts.gpTitle = drafts.gpBody = '';
      toast('Pitched. Editors reply in 2–5 weeks.', 'info');
      writingHours(st, h);
      return true;
    }, { hours: writingHours(ctx.state, h, { commit: false }), label: 'Guest post' });
  });
  on(body, 'submit', '#prForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const r = runDigitalPR(st, { budget: +f.budget }); toast(`Campaign booked (${money(r.usdCost)}). Coverage lands over the next 1–2 months.`, 'info'); return true; }, { hours: SEO_DYN.links.prHours, label: 'Digital PR campaign' }); });
  on(body, 'submit', '#buyForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const r = buyLinks(st, { pack: f.pack }); toast(`Bought. Domain rating +${r.drGain.toFixed(1)} for now.`, 'warn'); return true; }, { hours: 1, label: 'Buy links' }); });
  on(body, 'submit', '#migForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const dry = migrateSite(ctx.state, { redirectMap: !!f.redirectMap, dryRun: true });
    ctx.act((st) => { migrateSite(st, { redirectMap: !!f.redirectMap, rendering: f.rendering }); toast(f.redirectMap ? 'Migrated with a full redirect map.' : 'Migrated. Old URLs now 404 or point at the home page.', f.redirectMap ? 'info' : 'warn'); return true; }, { hours: dry.hoursCost, label: 'Site migration' });
  });
}

// ---------------------------------------------------------------- writers & agencies

export function writersTab(body, ctx, drafts) {
  const s = ctx.state;
  const S = ensureSeo(s);
  const G = S.agency;
  const queue = S.drafts.filter((d) => d.status === 'review' || d.status === 'writing');
  const done = S.drafts.filter((d) => d.status === 'published' || d.status === 'rejected').slice(0, 15);
  const writers = (s.apps.people?.members ?? []).filter((m) => m.status === 'active' && (m.jobRole === 'content_writer' || m.role === 'marketer'));
  mount(body, html`
    <section class="panel"><h2>Content plan</h2>
      <form id="planForm">
        <label>Target queries, one per line (writers, agencies and in-house writers work from this list) <textarea name="plan" rows="5" data-draft="plan">${drafts.plan ?? S.plan.join('\n')}</textarea></label>
        <button>Save plan (15 min)</button> <span class="small muted">${S.plan.length ? `${Math.max(0, S.plan.length - S.planUsed)} of ${S.plan.length} not yet assigned` : 'No plan: agencies and writers pick their own topics (usually generic ones).'}</span>
      </form>
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Commission a freelance article</h2>
        <form id="comForm2">
          <label>Writer <select name="tier">${Object.entries(WRITERS).map(([k, w]) => html`<option value="${k}" ${drafts.wTier === k ? 'selected' : ''}>${w.label}: ${money(w.usd)} per post</option>`)}</select></label>
          <label>Target query <input name="query" data-draft="wQuery" value="${drafts.wQuery ?? ''}" /></label>
          <label>Working title <input name="title" data-draft="wTitle" value="${drafts.wTitle ?? ''}" /></label>
          <label>Brief <textarea name="brief" rows="5" data-draft="wBrief" placeholder="Who it is for, the angle, product facts, customer quotes from calls or tickets, numbers only you have.">${drafts.wBrief ?? ''}</textarea></label>
          <p class="hint">Brief strength ${Math.round(briefQuality(s, drafts.wBrief ?? '') * 100)}/100. Writers without product knowledge write generic posts; a specific brief is most of the difference.</p>
          <button class="primary">Pay & commission (brief: 30 min)</button>
        </form>
        <p class="small muted">Freelance rates 2026: junior $150–300, mid $300–600, specialist SaaS $1,000–2,500 per post. Cheap drafts need 3–6 hours of founder editing or they go out generic.</p>
      </section>
      <section class="panel"><h2>Agency retainer</h2>
        ${G?.status === 'active' ? html`<p><b>${AGENCIES[G.tier].label}</b> since ${fmtDate(s, G.startDay)} · ${money(AGENCIES[G.tier].monthly)}/month · ${G.produced} pieces so far.${AGENCIES[G.tier].bought ? ' Link building: paid guest posts on your behalf.' : ''}</p><button data-cancelag>Cancel retainer (30 min)</button>`
          : html`<form id="agForm">
            <label>Agency <select name="tier">${Object.entries(AGENCIES).map(([k, a]) => html`<option value="${k}">${a.label}: ${money(a.monthly)}/month, ~${a.perMonth} pieces</option>`)}</select></label>
            <label>Onboarding brief <textarea name="brief" rows="4" data-draft="agBrief">${drafts.agBrief ?? ''}</textarea></label>
            <button>Sign retainer (onboarding 2h)</button>
          </form>${G ? html`<p class="small muted">Previous retainer ${G.status} on ${fmtDate(s, G.endDay ?? s.day)}.</p>` : ''}`}
        <p class="small muted">Agencies publish to your CMS within a week if you don't review. Typical retainers: ~$3.2k/month (Ahrefs survey of 439 providers); credible B2B SaaS content $2.5–10k/month; $100–200 AI-spun posts rarely rank. Commit 12 months or don't start.</p>
        ${writers.length ? html`<p class="small">In-house: ${writers.length} writer/marketer(s) on the team draft into the queue every week.</p>` : ''}
      </section>
    </div>
    <section class="panel"><h2>Review queue</h2>
      ${table({ columns: [
        { label: 'Draft', render: (d) => html`<b>${d.title}</b><div class="small muted">"${d.query}" · ${d.source.split(':')[0]}${d.tier && d.tier !== 'team' ? ` (${d.tier})` : ''}</div>` },
        { label: 'Status', render: (d) => (d.status === 'writing' ? `due ${fmtDate(s, d.dueDay)}` : d.autoPublishDay != null ? `auto-publishes ${fmtDate(s, d.autoPublishDay)}` : 'waiting for you') },
        { label: 'First read', render: (d) => (d.status === 'review' ? (d.slop > 0.5 ? badge('reads like AI', 'bad') : d.quality >= 0.6 ? badge('solid', 'good') : badge('generic', 'warn')) : '—') },
        { label: '', render: (d) => (d.status === 'review' ? html`<button class="sm" data-rv="publish" data-id="${d.id}">Publish as is (15 min)</button> <button class="sm" data-rv="edit" data-id="${d.id}">Edit & publish (${d.editHours}h)</button> <button class="sm" data-rv="reject" data-id="${d.id}">Reject</button>` : '') },
      ], rows: queue, empty: 'Nothing in the queue.' })}
      ${done.length ? html`<p class="small muted">Recent: ${done.map((d) => `${d.title} (${d.status}${d.edited ? ', edited' : ''})`).join(' · ')}</p>` : ''}
    </section>`);
  on(body, 'submit', '#planForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { setContentPlan(st, String(f.plan).split('\n')); drafts.plan = undefined; toast('Plan saved.', 'good'); return true; }, { hours: 0.25, label: 'Content plan' }); });
  on(body, 'submit', '#comForm2', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.query.trim()) return toast('Give the writer a target query.', 'warn');
    ctx.act((st) => { const d = commissionArticle(st, { tier: f.tier, query: f.query, title: f.title, brief: f.brief }); drafts.wQuery = drafts.wTitle = drafts.wBrief = ''; toast(`Commissioned: due ${fmtDate(st, d.dueDay)}.`, 'good'); return true; }, { hours: 0.5, label: 'Commission article' });
  });
  on(body, 'submit', '#agForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { startAgency(st, { tier: f.tier, brief: f.brief }); drafts.agBrief = ''; toast('Retainer signed. First drafts in about a week.', 'good'); return true; }, { hours: 2, label: 'Agency onboarding' }); });
  on(body, 'click', '[data-cancelag]', () => ctx.act((st) => { cancelAgency(st); toast('Retainer cancelled.', 'info'); return true; }, { hours: 0.5, label: 'Cancel agency' }));
  on(body, 'click', '[data-rv]', (e, el) => {
    const dry = reviewDraft(ctx.state, el.dataset.id, el.dataset.rv, { dryRun: true });
    if (!dry.ok) return toast(dry.error, 'warn');
    ctx.act((st) => { const r = reviewDraft(st, el.dataset.id, el.dataset.rv); if (!r.ok) throw new Error(r.error); toast(el.dataset.rv === 'reject' ? 'Rejected.' : 'Published.', 'info'); if (el.dataset.rv === 'edit') writingHours(st, dry.hoursCost); return true; }, { hours: el.dataset.rv === 'edit' ? writingHours(ctx.state, dry.hoursCost, { commit: false }) : dry.hoursCost, label: 'Review draft' });
  });
}
