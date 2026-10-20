// Website: your real landing page (fetched by URL or uploaded HTML). A panel of four different AI visitors
// (apps/website/personas.js: a user, a champion, the economic buyer and a skeptic, built from the customer type, the
// ICP and the hidden market) reads it and judges clarity, relevance, credibility, intent to start a trial and
// willingness to pay. That judgment sets the landing-page conversion every channel (ads, SEO, outbound
// click-throughs) runs through. This is the reference implementation of an LLM panel for other apps.

import { html, mount, on, toast, readFile, formData, badge } from '../core/ui.js';
import { ensureMarket, recordStatedWtp, hasProduct } from '../core/market.js';
import { REALISM, averageField } from '../core/llm.js';
import { fetchSite } from '../core/site.js';
import { clamp, words, money, pct, hash } from '../core/util.js';
import { notify, spendHours } from '../core/state.js';
import { recordPublicEvent } from '../core/network.js';
import { buildPanel, personaSystemPrompt, publicPersona, voiceOf, fill, SIGNAL_LABELS } from './website/personas.js';
import { profileOf } from '../core/customer-type.js';
import { DEMO, VIDEO_TOOLS, VIDEO_USES, judgeDemo, recordDemo, scriptSeconds, demoLift, demoOnDay, videoKit, videoHours, upgradeVideoTool, launchVideoMult, styleOf } from './website/demo.js';
import { SITE_PATHS, SITE_PATH_ORDER, SITE_NOTES, buildSite, buildHours, iterateSite, siteBuildSlice, siteBuildMult, siteCoaching, siteBuildScore } from './website/sitebuild.js';
import { recordSiteClaims, siteClaimsDay } from './website/social-proof.js';
import { domainOnDay } from './website/domain.js';
import { domainPanel, browserFrame, wireDomain } from './website/domain-view.js';
import { knownCompetitors, competitionBrief } from './marketworld/competitors.js';
import { rubricText } from '../core/rubric.js';
import { LANDING_CRITERIA, withRubric, rubricSkill, to5 } from './growth/rubrics.js';

const BUZZ = ['revolutioniz', 'seamless', 'all-in-one', 'next-gen', 'cutting-edge', 'unlock', 'supercharge', 'game-chang', 'leverage', 'synerg', 'world-class', 'best-in-class', 'empower', 'transform your', '10x', 'ai-powered', 'effortless', 'robust'];

const PANEL_BASE = {
  type: 'object',
  additionalProperties: false,
  required: ['firstImpression', 'clarity', 'relevance', 'credibility', 'trialProbability', 'willingnessToPayMonthly', 'confusions', 'missing'],
  properties: {
    firstImpression: { type: 'string', description: 'One or two blunt sentences, in character.' },
    clarity: { type: 'number', description: '1-10: within 5 seconds, do I understand what it does and for whom?' },
    relevance: { type: 'number', description: '1-10: does it address a problem I actually have right now?' },
    credibility: { type: 'number', description: '1-10: proof, specifics, social proof, pricing transparency.' },
    trialProbability: { type: 'number', description: '0-1: probability I would start a trial / sign up / book a demo today.' },
    willingnessToPayMonthly: { type: 'number', description: 'USD per month I would realistically pay for this, 0 if nothing.' },
    confusions: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
  },
};
export const PANEL_SCHEMA = withRubric(PANEL_BASE, LANDING_CRITERIA);

/** Put a (new version of the) landing page live. Going live for the first time is a public moment: directory
 *  submitters, link sellers and tool vendors crawl new sites (data/inbound-archetypes.js website_live). */
export function setWebsite(state, site) {
  const first = !state.company.website;
  state.company.website = { ...site, fetchedDay: state.day };
  if (first) recordPublicEvent(state, 'website_live', { source: site.source ?? 'upload', url: site.url ?? null });
  return state.company.website;
}

/** The panel for the current page (apps/website/personas.js): four different people, one per buying seat. */
export function personasFor(state, site = state.company.website) {
  return buildPanel(state, site ? hash(siteText(site)) : '');
}

export function siteText(site) {
  if (!site) return '';
  return [site.title && `TITLE: ${site.title}`, site.description && `META: ${site.description}`, site.headings?.length && `HEADINGS: ${site.headings.join(' | ')}`, site.text].filter(Boolean).join('\n').slice(0, 12000);
}

// Page signals a visitor can look for. Each persona weighs them differently (personas.js `cares` / `needs`).
const SIGNAL_RX = {
  security: /soc ?2|\bsso\b|saml|gdpr|hipaa|encrypt|security|iso ?27001|data residency|audit log/,
  integrations: /integrat|\bapi\b|zapier|slack|github|shopify|quickbooks|xero|square|salesforce|hubspot|klaviyo|webhook|connects? (to|with)/,
  docs: /\bdocs\b|documentation|api reference|\bsdk\b|changelog|open[- ]source|github/,
  setup: /set ?up in|minutes to|we set it up|sets? it up|done[- ]for[- ]you|onboarding|import your|migrat|in \d+ minutes/,
  human: /call us|phone|\(\d{3}\)|talk to a (human|person)|live chat|real person|support team|named (contact|csm)/,
  roi: /\broi\b|payback|\$[\d,]+ (saved|per|a )|hours (saved|a week|per week)|\d+% (more|less|faster|fewer|increase|reduction|lift)|from \d+ (hours|days) to| cut (our|my|the) /,
  cancel: /cancel any ?time|no contract|month[- ]to[- ]month|refund|money[- ]back|no credit card/,
  mobile: /mobile|iphone|android|\bios\b|app store|on your phone|works on (any|your) (phone|device)/,
  privacy: /privacy|never sell|your data|delete your data|gdpr|encrypt/,
  speed: /lightweight|page speed|no impact on|loads? in|\bkb\b|core web vitals/,
};
const TECH_RX = /\b(api|sdk|llm|saas|webhooks?|kubernetes|vector|latency|throughput|devops|json|endpoint|rag)\b/g;
// Neutral visitor for callers that pass a bare { id, role } persona (old saves, other apps).
const NEUTRAL = { voice: 'operator', reading: 'skims', priceSens: 0.5, hype: 1, tech: 0.5, act: 1, cares: { proof: 1, price: 1, numbers: 1 }, needs: [], uses: 'what I use now' };

// Deterministic offline judge: rewards specificity, proof, pricing and a clear CTA; punishes buzzwords. Each persona
// weighs the page through its own lens (what it cares about, its deal-breakers, reading style, hype and jargon
// tolerance, price sensitivity) and comments in its own voice. [design] weights, calibrated so the panel average stays
// near the old single-lens judge.
export function heuristicJudge(state, site, persona = {}) {
  const p = persona.voice ? persona : { ...NEUTRAL, ...persona };
  const text = siteText(site).toLowerCase();
  const n = words(text);
  const icpWords = ((state.company.icp ?? '') + ' ' + (state.company.oneLiner ?? '')).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const icpHits = icpWords.filter((w) => text.includes(w)).length;
  const buzzList = BUZZ.filter((b) => text.includes(b));
  const buzz = buzzList.length;
  const proof = ['customers', 'case study', 'testimonial', 'trusted by', 'reviews', '★', 'saved', 'hours'].filter((k) => text.includes(k)).length;
  const pricing = /\$\s?\d|pricing|per month|\/mo/.test(text);
  const cta = /(start|try|book|get started|sign up|free trial|demo)/.test(text);
  const numbers = (text.match(/\d+%|\d+ (hours|minutes|days)|\$\d+/g) ?? []).length;
  const heads = site.headings?.length ?? 0;
  const tech = (text.match(TECH_RX) ?? []).length;
  const has = Object.fromEntries(Object.entries(SIGNAL_RX).map(([k, rx]) => [k, rx.test(text)]));
  Object.assign(has, { proof: proof >= 2, price: pricing, numbers: numbers >= 2 });
  const sig = { ...has, proof: Math.min(3, proof) / 3, numbers: Math.min(4, numbers) / 4 };
  const unmet = p.needs.filter((k) => !has[k]);
  const hid = p.hidden;
  const hype = p.hype, skim = /skim/.test(p.reading ?? 'skims');
  const jargonPen = (1 - p.tech) * Math.min(2, tech * 0.5);
  // Skimmers live on headings and punish walls of text; readers reward substance and punish thin pages.
  const lengthTerm = skim ? (n > 80 ? (n > 900 && heads < 3 ? -0.5 : 1) : -1) : (n > 250 ? 1.3 : n > 80 ? 0.6 : -1.5);
  const clarity = clamp(3 + Math.min(3, icpHits) + (heads ? (skim ? 1.3 : 0.7) : 0) + (cta ? 1 : 0) - buzz * 0.7 * hype + lengthTerm - jargonPen, 1, 10);
  // The hidden person: a visitor with the problem leans in, one without it shrugs (centred so the panel mean barely moves).
  const painTerm = hid ? 1.2 * ((hid.hasPain ? hid.painIntensity : 0) - 0.3) : 0;
  const relevance = clamp(3 + Math.min(4, icpHits * 1.2) - buzz * 0.3 * hype + painTerm, 1, 10);
  const generic = Math.min(3, proof) + (pricing ? 1.5 : 0) + Math.min(2, numbers * 0.5);
  const wsum = Object.values(p.cares).reduce((a, b) => a + b, 0) || 1;
  const lens = 6.5 * Object.entries(p.cares).reduce((a, [k, w]) => a + w * (Number(sig[k]) || 0), 0) / wsum;
  const credibility = clamp(2 + 0.5 * generic + 0.5 * lens - buzz * 0.5 * hype - unmet.length * 0.8, 1, 10);
  const painTrial = hid ? (hid.hasPain ? 0.9 + 0.45 * hid.painIntensity : 0.85) : 1;
  const priceTrial = pricing ? 1 : 1 - 0.35 * p.priceSens;
  const trial = clamp(((clarity + relevance + credibility) / 30) ** 2 * 0.35 * p.act * Math.pow(0.7, unmet.length) * priceTrial * painTrial, 0.005, 0.4);
  const ref = { b2c: 8, smb: 60, ent: 1200 }[state.company.model] * (profileOf(state)?.market?.refPriceMult ?? 1);
  const faq = /faq|frequently asked|cancel anytime|security|integrat|refund|guarantee/.test(text);
  const named = /["“”].{20,}["“”]|case study|testimonial|★|\d[\d,]* (reviews|customers|teams)/.test(text);
  const ctaCount = (text.match(/\b(start|try|book|get started|sign up|free trial|request a demo)\b/g) ?? []).length;
  const crit = {
    value_prop_5s: to5(clarity), icp_relevance: to5(relevance),
    proof: clamp(1 + Math.min(2, proof * 0.7) + (named ? 1.5 : 0) + Math.min(1, numbers * 0.4), 1, 5),
    offer_cta: clamp(1 + (cta ? 2 : 0) + (ctaCount >= 2 && ctaCount <= 5 ? 1 : 0) + (/free|no credit card|trial/.test(text) ? 1 : 0) - (ctaCount > 8 ? 1 : 0), 1, 5),
    price_objections: clamp(1 + (pricing ? 2 : 0) + (faq ? 1 : 0) + (unmet.length ? 0 : 1), 1, 5),
    specific_plain_copy: clamp(4 - buzz * 0.8 * hype + Math.min(1, numbers * 0.3) - jargonPen * 0.5, 1, 5),
    evidence: unmet.length ? `Nothing on ${SIGNAL_LABELS[unmet[0]]}` : buzz ? `Buzzwords on the page: ${buzzList.slice(0, 4).join(', ')}` : !proof ? 'No customer proof found on the page' : 'Proof and specifics present',
  };
  // Comments in this person's own voice (facts and opinions about the page, not coaching).
  const v = voiceOf(p);
  const lead = buzz > 2 ? v.buzz : clarity < 5 ? v.unclear : relevance < 4.5 ? v.notForMe : clarity >= 7 && credibility >= 6.5 && !unmet.length ? v.good : v.meh;
  const painLine = !hid ? '' : hid.hasPain && hid.painIntensity >= 0.55 && hid.ago ? v.pain : !hid.hasPain && lead !== v.notForMe ? v.noPain : '';
  const confusions = [buzz && v.buzzConf, p.tech < 0.45 && tech >= 2 && v.jargon, skim && n > 900 && heads < 3 && v.long].filter(Boolean).map((l) => fill(l, p));
  const missing = [
    ...unmet.map((k) => fill(v.need, p, { need: SIGNAL_LABELS[k] })),
    !pricing && !p.needs.includes('price') && p.priceSens >= 0.5 && v.noPrice,
    !proof && (p.cares.proof ?? 0) >= 0.8 && v.noProof,
    !cta && v.noCta,
  ].filter(Boolean).map((l) => fill(l, p));
  const wtpMult = 1.3 - 0.6 * p.priceSens;
  return {
    ...crit,
    firstImpression: [fill(lead, p), fill(painLine, p)].filter(Boolean).join(' '),
    clarity: +clarity.toFixed(1), relevance: +relevance.toFixed(1), credibility: +credibility.toFixed(1),
    trialProbability: +trial.toFixed(3),
    willingnessToPayMonthly: Math.round(ref * (0.4 + relevance / 10) * wtpMult),
    confusions,
    missing,
  };
}

/** Panel aggregate (0..1) from every judgment: holistic scores, rubric criteria and stated trial intent. */
export function panelScore(flat) {
  const avg = (f) => averageField(flat.map((d) => ({ data: d })), f) ?? 0;
  const trial = avg('trialProbability');
  const holistic = (avg('clarity') + avg('relevance') + avg('credibility')) / 30;
  const rub = rubricSkill(flat, LANDING_CRITERIA);
  const quality = rub == null ? holistic : 0.5 * holistic + 0.5 * rub;
  // Personas overstate intent ("25% chance I'd sign up" vs a 3.8% SaaS landing median): map on a log scale.
  const trialTerm = clamp(Math.log(Math.max(trial, 0.005) / 0.005) / Math.log(0.25 / 0.005), 0, 1);
  return clamp(0.55 * quality + 0.45 * trialTerm, 0, 1);
}

export async function runPanel(ctx) {
  const state = ctx.state;
  const site = state.company.website;
  const personas = personasFor(state);
  const results = [];
  for (const p of personas) {
    // What this visitor already uses or has heard of (real competitors, weighted by share and awareness).
    const known = knownCompetitors(state, { audience: state.company.model === 'b2c' ? 'consumer' : 'prospect', seed: `landing:${p.id}` });
    const brief = competitionBrief(state, known);
    const res = await ctx.llm.panel({
      task: 'landing_page_review', rubric: LANDING_CRITERIA,
      system: personaSystemPrompt(p, { realism: REALISM, rubric: rubricText(LANDING_CRITERIA), brief }),
      prompt: `You landed on this website. Read it the way you read websites (${p.reading}, on ${p.device}). Judge it honestly, as yourself.\n\n=== WEBSITE ===\n${siteText(site)}\n=== END ===\n\nThe company's current price: ${state.plans.filter((x) => x.active).map((x) => `${x.name} $${x.price}/${x.interval}`).join(', ')}.`,
      schema: PANEL_SCHEMA,
      temperature: 0.3, maxTokens: 2000, // headroom: each persona quotes evidence per criterion
      fallback: () => heuristicJudge(state, site, p),
      cache: state.cache,
    });
    results.push({ persona: p, results: res.map((r) => ({ model: r.model, mock: r.mock, ...r.data })) });
  }
  const flat = results.flatMap((r) => r.results);
  const fresh = panelScore(flat);
  // Re-running the panel on the same page shows new opinions but doesn't re-roll the stored score; after an edit the
  // stored score is the mean of the last two runs, so repeated tiny edits regress instead of fishing for a lucky roll.
  const siteHash = hash(siteText(site));
  const prev = ensureMarket(state).fit.website;
  const score = prev.score == null ? fresh : prev.siteHash === siteHash ? prev.score : (prev.score + fresh) / 2;
  const wtps = flat.map((d) => d.willingnessToPayMonthly).filter((v) => v > 0).sort((a, b) => a - b);
  const m = ensureMarket(state);
  m.fit.website = { score, siteHash, lastRun: fresh, notes: `${flat.length} judgments${prev.siteHash === siteHash ? ' (same page: stored score kept)' : ''}`, day: state.day, source: flat.some((d) => d.mock) ? 'offline heuristic' : 'LLM panel' };
  if (wtps.length) recordStatedWtp(state, wtps[Math.floor(wtps.length / 2)], { notes: 'median willingness to pay from landing page panel', source: m.fit.website.source });
  state.company.website.eval = { day: state.day, score, results };
  recordSiteClaims(state, siteText(site)); // what the page claims is checked later by buyers, competitors and the FTC (website/social-proof.js)
  notify(state, `Landing page panel: score ${Math.round(score * 100)}/100, median willingness to pay ${money(m.fit.price.stated ?? m.fit.price.wtp ?? 0)}/mo.`, { type: score > 0.55 ? 'good' : 'info', app: 'website' });
}

function htmlToSite(htmlText, name) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg').forEach((n) => n.remove());
  return {
    source: 'upload',
    url: name,
    title: doc.title,
    description: doc.querySelector('meta[name=description]')?.content ?? '',
    headings: [...doc.querySelectorAll('h1,h2,h3')].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 25),
    text: (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 20000),
  };
}

// Who a panelist is (name, title, company, seat in the decision, what they use today). Hidden pain never shows.
function panelistHead(persona) {
  const p = publicPersona(persona);
  if (!p.name) return html`<h3>${p.title}</h3>`;
  return html`<h3>${p.name} ${p.seat ? badge(p.seat) : ''}</h3><p class="small muted">${p.title}${p.company ? ` at ${p.company}` : ''}${p.device ? ` · reads on ${p.device}` : ''}${p.uses ? html`<br>Uses today: ${p.uses}` : ''}</p>`;
}

let demoDraft = { script: '', tool: 'tella', use: 'landing' };
function assetLine(s, d, label) {
  if (!d) return '';
  const st = styleOf(d);
  return html`<p class="small"><b>${label}:</b> ${st.label}, ${d.seconds}s, script quality ${Math.round(d.quality * 100)}/100${d.bestTool && d.bestTool !== d.tool ? html` · <span class="muted">a stellar pick here: ${VIDEO_TOOLS[d.bestTool].vendor}</span>` : ''}</p>
    ${d.notes?.length ? html`<ul class="list small">${d.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}`;
}
function demoPanel(s) {
  const d = s.company.demoVideo;
  const l = demoLift(s);
  const kit = videoKit(s);
  return html`<section class="panel"><h2>Demo video</h2>
    <p class="small muted">Script it, pick the tool for the job, then record it. Loom is for async follow-ups, Arcade is a clickable demo for the landing page, Screen Studio makes a polished clip (macOS), Tella a hosted lightly edited one, Descript edits long talks by transcript, Capsule is a template system for marketing teams. The script decides the quality; the tool decides the ceiling for each use. Effects are game assumptions [design].</p>
    <form id="demoForm"><textarea name="script" rows="7" placeholder="Open with who it's for and their pain. Show real clicks in the product. Put a number on the result. End with one next step. Aim for 60-120 seconds (about 150-300 words).">${demoDraft.script}</textarea>
      <div class="inline">
        <label>Tool <select name="tool">${Object.entries(VIDEO_TOOLS).map(([k, v]) => html`<option value="${k}" ${demoDraft.tool === k ? 'selected' : ''} ${v.macOnly && kit.os !== 'mac' ? 'disabled' : ''}>${v.label} (${v.hours} h${v.monthly ? `, $${v.monthly}/mo${v.unverified ? ' [unverified]' : ''}` : ', free plan'})</option>`)}</select></label>
        <label>For <select name="use">${Object.entries(VIDEO_USES).map(([k, v]) => html`<option value="${k}" ${demoDraft.use === k ? 'selected' : ''}>${v}</option>`)}</select></label>
        <label>Your computer <select name="os" id="demoOs">${['mac', 'windows', 'linux'].map((o) => html`<option value="${o}" ${kit.os === o ? 'selected' : ''}>${o === 'mac' ? 'macOS' : o === 'windows' ? 'Windows' : 'Linux'}</option>`)}</select></label>
      </div>
      <p class="small muted" id="demoLen">${scriptSeconds(demoDraft.script)} s read aloud</p>
      <button class="primary">Record and publish</button></form>
    ${!kit.subs.loom && (kit.counts.loom ?? 0) ? html`<p class="small">Loom free: ${kit.counts.loom}/${VIDEO_TOOLS.loom.freeVideos} videos, 5 minutes each. <button class="sm" id="loomUp">Upgrade to Loom Business ($${VIDEO_TOOLS.loom.paidMonthly}/user [third-party])</button></p>` : ''}
    ${d || s.company.salesVideo || s.company.launchVideo ? html`<h3>Published</h3>${assetLine(s, d, 'Landing page')}${assetLine(s, s.company.salesVideo, 'Sales follow-up')}${assetLine(s, s.company.launchVideo, 'Launch')}
      <p class="small">Landing x${l.landing.toFixed(3)}, sales x${l.sales.toFixed(3)}${s.company.launchVideo ? `, launch posts x${launchVideoMult(s).toFixed(3)}` : ''}${l.stale ? ' · landing demo out of date: you shipped new features since' : ''}.</p>
      ${d?.judge?.notes?.length ? html`<ul class="list small">${d.judge.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}` : ''}</section>`;
}

let siteDraft = { path: 'agent_repo', brief: '', spec: false, review: 'skim', ssr: false, meta: false, speed: false, framework: '' };
function sitePanel(s) {
  const b = siteBuildSlice(s);
  const opts = { spec: siteDraft.spec, review: siteDraft.review, checks: { ssr: siteDraft.ssr, meta: siteDraft.meta, speed: siteDraft.speed }, framework: siteDraft.framework || null };
  return html`<section class="panel"><h2>Build the site with an LLM</h2>
    <p class="small muted">Most founders now build the marketing site with an AI coding agent on their own repo or an AI app builder. The tool sets the hours, billing, rendering and lock-in; your brief, spec and review set the quality. Numbers are game assumptions [design] unless a price is shown.</p>
    <form id="siteForm">
      <label>Path <select name="path">${SITE_PATH_ORDER.map((k) => html`<option value="${k}" ${siteDraft.path === k ? 'selected' : ''}>${SITE_PATHS[k].label}${SITE_PATHS[k].monthly ? ` · $${SITE_PATHS[k].monthly}/mo${SITE_PATHS[k].unverified ? ' [unverified]' : ''}` : ' · your coding plan'}</option>`)}</select></label>
      <p class="small muted">${SITE_PATHS[siteDraft.path].note}</p>
      <label>Copy brief <textarea name="brief" rows="6" placeholder="Who it is for and their pain, in their words. What you do instead of the alternative. Proof. One number. One call to action.">${siteDraft.brief}</textarea></label>
      <div class="inline">
        <label class="inline-check"><input type="checkbox" name="spec" ${siteDraft.spec ? 'checked' : ''} style="width:auto" /> Write a page spec first (+${'1'} h)</label>
        <label>Review output <select name="review">${[['every', 'Read and edit every section'], ['skim', 'Skim it'], ['none', 'Publish as generated']].map(([k, v]) => html`<option value="${k}" ${siteDraft.review === k ? 'selected' : ''}>${v}</option>`)}</select></label>
        ${siteDraft.path === 'bolt' || siteDraft.path === 'agent_repo' ? html`<label>Framework <select name="framework"><option value="">tool default</option><option value="astro" ${siteDraft.framework === 'astro' ? 'selected' : ''}>Astro (static)</option><option value="next" ${siteDraft.framework === 'next' ? 'selected' : ''}>Next.js</option></select></label>` : ''}
      </div>
      <div class="inline">
        <label class="inline-check"><input type="checkbox" name="ssr" ${siteDraft.ssr ? 'checked' : ''} style="width:auto" /> Check pages are server-rendered/static</label>
        <label class="inline-check"><input type="checkbox" name="meta" ${siteDraft.meta ? 'checked' : ''} style="width:auto" /> Per-page titles, meta, OG and sitemap</label>
        <label class="inline-check"><input type="checkbox" name="speed" ${siteDraft.speed ? 'checked' : ''} style="width:auto" /> Speed pass (Lighthouse)</label>
      </div>
      <button class="primary">${b ? (b.path === siteDraft.path ? 'Rebuild' : `Move the site to this path (+${SITE_PATHS[b.path].lockInHours} h lock-in)`) : 'Build and publish'} (~${buildHours(siteDraft.path, opts)} h)</button>
    </form>
    ${b ? html`<h3>Current build</h3>
      <p class="small">${SITE_PATHS[b.path].label}: ${b.rendering === 'csr' ? html`<span class="neg">client-rendered SPA</span>` : 'static / server-rendered'} · ${b.meta ? 'per-page meta + sitemap' : html`<span class="neg">one shared title, no sitemap</span>`} · mobile LCP ~${b.lcp}s · ${Math.round(b.generic * 100)}% generic AI copy · landing x${siteBuildMult(b).toFixed(3)} · operator read ${Math.round(siteBuildScore(b) * 100)}/100${b.loops ? ` · ${b.loops} fix loop(s)` : ''}${b.wastedUsd ? `, $${b.wastedUsd} burned` : ''}</p>
      <button class="sm" id="siteIterate">Iterate on the site (~${SITE_PATHS[b.path].iterateHours} h)</button>
      ${siteCoaching(b).length ? html`<details class="small"><summary>What a stellar operator would do</summary><ul class="list">${siteCoaching(b).map((c) => html`<li>${c}</li>`)}</ul></details>` : ''}` : ''}
    <details class="small"><summary>Other site tools (notes)</summary><ul class="list">${SITE_NOTES.map((n) => html`<li>${n.outdated ? html`<span class="badge">outdated ${n.date}</span> ` : html`<span class="muted">${n.date}</span> `}${n.text}</li>`)}</ul></details>
  </section>`;
}

export default {
  id: 'website',
  title: 'Website',
  icon: '🌐',
  group: 'Growth',
  onDay(state) { demoOnDay(state); siteClaimsDay(state); domainOnDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    const site = s.company.website;
    const ev = site?.eval;
    mount(root, html`
      <div class="app-head"><div><h1>Website ${s.company.domain ? html`<span class="domain-chip">🔒 ${s.company.domain}</span>` : html`<button type="button" class="domain-chip none" data-scroll-domain>no domain yet: pick one</button>`}</h1><p>Your landing page is where every channel converts. Point it at your real site or upload your own HTML. A panel of four AI visitors drawn from your customer type and ICP (someone who would use it, someone who would push for it, the person who pays and someone who can block it) reads it the way each of them reads websites.</p></div></div>
      ${domainPanel(s)}
      <div class="grid-2">
        <section class="panel">
          <h2>${s.company.domain ? 'Your site' : 'Step 2 · Your site'}</h2>
          <form id="urlForm" class="inline"><label>Live URL <input name="url" type="url" placeholder="https://${s.company.domain || 'yourproduct.com'}" value="${site?.source === 'url' ? site.url : ''}" /></label><button class="primary">Fetch</button></form>
          <label>…or upload HTML <input type="file" id="htmlFile" accept=".html,.htm,text/html" /></label>
          <details><summary>…or paste landing-page copy</summary>
            <form id="pasteForm"><textarea name="copy" placeholder="Headline, subheadline, sections, pricing, CTA…">${site?.source === 'paste' ? site.text : ''}</textarea><button>Use this copy</button></form>
          </details>
          ${hasProduct(s) ? '' : html`<div class="callout small">No product yet? A page with a waitlist or a deposit button is a smoke test: run it from <a href="#/mvp">MVP lab</a> with a hypothesis and a pass/fail threshold, and read paid intent, not just email signups.</div>`}
          ${site ? html`<h3>What visitors see</h3>${browserFrame(s, site)}
            <p class="muted small">${words(site.text)} words · ${site.source === 'url' ? site.url : site.source}</p>` : html`<div class="callout warn">No website yet. Without one, paid and organic traffic barely converts.</div>`}
        </section>
        <section class="panel">
          <h2>Customer panel</h2>
          <p class="muted">Your ICP: ${s.company.icp || s.company.oneLiner || html`<i>not set: add it in Settings so personas match your real customers</i>`}</p>
          <button class="primary" id="runPanel" ${site ? '' : 'disabled'}>Run landing-page panel (1h)</button>
          ${ev ? html`<div class="stats" style="margin-top:12px">
              <div class="stat"><div class="stat-label">Landing score</div><div class="stat-value">${Math.round(ev.score * 100)}</div><div class="stat-sub">${s.market.fit.website.source}</div></div>
              <div class="stat"><div class="stat-label">Median WTP</div><div class="stat-value">${money(s.market.fit.price.stated ?? s.market.fit.price.wtp)}</div><div class="stat-sub">per month</div></div>
            </div>
            ${ev.results.map((r) => html`${panelistHead(r.persona)}${r.results.map((d) => html`<div class="card"><div class="small muted">${d.model}${d.mock ? ' (offline)' : ''} · clarity ${d.clarity}/10 · relevance ${d.relevance}/10 · credibility ${d.credibility}/10 · trial ${pct(d.trialProbability, 0)}</div>
              <p>"${d.firstImpression}"</p>
              ${d.confusions.length ? html`<p class="small"><b>Confused by:</b> ${d.confusions.join(' ')}</p>` : ''}
              ${d.missing.length ? html`<p class="small"><b>Couldn't find:</b> ${d.missing.join(' ')}</p>` : ''}</div>`)}`)}` : html`<p class="muted">Not judged yet.</p>`}
        </section>
      </div>
      ${sitePanel(s)}
      ${demoPanel(s)}`);

    wireDomain(root, ctx);
    on(root, 'input', '#demoForm textarea', (e, el) => { demoDraft.script = el.value; root.querySelector('#demoLen').textContent = `${scriptSeconds(el.value)} s read aloud`; });
    on(root, 'change', '#demoForm select', (e, el) => { if (el.name === 'os') ctx.act((st) => { videoKit(st).os = el.value; }); else demoDraft[el.name] = el.value; });
    on(root, 'click', '#loomUp', () => ctx.act((st) => { upgradeVideoTool(st, 'loom'); toast('Loom Business: no video cap, no 5-minute limit.', 'good'); }, { hours: 0.1, label: 'Upgrade Loom' }));
    on(root, 'submit', '#demoForm', async (e) => {
      e.preventDefault();
      const script = e.target.script.value.trim(), tool = e.target.tool.value, use = e.target.use.value;
      if (script.split(/\s+/).length < 30) { toast('Write a real script first (at least ~30 words).', 'warn'); return; }
      await ctx.act(async (st) => {
        const { judge, mock } = await judgeDemo(ctx, script);
        const d = recordDemo(st, { script, tool, use, judge });
        demoDraft = { script: '', tool, use };
        toast(`Published with ${VIDEO_TOOLS[tool].vendor} (script ${Math.round(d.quality * 100)}/100${mock ? ', offline judge' : ''}).`, d.quality >= DEMO.minQuality ? 'good' : 'warn');
      }, { hours: videoHours(tool), label: `Record ${VIDEO_USES[use].toLowerCase()} video` });
    });
    on(root, 'change', '#siteForm', (e) => { const f = formData(root.querySelector('#siteForm')); const pathChanged = f.path !== siteDraft.path; siteDraft = { ...siteDraft, ...f }; if (pathChanged || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') ctx.render?.(); });
    on(root, 'submit', '#siteForm', async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      siteDraft = { ...siteDraft, ...f };
      if (String(f.brief ?? '').trim().split(/\s+/).length < 15) { toast('Write a copy brief first: who it is for, their pain, the difference, proof, one number, one CTA.', 'warn'); return; }
      const opts = { path: f.path, brief: f.brief, spec: !!f.spec, review: f.review, checks: { ssr: !!f.ssr, meta: !!f.meta, speed: !!f.speed }, framework: f.framework || null };
      await ctx.act((st) => {
        const r = buildSite(st, opts);
        setWebsite(st, r.site);
        for (const w of r.warnings) notify(st, w, { type: 'warn', app: 'website' });
        toast(`Site built with ${SITE_PATHS[f.path].label.split(' (')[0]} in ~${r.hours} h${r.usd ? `, $${r.usd} extra usage` : ''}. Run the panel to see how visitors react.`, r.build.generic >= 0.5 ? 'warn' : 'good');
        const extra = Math.round((r.hours - buildHours(f.path, opts)) * 100) / 100;
        if (extra > 0) spendHours(st, extra, 'Site build: fix loops, setup and lock-in', { overtime: extra });
      }, { hours: buildHours(f.path, opts), label: 'Build the marketing site' });
    });
    on(root, 'click', '#siteIterate', () => ctx.act((st) => {
      const r = iterateSite(st);
      toast(r.useful ? 'Changed what the panel pointed at.' : 'Iterated without new data: nothing tells you whether it is better.', r.useful ? 'good' : 'warn');
    }, { hours: SITE_PATHS[siteBuildSlice(ctx.state)?.path ?? 'agent_repo'].iterateHours, label: 'Iterate on the site' }));
    on(root, 'submit', '#urlForm', async (e) => {
      e.preventDefault();
      const { url } = formData(e.target);
      await ctx.act(async (st) => {
        const r = await fetchSite(url, { cache: st.cache });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not fetch that site');
        setWebsite(st, { source: 'url', ...j });
        toast('Fetched your site. Run the panel to see how customers react.', 'good');
      }, { hours: 0.25, label: 'Website update' });
    });
    on(root, 'change', '#htmlFile', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const file = await readFile(f);
      await ctx.act((st) => { setWebsite(st, htmlToSite(file.text, f.name)); }, { hours: 0.25, label: 'Website update' });
    });
    on(root, 'submit', '#pasteForm', async (e) => {
      e.preventDefault();
      const { copy } = formData(e.target);
      await ctx.act((st) => {
        const lines = copy.split('\n').map((l) => l.trim()).filter(Boolean);
        setWebsite(st, { source: 'paste', url: 'pasted copy', title: lines[0] ?? '', description: lines[1] ?? '', headings: lines.filter((l) => l.length < 80).slice(0, 10), text: copy });
      }, { hours: 0.25, label: 'Website update' });
    });
    on(root, 'click', '#runPanel', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Personas are reading your site…';
      await ctx.act(() => runPanel(ctx), { hours: 1, label: 'Landing page review' });
    });
  },
};
