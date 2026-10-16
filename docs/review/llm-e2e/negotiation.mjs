// Live end-to-end check of the negotiation counterparty (core/negotiation.js: enterprise, VC, M&A, hiring, vendor playbooks),
// the RFP question judge, spec autofill and world news items.
// Run: node docs/review/llm-e2e/negotiation.mjs [neg|rfp|spec|news ...]   (needs the local server on :3000 with a key;
// not part of npm test). Prints a pass/fail table; raw outputs go to docs/review/llm-e2e/out/negotiation.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as llm from '../../../public/core/llm.js';
import { newState } from '../../../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../../../public/core/stripe.js';
import { ensureMarket } from '../../../public/core/market.js';
import { seedDefaultStack, post, addRecurring } from '../../../public/core/bank.js';
import * as N from '../../../public/apps/negotiate/index.js';
import { addContact, ensureDeal, startProposal, sendContract } from '../../../public/apps/sales/model.js';
import { ensureFr } from '../../../public/apps/fundraising/sim.js';
import { makeCandidate } from '../../../public/apps/people/candidates.js';
import { ensurePeople, createJob, applyJudge, makeOffer, createPool } from '../../../public/apps/people/sim.js';
import { ensureOps } from '../../../public/apps/people/ops-state.js';
import { ensureLegal } from '../../../public/apps/legal/sim.js';
import { uP, valueAt, stanceOfValue } from '../../../test/helpers/negotiators.js';
import * as R from '../../../public/apps/sales/rfp.js';
import { ensureCrm } from '../../../public/apps/sales/model.js';
import { researchSlice, productSlice } from '../../../public/apps/product/store.js';
import { gatherEvidence, autofillPrompt, autofillSpec, draftFromEvidence, isUneditedAutofill, AUTOFILL_SYSTEM, AUTOFILL_SCHEMA } from '../../../public/apps/aicost/autofill.js';
import { ensureWorld, seedLandscape, fireEvent, eventById } from '../../../public/apps/marketworld/engine.js';
import { writeNews, newsFacts } from '../../../public/apps/marketworld/llm.js';
import { computeMetrics } from '../../../public/apps/fundraising/metrics.js';
import { fmtDate } from '../../../public/core/util.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLY = process.argv.slice(2);
const want = (k) => !ONLY.length || ONLY.includes(k);
const usage = [];
llm.configure({ base: 'http://localhost:3000', onUsage: (u) => usage.push(u) });
const live = await llm.checkServerKey();
if (!live || !llm.isLive()) { console.error('Server at :3000 has no key; aborting.'); process.exit(1); }

const rows = [];
const raw = {};
const row = (task, cas, pass, note = '') => { rows.push({ task, case: cas, pass: pass ? 'PASS' : 'FAIL', note: String(note).slice(0, 160) }); };
const keep = (task, v) => { (raw[task] ??= []).push(v); };
export const ctxOf = (state) => ({ state, llm, toast() {}, save() {}, render() {}, act: async (fn) => fn(state), enqueue() {}, navigate() {} });

// ---------------------------------------------------------------------------
// Two contrasting companies
// ---------------------------------------------------------------------------
export function shelfbooks(seed = 11) {
  const s = newState({ companyName: 'Shelfbooks', model: 'smb', path: 'indie', founderName: 'Maya Chen', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  Object.assign(s.company, { oneLiner: 'Automatic bookkeeping and sales-tax reconciliation for Shopify sellers', icp: 'US Shopify merchants doing $20k-$500k/yr who do their own books', domain: 'shelfbooks.app', incorporated: true, entity: 'ccorp' });
  s.plans = [{ id: 'p1', name: 'Seller', price: 39, interval: 'month', trialDays: 14, active: true }];
  post(s, { amount: 220000, counterparty: 'Maya Chen', category: 'owner_contribution' });
  for (let i = 0; i < 62; i++) { const c = createCustomer(s, { name: `Seller ${i}`, email: `owner${i}@shop${i}.com`, company: `Shop ${i}` }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  s.apps.product = { features: [{ id: 'f1', title: 'Shopify payout matching', status: 'shipped', shippedDay: 0 }, { id: 'f2', title: 'Sales-tax by state report', status: 'shipped', shippedDay: 0 }] };
  s.day = 120;
  return s;
}
export function clausewise(seed = 23) {
  const s = newState({ companyName: 'Clausewise', model: 'ent', path: 'vc', founderName: 'Daniel Okafor', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  Object.assign(s.company, { oneLiner: 'AI agent that maps fintech controls to SOC 2, ISO 27001 and DORA evidence automatically', icp: 'Heads of compliance at 200-2,000 employee fintechs and payment companies', domain: 'clausewise.ai', incorporated: true, entity: 'ccorp' });
  s.plans = [{ id: 'p1', name: 'Platform', price: 1500, interval: 'month', trialDays: 0, active: true }];
  post(s, { amount: 1800000, counterparty: 'Seed round', category: 'investment' });
  for (let i = 0; i < 8; i++) { const c = createCustomer(s, { name: `Buyer ${i}`, email: `cco${i}@fin${i}.com`, company: `Fin ${i}` }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  s.apps.product = { features: [{ id: 'f1', title: 'DORA register export', status: 'shipped', shippedDay: 0 }] };
  s.day = 200;
  return s;
}

// ---------------------------------------------------------------------------
// Negotiation playbooks
// ---------------------------------------------------------------------------
const PLAYBOOKS = {
  // The bluffer plays in a world where it has no real alternative (the other deal is only qualified), so its claim is a bluff.
  enterprise: (tier) => {
    const s = clausewise(23);
    const { contact } = addContact(s, { firstName: 'Ruth', lastName: 'Adeyemi', email: 'ruth@northbank.com', title: 'Head of Vendor Procurement', company: 'Northbank Payments', domain: 'northbank.com' });
    s.apps.crm.companies.find((x) => x.id === contact.companyId).employees = 1400;
    const d = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
    startProposal(s, d, { planId: 'p1', quantity: 3, annual: true });
    sendContract(s, d);
    const c2 = addContact(s, { firstName: 'Bo', lastName: 'Kim', email: 'bo@lendfast.com', title: 'CCO', company: 'Lendfast', domain: 'lendfast.com' }).contact;
    ensureDeal(s, { companyId: c2.companyId, contactId: c2.id, stage: tier === 'manipulative' ? 'qualified' : 'contract' });
    return { s, neg: N.startEnterpriseNegotiation(s, d) };
  },
  vc: () => {
    const s = clausewise(29);
    const fr = ensureFr(s);
    fr.raise = { id: 'r1', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 150, deadlineDay: 300, raised: 0 };
    const t = { instrument: 'priced', lead: true, amount: 1.8e6, roundSize: 3e6, preMoney: 12e6, postMoney: 15e6, poolTargetPost: 0.12, liqPref: 1, participating: false, boardSeat: true, proRata: true, boardSeats: 'founder', vesting: 'keep', protective: 'standard', noShopDays: 45, levMult: 1, talkMult: 1, exploding: false };
    const inv = { id: 'invA', name: 'Hannah Voss', firm: 'Alder Partners', kind: 'seed_fund', leads: true, raiseId: 'r1', status: 'term_sheet', termExpiresDay: 214, terms: t, log: [], source: 'generated' };
    fr.investors.push(inv);
    return { s, neg: N.startVcNegotiation(s, inv) };
  },
  mna: () => {
    const s = shelfbooks(41);
    const fr = ensureFr(s);
    fr.exit.offers = [{ id: 'off1', type: 'Search fund / PE-backed buyer', price: 210000, cashAtClose: 170000, earnout: 40000, earnoutMonths: 12, diligenceDays: 45, failP: 0, day: 118, expiresDay: 150 }];
    return { s, neg: N.startMnaNegotiation(s, 'off1') };
  },
  hiring: () => {
    const s = shelfbooks(31);
    s.founder.hoursPerWeek = 80;
    const p = ensurePeople(s);
    p.payrollSetup.gusto = true; p.payrollSetup.deel = true;
    ensureLegal(s); s.apps.legal.ein = { status: 'done' };
    createPool(s, 10); ensureOps(s);
    const j = createJob(s, { text: 'Senior full-stack engineer (Shopify apps)', role: 'engineer', region: 'us', engagement: 'employee' });
    applyJudge(j, { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' });
    const c = makeCandidate(s, j, null, (x) => `${x}_live`);
    Object.assign(c, { name: 'Priya Raman', expectation: 150000, seniority: 'senior', stage: 'interviewed', interest: 0.7, noticeDays: 14 });
    c.persona = { ...c.persona, otherOffers: false };
    p.candidates.push(c);
    makeOffer(s, c.id, { salary: 138000, equityPct: 0.2, startDay: s.day + 21 });
    c.negotiation.rolled = true;
    Object.assign(c.negotiation, { status: 'countered', round: 1, counterDay: s.day, counter: { want: { salary: 159000, equityPct: 0.4, signOn: 10000 }, items: ['base', 'equity', 'sign-on'] } });
    return { s, neg: N.startHiringCandidateNegotiation(s, c.id) };
  },
  vendor: (tier) => {
    const s = shelfbooks(3);
    s.day = 140;
    const r = addRecurring(s, { vendor: 'HubSpot', amount: 900, category: 'software', dayOfMonth: 10 });
    r.seats = 5; r.seatPrice = 180;
    const neg = N.startRecurringNegotiation(s, r.id);
    if (tier === 'manipulative') { neg.context.alternatives = 0; neg.context.unused = false; N.refreshBatna(s, neg); } // nothing real to walk to: the claim is a bluff
    return { s, neg };
  },
};

// Per-playbook words a real founder would use: the justification behind a stellar anchor, the fake competitor a bluffer names.
const SAY = {
  enterprise: { why: 'Northbank is a 3-seat, 12-month start, so list is fair: our two other fintech customers at this size pay within 5% of it, and we priced the DORA module in.', rival: 'two other banks are ready to sign at list this quarter', thing: 'the price' },
  vc: { why: 'We are at $12k MRR with 8 fintech logos and 18% month-over-month growth; seed rounds for AI compliance at this traction are clearing around $15-16M pre.', rival: 'Index sent us a term sheet at $18M pre', thing: 'the valuation' },
  mna: { why: 'We are at about $2.4k MRR growing 6% a month with 3% monthly churn; at 3.5-4x ARR that is roughly $250k, and I am not keen on a big earnout.', rival: 'another buyer offered $320k all cash', thing: 'the price' },
  hiring: { why: 'We are an early, profitable-ish indie company, so base has to stay near $150k; I can put more into equity and a sign-on to bridge the gap.', rival: 'two other candidates are ready to accept today', thing: 'the base' },
  vendor: { why: 'We use 5 seats at a small company and Pipedrive quotes about $5,400 a year for the same; I need the renewal closer to that to stay.', rival: 'Salesforce offered us the same thing for free', thing: 'the price' },
};

const ALT_RE = /(competing|other|another|rival|second|alternative)/i;
const FOURTH_WALL = /\b(as an ai|language model|utility|satisfaction (score|of)|priority weight|0\.\d\d\b|json|reference counter|on a 0)/i;
const SECRET_RE = /(reservation|walk-?away (price|point|value|number)|batna|bottom line is|my (floor|limit) is|lowest (we|i) (can|could) go is)/i;

function moneyTokens(t) {
  const out = [];
  for (const m of String(t).matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?([kKmM]|million|thousand)?/g)) {
    let v = Number(m[1].replace(/,/g, '')); const u = (m[2] ?? '').toLowerCase();
    if (u === 'k' || u === 'thousand') v *= 1e3; if (u === 'm' || u === 'million') v *= 1e6;
    out.push({ kind: 'usd', v, s: m[0] });
  }
  for (const m of String(t).matchAll(/(\d+(?:\.\d+)?)\s?(%|percent)/g)) out.push({ kind: 'pct', v: Number(m[1]) / 100, s: m[0] });
  return out;
}
// Numbers the counterparty quotes must match a value on the table (its package, the player's offer, earlier packages) or a
// fact the founder put in the message; anything else is an invented or inconsistent number.
function numberCheck(neg, message, pkg, offer, founderMsg) {
  const vals = [];
  const push = (p) => { if (!p) return; for (const i of neg.issues) if (i.type === 'num') vals.push({ kind: i.fmt === 'pct' ? 'pct' : 'usd', v: Number(p[i.id]) }); };
  push(pkg); push(offer); for (const h of neg.history) push(h.package);
  for (const t of moneyTokens(founderMsg)) vals.push(t);
  const bad = [];
  for (const t of moneyTokens(message)) {
    const ok = vals.some((x) => (x.kind === t.kind || (x.kind === 'usd' && t.kind === 'usd')) && Math.abs(x.v - t.v) <= Math.max(t.kind === 'pct' ? 0.006 : 600, Math.abs(x.v) * 0.012));
    // differences between two packages are fine too (e.g. "$3k over" ), so only flag numbers in the package range
    if (!ok) bad.push(t.s);
  }
  // the counter's own package: a number quoted next to an issue's name must be that issue's value in the package (or the
  // founder's offer, which the counterparty may be quoting back)
  const mism = [];
  if (pkg) {
    const words = neg.issues.filter((i) => i.type === 'num').map((i) => ({ i, w: [i.label.toLowerCase().split(/[ /(]/).filter((x) => x.length > 3)[0], i.id.toLowerCase()].filter(Boolean) }));
    const text = String(message);
    for (const m of text.matchAll(/(\$\s?\d[\d,]*(?:\.\d+)?\s?(?:[kKmM]|million|thousand)?|\d+(?:\.\d+)?\s?(?:%|percent))/g)) {
      const tok = moneyTokens(m[0])[0];
      if (!tok) continue;
      const win = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 25).toLowerCase();
      let best = null;
      for (const { i, w } of words) {
        if ((i.fmt === 'pct') !== (tok.kind === 'pct')) continue;
        // distance from the label to the number: a label just before the number wins over one just after it
        const t0 = Math.min(30, m.index), t1 = t0 + m[0].length;
        const pos = Math.min(...w.flatMap((x) => [...win.matchAll(new RegExp(x, 'g'))].map((mm) => (mm.index + x.length <= t0 ? t0 - (mm.index + x.length) : mm.index >= t1 ? mm.index - t1 + 14 : Infinity))));
        if (pos < Infinity && (!best || pos < best.pos)) best = { i, pos };
      }
      if (!best) continue;
      const i = best.i;
      const okv = [pkg[i.id], offer?.[i.id]].some((v) => v != null && Math.abs(Number(v) - tok.v) <= Math.max(tok.kind === 'pct' ? 0.006 : 600, Math.abs(Number(v)) * 0.012));
      // a figure that is some other issue's value in the same package is a labelling ambiguity, not a contradiction
      const other = neg.issues.some((j) => j.type === 'num' && (j.fmt === 'pct') === (tok.kind === 'pct') && Math.abs(Number(pkg[j.id]) - tok.v) <= Math.max(tok.kind === 'pct' ? 0.006 : 600, Math.abs(Number(pkg[j.id])) * 0.012));
      if (!okv && !other) mism.push(`${i.id}: says ${tok.s} vs ${N.fmtValue(i, pkg[i.id])}`);
    }
  }
  return { bad, mism };
}

const founderNames = (s) => String(s.founder?.name ?? '').split(/\s+/);
const pkgFrom = (view, st) => Object.fromEntries(view.issues.map((i) => [i.id, valueAt(i, st[i.id])]));

/** A live (or offline) negotiator by tier: stellar | mediocre | manipulative. Returns a per-round trace. */
async function negotiate(kind, tier, { offline = false } = {}) {
  const { s, neg } = PLAYBOOKS[kind](tier);
  const id = neg.id;
  const say = SAY[kind];
  const calls = [];
  const ask = async (o) => { const r = await llm.ask(o); calls.push({ system: o.system, prompt: o.prompt, data: r.data, mock: r.mock }); return r; };
  if (tier === 'stellar') for (const p of ['batna', 'norms', 'counterparty', 'counterparty']) N.prepare(s, id, p);
  let v = N.viewOf(s, neg);
  const issues = v.issues;
  const threshold = v.batna?.value ?? neg.player.batna.value;
  const known = (iid) => v.known.priorities[iid];
  let st;
  const trace = [];
  const play0 = () => {
    if (tier === 'mediocre') { st = Object.fromEntries(issues.map((i) => [i.id, 0.6])); return { offer: pkgFrom(v, st), message: 'Here is our proposal. Let me know what you think.' }; }
    if (tier === 'manipulative') { st = Object.fromEntries(issues.map((i) => [i.id, 1])); return { offer: pkgFrom(v, st), message: `Honestly ${say.rival}, and that offer expires Friday. Match these terms today or we walk.`, claim: 'alternative', threat: true }; }
    st = Object.fromEntries(issues.map((i) => [i.id, known(i.id) === 'high' && i.yourWeight < 0.1 ? 0.5 : known(i.id) === 'low' ? 0.85 : 0.75]));
    return { offer: pkgFrom(v, st), message: `${say.why} Before we go further: what matters most to you in this deal?`, claim: neg.player.batna.real ? 'alternative' : undefined };
  };
  let play = play0();
  let prevCU = null;
  for (let r = 1; r <= 7 && neg.status === 'open'; r++) {
    // the deterministic engine's answer to the same move, on a copy (what the LLM persona is validated against)
    const shadow = structuredClone(s);
    const offRep = N.playRoundSync(shadow, id, play);
    const n0 = calls.length;
    const rep = offline ? N.playRoundSync(s, id, play) : await N.playRound(s, id, play, { ask, live: true });
    const call = calls[n0] ?? null;
    const cpPkg = rep.package ?? null;
    const numbers = numberCheck(neg, rep.message, cpPkg, play.offer, play.message);
    trace.push({
      round: r, offer: N.describePackage(neg, play.offer).join('; '), founder: play.message, claim: play.claim ?? null,
      llmAction: call?.data?.action ?? null, action: rep.action, offlineAction: offRep.action, clamped: Boolean(rep.clamped), voiceRejected: Boolean(rep.voiceRejected), mock: call?.mock ?? null,
      rawMessage: call?.data?.message ?? null, message: rep.message, offlineMessage: offRep.message,
      cpU: cpPkg ? +N.pkgU(neg, cpPkg).c.toFixed(3) : null, offlineCpU: offRep.package ? +N.pkgU(neg, offRep.package).c.toFixed(3) : null,
      pkg: cpPkg ? N.describePackage(neg, cpPkg).join('; ') : null, notes: rep.notes, bluffCalled: Boolean(rep.bluffCalled),
      leakRaw: call?.data?.message ? (SECRET_RE.test(call.data.message) || call.data.message.includes(neg.hidden.res.toFixed(2))) : false,
      fourthWall: FOURTH_WALL.test(rep.message ?? ''), numbers,
      wrongName: [...String(rep.message ?? '').matchAll(/\b(?:Thanks|Thank you|Hi|Hey|Look|Listen|Honestly|Okay|OK|Sorry),?\s+([A-Z][a-z]+)\b/g)].map((m) => m[1]).filter((n) => !founderNames(s).includes(n) && !/^(for|but|and|I|We|That|This|The|Your|You|So|Let|It|Here|Again)$/.test(n)),
    });
    if (neg.status !== 'open') break;
    v = N.viewOf(s, neg);
    const cp = v.last.cp;
    const uC = uP(v, cp);
    // acceptance by tier
    if (tier === 'mediocre' && r >= 3) { N.acceptCounter(s, id); break; }
    if (tier === 'manipulative' && r >= 5 && uC >= threshold) { N.acceptCounter(s, id); break; }
    if (tier === 'stellar') {
      const gain = uC - (prevCU ?? -1); prevCU = uC;
      if (r >= 3 && uC >= threshold + 0.1 && (gain < 0.025 || rep.final || r >= 6)) { N.acceptCounter(s, id); break; }
    }
    const cpSt = Object.fromEntries(issues.map((i) => [i.id, stanceOfValue(i, cp[i.id])]));
    if (tier === 'mediocre') {
      for (const i of issues) st[i.id] = (st[i.id] + cpSt[i.id]) / 2;
      play = { offer: pkgFrom(v, st), message: r >= 2 ? "Let's just split the difference and get this done." : 'OK, we can move. How about this?', split: r >= 2 };
    } else if (tier === 'manipulative') {
      for (const i of issues) st[i.id] = Math.max(cpSt[i.id], st[i.id] - 0.06);
      const lines = [`Last chance. My other offer expires tomorrow at noon. ${say.rival}. Move on ${say.thing} or we are done.`, 'This is ridiculous. I am walking unless you fix this today.', 'Final warning: my board says take the other deal unless you match.', 'Fine. I can move a little, but this is my last offer.'];
      play = { offer: pkgFrom(v, st), message: lines[Math.min(lines.length - 1, r - 1)], claim: r <= 2 ? 'alternative' : undefined, threat: r <= 3 };
    } else {
      const gives = [], holds = [];
      for (const i of issues) {
        const give = (known(i.id) === 'high' || known(i.id) === 'medium') && i.yourWeight < 0.12;
        const step = 0.3 / Math.sqrt(r);
        if (give) { st[i.id] = Math.max(cpSt[i.id], st[i.id] - 2 * step); gives.push(i.label.toLowerCase()); }
        else if (i.yourWeight >= 0.1) { st[i.id] = Math.max(cpSt[i.id], st[i.id] - 0.25 * step); holds.push(i.label.toLowerCase()); }
        else st[i.id] = Math.max(cpSt[i.id], st[i.id] - 0.7 * step);
      }
      play = { offer: pkgFrom(v, st), message: `I can move on ${gives.slice(0, 2).join(' and ') || 'the smaller terms'} because you said those matter to you, if you can meet me on ${holds.slice(0, 2).join(' and ') || say.thing}. Smaller step than last time: we are close.` };
    }
  }
  if (neg.status === 'open') { const v2 = N.viewOf(s, neg); if (v2.last.cp && uP(v2, v2.last.cp) >= threshold) N.acceptCounter(s, id); else N.walkAway(s, id); }
  return { kind, tier, offline, status: neg.status, score: neg.result?.score ?? null, capture: neg.result?.capture ?? null, uP: neg.result?.uP ?? null, final: neg.final ? N.describePackage(neg, neg.final).join('; ') : null, res: neg.hidden.res, cp: { name: neg.cp.name, role: neg.cp.role, style: neg.cp.style }, batnaReal: neg.player.batna.real, trace, system: calls[0]?.system ?? null, prompt1: calls[0]?.prompt ?? null };
}

async function negotiationCases() {
  const T = 'negotiation:counterparty';
  for (const kind of Object.keys(PLAYBOOKS)) {
    const out = {};
    for (const tier of ['stellar', 'mediocre', 'manipulative']) {
      const [liveRun, offRun] = [await negotiate(kind, tier), await negotiate(kind, tier, { offline: true })];
      out[tier] = liveRun;
      keep(T, liveRun);
      const tr = liveRun.trace;
      const mocks = tr.filter((x) => x.mock === true).length;
      const llmRounds = tr.filter((x) => x.mock === false).length;
      row(T, `${kind}/${tier} live`, mocks === 0 && llmRounds > 0, `${llmRounds} live rounds, ${liveRun.status}, score ${liveRun.score?.toFixed(2)} (offline ${offRun.status} ${offRun.score?.toFixed(2)})`);
      const leaks = tr.filter((x) => x.leakRaw).length;
      row(T, `${kind}/${tier} no leak`, leaks === 0, leaks ? tr.find((x) => x.leakRaw).rawMessage : 'no hidden value in raw messages');
      const fw = tr.filter((x) => x.fourthWall || x.wrongName?.length);
      row(T, `${kind}/${tier} in character`, fw.length === 0, fw.length ? fw[0].message : `${liveRun.cp.role} (${liveRun.cp.style}): "${tr[0]?.message?.slice(0, 90)}"`);
      const mism = tr.filter((x) => x.numbers.mism.length);
      row(T, `${kind}/${tier} text matches terms`, mism.length === 0, mism.length ? `${mism[0].numbers.mism[0]} :: ${mism[0].message}` : 'quoted numbers match the structured package');
      const drift = tr.filter((x) => x.cpU != null && x.offlineCpU != null && x.offlineCpU - x.cpU > 0.04);
      const softAccept = tr.filter((x) => x.action === 'accept' && x.offlineAction !== 'accept');
      const voiced = tr.filter((x) => x.mock === false && !x.voiceRejected).length;
      row(T, `${kind}/${tier} follows engine`, drift.length === 0 && softAccept.length === 0, `${drift.length} rounds conceded >0.04 more than the engine; ${softAccept.length} accepts the engine would not make; ${voiced}/${llmRounds} messages voiced by the persona (rest fell back to the deterministic line)`);
      if (tier === 'manipulative') {
        const called = tr.filter((x) => x.bluffCalled);
        const textCalls = called.filter((x) => /(show|proof|verify|believe|doubt|check|really|send (me|over)|see (it|that|the))/i.test(x.message));
        const credulous = tr.filter((x) => !x.bluffCalled && x.claim && /(competitive|sharpen|match|understand you have)/i.test(x.message));
        row(T, `${kind}/manipulative bluff handled`, (!called.length || textCalls.length === called.length) && !liveRun.batnaReal, `engine called ${called.length}x, text tests it ${textCalls.length}x; credulous replies ${credulous.length}`);
      }
    }
    const sep = (out.stellar.score ?? 0) - Math.max(out.mediocre.score ?? 0, out.manipulative.score ?? 0);
    row(T, `${kind} tiers separate`, sep >= 0.12, `stellar ${out.stellar.score?.toFixed(2)} (${out.stellar.status}) vs mediocre ${out.mediocre.score?.toFixed(2)} (${out.mediocre.status}) vs manipulative ${out.manipulative.score?.toFixed(2)} (${out.manipulative.status})`);
  }
}

// ---------------------------------------------------------------------------
// rfp_question_judge: Q&A questions in a formal RFP (sales/rfp.js judgeQuestionLlm)
// ---------------------------------------------------------------------------
const reqOf = (id, o = {}) => ({ ...(R.CORE_REQS.find((r) => r.id === id) ?? R.REQ_BANK.find((r) => r.id === id) ?? R.CERT_REQS[id]), weight: 2, mandatory: false, ...o });
const numbered = (reqs) => reqs.map((r, i) => ({ ...r, n: `R-${String(i + 1).padStart(2, '0')}` }));
function rfpWorld(kind) {
  const s = kind === 'k12' ? (() => {
    const t = newState({ companyName: 'Ledgerly', model: 'ent', path: 'vc', founderName: 'Pat Doe', seed: 5 });
    ensureStripe(t); ensureMarket(t); seedDefaultStack(t);
    t.company.oneLiner = 'Request tracking and approvals for school districts';
    t.plans[0].price = 400; t.plans[0].interval = 'month';
    return t;
  })() : clausewise(23);
  ensureCrm(s);
  const reqs = numbered([reqOf('core', { mandatory: true, weight: 3 }), reqOf('encrypt', { mandatory: true, weight: 3 }), reqOf('sso'), reqOf('rbac', { mandatory: true }), reqOf('audit'), reqOf('export'), reqOf(kind === 'k12' ? 'a11y' : 'soc2', { mandatory: true })]);
  const bid = R.postPublicBid(s, { segmentId: kind === 'k12' ? 'k12' : 'banks', wired: false, reqs, quantity: kind === 'k12' ? 120 : 6, budget: 1e9, budgetHint: true, evalFlaw: false, localPct: 0, weightsStated: false });
  return { s, bid };
}
const RFP_Q = {
  k12: {
    strong: [
      'Section 5 lists price, technical merit and references: how many evaluation points is each worth, and will oral presentations be scored separately?',
      'R-07 requires WCAG 2.1 AA conformance as mandatory; would a current VPAT with a dated remediation plan for two known issues be acceptable, or is full conformance required at submission?',
      'Is the current request-tracking contract with the incumbent expiring this school year, and must the new system import its historical records?',
    ],
    mediocre: ['Can you tell us more about what the district is looking for?', 'When will the district make a decision on this RFP?'],
    gamed: [
      'Regarding R-01 R-02 R-03 R-04 R-05 R-06 R-07, what is the budget, the evaluation weights, the scoring rubric points, the incumbent contract expiration and is every mandatory requirement acceptable as equivalent?',
      'Our platform is the best-in-class leading provider of approvals software trusted by districts nationwide; would the district like to see how our solution exceeds every requirement?',
      'We really admire the district\'s vision! Are you leaning toward a particular vendor, and can you confirm we would be a strong fit?',
    ],
  },
  bank: {
    strong: [
      'R-07 makes a SOC 2 Type II report mandatory; we hold a Type I and our Type II observation window closes in four months. Would a Type I plus a bridge letter satisfy R-07 at submission?',
      'What is the anticipated annual budget for the six compliance seats, and is it fixed for a multi-year term or reviewed annually?',
      'How are the evaluation points split between price, security and functionality, and is the DORA register export in R-01 scored as part of core functionality?',
    ],
    mediocre: ['Could you share more details on your requirements?', 'Is there any flexibility on the timeline?'],
    gamed: [
      'Re R-01/R-02/R-03/R-04/R-05/R-06/R-07: budget? weights? scoring rubric points? incumbent? mandatory or acceptable equivalent? relative importance? evaluation committee?',
      'As the leading AI-native compliance platform, we offer best-in-class SOC 2, ISO 27001 and DORA automation; would you like a demo of how we exceed the requirements?',
      'Your team has been amazing to work with. Which vendor are you leaning toward, and can you confirm we are your favourite?',
    ],
  },
};
async function rfpCases() {
  const T = 'rfp_question_judge';
  for (const kind of ['k12', 'bank']) {
    const res = {};
    for (const [label, qs] of Object.entries(RFP_Q[kind])) {
      res[label] = [];
      for (const q of qs) {
        const { s, bid } = rfpWorld(kind);
        let rawScore = null, mock = null;
        const spy = { ask: async (o) => { const r = await llm.ask(o); rawScore = r.data?.score; mock = r.mock; keep(T, { kind, label, q, system: o.system, prompt: o.prompt, data: r.data, mock: r.mock }); return r; } };
        const j = await R.judgeQuestionLlm(spy, s, bid, q);
        const heur = R.judgeQuestion(q, bid);
        res[label].push({ q, final: j.score, llm: rawScore, heur: heur.score, kind: j.kind, mock, feedback: j.feedback ?? j.issues });
      }
    }
    keep(T, { kind, res });
    const avg = (l, k) => res[l].reduce((a, x) => a + (x[k] ?? 0), 0) / res[l].length;
    const all = Object.values(res).flat();
    row(T, `${kind} live`, all.every((x) => x.mock === false && Number.isFinite(x.llm)), `${all.filter((x) => x.mock === false).length}/${all.length} live`);
    row(T, `${kind} order (final)`, avg('strong', 'final') > avg('mediocre', 'final') + 0.15 && avg('mediocre', 'final') >= avg('gamed', 'final') - 0.05, `strong ${avg('strong', 'final').toFixed(2)} / mediocre ${avg('mediocre', 'final').toFixed(2)} / gamed ${avg('gamed', 'final').toFixed(2)}`);
    row(T, `${kind} order (model)`, avg('strong', 'llm') > avg('mediocre', 'llm') + 0.2 && avg('strong', 'llm') > avg('gamed', 'llm') + 0.3, `llm strong ${avg('strong', 'llm').toFixed(2)} / mediocre ${avg('mediocre', 'llm').toFixed(2)} / gamed ${avg('gamed', 'llm').toFixed(2)}; heuristic gamed ${avg('gamed', 'heur').toFixed(2)}`);
    const stuffed = res.gamed[0];
    row(T, `${kind} keyword-stuffed caught`, stuffed.final < 0.5, `final ${stuffed.final} (heuristic ${stuffed.heur}, model ${stuffed.llm})`);
    const anyStrongLow = res.strong.filter((x) => x.final < 0.55);
    row(T, `${kind} strong questions get answered`, !anyStrongLow.length, anyStrongLow.length ? `${anyStrongLow[0].final}: ${anyStrongLow[0].q.slice(0, 80)}` : res.strong.map((x) => x.final).join(', '));
  }
}

// ---------------------------------------------------------------------------
// spec_autofill: draft a spec from the evidence (generator; must not invent evidence or metrics)
// ---------------------------------------------------------------------------
function seedEvidence(s, n, texts, theme) {
  const Rs = researchSlice(s);
  Rs.interviews = Array.from({ length: n }, (_, i) => ({ id: `iv${i}`, real: true, status: 'done', channel: 'warm', doneDay: 5 + i }));
  Rs.insights = [];
  for (let i = 0; i < Math.max(1, n); i++) for (const [type, text] of texts) Rs.insights.push({ id: `ins${i}_${type}`, interviewId: `iv${i}`, theme, type, text, real: true, verified: true, who: `Interviewee ${i + 1}`, day: 5 + i });
}
const SPEC_EVIDENCE = {
  shelfbooks: { n: 5, theme: 'Payout reconciliation', texts: [
    ['pain', 'Every month-end I spend about 4 hours matching Shopify payouts to bank deposits because fees and refunds are netted out.'],
    ['workaround', 'They export the payout CSV and tick off lines against the bank statement in a spreadsheet.'],
    ['spend', 'I paid my bookkeeper $150 last quarter just to find a $312 refund that never showed up.'],
  ] },
  clausewise: { n: 2, theme: 'Evidence collection', texts: [
    ['workaround', 'Our compliance analyst keeps a spreadsheet of which control each screenshot proves.'],
    ['pain', 'Before an audit we screenshot access reviews from three systems by hand.'],
  ] },
};
const figuresIn = (t) => [...String(t).matchAll(/\$\s?\d[\d,.]*\s?[km]?|\b\d+(?:\.\d+)?\s*(?:%|percent|hours?|h\b|hrs?|minutes?|mins?|days?|weeks?|months?|accounts?|customers?|merchants?|users?|interviewees?)/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, ' ').trim());
async function specCases() {
  const T = 'spec_autofill';
  for (const [name, mk] of [['shelfbooks', shelfbooks], ['clausewise', clausewise]]) {
    const s = mk();
    const E = SPEC_EVIDENCE[name];
    seedEvidence(s, E.n, E.texts, E.theme);
    const ev = gatherEvidence(s);
    const prompt = autofillPrompt(s, ev);
    if (ev.strength < 0.25) { row(T, `${name} below evidence floor`, true, `strength ${ev.strength}: no LLM call, generic offline draft`); continue; }
    const res = await llm.ask({ task: 'spec_autofill', system: AUTOFILL_SYSTEM, prompt, schema: AUTOFILL_SCHEMA, temperature: 0.2, maxTokens: 700, fallback: () => ({ ...draftFromEvidence(s, ev).fields }) });
    keep(T, { name, strength: ev.strength, prompt, data: res.data, mock: res.mock });
    row(T, `${name} live`, res.mock === false && ['title', 'problem', 'solution', 'acceptanceText', 'metric'].every((k) => String(res.data?.[k] ?? '').length > 3), `strength ${ev.strength}, mock ${res.mock}`);
    // Every figure in the draft must come from the evidence (or the plan / ICP in the prompt), or be marked [confirm: ...]
    const allowed = new Set(figuresIn(prompt));
    const text = Object.entries(res.data ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
    const noConfirm = text.replace(/\[confirm[^\]]*\]/gi, '');
    const invented = figuresIn(noConfirm).filter((f) => !allowed.has(f) && !/^(1|2|3|5|10|14|30|60|90) (days?|minutes?|mins?|hours?|weeks?)$/.test(f));
    row(T, `${name} no invented figures`, invented.length <= 1, invented.length ? `invented: ${invented.slice(0, 5).join(', ')}` : `figures all from evidence; ${(text.match(/\[confirm/gi) ?? []).length} [confirm] placeholders`);
    const claimsCount = /\b(\d+) (of \d+ )?(interviewees|customers|merchants|users|accounts)\b/i.exec(noConfirm);
    const realN = ev.interviews;
    row(T, `${name} no invented interview counts`, !claimsCount || Number(claimsCount[1]) <= realN, claimsCount ? `"${claimsCount[0]}" vs ${realN} real interviews` : 'no counts claimed');
    // Through the app path: the draft lands on the feature and is capped as unedited
    const f = { id: 'feat1', title: '', status: 'draft' };
    productSlice(s).features.push(f);
    const r = autofillSpec(s, f, { draft: res.data });
    row(T, `${name} applied + capped`, r.source === 'LLM' && isUneditedAutofill(f), `source ${r.source}, weak ${r.weak}, cites ${r.cites.length}`);
  }
}

// ---------------------------------------------------------------------------
// world_news_item: market news written for THIS company's niche
// ---------------------------------------------------------------------------
async function newsCases() {
  const T = 'world_news_item';
  const cases = [['shelfbooks', 'competitor_price_cut'], ['shelfbooks', 'card_testing_attack'], ['shelfbooks', 'negative_public_review'], ['clausewise', 'enterprise_budget_freeze'], ['clausewise', 'ai_lab_feature_overlap'], ['clausewise', 'competitor_raise']];
  for (const [name, evId] of cases) {
    const s = (name === 'shelfbooks' ? shelfbooks : clausewise)();
    seedLandscape(s);
    const ev = eventById(evId);
    const inst = fireEvent(s, ev);
    if (!inst) { row(T, `${name}/${evId}`, false, 'event did not fire'); continue; }
    const W = ensureWorld(s);
    const n = W.news.find((x) => x.instId === inst.id);
    let call = null;
    const ctx = ctxOf(s);
    ctx.llm = { ...llm, ask: async (o) => { const r = await llm.ask(o); call = { system: o.system, prompt: o.prompt, mock: r.mock }; return r; } };
    await writeNews(ctx, n.id);
    const rival = inst.rivalId ? W.rivals.find((c) => c.id === inst.rivalId) : null;
    keep(T, { name, evId, rival: rival ? { name: rival.name, real: rival.real, price: rival.priceMonthly } : null, effects: inst.effects, headline: n.headline, source: n.source, body: n.body, mock: n.mock, prompt: call?.prompt });
    // grade: plausible for this market, consistent with the state (a cheap model reads the facts and the item)
    const facts = `${bizContextFacts(s)}\n${newsFacts(s, ev, rival)}\nRival in this event: ${rival ? `${rival.name} ($${rival.priceMonthly}/mo, ${rival.positioning})` : 'none'}\nDrawn effects: ${JSON.stringify(inst.effects)}`;
    const g = await llm.ask({ task: 'e2e_news_check', system: 'You check generated in-game news for a startup simulator. Be strict.', prompt: `FACTS:\n${facts}\n\nNEWS ITEM:\nHeadline: ${n.headline}\nSource: ${n.source}\n${n.body}\n\nAnswer: does the item fit this company's market and customers (plausible, specific), and does it state anything that contradicts the facts (wrong price, wrong product, invented company metrics such as MRR, customer counts or revenue)?`, schema: { type: 'object', additionalProperties: false, required: ['fitsMarket', 'contradiction', 'reason'], properties: { fitsMarket: { type: 'number', description: '0-1' }, contradiction: { type: 'boolean' }, reason: { type: 'string' } } }, temperature: 0, maxTokens: 250 });
    keep(T, { check: g.data });
    const words = String(n.body).split(/\s+/).length;
    row(T, `${name}/${evId} live`, n.mock === false && words >= 30 && words <= 260, `${words} words, mock ${n.mock}: "${n.headline}"`);
    row(T, `${name}/${evId} fits + consistent`, (g.data?.fitsMarket ?? 0) >= 0.6 && !g.data?.contradiction, `fit ${g.data?.fitsMarket}, contradiction ${g.data?.contradiction}: ${g.data?.reason}`);
    if (rival?.real) row(T, `${name}/${evId} simulated label`, /^Simulated:/.test(n.headline), n.headline);
    const all = `${n.headline} ${n.source} ${n.body}`;
    if (evId === 'competitor_price_cut' && rival) {
      const prices = [...all.matchAll(/\$(\d+(?:\.\d+)?)\s?(?:\/|per )\s?(?:mo|month)/gi)].map((m) => Number(m[1]));
      const newP = prices.filter((p) => Math.abs(p - rival.priceMonthly) > 0.5);
      row(T, `${name}/${evId} direction`, /free/i.test(all) ? newP.every((p) => p < rival.priceMonthly) : newP.length > 0 && newP.every((p) => p < rival.priceMonthly), `rival $${rival.priceMonthly}/mo; quoted ${prices.join(', ') || 'none'}`);
    }
    if (evId === 'competitor_raise' && rival?.lastRound) row(T, `${name}/${evId} round size`, all.includes(`$${(rival.lastRound / 1e6).toFixed(1)}M`) || all.includes(`$${Math.round(rival.lastRound / 1e6)}M`) || all.includes(`$${Math.round(rival.lastRound / 1e6)} million`), `state $${(rival.lastRound / 1e6).toFixed(1)}M: "${n.headline}"`);
    if (['enterprise_budget_freeze', 'negative_public_review'].includes(evId)) {
      const cos = (s.stripe.customers ?? []).map((c) => c.company || c.name);
      row(T, `${name}/${evId} real customer`, cos.some((c) => all.includes(c)), `customers ${cos.slice(0, 3).join(', ')}...; item: "${n.source}"`);
    }
  }
}
const bizContextFacts = (s) => {
  const c = s.company;
  const m = (() => { try { return computeMetrics(s); } catch { return null; } })();
  return `Company: ${c.name}, ${c.oneLiner}. ICP: ${c.icp}. Price: ${s.plans.map((p) => `$${p.price}/${p.interval}`).join(', ')}. ${m ? `MRR $${Math.round(m.mrr)}, ${m.customers} customers.` : ''} Today: ${fmtDate(s)}.`;
};

if (want('neg')) await negotiationCases();
if (want('rfp')) await rfpCases();
if (want('spec')) await specCases();
if (want('news')) await newsCases();

// ---------------------------------------------------------------------------
console.table(rows);
const cost = usage.reduce((a, u) => a + (u.usd ?? 0), 0);
console.log(`calls ${usage.length}, cost $${cost.toFixed(4)}`);
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', `negotiation${ONLY.length ? '-' + ONLY.join('-') : ''}.json`), JSON.stringify({ rows, raw, usage: { calls: usage.length, cost } }, null, 2));
