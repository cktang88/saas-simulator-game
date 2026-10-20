// Website customer panel: every panelist is a different, concrete person (apps/website/personas.js) with their own
// system prompt, their own offline lens and their own voice; the panel mixes buying seats; the aggregate still
// separates a strong page from a weak one; hidden truth never renders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { setCustomerType } from '../public/core/customer-type.js';
import website, { setWebsite, runPanel, heuristicJudge, personasFor } from '../public/apps/website.js';
import { buildPanel, personaSystemPrompt, publicPersona, SEATS } from '../public/apps/website/personas.js';
import { REALISM } from '../public/core/llm.js';
import { getSegment } from '../public/data/buyer-segments.js';

const PAGES = {
  strong: { title: 'Ledgerly: bookkeeping for small agencies', description: 'Close the month in 2 hours, not 2 days.', headings: ['Month-end close in 2 hours for agencies of 5-50 people', 'How it works', 'Pricing', 'FAQ', 'Security'], text: 'Ledgerly does bookkeeping for small agencies. Connect QuickBooks or Xero and Stripe in 5 minutes; we reconcile every transaction and flag the odd ones. "We cut our close from 3 days to 4 hours" - Maria Lopez, COO at Brightside Agency (22 people). 340 agencies, 4.8 stars from 120 reviews. Pricing: $49/month per company, cancel anytime, no contract. FAQ: Is my data safe? SOC 2 Type II, SSO on the Team plan, data encrypted, hosted in the US. Integrations: QuickBooks, Xero, Stripe, Slack, API docs. Need help? Call us or live chat, a real person sets it up with you. Works on your phone. Start a 14-day free trial, no credit card.' },
  medium: { title: 'Ledgerly', description: 'Bookkeeping for agencies', headings: ['Bookkeeping for agencies', 'Pricing'], text: 'Ledgerly helps agencies with bookkeeping. Connect your accounts and we reconcile transactions. Trusted by agencies. Pricing: $49/month. Start free trial.' },
  weak: { title: 'Solution', description: '', headings: ['Revolutionize your finance'], text: 'Our seamless, cutting-edge, AI-powered all-in-one platform will supercharge and unlock your potential. Robust and effortless. Contact us.' },
};
const TYPES = [['smb', 'startups'], ['smb', 'local_smb'], ['smb', 'ecommerce'], ['ent', 'mid_market'], ['ent', 'enterprise'], ['b2c', 'consumers']];

function mk(model, type, page = 'medium', seed = 5) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'bootstrap', founderName: 'F', seed });
  ensureStripe(s); ensureMarket(s);
  if (type) setCustomerType(s, type);
  s.company.oneLiner = 'Bookkeeping that closes the month for small agencies';
  s.company.icp = 'operations leads at small marketing agencies';
  if (page) setWebsite(s, { source: 'paste', ...PAGES[page] });
  return s;
}
const offlineLlm = (calls = []) => ({ panel: async (o) => { calls.push(o); return [{ data: o.fallback(), mock: true, model: 'offline' }]; } });

test('each panelist is a different person with their own system prompt, one per buying seat', () => {
  for (const [model, type] of TYPES) {
    const s = mk(model, type);
    const panel = personasFor(s);
    assert.deepEqual(panel.map((p) => p.seat), SEATS, type);
    assert.equal(new Set(panel.map((p) => p.key)).size, 4, `${type}: four different archetypes`);
    assert.equal(new Set(panel.map((p) => p.name)).size, 4, `${type}: four different names`);
    const prompts = panel.map((p) => personaSystemPrompt(p, { realism: REALISM }));
    assert.equal(new Set(prompts).size, 4, `${type}: distinct prompts`);
    for (const [i, p] of panel.entries()) {
      for (const bit of [p.name, p.title, p.jtbd, p.uses, p.burnedBy, p.skeptical, p.biases[0]]) assert.ok(prompts[i].includes(bit), `${type}/${p.key} prompt lacks "${bit}"`);
      assert.match(prompts[i], /How you read websites: you /);
      assert.doesNotMatch(prompts[i], /stellar operator/i);
    }
  }
});

test('the live panel sends each persona its own system prompt', async () => {
  const s = mk('smb', 'startups');
  const calls = [];
  await runPanel({ state: s, llm: offlineLlm(calls) });
  assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map((c) => c.system)).size, 4);
  assert.ok(calls.some((c) => /security|SOC 2/i.test(c.system)) && calls.some((c) => /burn/i.test(c.system)));
});

test('panels are deterministic per page version and seed', () => {
  const a = buildPanel(mk('smb', 'local_smb'), 'v1'), b = buildPanel(mk('smb', 'local_smb'), 'v1');
  assert.deepEqual(a, b);
  const c = buildPanel(mk('smb', 'local_smb', 'medium', 99), 'v1');
  assert.notDeepEqual(a.map((p) => [p.name, p.title, p.company]), c.map((p) => [p.name, p.title, p.company]));
});

test('different customer types produce different panels', () => {
  const panels = Object.fromEntries(TYPES.map(([model, type]) => [type, personasFor(mk(model, type))]));
  const keys = Object.values(panels).map((ps) => ps.map((p) => p.key).join(','));
  assert.equal(new Set(keys).size, TYPES.length);
  const titles = (t) => panels[t].map((p) => p.title).join(' | ');
  assert.match(titles('startups'), /engineer|CEO|Founder|engineering/i);
  assert.match(titles('enterprise'), /analyst|procurement|risk|InfoSec|sourcing|SVP|CIO|Chief/i);
  // Owner-run verticals borrow the segment's own committee titles (a restaurant's buyer is the Owner or GM).
  const eb = panels.local_smb.find((p) => p.seat === 'economic_buyer');
  assert.ok(getSegment(eb.segmentId).committee.find((r) => r.role === 'economic_buyer').titles.includes(eb.title), titles('local_smb'));
  assert.ok(panels.consumers.every((p) => p.company == null));
  assert.ok(panels.mid_market.every((p) => p.company && /\d|regional|national|global/.test(p.company)), 'B2B panelists name a company and its size');
});

test('offline feedback differs by persona: scores, weights and voice', () => {
  for (const [model, type] of TYPES) {
    const s = mk(model, type);
    const panel = personasFor(s);
    const out = panel.map((p) => heuristicJudge(s, s.company.website, p));
    assert.ok(new Set(out.map((d) => d.firstImpression)).size >= 3, `${type}: comments in different voices\n${out.map((d) => d.firstImpression).join('\n')}`);
    assert.ok(new Set(out.map((d) => `${d.clarity}|${d.credibility}|${d.trialProbability}`)).size >= 3, `${type}: scores differ`);
    assert.ok(new Set(out.flatMap((d) => d.missing)).size >= 2, `${type}: each misses different things`);
  }
  // The same page through two lenses: adding a security section moves the security lead much more than the CEO.
  const s = mk('smb', 'startups');
  const panel = personasFor(s);
  const sec = panel.find((p) => p.key === 'startup_security'), ceo = panel.find((p) => p.key === 'startup_ceo');
  const plus = { ...PAGES.medium, text: `${PAGES.medium.text} Security: SOC 2 Type II, SSO, data encrypted and hosted in the US.` };
  const gain = (p) => heuristicJudge(s, plus, p).credibility - heuristicJudge(s, PAGES.medium, p).credibility;
  assert.ok(gain(sec) > gain(ceo) + 1, `security ${gain(sec)} vs CEO ${gain(ceo)}`);
  // Price sensitivity: a page without pricing costs the owner far more intent than the staff member.
  const l = mk('smb', 'local_smb'); const lp = personasFor(l);
  const owner = lp.find((p) => p.seat === 'economic_buyer'), staff = lp.find((p) => p.seat === 'user');
  const noPrice = { ...PAGES.medium, text: PAGES.medium.text.replace('Pricing: $49/month. ', '') , headings: ['Bookkeeping for agencies'] };
  const drop = (p) => heuristicJudge(l, noPrice, p).trialProbability / heuristicJudge(l, PAGES.medium, p).trialProbability;
  assert.ok(drop(owner) < drop(staff) - 0.1, `owner ${drop(owner)} vs staff ${drop(staff)}`);
  assert.ok(heuristicJudge(l, noPrice, owner).missing.some((m) => /pricing/i.test(m)));
});

test('a visitor with the problem reacts differently from one without it (hidden person)', () => {
  const s = mk('smb', 'local_smb');
  const p = personasFor(s)[2];
  const hot = { ...p, hidden: { ...(p.hidden ?? {}), hasPain: true, painIntensity: 0.9, ago: '3 days ago' } };
  const cold = { ...p, hidden: { ...(p.hidden ?? {}), hasPain: false, painIntensity: 0, ago: null, priorities: ['hiring'] } };
  const h = heuristicJudge(s, s.company.website, hot), c = heuristicJudge(s, s.company.website, cold);
  assert.ok(h.relevance > c.relevance + 0.8 && h.trialProbability > c.trialProbability * 1.2);
  assert.notEqual(h.firstImpression, c.firstImpression);
  assert.match(personaSystemPrompt(hot, {}), /genuinely have the problem/);
  assert.match(personaSystemPrompt(cold, {}), /do not really have this problem/);
  // What the player sees about a panelist carries no hidden truth.
  const pub = JSON.stringify(publicPersona(hot));
  assert.doesNotMatch(pub, /painIntensity|hasPain|hidden|lastIncident|workaround/);
});

test('aggregate score still separates strong, medium and weak pages for every customer type', async () => {
  for (const [model, type] of TYPES) {
    const score = {};
    for (const page of ['strong', 'medium', 'weak']) {
      const s = mk(model, type, page);
      await runPanel({ state: s, llm: offlineLlm() });
      score[page] = s.market.fit.website.lastRun;
    }
    assert.ok(score.strong >= 0.75, `${type} strong ${score.strong}`);
    assert.ok(score.strong > score.medium + 0.12, `${type} ${score.strong} vs ${score.medium}`);
    assert.ok(score.medium > score.weak + 0.3 && score.weak < 0.2, `${type} ${score.medium} vs ${score.weak}`);
    assert.ok(score.medium < 0.75, `${type}: a mediocre page does not score well (${score.medium})`);
  }
});

test('the panel UI names each panelist and leaks no hidden truth or coaching', async () => {
  const s = mk('smb', 'ecommerce');
  await runPanel({ state: s, llm: offlineLlm() });
  const root = { innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; } };
  website.render(root, { state: s, params: '', save() {}, act() {}, render() {}, navigate() {}, toast() {}, llm: null });
  for (const r of s.company.website.eval.results) {
    assert.ok(root.innerHTML.includes(r.persona.name), r.persona.name);
    assert.ok(root.innerHTML.includes(r.persona.title.replace(/&/g, '&amp;')) || root.innerHTML.includes(r.persona.title), r.persona.title);
    if (r.persona.hidden?.lastIncident) assert.ok(!root.innerHTML.includes(r.persona.hidden.lastIncident));
  }
  assert.doesNotMatch(root.innerHTML, /painIntensity|stellar operator|you should(?! have)|Tip:/i);
});
