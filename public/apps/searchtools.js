// Search & AI visibility: the SEO / GEO tool stack (Search Console, Bing, Ahrefs Webmaster Tools, Keyword Planner,
// HubSpot AI grader, Ahrefs/Semrush, Screaming Frog, Surfer/Clearscope, Otterly/Peec/Semrush AI/Brand Radar/Profound)
// and AI-answer visibility as share of voice across a buyer prompt set. Tools reveal information; rankings and
// citations still come from the work in Organic, Channels and Market.
// Engines: searchtools/geo.js (visibility, mentions, risks), searchtools/tools.js (subscriptions, GSC, estimates).
// Research: docs/research/seo/llm-visibility.md, effects-and-risks.md §8, indie.md, seed-series-a.md.

import { html, mount, on, formData, toast, table, stat, badge } from '../core/ui.js';
import { pct, money, fmtDate } from '../core/util.js';
import { reviewFor } from '../core/advice.js';
import { TOOLS, TOOL_ORDER, ENGINES, ENGINE_ORDER, BOTS, HOURS } from './searchtools/params.js';
import {
  ensureSearch, geoDay, trackerReport, trackerCapacity, manualTest, runGrader, geoAudit, setRobots, addLlmsTxt, communityWeek, astroturf, buyPlacement,
  savePromptSet, promptSetHours, activeWrongFacts, fixFactSource, FIX_SOURCES, shareOfVoice, rivalNames, geoOperatorRead, signalParts,
} from './searchtools/geo.js';
import {
  subscribe, unsubscribe, renewAnnual, gscSnapshot, gscReport, trueMonthlyClicks, keywordInsight, estimateTraffic, rivalTrueTraffic, keywordTools,
  makeBrief, scoreDraft, applyBriefs, siteAudit, hasKind, monthlyToolSpend, syncSearchConsole,
} from './searchtools/tools.js';
import { judgePromptSet, classifyAnswer } from './searchtools/judge.js';
import { kwInsightHtml } from './searchtools/view.js';
import { seoGuideHtml } from './growth/seoGuide.js';

export { keywordInsight, keywordLabel } from './searchtools/tools.js';
export { geoOperatorRead } from './searchtools/geo.js';

const TABS = [['overview', 'Overview'], ['tools', 'Tools'], ['gsc', 'Search Console'], ['keywords', 'Keywords'], ['content', 'Content briefs'], ['audit', 'Site audit'], ['ai', 'AI visibility'], ['mentions', 'Earn mentions']];
const GUIDED = new Set(['tools', 'gsc', 'keywords', 'content', 'audit']); // SEO workflow tabs: show "you are on step N"
const draft = { prompts: null, kwq: '', briefQ: '', briefText: '', pasteP: '', pasteA: '' };
const engLabel = (e) => ENGINES[e]?.label ?? e;

function overview(s, T) {
  const spend = monthlyToolSpend(s);
  const stage = s.company.path === 'vc' ? 'seed' : 'indie';
  const facts = activeWrongFacts(s).filter((f) => f.noticed);
  return html`${seoGuideHtml(s)}<div class="stats">
      ${stat('Tool spend', `${money(spend)}/mo`, stage === 'indie' ? 'indie stacks: $0-150/mo' : 'seed founder-run: $0-300/mo; Series A $800-2,500')}
      ${stat('Search Console', T.subs.gsc ? 'verified' : 'not set up', T.subs.gsc ? `data from ${fmtDate(s, T.gscVerifiedDay)}` : 'free; set it up on day 0')}
      ${stat('AI visibility (measured)', T.samples[0] || Object.keys(T.track.cells).length ? pct(lastMeasured(s, T), 0) : 'unknown', 'what your own tests or tracker show')}
      ${stat('Wrong facts in answers', facts.length ? String(facts.length) : '—', facts.length ? 'fix the sources' : 'none you know of', facts.length ? 'bad' : '')}
    </div>
    <div class="grid-2"><section class="panel"><h2>What tools do and don't do</h2><ul class="small">
      <li><b>Search Console</b> is Google's own data for your site: real clicks, impressions, CTR and average position, ~2-3 days behind, only for queries you already appear for.</li>
      <li><b>Ahrefs / Semrush</b> estimate volume, difficulty and competitors' traffic from clickstream and rank models. Against Search Console, median error is ~50% (Ahrefs) and ~68% (Semrush) in Ahrefs' 2022 study of 1,635 sites; small sites are often overestimated several-fold. Use them to rank opportunities, not to forecast.</li>
      <li><b>Content optimizers</b> (Surfer, Clearscope) give a brief and a term checklist. Small help as a checklist; followed blindly they make your page read like the ten already ranking.</li>
      <li><b>AI visibility trackers</b> (Otterly, Peec, Semrush AI, Brand Radar, Profound) run your prompts on each engine and report how often you're named. Answers rarely repeat (SparkToro 2026: under 1% identical lists), so read visibility % over many runs, never one screenshot.</li>
    </ul></section>
    <section class="panel"><h2>Stack by stage</h2><ul class="small">
      <li><b>Indie / pre-revenue:</b> Search Console + Bing + Ahrefs Webmaster Tools + Keyword Planner + the free HubSpot grader + manual prompt tests. $0. Add one keyword tool for a month of research if you need it.</li>
      <li><b>Seed:</b> one keyword suite (Ahrefs Lite / Semrush Pro), an AI tracker (Otterly/Peec, $30-100), maybe an optimizer for freelancers' briefs. $150-400/mo.</li>
      <li><b>Series A:</b> Standard/Guru seats, Screaming Frog, Clearscope, Profound or Brand Radar, rank tracking. $800-2,500/mo, worth it only with someone using it weekly.</li>
      <li class="muted">Paying for a stack nobody opens is a classic waste; the Bank's spend audit will show it.</li>
    </ul></section></div>`;
}
function lastMeasured(s, T) {
  if (Object.keys(T.track.cells).length) return trackerReport(s).all.visibility;
  const smp = T.samples[0];
  return smp ? shareOfVoice(smp.names, smp.rows.filter((r) => r.kind !== 'vanity' && r.kind !== 'off_target')).visibility : 0;
}

function toolsView(s, T) {
  const groups = [['Free', (t) => t.price === 0], ['Keyword & competitor suites', (t) => t.kind === 'keyword'], ['Crawlers & optimizers', (t) => (t.kind === 'crawler' || t.kind === 'optimizer') && t.price > 0], ['AI visibility trackers', (t) => t.kind === 'tracker']];
  return html`${groups.map(([title, f]) => html`<section class="panel"><h2>${title}</h2>
    ${table({ columns: [
      { label: 'Tool', render: (id) => html`<b>${TOOLS[id].label}</b><div class="small muted">${TOOLS[id].note}</div>` },
      { label: 'Price', align: 'right', render: (id) => (TOOLS[id].price ? (TOOLS[id].annual ? `${money(TOOLS[id].annual)}/yr` : `${money(TOOLS[id].price)}/mo`) : 'free') },
      { label: 'Setup', align: 'right', render: (id) => `${TOOLS[id].setup} h` },
      { label: '', render: (id) => (T.subs[id] ? html`${badge('active', 'good')} <button class="sm" data-unsub="${id}">Cancel</button>` : TOOLS[id].oneOff ? html`<button class="sm" data-grader="1">Run grader</button>` : html`<button class="sm primary" data-sub="${id}">${TOOLS[id].price ? 'Subscribe' : 'Set up'}</button>`) },
    ], rows: TOOL_ORDER.filter((id) => f(TOOLS[id])) })}</section>`)}
    <p class="small muted">Prices are 2026 list prices from vendor summaries and aggregators (they conflict; check the vendor page). Paid tools bill your card monthly through Bank and appear in the spend audit.</p>
    ${T.grader[0] ? html`<section class="panel"><h2>HubSpot AI Search Grader</h2><p>Score <b>${T.grader[0].score}</b>/100 (${T.grader[0].label}) on ${fmtDate(s, T.grader[0].day)}: named in ${T.grader[0].hits} of ${T.grader[0].n} single runs.</p><p class="small muted">One run per prompt: next month's score could differ a lot without anything changing.</p></section>` : ''}`;
}

function gscView(s, T) {
  if (!T.subs.gsc) return html`<section class="panel"><h2>Search Console</h2><p>Not verified. Verification is a DNS record (~30 min) and is free. Google only shows data from the day you add the property: every week you wait is history you never get back.</p><button class="primary" data-sub="gsc">Verify site (${TOOLS.gsc.setup} h)</button></section>`;
  const r = gscReport(s);
  const tot = r.rows.reduce((a, x) => ({ c: a.c + x.clicks, i: a.i + x.impressions }), { c: 0, i: 0 });
  return html`<div class="stats">${stat('Clicks (28 days)', Math.round(tot.c).toLocaleString())}${stat('Impressions', Math.round(tot.i).toLocaleString())}${stat('CTR', tot.i ? pct(tot.c / tot.i, 1) : '—')}${stat('Data through', fmtDate(s, r.through), `${r.lag}-day processing lag`)}</div>
    <section class="panel"><h2>Queries & pages</h2>
    ${table({ columns: [
      { label: 'Query / page', render: (x) => html`${x.query}<div class="small muted">${x.title}</div>` },
      { label: 'Clicks', align: 'right', render: (x) => Math.round(x.clicks).toLocaleString() },
      { label: 'Impressions', align: 'right', render: (x) => x.impressions.toLocaleString() },
      { label: 'CTR', align: 'right', render: (x) => pct(x.ctr, 1) },
      { label: 'Avg. position', align: 'right', render: (x) => x.position?.toFixed(1) ?? '—' },
    ], rows: r.rows, empty: (s.apps.organic?.articles ?? []).length ? 'No impressions yet. Pages appear here only once indexed and ranking where people look: weeks to months after publishing. Each page\'s "Why" line in Organic → Content says where it is.' : 'No impressions yet: you have no published pages. Write one in Organic → Content, SEO & GEO.' })}
    <p class="small muted">Google-only and first-party. Impressions come only once a page ranks somewhere people look; a page "not ranking yet" shows nothing. Anonymised rare queries are left out of query rows in the real tool.</p></section>
    ${hasKind(s, 'keyword') || T.subs.awt ? html`<section class="panel"><h2>Your traffic vs the tools' estimate</h2>
      <p class="small">Search Console (truth): <b>${Math.round(trueMonthlyClicks(s)).toLocaleString()}</b> organic clicks in the last 30 days.</p>
      ${[...keywordTools(s).map((id) => TOOLS[id].engine), ...(T.subs.awt ? ['ahrefs'] : [])].filter((v, i, a) => a.indexOf(v) === i).map((eng) => html`<p class="small">${eng === 'ahrefs' ? 'Ahrefs' : 'Semrush'} estimates: <b>${estimateTraffic(s, eng, 'self', Math.max(1, trueMonthlyClicks(s))).toLocaleString()}</b>/month.</p>`)}
      <p class="small muted">Small sites are routinely overestimated.</p></section>` : ''}`;
}

function keywordsView(s, T) {
  const k = draft.kwq ? keywordInsight(s, draft.kwq) : null;
  const names = rivalNames(s);
  const tools = keywordTools(s);
  return html`<div class="grid-2"><section class="panel"><h2>Keyword research</h2>
      <form id="kwForm"><label>Query <input name="q" value="${draft.kwq}" placeholder="e.g. shopify payouts quickbooks" /></label><button class="sm">Look up</button></form>
      ${k ? kwInsightHtml(k) : html`<p class="hint">Type the exact question your buyer would search, e.g. a specific task in the tool they use. What you see depends on your tools: Planner ranges (free), Search Console impressions for pages you already have, or Ahrefs/Semrush volume and difficulty.</p>`}
      ${tools.length || T.subs.planner ? '' : html`<div class="callout"><b>No keyword tool yet.</b> Look-ups show nothing until you set one up. Start free: <button class="sm primary" data-sub="planner">Set up Keyword Planner (${TOOLS.planner.setup} h, free)</button>. No tool at all? Pick a specific 3+ word query with buying intent and go <a href="#/organic/content">write it</a>.</div>`}
      <p class="small muted">Found a query? Write the article in <a href="#/organic/content">Organic → Content, SEO & GEO</a>.</p>
    </section>
    <section class="panel"><h2>Competitors' organic traffic</h2>
      ${tools.length ? table({ columns: [{ label: 'Competitor', render: (r) => r.name }, ...tools.map((id) => ({ label: TOOLS[id].vendor, align: 'right', render: (r) => estimateTraffic(s, TOOLS[id].engine, r.name, rivalTrueTraffic(s, r.name, r.i)).toLocaleString() }))], rows: names.map((name, i) => ({ name, i })) }) : html`<p class="empty">Needs Ahrefs or Semrush.</p>`}
      ${tools.length > 1 ? html`<p class="small muted">The two suites disagree; neither is right. Compare orders of magnitude, not numbers.</p>` : ''}
    </section></div>`;
}
function contentView(s, T) {
  if (!hasKind(s, 'optimizer')) return html`<section class="panel"><h2>Content briefs</h2><p class="empty">Optional. Briefs need Surfer or Clearscope (<a href="#/searchtools/tools">Tools</a>, paid). You can skip them: search your query, read the top 5 results, note what they all miss, and write that in <a href="#/organic/content">Organic → Content</a>.</p></section>`;
  const b = draft.briefQ ? T.briefs[draft.briefQ.trim().toLowerCase()] : null;
  return html`<div class="grid-2"><section class="panel"><h2>Brief</h2>
      <form id="briefForm"><label>Target query <input name="q" value="${draft.briefQ}" /></label><button class="sm">Build brief (0.25 h)</button></form>
      ${b ? html`<p class="small">Target ~${b.targetWords.toLocaleString()} words (the top results' average). Suggested headings: ${b.headings.join(' · ')}</p><p class="small">Terms: ${b.terms.map((t) => badge(t))}</p>` : ''}
    </section>
    <section class="panel"><h2>Score a draft</h2>
      <form id="scoreForm"><textarea name="text" rows="10" placeholder="Paste your draft">${draft.briefText}</textarea><button class="sm" ${b ? '' : 'disabled'}>Score (0.2 h)</button>${b ? '' : html`<span class="small muted"> Build a brief for the query first (left).</span>`}</form>
      ${b?.last ? html`<p>Content score <b>${b.last.score}</b> · ${pct(b.last.coverage, 0)} of terms · ${b.last.words} words ${b.last.samey ? badge('reads like the other ten', 'bad') : ''}</p>${b.last.missing.length ? html`<p class="small muted">Missing: ${b.last.missing.join(', ')}</p>` : ''}
        <p class="small muted">Use the list to catch sub-topics you forgot, not as a target. Chasing 100 by stuffing every term at the competitors' length produces a page with nothing new in it; Google and AI answers reward the first-hand detail the checklist can't see.</p>` : ''}
    </section></div>`;
}

function auditView(s, T) {
  const a = T.lastSiteAudit;
  return html`<section class="panel"><h2>Technical site audit</h2>
    <p class="small">Crawls your site the way search and AI bots do: indexability, robots rules, rendering, broken links. ${hasKind(s, 'crawler') || T.subs.awt ? '' : 'Needs Screaming Frog (free to 500 URLs) or Ahrefs Webmaster Tools.'}</p>
    <button class="primary" id="siteAudit" ${hasKind(s, 'crawler') || T.subs.awt ? '' : 'disabled'}>Run crawl (1 h)</button>
    ${a ? html`<h3>${a.crawler} · ${fmtDate(s, a.day)} · ${a.crawled} of ${a.urls} URLs${a.truncated ? ' (free limit reached)' : ''}</h3>
      ${a.coreAvailable ? '' : html`<p class="small muted">Core technical checks (indexing, canonicals, Core Web Vitals) appear here once the SEO engine reports them.</p>`}
      ${a.issues.length ? html`<ul class="list small">${a.issues.map((i) => html`<li>${badge(i.tone === 'bad' ? 'error' : i.tone === 'info' ? 'info' : 'warning', i.tone === 'bad' ? 'bad' : i.tone === 'info' ? '' : 'warn')} ${i.text}</li>`)}</ul>` : html`<p class="small pos">No issues found.</p>`}` : ''}
  </section>
  <section class="panel"><h2>robots.txt: AI crawlers</h2>
    <p class="small">OpenAI: <b>OAI-SearchBot</b> decides whether you can appear in ChatGPT search answers; <b>GPTBot</b> is training only; the settings are independent. Google-Extended affects Gemini, not Google Search. Changes take ~a day to weeks.</p>
    ${T.robots.checked ? table({ columns: [{ label: 'Bot', render: (b) => b }, { label: 'Status', render: (b) => (T.robots.blocked[b] ? badge('blocked', 'bad') : badge('allowed', 'good')) }, { label: '', render: (b) => html`<button class="sm" data-bot="${b}" data-allow="${T.robots.blocked[b] ? '1' : '0'}">${T.robots.blocked[b] ? 'Allow' : 'Block'} (${HOURS.robots} h)</button>` }], rows: BOTS }) : html`<p class="small muted">You haven't checked what your robots.txt and CDN actually send these bots. Run a GEO audit or a crawl.</p>`}
    <p class="small">llms.txt: ${T.llmsTxt ? 'published' : 'none'} ${T.llmsTxt ? '' : html`<button class="sm" id="llmsTxt">Write llms.txt (${HOURS.llmsTxt} h)</button>`}<span class="muted"> SE Ranking (300k domains) found no relationship with AI citations.</span></p>
  </section>`;
}

function aiView(s, T) {
  const cap = trackerCapacity(s);
  const rep = cap.prompts ? trackerReport(s) : null;
  const texts = draft.prompts ?? T.prompts.list.map((p) => p.text).join('\n');
  const n = texts.split('\n').filter((x) => x.trim()).length;
  const smp = T.samples[0];
  return html`<div class="grid-2"><section class="panel"><h2>Prompt set</h2>
      <p class="small muted">The questions buyers actually ask ChatGPT, Claude, Perplexity, Gemini and AI Overviews before choosing a tool. Pull them from sales calls, support tickets, Search Console queries and "People also ask".</p>
      <label>One per line <textarea id="promptText" rows="10">${texts}</textarea></label>
      <button class="primary" id="savePrompts">Save & review (${promptSetHours(n)} h)</button>
      ${T.prompts.list.length ? html`<p class="small">Quality <b>${pct(T.prompts.quality ?? 0, 0)}</b>${T.prompts.mock ? ' (offline review)' : ''} · ${T.prompts.list.length} prompts: ${['generic', 'comparison', 'vanity', 'off_target'].map((k) => `${T.prompts.list.filter((p) => p.kind === k).length} ${k.replace('_', '-')}`).join(', ')}</p>${T.prompts.feedback ? html`<p class="small muted">${T.prompts.feedback}</p>` : ''}` : ''}
    </section>
    <section class="panel"><h2>Test by hand</h2>
      <form id="testForm"><div class="grid-2"><label>Runs per prompt <input type="number" name="runs" min="1" max="10" value="3" /></label><label>Prompts <input type="number" name="n" min="1" max="30" value="${Math.min(10, T.prompts.list.length || 10)}" /></label></div>
        <div>${ENGINE_ORDER.map((e) => html`<label class="inline"><input type="checkbox" name="e_${e}" ${['chatgpt', 'claude', 'perplexity'].includes(e) ? 'checked' : ''} /> ${engLabel(e)}</label>`)}</div>
        <button class="sm" ${T.prompts.list.length ? '' : 'disabled'}>Run (~1.5 min per answer)</button>${T.prompts.list.length ? '' : html`<span class="small muted"> Save a prompt set first (left).</span>`}</form>
      ${smp ? sampleHtml(s, smp) : ''}
      <h3>Log a real answer</h3><p class="small muted">Paste what an assistant actually answered; it's classified for you.</p>
      <form id="pasteForm"><input name="p" placeholder="The prompt you asked" value="${draft.pasteP}" /><textarea name="a" rows="4" placeholder="The answer">${draft.pasteA}</textarea><button class="sm">Classify (${HOURS.pasteAnswer} h)</button></form>
      ${T.pasted.slice(0, 5).map((x) => html`<div class="small">${fmtDate(s, x.day)} · ${x.stance}${x.wrongFact ? ' · wrong fact' : ''}${x.mock ? ' (offline)' : ''}: "${x.prompt}"</div>`)}
    </section></div>
    <section class="panel"><h2>Tracker: share of voice</h2>
      ${rep ? html`<p class="small">${cap.prompts} prompts × ${cap.engines.map(engLabel).join(', ')}, one run a day, ~30-day window. ${T.prompts.list.length > cap.prompts ? `${T.prompts.list.length - cap.prompts} prompts over your plan's limit are not tracked.` : ''}</p>
        ${table({ columns: [{ label: 'Engine', render: (r) => engLabel(r.e) }, { label: 'You named', align: 'right', render: (r) => pct(r.visibility, 0) }, { label: 'Share of voice', align: 'right', render: (r) => pct(r.sov, 0) }, ...rep.names.map((nm, i) => ({ label: nm, align: 'right', render: (r) => pct(r.rivals[i].visibility, 0) }))], rows: Object.entries(rep.byEngine).map(([e, v]) => ({ e, ...v })) })}
        <details><summary class="small">By prompt</summary>${table({ columns: [{ label: 'Prompt', render: (r) => html`${r.prompt.text} ${badge(r.prompt.kind)}` }, { label: 'Named', align: 'right', render: (r) => pct(r.visibility, 0) }, { label: 'Runs', align: 'right', render: (r) => Math.round(r.n) }], rows: rep.byPrompt })}</details>
        ${rep.all.negShare > 0.05 ? html`<p class="small neg">${pct(rep.all.negShare, 0)} of mentions are negative.</p>` : ''}` : html`<p class="empty">No tracker. Without one you only know what your own tests show (Tools tab: Otterly from $29/mo).</p>`}
    </section>
    <section class="panel"><h2>GEO audit</h2><p class="small">Grader, 18 buyer prompts × 3 runs on 3 engines, robots/CDN check and wrong-fact check, with what to do next.</p><button class="primary" id="geoAudit">Run GEO audit (${HOURS.audit} h)</button>
      ${T.audits[0] ? html`<h3>${fmtDate(s, T.audits[0].day)}: named in ${pct(shareOfVoice(T.audits[0].sample.names, T.audits[0].sample.rows).visibility, 0)} of buyer answers</h3><ul class="list small">${T.audits[0].findings.map((f) => html`<li>${badge(f.tone, f.tone === 'bad' ? 'bad' : f.tone === 'good' ? 'good' : 'warn')} ${f.text}</li>`)}</ul>` : ''}
    </section>
    ${coachHtml(s)}`;
}
function sampleHtml(s, smp) {
  const buyer = smp.rows.filter((r) => r.kind === 'generic' || r.kind === 'comparison');
  const vanity = smp.rows.filter((r) => r.kind === 'vanity');
  const sv = shareOfVoice(smp.names, buyer);
  return html`<h3>${fmtDate(s, smp.day)}: ${smp.answers} answers</h3>
    <p class="small">Buyer prompts: named in <b>${pct(sv.visibility, 0)}</b> of runs · share of voice ${pct(sv.sov, 0)} · ${sv.rivals.slice(0, 3).map((r) => `${r.name} ${pct(r.visibility, 0)}`).join(' · ')}</p>
    ${vanity.length ? html`<p class="small warn">Vanity prompts named you in ${pct(shareOfVoice(smp.names, vanity).visibility, 0)} of runs. That number says nothing about buyers.</p>` : ''}
    ${smp.rows.some((r) => r.wrong) ? html`<p class="small neg">Some answers quoted wrong facts about you.</p>` : ''}
    <p class="small muted">With ${smp.rows[0]?.runs ?? 1} run(s) per prompt this is noisy: identical answer lists repeat less than 1% of the time.</p>`;
}
function coachHtml(s) {
  const r = geoOperatorRead(s);
  if (r.tier === 'unknown') return '';
  // Tier, evidence and prescriptions are hidden truth: only a recruited source with your data (or learning mode) reveals them.
  const rev = reviewFor(s, 'content_seo_geo', r);
  if (!rev.covered) return '';
  return html`<section class="panel"><h2>${rev.reviewer}: AI visibility</h2>${rev.tier ? html`<p>${badge(rev.tier, rev.tier === 'stellar' || rev.tier === 'good' ? 'good' : rev.tier === 'average' ? 'warn' : 'bad')}</p><ul class="small">${rev.evidence.map((e) => html`<li>${e}</li>`)}</ul>` : ''}${rev.items.length ? html`<ul class="small muted">${rev.items.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>` : ''}</section>`;
}

function mentionsView(s, T) {
  const C = s.apps.channels;
  const lists = (C?.aiSearch?.pitches ?? []).filter((p) => p.accepted);
  const facts = activeWrongFacts(s).filter((f) => f.noticed);
  const p = signalParts(s);
  return html`<div class="grid-2"><section class="panel"><h2>Third-party lists & reviews</h2>
      <p class="small">"Best X tools" lists, review sites and press are what AI answers cite most for buyer prompts (branded web mentions correlate r=0.66 with AI Overview mentions vs 0.22 for backlinks, Ahrefs 75k brands). Pitch authors in <a href="#/channels/ai">Channels → AI search</a>; collect reviews in <a href="#/channels/reviews">Channels → Reviews</a>; write comparison pages in <a href="#/organic/content">Organic</a> or <a href="#/market">Market</a>.</p>
      <p class="small">${lists.length} list inclusion(s) · ${C?.reviews?.count ?? 0} reviews · comparison pages ${p.comparison.toFixed(1)} signal. Lists drop or replace you over time: re-pitch with fresh data.</p>
      <h3>Pay for a placement</h3><form id="paidForm"><input name="site" placeholder="Site / list name" /><label class="inline"><input type="checkbox" name="disclosed" checked /> Marked as sponsored</label><button class="sm">Pay (${money(400)}-${money(2500)}, ${HOURS.paidPlacement} h)</button></form>
      <p class="small muted">Undisclosed paid placement is deceptive advertising under the FTC Act; penalties under the 2024 reviews rule reach ~$51,744 per violation. Disclosed placements count for less.</p>
    </section>
    <section class="panel"><h2>Communities</h2>
      <p class="small">Reddit and forums are heavily cited (engine- and month-dependent: ChatGPT reportedly cut Reddit citations ~86% in Aug 2026). Authentic, disclosed answers take 2-4 h a week for months before they show up.</p>
      <button class="primary" id="commWeek">Spend this week answering, disclosed (${HOURS.communityWeek} h)</button> <span class="small">${T.community.weeks.length} week(s) so far</span>
      <p class="small">Answer quality comes from your judged posts in <a href="#/organic/community">Organic → Communities</a>.</p>
      <h3>Shortcut</h3><button class="sm" id="astroturf">Seed a thread from an alt account (${HOURS.astroturf} h)</button>
      <p class="small muted">Moderators and Reddit's filters catch seeded threads (and screenshots travel). ${T.community.bannedDay != null ? html`<b class="neg">Your accounts were banned on ${fmtDate(s, T.community.bannedDay)}.</b>` : ''}</p>
    </section></div>
    <section class="panel"><h2>Wrong facts in AI answers</h2>
      ${facts.length ? facts.map((f) => html`<div class="callout warn"><b>${f.label}</b> (since ${fmtDate(s, f.since)}). ${f.detail}
        <div class="small">${f.open.map((src) => html`<button class="sm" data-fix="${f.id}" data-src="${src}">${FIX_SOURCES[src]} (${HOURS.factFix[src]} h)</button> `)}${f.factsPage ? '' : html`<button class="sm" data-fix="${f.id}" data-src="facts_page">${FIX_SOURCES.facts_page} (${HOURS.factFix.facts_page} h)</button>`}</div>
        ${f.fixedDay ? html`<p class="small">All sources fixed ${fmtDate(s, f.fixedDay)}. Search-based answers should update within weeks; answers from training data stay wrong until the next model learns it (months).</p>` : html`<p class="small muted">You can't edit ChatGPT. You fix the pages it reads.</p>`}</div>`) : html`<p class="empty">None you know of. You'd only find out by testing answers (or from confused trial users).</p>`}
    </section>`;
}

export default {
  id: 'searchtools',
  title: 'Search & AI visibility',
  icon: '🔎',
  group: 'Growth',
  badge: (state) => { const T = state.apps?.searchtools; return T ? (T.facts?.wrong ?? []).filter((f) => f.noticed && !f.fixedDay).length || null : null; },

  render(root, ctx) {
    const s = ctx.state;
    const T = ensureSearch(s);
    const tab = TABS.some(([k]) => k === ctx.params) ? ctx.params : 'overview';
    const view = { overview, tools: toolsView, gsc: gscView, keywords: keywordsView, content: contentView, audit: auditView, ai: aiView, mentions: mentionsView }[tab];
    mount(root, html`<div class="app-head"><div><h1>Search & AI visibility</h1><p>Search Console, keyword and AI-visibility tools, and how often ChatGPT, Claude, Perplexity, Gemini and AI Overviews name you. Tools show you what is happening; they don't rank you.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/searchtools/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${GUIDED.has(tab) ? seoGuideHtml(s, { compact: true }) : ''}
      ${view(s, T)}`);

    const act = (fn, label, msg) => {
      const dry = fn(structuredClone(ctx.state));
      if (!dry.ok) return toast(dry.error, 'warn');
      return ctx.act((st) => { const r = fn(st); if (!r.ok) throw new Error(r.error); if (msg) toast(typeof msg === 'function' ? msg(r) : msg, 'good'); return r; }, { hours: dry.hoursCost ?? 0, label });
    };
    on(root, 'click', '[data-sub]', (e, el) => act((st) => subscribe(st, el.dataset.sub), `Set up ${TOOLS[el.dataset.sub].label}`, `${TOOLS[el.dataset.sub].label} is set up.`));
    on(root, 'click', '[data-unsub]', (e, el) => ctx.act((st) => { unsubscribe(st, el.dataset.unsub); }, { label: 'Cancel tool' }));
    on(root, 'click', '[data-grader]', () => act((st) => { const r = runGrader(st); return r.ok ? { ...r, hoursCost: TOOLS.grader.setup } : r; }, 'HubSpot AI grader', (r) => `AI grader: ${r.grade.score}/100 (${r.grade.label}).`));
    on(root, 'submit', '#kwForm', (e) => { e.preventDefault(); draft.kwq = formData(e.target).q; ctx.act(() => true, { hours: 0.1, label: 'Keyword research' }); });
    on(root, 'submit', '#briefForm', (e) => { e.preventDefault(); draft.briefQ = formData(e.target).q; act((st) => makeBrief(st, draft.briefQ), 'Content brief'); });
    on(root, 'submit', '#scoreForm', (e) => { e.preventDefault(); draft.briefText = formData(e.target).text; act((st) => scoreDraft(st, draft.briefQ, draft.briefText), 'Score draft'); });
    on(root, 'click', '#siteAudit', () => act((st) => { const r = siteAudit(st); if (r.ok) ensureSearch(st).lastSiteAudit = { ...r, day: st.day }; return r; }, 'Site crawl'));
    on(root, 'click', '[data-bot]', (e, el) => act((st) => setRobots(st, el.dataset.bot, el.dataset.allow === '1'), 'Edit robots.txt'));
    on(root, 'click', '#llmsTxt', () => act((st) => addLlmsTxt(st), 'Write llms.txt', (r) => r.note));
    on(root, 'click', '#geoAudit', () => act((st) => geoAudit(st), 'GEO audit', 'Audit done: findings below.'));
    on(root, 'input', '#promptText', (e) => { draft.prompts = e.target.value; });
    on(root, 'click', '#savePrompts', () => {
      const texts = (draft.prompts ?? root.querySelector('#promptText').value).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 100);
      if (!texts.length) return toast('Write at least a few prompts.', 'warn');
      ctx.act(async (st) => {
        const j = await judgePromptSet(ctx, texts);
        const r = savePromptSet(st, { texts, kinds: j.kinds, rubric: j.rubric, feedback: j.feedback, mock: j.mock });
        draft.prompts = null;
        toast(`Prompt set saved: quality ${Math.round(r.quality * 100)}%.`, r.quality >= 0.6 ? 'good' : 'warn');
      }, { hours: promptSetHours(texts.length), label: 'Build AI prompt set' });
    });
    on(root, 'submit', '#testForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const engines = ENGINE_ORDER.filter((x) => f[`e_${x}`]);
      if (!engines.length) return toast('Pick at least one engine.', 'warn');
      const ids = T.prompts.list.slice(0, Math.max(1, f.n | 0)).map((p) => p.id);
      act((st) => manualTest(st, { promptIds: ids, runs: f.runs, engines }), 'Manual AI answer tests');
    });
    on(root, 'submit', '#pasteForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      draft.pasteP = f.p; draft.pasteA = f.a;
      if (String(f.a).trim().length < 40) return toast('Paste the full answer.', 'warn');
      ctx.act(async (st) => {
        const r = await classifyAnswer(ctx, { prompt: f.p, answer: f.a });
        const S = ensureSearch(st);
        S.pasted.unshift({ day: st.day, prompt: String(f.p).slice(0, 160), ...r });
        S.pasted.length = Math.min(S.pasted.length, 30);
        S.acted.pasted = true;
        if (r.wrongFact) for (const x of activeWrongFacts(st)) x.noticed = true;
        draft.pasteP = draft.pasteA = '';
        toast(r.mentioned ? `Named (${r.stance}).` : 'Not named.', r.mentioned ? 'good' : 'info');
      }, { hours: HOURS.pasteAnswer, label: 'Classify an AI answer' });
    });
    on(root, 'submit', '#paidForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const r = buyPlacement(st, { site: f.site || 'a "best tools" roundup', disclosed: f.disclosed }); toast(`Paid ${money(r.usdCost)} for the placement.`, 'info'); }, { hours: HOURS.paidPlacement, label: 'Paid list placement' }); });
    on(root, 'click', '#commWeek', () => act((st) => communityWeek(st), 'Community answers (week)', 'Logged. This compounds only if you keep showing up.'));
    on(root, 'click', '#astroturf', () => act((st) => astroturf(st), 'Seed a Reddit thread', 'Posted from the alt account.'));
    on(root, 'click', '[data-fix]', (e, el) => act((st) => fixFactSource(st, el.dataset.fix, el.dataset.src), 'Fix a wrong fact at the source', 'Fixed. Answers update as engines re-read the page.'));
  },

  onDay(state) {
    syncSearchConsole(state);
    geoDay(state);
    gscSnapshot(state);
    applyBriefs(state);
    renewAnnual(state);
  },
};
