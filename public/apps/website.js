// Website: your real landing page (fetched by URL or uploaded HTML). A panel of AI customer personas
// built from your ICP reads it and judges clarity, relevance, credibility, intent to start a trial and
// willingness to pay. That judgment sets the landing-page conversion every channel (ads, SEO, outbound
// click-throughs) runs through. This is the reference implementation of an LLM panel for other apps.

import { html, mount, on, toast, readFile, formData } from '../core/ui.js';
import { ensureMarket } from '../core/market.js';
import { REALISM, averageField } from '../core/llm.js';
import { clamp, words, money, pct, hash } from '../core/util.js';
import { notify } from '../core/state.js';
import { DEMO, judgeDemo, recordDemo, scriptSeconds, demoLift, demoOnDay } from './website/demo.js';
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

export function personasFor(state) {
  const icp = state.company.icp || state.company.oneLiner || 'the target customer described on the page';
  const m = state.company.model;
  const base = m === 'b2c'
    ? ['a busy consumer scrolling on their phone who clicked an ad', 'a price-sensitive person who already uses a free alternative', 'an enthusiast who has tried several similar apps']
    : m === 'smb'
      ? ['a small-business owner who handles this problem themselves on weekends', 'an operations manager at a 20-person company who evaluates tools', 'a skeptical owner burned by a previous SaaS tool']
      : ['a VP who owns this problem at a 1,000-person company', 'an IT/security reviewer who has to approve vendors', 'a director who would champion a new tool internally'];
  return base.map((role, i) => ({ id: `p${i}`, role, icp }));
}

export function siteText(site) {
  if (!site) return '';
  return [site.title && `TITLE: ${site.title}`, site.description && `META: ${site.description}`, site.headings?.length && `HEADINGS: ${site.headings.join(' | ')}`, site.text].filter(Boolean).join('\n').slice(0, 12000);
}

// Deterministic offline judge: rewards specificity, proof, pricing and a clear CTA; punishes buzzwords.
export function heuristicJudge(state, site, persona) {
  const text = siteText(site).toLowerCase();
  const n = words(text);
  const icpWords = (state.company.icp + ' ' + state.company.oneLiner).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const icpHits = icpWords.filter((w) => text.includes(w)).length;
  const buzz = BUZZ.filter((b) => text.includes(b)).length;
  const proof = ['customers', 'case study', 'testimonial', 'trusted by', 'reviews', '★', 'saved', 'hours'].filter((k) => text.includes(k)).length;
  const pricing = /\$\s?\d|pricing|per month|\/mo/.test(text);
  const cta = /(start|try|book|get started|sign up|free trial|demo)/.test(text);
  const numbers = (text.match(/\d+%|\d+ (hours|minutes|days)|\$\d+/g) ?? []).length;
  const clarity = clamp(3 + Math.min(3, icpHits) + (site.headings?.length ? 1 : 0) + (cta ? 1 : 0) - buzz * 0.7 + (n > 80 ? 1 : -1), 1, 10);
  const relevance = clamp(3 + Math.min(4, icpHits * 1.2) - buzz * 0.3, 1, 10);
  const credibility = clamp(2 + Math.min(3, proof) + (pricing ? 1.5 : 0) + Math.min(2, numbers * 0.5) - buzz * 0.5, 1, 10);
  const trial = clamp(((clarity + relevance + credibility) / 30) ** 2 * 0.35, 0.005, 0.4);
  const ref = { b2c: 8, smb: 60, ent: 1200 }[state.company.model];
  const faq = /faq|frequently asked|cancel anytime|security|integrat|refund|guarantee/.test(text);
  const named = /["“”].{20,}["“”]|case study|testimonial|★|\d[\d,]* (reviews|customers|teams)/.test(text);
  const ctaCount = (text.match(/\b(start|try|book|get started|sign up|free trial|request a demo)\b/g) ?? []).length;
  const crit = {
    value_prop_5s: to5(clarity), icp_relevance: to5(relevance),
    proof: clamp(1 + Math.min(2, proof * 0.7) + (named ? 1.5 : 0) + Math.min(1, numbers * 0.4), 1, 5),
    offer_cta: clamp(1 + (cta ? 2 : 0) + (ctaCount >= 2 && ctaCount <= 5 ? 1 : 0) + (/free|no credit card|trial/.test(text) ? 1 : 0) - (ctaCount > 8 ? 1 : 0), 1, 5),
    price_objections: clamp(1 + (pricing ? 2 : 0) + (faq ? 2 : 0), 1, 5),
    specific_plain_copy: clamp(4 - buzz * 0.8 + Math.min(1, numbers * 0.3), 1, 5),
    evidence: buzz ? `Buzzwords on the page: ${BUZZ.filter((b) => text.includes(b)).slice(0, 4).join(', ')}` : !proof ? 'No customer proof found on the page' : 'Proof and specifics present',
  };
  return {
    ...crit,
    firstImpression: buzz > 2 ? 'Lots of buzzwords, I still don\'t know what this actually does for me.' : icpHits ? 'Seems aimed at someone like me, but I need more proof.' : 'Not sure this is for me.',
    clarity, relevance, credibility,
    trialProbability: +trial.toFixed(3),
    willingnessToPayMonthly: Math.round(ref * (0.4 + relevance / 10) * (persona.id === 'p1' ? 0.6 : 1)),
    confusions: buzz ? ['Too many generic claims: what exactly does it do?'] : [],
    missing: [!pricing && 'Pricing', !proof && 'Proof it works (customers, numbers, examples)', !cta && 'A clear next step'].filter(Boolean),
  };
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
      task: 'landing_page_review',
      system: `${REALISM}\nYou are ${p.role}. Target customer profile the company is going after: ${p.icp}. The year is 2026. You skim in seconds: score what you can see above the fold and near the buttons, not what a long page says about itself. Buzzwords, superlatives and page length earn nothing.\n${rubricText(LANDING_CRITERIA)}${brief ? `\nWhat you use or know today: ${brief} Compare this site against that, honestly: switching costs, missing parity features, price.` : ''}`,
      prompt: `You landed on this website. Read it as that person would (skimming, not studying). Judge it honestly.\n\n=== WEBSITE ===\n${siteText(site)}\n=== END ===\n\nThe company's current price: ${state.plans.filter((x) => x.active).map((x) => `${x.name} $${x.price}/${x.interval}`).join(', ')}.`,
      schema: PANEL_SCHEMA,
      temperature: 0.3,
      fallback: () => heuristicJudge(state, site, p),
      cache: state.cache,
    });
    results.push({ persona: p, results: res.map((r) => ({ model: r.model, mock: r.mock, ...r.data })) });
  }
  const flat = results.flatMap((r) => r.results);
  const avg = (f) => averageField(flat.map((d) => ({ data: d })), f) ?? 0;
  const trial = avg('trialProbability');
  const holistic = (avg('clarity') + avg('relevance') + avg('credibility')) / 30;
  const rub = rubricSkill(flat, LANDING_CRITERIA);
  const quality = rub == null ? holistic : 0.5 * holistic + 0.5 * rub;
  // Personas overstate intent ("25% chance I'd sign up" vs a 3.8% SaaS landing median): map on a log scale.
  const trialTerm = clamp(Math.log(Math.max(trial, 0.005) / 0.005) / Math.log(0.25 / 0.005), 0, 1);
  const fresh = clamp(0.55 * quality + 0.45 * trialTerm, 0, 1);
  // Re-running the panel on the same page shows new opinions but doesn't re-roll the stored score; after an edit the
  // stored score is the mean of the last two runs, so repeated tiny edits regress instead of fishing for a lucky roll.
  const siteHash = hash(siteText(site));
  const prev = ensureMarket(state).fit.website;
  const score = prev.score == null ? fresh : prev.siteHash === siteHash ? prev.score : (prev.score + fresh) / 2;
  const wtps = flat.map((d) => d.willingnessToPayMonthly).filter((v) => v > 0).sort((a, b) => a - b);
  const m = ensureMarket(state);
  m.fit.website = { score, siteHash, lastRun: fresh, notes: `${flat.length} judgments${prev.siteHash === siteHash ? ' (same page: stored score kept)' : ''}`, day: state.day, source: flat.some((d) => d.mock) ? 'offline heuristic' : 'LLM panel' };
  if (wtps.length) m.fit.price = { wtp: wtps[Math.floor(wtps.length / 2)], notes: 'median willingness to pay from landing page panel', day: state.day, source: m.fit.website.source };
  state.company.website.eval = { day: state.day, score, results };
  notify(state, `Landing page panel: score ${Math.round(score * 100)}/100, median willingness to pay ${money(m.fit.price.wtp ?? 0)}/mo.`, { type: score > 0.55 ? 'good' : 'info', app: 'website' });
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

let demoDraft = { script: '', style: 'standard' };
function demoPanel(s) {
  const d = s.company.demoVideo;
  const l = demoLift(s);
  return html`<section class="panel"><h2>Demo video</h2>
    <p class="small muted">Script it, then record it. A good demo lifts landing conversion modestly and helps sales calls; a vague or long one does nothing. Polish amplifies a good script and can't rescue a weak one. Effects are game assumptions [design].</p>
    <form id="demoForm"><textarea name="script" rows="7" placeholder="Open with who it's for and their pain. Show real clicks in the product. Put a number on the result. End with one next step. Aim for 60-120 seconds (about 150-300 words).">${demoDraft.script}</textarea>
      <label>Production <select name="style">${Object.entries(DEMO.styles).map(([k, v]) => html`<option value="${k}" ${demoDraft.style === k ? 'selected' : ''}>${v.label} (${v.hours} h)</option>`)}</select></label>
      <p class="small muted" id="demoLen">${scriptSeconds(demoDraft.script)} s read aloud</p>
      <button class="primary">Record and publish</button></form>
    ${d ? html`<h3>Current demo</h3><p class="small">${DEMO.styles[d.style].label}, ${d.seconds}s, script quality ${Math.round(d.quality * 100)}/100${l.stale ? ' · out of date: you shipped new features since' : ''}. Landing x${l.landing.toFixed(3)}, sales x${l.sales.toFixed(3)}.</p>
      ${d.judge.notes?.length ? html`<ul class="list small">${d.judge.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}` : ''}</section>`;
}

export default {
  id: 'website',
  title: 'Website',
  icon: '🌐',
  group: 'Growth',
  onDay: demoOnDay,
  render(root, ctx) {
    const s = ctx.state;
    const site = s.company.website;
    const ev = site?.eval;
    mount(root, html`
      <div class="app-head"><div><h1>Website</h1><p>Your landing page is where every channel converts. Point it at your real site or upload your own HTML. AI customer personas from your ICP will read it the way real visitors skim.</p></div></div>
      <div class="grid-2">
        <section class="panel">
          <h2>Your site</h2>
          <form id="urlForm" class="inline"><label>Live URL <input name="url" type="url" placeholder="https://yourproduct.com" value="${site?.source === 'url' ? site.url : ''}" /></label><button class="primary">Fetch</button></form>
          <label>…or upload HTML <input type="file" id="htmlFile" accept=".html,.htm,text/html" /></label>
          <details><summary>…or paste landing-page copy</summary>
            <form id="pasteForm"><textarea name="copy" placeholder="Headline, subheadline, sections, pricing, CTA…">${site?.source === 'paste' ? site.text : ''}</textarea><button>Use this copy</button></form>
          </details>
          ${site ? html`<h3>What visitors see</h3><p><b>${site.title || '(no title)'}</b></p><p class="muted">${site.description}</p>
            <ul class="list small">${(site.headings ?? []).slice(0, 8).map((h) => html`<li>${h}</li>`)}</ul>
            <p class="muted small">${words(site.text)} words · ${site.source === 'url' ? site.url : site.source}</p>` : html`<div class="callout warn">No website yet. Without one, paid and organic traffic barely converts.</div>`}
        </section>
        <section class="panel">
          <h2>Customer panel</h2>
          <p class="muted">Your ICP: ${s.company.icp || s.company.oneLiner || html`<i>not set: add it in Settings so personas match your real customers</i>`}</p>
          <button class="primary" id="runPanel" ${site ? '' : 'disabled'}>Run landing-page panel (1h)</button>
          ${ev ? html`<div class="stats" style="margin-top:12px">
              <div class="stat"><div class="stat-label">Landing score</div><div class="stat-value">${Math.round(ev.score * 100)}</div><div class="stat-sub">${s.market.fit.website.source}</div></div>
              <div class="stat"><div class="stat-label">Median WTP</div><div class="stat-value">${money(s.market.fit.price.wtp)}</div><div class="stat-sub">per month</div></div>
            </div>
            ${ev.results.map((r) => html`<h3>${r.persona.role}</h3>${r.results.map((d) => html`<div class="card"><div class="small muted">${d.model}${d.mock ? ' (offline)' : ''} · clarity ${d.clarity}/10 · relevance ${d.relevance}/10 · credibility ${d.credibility}/10 · trial ${pct(d.trialProbability, 0)}</div>
              <p>"${d.firstImpression}"</p>
              ${d.confusions.length ? html`<p class="small"><b>Confused by:</b> ${d.confusions.join('; ')}</p>` : ''}
              ${d.missing.length ? html`<p class="small"><b>Missing:</b> ${d.missing.join('; ')}</p>` : ''}</div>`)}`)}` : html`<p class="muted">Not judged yet.</p>`}
        </section>
      </div>
      ${demoPanel(s)}`);

    on(root, 'input', '#demoForm textarea', (e, el) => { demoDraft.script = el.value; root.querySelector('#demoLen').textContent = `${scriptSeconds(el.value)} s read aloud`; });
    on(root, 'change', '#demoForm select', (e, el) => { demoDraft.style = el.value; });
    on(root, 'submit', '#demoForm', async (e) => {
      e.preventDefault();
      const script = e.target.script.value.trim(), style = e.target.style.value;
      if (script.split(/\s+/).length < 30) { toast('Write a real script first (at least ~30 words).', 'warn'); return; }
      await ctx.act(async (st) => {
        const { judge, mock } = await judgeDemo(ctx, script);
        const d = recordDemo(st, { script, style, judge });
        demoDraft = { script: '', style };
        toast(`Demo published (script ${Math.round(d.quality * 100)}/100${mock ? ', offline judge' : ''}).`, d.quality >= DEMO.minQuality ? 'good' : 'warn');
      }, { hours: DEMO.styles[style].hours, label: 'Record demo video' });
    });
    on(root, 'submit', '#urlForm', async (e) => {
      e.preventDefault();
      const { url } = formData(e.target);
      await ctx.act(async (st) => {
        const r = await fetch('/api/site', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not fetch that site');
        st.company.website = { source: 'url', ...j, fetchedDay: st.day };
        toast('Fetched your site. Run the panel to see how customers react.', 'good');
      }, { hours: 0.25, label: 'Website update' });
    });
    on(root, 'change', '#htmlFile', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const file = await readFile(f);
      await ctx.act((st) => { st.company.website = { ...htmlToSite(file.text, f.name), fetchedDay: st.day }; }, { hours: 0.25, label: 'Website update' });
    });
    on(root, 'submit', '#pasteForm', async (e) => {
      e.preventDefault();
      const { copy } = formData(e.target);
      await ctx.act((st) => {
        const lines = copy.split('\n').map((l) => l.trim()).filter(Boolean);
        st.company.website = { source: 'paste', url: 'pasted copy', title: lines[0] ?? '', description: lines[1] ?? '', headings: lines.filter((l) => l.length < 80).slice(0, 10), text: copy, fetchedDay: st.day };
      }, { hours: 0.25, label: 'Website update' });
    });
    on(root, 'click', '#runPanel', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Personas are reading your site…';
      await ctx.act(() => runPanel(ctx), { hours: 1, label: 'Landing page review' });
    });
  },
};
