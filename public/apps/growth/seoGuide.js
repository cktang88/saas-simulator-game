// "How SEO works here": the step-by-step path through the SEO workflow, which spans two apps (Search & AI visibility
// for Search Console, keywords and briefs; Organic for writing, publishing, site health and links). seoSteps() reads
// the state and says which step the founder is on; articleLag() explains, per published page, why it has no traffic
// yet. Pure reads: no state changes, no randomness.
// Timing copy uses only sourced numbers (docs/research/seo/effects-and-risks.md §1: Ahrefs, 5.7% of new pages reach
// the top 10 within a year, most of those in 61-182 days; AI Overviews cut position-1 CTR ~58% on informational
// queries); indexing lag is a game assumption and is labelled so.

import { html } from '../../core/ui.js';
import { hasProduct } from '../../core/market.js';
import { ensureSeo, isIndexed, shownPosition, liveArticles } from './seoDynamics.js';
import { TOOLS } from '../searchtools/params.js';

/** Steps of the SEO path with done flags and a status line from the founder's own state. */
export function seoSteps(state) {
  const O = state.apps?.organic ?? { articles: [] };
  const S = state.apps?.organic ? ensureSeo(state) : { tech: {}, links: {} };
  const T = state.apps?.searchtools ?? { subs: {} };
  const arts = state.apps?.organic ? liveArticles(state) : [];
  const day = state.day ?? 0;
  const indexed = arts.filter((a) => isIndexed(state, a));
  const stuck = arts.filter((a) => a.stuck);
  const positions = indexed.map((a) => shownPosition(a, day)).filter((p) => p != null);
  const best = positions.length ? Math.min(...positions) : null;
  const visits = arts.reduce((a, x) => a + (x.visits ?? 0), 0);
  const signups = arts.reduce((a, x) => a + (x.signups ?? 0), 0);
  const kwTool = Object.keys(T.subs ?? {}).some((id) => TOOLS[id]?.kind === 'keyword' || TOOLS[id]?.kind === 'planner');
  const tech = S.tech ?? {};
  const newest = arts.reduce((m, a) => (m == null || a.day > m.day ? a : m), null);
  const steps = [
    { id: 'setup', title: 'Verify Search Console and submit a sitemap', route: 'organic/seo', done: Boolean(tech.gsc && tech.sitemap),
      what: 'Free, a few hours, once. Google finds new pages sooner and you see indexing errors and real clicks instead of guessing.',
      status: tech.gsc && !tech.sitemap ? 'Search Console is verified; the sitemap is still missing.' : !tech.gsc ? 'Not set up yet. Do this before you publish: Search Console only shows data from the day you verify.' : 'Done.' },
    { id: 'keyword', title: 'Pick a query you can win', route: 'searchtools/keywords', done: kwTool || arts.length > 0,
      what: 'One specific question your buyer types, 3+ words, ideally with buying intent ("X for Y", "X alternative", "how to do the job your product does"). Keyword Planner is free (ranges only).',
      status: kwTool ? 'You have a keyword tool: look queries up before you write.' : 'No keyword tool yet: set up Keyword Planner (free) under Tools, or judge by the query\'s shape.' },
    { id: 'write', title: 'Write and publish an article', route: 'organic/content', done: arts.length > 0,
      what: 'Answer the query in the first lines, then add what only you know: your numbers, steps you actually ran, screenshots, an opinion. 2-10 founder hours per article.',
      status: arts.length ? `${arts.length} live page(s).` : 'Nothing published yet.' },
    { id: 'index', title: 'Get indexed', route: 'organic/seo', done: indexed.length > 0,
      what: 'Google has to crawl and index a page before it can rank. Typically days to a few weeks (game assumption); thin or AI-slop pages can sit in "Discovered, not indexed".',
      status: !arts.length ? 'Publish first.' : stuck.length && stuck.length === arts.length ? `${stuck.length} page(s) not indexed: run an audit in SEO health, improve them and request indexing.` : indexed.length ? `${indexed.length} of ${arts.length} page(s) indexed.` : `Waiting for Google: newest page published ${day - newest.day} day(s) ago.` },
    { id: 'rank', title: 'Climb into the top 10', route: 'organic/content', done: best != null && best <= 10,
      what: 'New pages climb for months. In Ahrefs\' study only ~5.7% of new pages reached the top 10 within a year, most of those in 2-6 months (61-182 days); competitive terms take 12-24 months. Past page 1 gets almost no clicks.',
      status: !indexed.length ? 'Not indexed yet.' : best == null ? 'Indexed, not ranking anywhere people look yet. Keep publishing while you wait.' : best <= 10 ? `Best position #${best}.` : `Best position #${best}: ${best <= 20 ? 'page 2, close' : 'too deep for clicks'}. Links and substantive refreshes push pages up.` },
    { id: 'traffic', title: 'Turn visits into signups', route: 'searchtools/gsc', done: signups > 0,
      what: 'Clicks scale with the query\'s volume and your position; AI Overviews take ~58% of position-1 clicks on informational queries, so bottom-funnel pages (comparisons, alternatives, pricing) convert better.',
      status: !hasProduct(state) ? `${Math.round(visits)} visit(s). Nothing is shipped yet, so visitors can't sign up.` : `${Math.round(visits)} visit(s), ${signups} signup(s) from search so far.` },
    { id: 'compound', title: 'Compound: clusters, links, refreshes', route: 'organic/seo', done: arts.length >= 5 && (S.links?.earned ?? 0) > 0,
      what: 'SEO compounds: related pages in a cluster, earned links (guest posts, data, PR) raising domain rating, and refreshing pages that decay after 6-12 months. Bought links and mass AI pages risk penalties.',
      status: `${arts.length} live page(s) · ${S.links?.earned ?? 0} earned link(s).` },
  ];
  const current = steps.findIndex((x) => !x.done);
  return { steps, current: current < 0 ? steps.length - 1 : current, allDone: current < 0 };
}

/** Why a published page has (no) traffic yet: one short sentence from what the founder can see. */
export function articleLag(state, a) {
  const day = state.day ?? 0;
  if (a.status && a.status !== 'live') return '';
  const age = day - a.day;
  const slop = a.slop > 0.5 ? ' It reads like AI slop, which Google discounts.' : '';
  if (a.stuck) return `Crawled but not indexed ("Discovered, not indexed"). Low-value pages often stay out: improve it, then request indexing in SEO health.${slop}`;
  if (!isIndexed(state, a)) return `Waiting for Google to crawl and index it (published ${age} day(s) ago; typically days to a few weeks, faster with Search Console and a sitemap).`;
  const p = shownPosition(a, day);
  if (p == null) return `Indexed, not ranking where people look yet. New pages climb for months; most that reach the top 10 take 2-6 months.${slop}`;
  if (p > 20) return `#${p} (page ${Math.ceil(p / 10)}): almost no clicks. ${age < 180 ? 'It may still climb for a few months.' : 'Still deep after 6 months: target a more specific query, refresh with first-hand detail, or earn links.'}${slop}`;
  if (p > 10) return `#${p}: page 2, close. Links and a substantive refresh usually decide page 1.${slop}`;
  if ((a.visits ?? 0) < 10) return `#${p}: top 10. Few clicks so far: they depend on the query's volume, your exact position and AI Overviews.`;
  return '';
}

/** The numbered guide. compact = one line with the current step and a link (for tabs deeper in the workflow). */
export function seoGuideHtml(state, { compact = false } = {}) {
  const { steps, current, allDone } = seoSteps(state);
  const cur = steps[current];
  if (compact) {
    return html`<div class="callout seo-guide-compact"><b>SEO step ${current + 1} of ${steps.length}${allDone ? ' (ongoing)' : ''}:</b> ${cur.title}. <span class="small">${cur.status}</span> <a href="#/${cur.route}">Go →</a> <a class="small" href="#/searchtools/overview">All steps</a></div>`;
  }
  return html`<section class="panel seo-guide"><h2>How SEO works here</h2>
    <p class="small muted">Search is the slowest channel: expect months before traffic, then it compounds. Keyword tools and Search Console live in Search & AI visibility; you write and publish in Organic.</p>
    <ol class="seo-steps">${steps.map((x, i) => html`<li class="${i === current ? 'current' : x.done ? 'done' : ''}" data-seostep="${x.id}">
      <div title="${x.what}"><b>${x.done ? '✓ ' : ''}${x.title}</b> ${i === current ? html`<span class="badge accent">${allDone ? 'ongoing' : 'you are here'}</span>` : ''} <a class="small" href="#/${x.route}">Open →</a></div>
      ${i === current ? html`<div class="small">${x.what}</div><div class="small muted">Now: ${x.status}</div>` : ''}
    </li>`)}</ol>
    <details class="small"><summary>What each step involves</summary><ol>${steps.map((x) => html`<li><b>${x.title}.</b> ${x.what}</li>`)}</ol></details>
  </section>`;
}

/** What a good vs mediocre target query and article look like (the judge and the ranking model reward the former). */
export function seoExamplesHtml() {
  return html`<details class="panel seo-examples"><summary><b>What good looks like</b> <span class="small muted">(query and article)</span></summary>
    <div class="grid-2">
      <div><h3>Target query</h3><ul class="small">
        <li><b>Good:</b> specific, 3+ words, the job your buyer is trying to do: "reconcile stripe payouts in quickbooks", "[competitor] alternative for small agencies", "[category] for [your ICP]". Low difficulty, can rank in months.</li>
        <li><b>Mediocre:</b> a head term ("accounting software"): high difficulty, 12-24 months, rarely in year 1. Or a definition ("what is churn"): AI Overviews answer it, so clicks shrink.</li>
      </ul></div>
      <div><h3>Article</h3><ul class="small">
        <li><b>Good:</b> answers the query in the first lines, then first-hand detail: your numbers, steps you actually ran, screenshots, mistakes, an honest comparison with prices.</li>
        <li><b>Mediocre:</b> a rewrite of the top 10, generic AI text, the keyword repeated. The editor scores it low, it may never get indexed, and many such pages risk a site-wide spam demotion.</li>
      </ul></div>
    </div></details>`;
}
