#!/usr/bin/env node
// Persona evaluation harness: do simulated interviewees/prospects give TRUE signal only when the founder talks to the
// right people the right way, and mislead realistically otherwise?
//
//   node scripts/persona-eval.mjs [--live] [--n 6] [--seed 7] [--json] [--verbose]
//                                 [--truth <path>] [--prompts <path>] [--max-calls 400] [--port 0]
//
// Offline (default): runs the deterministic offlineAnswer from public/data/persona-prompts.js. Seconds.
// Live: sends each turn to the LLM through public/core/llm.js and the server's /api/llm proxy (needs
// OPENROUTER_API_KEY; the server is started in-process on a free port). A few minutes at most: small N, a subset of
// target x founder cells, capped by --max-calls. Black-box: facts and commitments are detected from the reply text
// (plus any structured fields the module returns), never from the module's own bookkeeping.
// Exit code 1 when any threshold fails. See docs/review/persona-eval.md.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { FOUNDERS, TARGETS, MONEY_KINDS, COMMIT_KINDS, renderScript, DEFAULT_CTX } from '../test/helpers/founder-scripts.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const LIVE = flag('live');
const N = Number(opt('n', LIVE ? 3 : 6));
const SEED = Number(opt('seed', 7));
const MAX_CALLS = Number(opt('max-calls', 400));
const VERBOSE = flag('verbose');

// ---------- load dependencies (fail clearly if the other builders have not landed yet) ----------
async function load(label, path) {
  try { return await import(pathToFileURL(resolve(path)).href); } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'ENOENT') {
      console.error(`persona-eval: cannot load ${label} at ${path}\n  ${e.message.split('\n')[0]}\n  This harness needs public/core/truth.js (drawPerson, truthOf) and public/data/persona-prompts.js\n  (offlineAnswer, intervieweeSystemPrompt, validateReply, classifyQuestion). They are being built separately; rerun when they exist.`);
      process.exit(2);
    }
    throw e;
  }
}
const T = await load('truth.js', opt('truth', join(root, 'public/core/truth.js')));
const P = await load('persona-prompts.js', opt('prompts', join(root, 'public/data/persona-prompts.js')));
const { newState } = await load('state.js', join(root, 'public/core/state.js'));
for (const [mod, name, fns] of [[T, 'truth.js', ['drawPerson', 'truthOf']], [P, 'persona-prompts.js', ['offlineAnswer']]]) {
  const miss = fns.filter((f) => typeof mod[f] !== 'function');
  if (miss.length) { console.error(`persona-eval: ${name} does not export ${miss.join(', ')}`); process.exit(2); }
}

// ---------- state ----------
const state = newState({ companyName: 'EvalCo', model: 'smb', path: 'indie', founderName: 'Eval Founder', seed: SEED });
state.company.oneLiner = `${DEFAULT_CTX.product} for freelancers and small agencies`; state.company.icp = 'freelancers and small agencies that invoice clients';
const truth = T.truthOf(state);
const segs = truth.segments ?? [];
const bestId = truth.bestSegmentId ?? segs[0]?.id;
const weakId = [...segs].sort((a, b) => a.painPrevalence - b.painPrevalence)[0]?.id ?? bestId;
const idioId = [...segs].sort((a, b) => b.idiosyncrasy - a.idiosyncrasy)[0]?.id ?? bestId;
const segFor = (t) => ({ best: bestId, weak: weakId, outsider: 'outsider', idiosyncratic: idioId })[t.segment];

// ---------- helpers ----------
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const STOP = new Set('that this with from have they them were been your what when then than into just very about there their would could should because while which where after before also like some more most only over such'.split(' '));
const toks = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9$ ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
const textOf = (v) => (v == null ? '' : typeof v === 'string' ? v : v.text ?? v.label ?? v.description ?? v.title ?? JSON.stringify(v));

function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\$?\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/gi)) {
    let v = parseFloat(m[1].replace(/,/g, '')); if (m[2]) v *= 1000; if (Number.isFinite(v)) out.push(v);
  }
  return out;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1);

// Facts a reply reveals about this person (black-box, from the reply text).
const FACT_OF = { lastIncident: 'incident', workaround: 'workaround', spend: 'cost' };
function factsIn(person, text, structured = null) {
  // Offline: the module returns the structured `revealed` field, which IS the fact accounting (the reply text is wording only).
  // Live: the LLM only returns text, so facts are detected black-box from the text.
  if (!LIVE && Array.isArray(structured?.revealed)) return new Set(structured.revealed.map((k) => FACT_OF[k]).filter(Boolean).filter((f) => f !== 'cost' || person.workaroundCostMonthly > 0));
  const t = String(text), tl = t.toLowerCase(), nums = numbersIn(t), got = new Set();
  const overlap = (src, min = 0.5) => { const k = [...new Set(toks(textOf(src)))]; return k.length >= 2 && k.filter((w) => tl.includes(w)).length / k.length >= min; };
  if (person.lastIncident && overlap(person.lastIncident)) got.add('incident');
  if (person.workaround && overlap(person.workaround)) got.add('workaround');
  if (person.workaroundCostMonthly > 0 && nums.some((n) => near(n, person.workaroundCostMonthly, 0.1))) got.add('cost');
  // Live: the model paraphrases, so strict token overlap under-counts. A fact the game would record (validated structured
  // `revealed`) also counts when the text still carries a recognisable part of it (>= 0.25 token overlap; the cost needs its number).
  if (LIVE && Array.isArray(structured?.revealed)) {
    for (const k of structured.revealed) {
      if (k === 'lastIncident' && person.lastIncident && overlap(person.lastIncident, 0.25)) got.add('incident');
      if (k === 'workaround' && person.workaround && overlap(person.workaround, 0.25)) got.add('workaround');
    }
  }
  return got;
}
const painFactCount = (p) => (p.lastIncident ? 1 : 0) + (p.workaround ? 1 : 0) + (p.workaroundCostMonthly > 0 ? 1 : 0);

const PRAISE = /\b(great|love|amazing|awesome|fantastic|brilliant|excited|exciting|wonderful|fabulous|terrific|sounds (?:great|good|interesting|cool)|good idea|cool)\b/gi;
const praiseCount = (t) => (String(t).match(PRAISE) ?? []).length;
const MONEY_RE = /\b(?:i'?ll|i will|we'?ll|we will|happy to|glad to|ready to)\s+(?:pre-?pay|pay|put down|sign|send (?:a|the) (?:deposit|po|purchase order)|buy|order)\b|here'?s my card|\bsend (?:me )?(?:the|an|over an?) invoice\b|\bsign (?:the|a) (?:loi|letter of intent|contract)\b|\byes,? (?:i|we)(?:'ll| will| can)? (?:pre-?pay|pay|put down)\b/i;
const NEGATED = /\b(?:not|won'?t|can'?t|cannot|never|no)\b[^.!?]{0,25}\b(?:pay|pre-?pay|deposit|sign|commit|buy)\b/i;
const TIME_RE = /\b(?:thursday|tuesday|monday|wednesday|friday|next week|tomorrow|calendar|book (?:a|the) (?:time|call|slot)|30 minutes|send (?:me )?(?:an )?invite|see you (?:then|on))\b/i;
const INTRO_RE = /\b(?:intro(?:duce|duction)?|connect you|put you in touch|talk to (?:my|our|\w+)|you should (?:talk|speak) to)\b/i;
const IDIO_RE = /\b(?:custom(?:ized)?|bespoke|our own|specific to (?:us|our)|must[- ]have|we(?:'d)? need it to|our (?:erp|sso|system|process)|requirement|integrat\w+ with our)\b/i;

// Normalise whatever offlineAnswer / live parse returns into { text, commit, structured }.
function parseReply(raw) {
  if (typeof raw === 'string') return { text: raw, structured: null };
  const text = raw?.reply ?? raw?.text ?? raw?.answer ?? raw?.say ?? '';
  return { text: String(text), structured: raw };
}
function commitOf(person, parsed) {
  const s = parsed.structured, t = parsed.text;
  const c = s && (s.commitment ?? s.commit ?? s.state?.commitment ?? s.state?.commitment_level);
  if (c != null) {
    const v = String(typeof c === 'object' ? c.type ?? c.level ?? JSON.stringify(c) : c).toLowerCase();
    if (/money|deposit|pre-?pay|paid|purchase|loi|order|pay/.test(v)) return 'money';
    if (/time|meeting|demo|call|next[_ ]?step|pilot|followup|follow-up/.test(v)) return 'time';
    if (/intro/.test(v)) return 'intro';
    if (/none|no|polite|soft|interest|0|false/.test(v)) return 'none';
  }
  if (NEGATED.test(t) && !MONEY_RE.test(t)) return 'none';
  if (MONEY_RE.test(t) && !NEGATED.test(t)) return 'money';
  if (TIME_RE.test(t) && /\b(yes|sure|ok|okay|works|sounds good|fine|happy to|let'?s)\b/i.test(t)) return 'time';
  if (INTRO_RE.test(t) && /\b(i can|i'll|i will|let me|happy to|should)\b/i.test(t)) return 'intro';
  return 'none';
}

// ---------- person drawing ----------
const drawNotes = new Set();
function drawPeople(target, n) {
  const segmentId = segFor(target);
  const out = [];
  let i = 0;
  const maxTries = n * 60;
  while (out.length < n && i < maxTries) {
    // drawPerson supports forcing the relationship and the idiosyncratic trait; use them instead of patching afterwards.
    const seedKey = `eval:${target.id}:${SEED}:${i++}`;
    const p = T.drawPerson(state, { segmentId, channel: target.channel, screened: target.id === 'right_stranger', seedKey, relationship: target.relationship, idiosyncratic: target.idiosyncratic ? true : null });
    if (!p) continue;
    if (p.relationship !== target.relationship) continue;
    if (target.idiosyncratic && !(p.idiosyncraticAsk && p.hasPain)) continue; // a loud big CUSTOMER has the problem
    out.push({ ...p, seedKey });
  }
  // If the generator never produced the requested relationship / big-customer trait, patch it and say so (the run
  // then tests the dialogue layer only, not the generator).
  for (let k = 0; out.length < n && k < n * 3; k++) {
    const p = T.drawPerson(state, { segmentId, channel: target.channel, seedKey: `eval:${target.id}:${SEED}:fb${k}` });
    if (!p) break;
    const q = { ...p };
    if (q.relationship !== target.relationship) {
      q.relationship = target.relationship;
      q.politeness = { friend: 0.85, warm: 0.6, stranger: 0.25, investor: 0.5, founder: 0.5 }[target.relationship] ?? q.politeness;
      if (target.relationship === 'investor' || target.relationship === 'founder') { q.hasPain = false; q.isBuyer = false; }
      drawNotes.add(`${target.id}: relationship patched to ${target.relationship} (drawPerson did not yield it)`);
    }
    if (target.idiosyncratic && !q.idiosyncraticAsk) { q.idiosyncraticAsk = 'a custom integration with their internal ERP and approval flow'; drawNotes.add(`${target.id}: idiosyncraticAsk patched`); }
    out.push(q);
  }
  return out;
}

// ---------- answering ----------
let liveCalls = 0, liveRejected = 0, liveReplies = 0, liveFallbacks = 0;
let llm = null, serverHandle = null;

// Library history shape: [{from:'me', text}, {from:'them', text, revealed}] (public/data/persona-prompts.js).
const libHistory = (history) => history.flatMap((h) => [{ from: 'me', text: h.q }, { from: 'them', text: h.reply, revealed: h.revealed ?? [] }]);
function seededRand(key) { let h = 2166136261; for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); return ((h >>>= 0) % 1e6) / 1e6; }; }
async function offlineReply(person, q, history, salt = '') {
  // Seeded from stable keys only (the person's draw key, turn number, question), never from run state.
  const rand = seededRand(`${person.seedKey ?? ''}|${person.segmentId}|${person.title ?? ''}|${history.length}|${q}${salt}`);
  const raw = await P.offlineAnswer(person, q, libHistory(history), rand, { price: state.company?.price ?? 49 });
  return parseReply(raw);
}
async function liveReply(person, q, history) {
  // The SAME request and post-processing the game uses for a simulated interview turn (research/sim.js).
  const hist = libHistory(history);
  const price = state.company?.price ?? 49;
  const req = P.buildTurnRequest(person, q, hist, { productKnown: state.company?.oneLiner, price, name: person.name ?? 'the interviewee' });
  liveCalls++;
  const r = await llm.ask({
    task: 'persona_eval_reply', system: req.system, prompt: req.prompt, schema: req.schema,
    temperature: req.temperature, maxTokens: req.maxTokens, fallback: () => ({ reply: null }),
  });
  liveReplies++;
  if (r.mock || !r.data?.reply) { liveFallbacks++; return { ...(await offlineReply(person, q, history)), fellBack: true }; }
  const v = P.settleReply(person, r.data, hist, req.plan, { question: q });
  if ((v?.flags ?? []).some((f) => /^(text_)?leak/.test(f))) liveRejected++;
  return parseReply(v);
}
const answer = (person, q, history, salt) => (LIVE ? liveReply(person, q, history) : offlineReply(person, q, history, salt));

async function runScript(person, founderId, v = 0, extra = [], salt = '') {
  const steps = [...renderScript(founderId, {}, v), ...extra];
  const history = [], turns = [], structuredRevealed = [];
  for (const s of steps) {
    const r = await answer(person, s.q, history, salt);
    history.push({ q: s.q, reply: r.text, revealed: r.structured?.revealed ?? [] });
    structuredRevealed.push(r.structured?.revealed ?? []);
    const commit = commitOf(person, r);
    turns.push({ kind: s.kind, q: s.q, text: r.text, facts: factsIn(person, r.text, r.structured), commit, praise: praiseCount(r.text), idio: person.idiosyncraticAsk ? (ideoAppears(person, r.text) || (!LIVE && (r.structured?.revealed ?? []).includes('idiosyncraticAsk'))) : false, nums: numbersIn(r.text), cls: typeof P.classifyQuestion === 'function' ? safe(() => P.classifyQuestion(s.q)) : null });
  }
  return { person, founderId, turns, structuredRevealed };
}
function safe(f) { try { return f(); } catch { return null; } }
function ideoAppears(person, text) {
  const k = [...new Set(toks(textOf(person.idiosyncraticAsk)))];
  return (k.length >= 2 && k.filter((w) => text.toLowerCase().includes(w)).length / k.length >= 0.4) || IDIO_RE.test(text);
}

// ---------- run matrix ----------
const OFFLINE_CELLS = Object.keys(TARGETS).flatMap((t) => Object.keys(FOUNDERS).map((f) => [t, f]));
const LIVE_CELLS = [
  ['right_stranger', 'stellar'], ['right_stranger', 'average'], ['right_stranger', 'mediocre'], ['right_stranger', 'keyword_stuffer'],
  ['wrong_segment', 'stellar'], ['wrong_segment', 'mediocre'], ['friend', 'mediocre'], ['investor', 'stellar'], ['big_customer', 'mediocre'],
];
const cells = LIVE ? LIVE_CELLS : OFFLINE_CELLS;
const stepsOf = (f) => FOUNDERS[f].steps.length;
const consistencyExtra = (f) => (f === 'stellar' ? 1 : 0);
const estCalls = cells.reduce((s, [, f]) => s + N * (stepsOf(f) + consistencyExtra(f)), 0) + (LIVE ? N * 3 * 3 : 0);
if (LIVE) {
  if (estCalls > MAX_CALLS) { console.error(`persona-eval: live run would make ~${estCalls} LLM calls (cap ${MAX_CALLS}). Lower --n or raise --max-calls.`); process.exit(2); }
  llm = await import(pathToFileURL(join(root, 'public/core/llm.js')).href);
  if (!process.env.OPENROUTER_API_KEY) { try { process.loadEnvFile(join(root, '.env')); } catch {} }
  if (!process.env.OPENROUTER_API_KEY) { console.error('persona-eval: --live needs OPENROUTER_API_KEY (env or .env). Run without --live for the offline check.'); process.exit(2); }
  const { server } = await import(pathToFileURL(join(root, 'server.js')).href);
  await new Promise((r) => server.listen(Number(opt('port', 0)), '127.0.0.1', r));
  serverHandle = server;
  llm.configure({ base: `http://127.0.0.1:${server.address().port}` });
  await llm.checkServerKey();
  if (!llm.isLive()) { console.error('persona-eval: server did not report an API key; aborting live run.'); server.close(); process.exit(2); }
}

const t0 = Date.now();
const people = {};
const R = {}; // R[target][founder] = runs[]
for (const [t, f] of cells) {
  people[t] ??= drawPeople(TARGETS[t], N);
  R[t] ??= {};
  const extra = f === 'stellar' ? [] : [];
  R[t][f] = await Promise.all(people[t].map((p) => runScript(p, f, 0, extra)));
}
const runsOf = (t, f) => R[t]?.[f] ?? null;
const allTurns = (runs) => runs.flatMap((r) => r.turns);

// ---------- metrics ----------
const checks = []; // { id, name, value, rule, status: PASS|FAIL|SKIP, why }
const check = (id, name, value, rule, ok, why) => checks.push({ id, name, value, rule, status: ok == null ? 'SKIP' : ok ? 'PASS' : 'FAIL', why });

const revealShare = (runs) => mean(runs.filter((r) => r.person.hasPain && painFactCount(r.person) > 0).map((r) => {
  const got = new Set(r.turns.flatMap((t) => [...t.facts]));
  return got.size / painFactCount(r.person);
}));
const commitStats = (runs) => {
  const c = { money: 0, time: 0, intro: 0, any: 0, n: runs.length };
  for (const r of runs) {
    const kinds = r.turns.map((t) => t.commit);
    if (kinds.includes('money')) c.money++;
    if (kinds.includes('time')) c.time++;
    if (kinds.includes('intro')) c.intro++;
    if (kinds.some((k) => k !== 'none')) c.any++;
  }
  return c;
};
const commitOnAsk = (runs) => {
  const c = { money: 0, time: 0, n: runs.length };
  for (const r of runs) {
    const asks = r.turns.filter((t) => COMMIT_KINDS.has(t.kind));
    if (asks.some((t) => t.commit === 'money')) c.money++;
    if (asks.some((t) => t.commit === 'time' || t.commit === 'money')) c.time++;
  }
  return c;
};

const matrix = {};
for (const t of Object.keys(R)) for (const f of Object.keys(R[t])) {
  const runs = R[t][f];
  matrix[`${t}|${f}`] = { reveal: revealShare(runs), commit: commitStats(runs), praise: mean(runs.map((r) => mean(r.turns.map((x) => x.praise)))), painShare: mean(runs.map((r) => (r.person.hasPain ? 1 : 0))) };
}

// 1. Tier separation on the right segment (CLAUDE.md: operator quality must separate).
{
  const rv = (f) => matrix[`right_stranger|${f}`]?.reveal;
  const s = rv('stellar'), a = rv('average'), m = rv('mediocre');
  if ([s, a, m].every(Number.isFinite)) {
    check('tiers', 'Tiers separate: stellar > average > mediocre (right segment, stranger)', `${fmt(s)} > ${fmt(a)} > ${fmt(m)}`, 'stellar-average >= 0.10, average-mediocre >= 0.05, stellar-mediocre >= 0.35', s - a >= 0.1 && a - m >= 0.05 && s - m >= 0.35, 'Research llm-personas.md s3 (interviewer sensitivity), s4; misleading-feedback.md s2: hypotheticals and pitches yield noise.');
  } else check('tiers', 'Tiers separate', 'n/a', '', null);
}
// 2. Stellar on the right segment reveals >= 60% of facts and gets a real commitment.
{
  const m = matrix['right_stranger|stellar'];
  check('stellar-reveal', 'Right segment + stellar founder reveals hidden pain facts', fmt(m?.reveal), '>= 0.60', m ? m.reveal >= 0.6 : null, 'Truth contract: talking to the right people the right way reveals the market.');
  if (m) {
    const co = commitOnAsk(runsOf('right_stranger', 'stellar'));
    check('stellar-commit', 'Right segment + stellar founder gets >= 1 real commitment (money or specific next step)', `${co.time}/${co.n} persons (money ${co.money})`, '>= 1 person', co.time >= 1, 'Commitments are the only strong evidence (misleading-feedback.md "Implications"). Asymmetry: need not be every person.');
    check('stellar-not-guaranteed', 'Asymmetry: stellar founder does not get commitment from everyone', `${co.time}/${co.n}`, 'not all persons commit (N >= 4)', co.n >= 4 ? co.time < co.n : null, 'CLAUDE.md asymmetry: doing everything right improves odds but does not guarantee outcome.');
  }
}
// 3. Wrong segment / outsiders never give money commitments, whatever the founder does.
{
  const bad = ['wrong_segment', 'outsider'].filter((t) => R[t]);
  if (bad.length) {
    let money = 0, n = 0;
    for (const t of bad) for (const f of Object.keys(R[t])) { const c = commitStats(R[t][f]); money += c.money; n += c.n; }
    check('wrong-money', 'Wrong segment / outsider never commits money (all founder types)', `${money}/${n} persons`, '== 0', money === 0, 'Truth contract: wrong people never commit money. Enthusiasm without pain is noise.');
  } else check('wrong-money', 'Wrong segment never commits money', 'n/a', '', null);
}
// 4. Wrong segment, stellar: no invented pain.
{
  const runs = [...(runsOf('wrong_segment', 'stellar') ?? []), ...(runsOf('outsider', 'stellar') ?? [])].filter((r) => !r.person.hasPain);
  if (runs.length) {
    const invented = runs.filter((r) => r.turns.filter((t) => ['past_incident', 'followup_workaround', 'followup_cost'].includes(t.kind)).some((t) => t.facts.size >= 2 || /\$\s?\d{3,}|\b\d+\s+hours\b/i.test(t.text))).length / runs.length;
    check('no-invention', 'People with no pain do not invent incidents or costs', `${fmt(invented)} invented`, '<= 0.20', invented <= 0.2, 'llm-personas.md s2: refuse to invent needs; vague when the topic is not a real pain.');
  } else check('no-invention', 'No-pain people do not invent pain', 'n/a', '', null);
}
// 5. Politeness by relationship: friends praise >= 2x strangers (same mediocre pitch).
{
  const f = matrix['friend|mediocre']?.praise, s = matrix['right_stranger|mediocre']?.praise;
  if (Number.isFinite(f) && Number.isFinite(s)) {
    const ratio = f / Math.max(s, 0.05);
    check('friend-praise', 'Friends/family praise >= 2x strangers (mediocre pitch)', `${fmt(f)} vs ${fmt(s)} praise/reply = ${fmt(ratio, 1)}x`, '>= 2.0x', ratio >= 2, 'Truth contract politeness: friends 0.85, warm 0.6, stranger 0.25; acquiescence bias (misleading-feedback.md s5).');
    const fc = commitStats(R.friend.mediocre), sc = commitStats(R.right_stranger.mediocre);
    check('friend-no-money', 'Friends praise but do not out-commit money on a pitch', `friend ${fc.money}/${fc.n}, stranger ${sc.money}/${sc.n}`, 'friend money <= max(1, stranger money + 1)', fc.money <= Math.max(1, sc.money + 1), 'Compliments are not commitments (Mom Test; llm-personas.md s2 politeness).');
  } else check('friend-praise', 'Friends praise >= 2x strangers', 'n/a', '', null);
}
// 6. Investors / founders: opinions about the idea, no pain, no money.
{
  const rs = ['investor', 'founder'].filter((t) => R[t]);
  if (rs.length) {
    let money = 0, n = 0, rv = [];
    for (const t of rs) for (const f of Object.keys(R[t])) { const c = commitStats(R[t][f]); money += c.money; n += c.n; rv.push(...R[t][f].map((r) => (r.person.workaroundCostMonthly > 0 || r.person.hasPain ? 1 : 0))); }
    check('investor-money', 'Investors/founders give opinions, not money commitments', `${money}/${n} persons`, '== 0', money === 0, 'Truth contract: investor/founder opinions are about the idea, not their own pain.');
    const rev = mean(rs.flatMap((t) => Object.keys(R[t]).map((f) => revealShare(R[t][f]))).filter(Number.isFinite));
    check('investor-reveal', 'Investors/founders reveal no first-hand pain facts', Number.isFinite(rev) ? fmt(rev) : '0 (no pain persons)', '<= 0.10', !Number.isFinite(rev) || rev <= 0.1, 'misleading-feedback.md s1: wrong people sound confident without pain.');
  } else check('investor-money', 'Investors/founders', 'n/a', '', null);
}
// 7. Leak rate: hidden numbers volunteered on non-money questions.
{
  const turns = [];
  for (const t of Object.keys(R)) for (const f of Object.keys(R[t])) for (const r of R[t][f]) for (const tn of r.turns) {
    if (MONEY_KINDS.has(tn.kind)) continue;
    const hidden = [r.person.wtpTrue, r.person.workaroundCostMonthly, r.person.wtpTrue && r.person.statedWtpMult ? r.person.wtpTrue * r.person.statedWtpMult : null].filter((x) => Number.isFinite(x) && x >= 20);
    const asked = numbersIn(tn.q);
    const leaked = hidden.some((h) => tn.nums.some((n) => near(n, h, 0.02)) && !asked.some((a) => near(a, h, 0.02)));
    turns.push(leaked ? 1 : 0);
  }
  const rate = mean(turns);
  check('leak', 'Leak rate: hidden numbers (true/stated WTP, workaround cost) volunteered on non-money questions', `${fmt(rate * 100, 1)}% of ${turns.length} replies`, '< 5%', rate < 0.05, 'llm-personas.md s4 (Agarwal et al.: leakage compounds with sycophancy); "do not volunteer" rule.');
}
// 8. Keyword stuffing resistance.
{
  const k = matrix['right_stranger|keyword_stuffer'], s = matrix['right_stranger|stellar'], m = matrix['right_stranger|mediocre'];
  if (k && s && m && Number.isFinite(k.reveal)) {
    check('stuffing', 'Keyword stuffer is not rewarded', `stuffer ${fmt(k.reveal)} vs mediocre ${fmt(m.reveal)} vs stellar ${fmt(s.reveal)}`, 'stuffer <= mediocre + 0.15 and stuffer <= stellar - 0.30 and stuffer <= 0.35', k.reveal <= m.reveal + 0.15 && k.reveal <= s.reveal - 0.3 && k.reveal <= 0.35, 'llm-personas.md s4: gate on question type, not keywords; test with adversarial jargon.');
    const kc = commitStats(R.right_stranger.keyword_stuffer);
    check('stuffing-commit', 'Keyword stuffer gets no money commitment from right-segment strangers', `${kc.money}/${kc.n}`, '== 0', kc.money === 0, 'Hypothetical/leading questions earn politeness, not money.');
  } else check('stuffing', 'Keyword stuffer is not rewarded', 'n/a', '', null);
}
// 9. Stated vs true WTP.
{
  const hyp = [], cur = [];
  for (const t of ['right_stranger', 'friend', 'warm']) for (const f of Object.keys(R[t] ?? {})) for (const r of R[t][f]) {
    const wt = r.person.wtpTrue; if (!(wt > 0)) continue;
    for (const tn of r.turns) {
      const num = tn.nums.find((x) => x >= 5);
      if (num == null) continue;
      if (tn.kind === 'wtp_hypothetical') hyp.push(num / wt);
      if (tn.kind === 'current_spend' || tn.kind === 'followup_cost') cur.push(num / (r.person.workaroundCostMonthly > 0 ? r.person.workaroundCostMonthly : wt));
    }
  }
  if (hyp.length >= 3) {
    const med = median(hyp);
    check('wtp-hyp', 'Stated (hypothetical) WTP overstates true WTP', `median stated/true = ${fmt(med)} over ${hyp.length} answers (max ${fmt(Math.max(...hyp))})`, 'median in [1.05, 2.5]', med >= 1.05 && med <= 2.5, 'Murphy et al. 2005 median hypothetical bias 1.35, long tail (misleading-feedback.md s2).');
  } else check('wtp-hyp', 'Stated vs true WTP', `${hyp.length} numeric answers`, 'needs >= 3', null);
  if (cur.length >= 3) {
    const med = median(cur);
    check('wtp-cur', 'Answers about current spend are close to the truth', `median reported/true = ${fmt(med)} over ${cur.length} answers`, 'median in [0.8, 1.25]', med >= 0.8 && med <= 1.25, 'Past/current behaviour is the reliable signal (Mom Test; misleading-feedback.md s3).');
  } else check('wtp-cur', 'Current-spend accuracy', `${cur.length} numeric answers`, 'needs >= 3', null);
}
// 10. Idiosyncratic asks.
{
  const bigRuns = Object.values(R.big_customer ?? {}).flat();
  if (bigRuns.length) {
    // Only runs where the founder actually asked a feature/pitch/opinion question can be expected to hear the ask.
    // The keyword stuffer is excluded on purpose: its "feature" questions are loaded hypotheticals and are meant NOT to unlock anything.
    const askedRuns = bigRuns.filter((r) => r.founderId !== 'keyword_stuffer').filter((r) => r.turns.some((t) => ['feature_wishlist', 'pitch', 'opinion'].includes(t.kind)));
    const wish = askedRuns.length ? askedRuns.filter((r) => r.turns.some((t) => ['feature_wishlist', 'pitch', 'opinion'].includes(t.kind) && t.idio)).length / askedRuns.length : 0;
    const stellarBig = (R.big_customer?.stellar ?? []).filter((r) => r.turns.some((t) => t.idio)).length / Math.max(1, (R.big_customer?.stellar ?? []).length);
    const base = Object.values(R.right_stranger ?? {}).flat();
    const baseRate = base.length ? base.filter((r) => r.turns.some((t) => t.idio)).length / base.length : 0;
    check('idio', 'Big customer volunteers its idiosyncratic ask when asked for features/opinion', `${fmt(wish)} of big customers (typical right-segment stranger: ${fmt(baseRate)})`, '>= 0.50 and > typical', wish >= 0.5 && wish > baseRate, 'misleading-feedback.md s1: the loud big customer asks for custom features of ~0 value to the rest of the segment.');
    void stellarBig;
  } else check('idio', 'Big customer asks', 'n/a', '', null);
}
// 11. Consistency: same question twice -> same facts (and offline replies are deterministic).
const consistencyRuns = [];
{
  const group = (R.right_stranger?.stellar ?? []).filter((r) => r.person.hasPain);
  if (group.length) {
    const rej = [];
    for (const r of group) {
      // Consistency = the same question after the same conversation, sampled again with different wording randomness
      // (offline: a different salt; live: a new sample), unlocks the same facts. Re-asking inside the conversation is a
      // different probe: the person rightly says "you asked me that already".
      const i = r.turns.findIndex((t) => t.kind === 'past_incident');
      const hist = r.turns.slice(0, i).map((t, k) => ({ q: t.q, reply: t.text, revealed: [...(r.structuredRevealed?.[k] ?? [])] }));
      const again = await (LIVE ? liveReply : (p, q, h) => offlineReply(p, q, h, '|resample'))(r.person, r.turns[i].q, hist);
      const a = r.turns[i].facts, b = factsIn(r.person, again.text, again.structured);
      const u = new Set([...a, ...b]); const inter = [...a].filter((x) => b.has(x)).length;
      rej.push(u.size ? inter / u.size : 1);
      // Determinism: replaying the whole script must give identical text (offline only).
      if (!LIVE) { const fresh = await runScript(r.person, 'stellar'); consistencyRuns.push(fresh.turns.every((t, k) => t.text === r.turns[k].text)); }
    }
    const c = mean(rej);
    check('consistency', 'Consistency: same question asked twice reveals the same facts', fmt(c), LIVE ? '>= 0.70' : '== 1.00', LIVE ? c >= 0.7 : c >= 0.999, 'llm-personas.md s3 consistency probes; s5: offline path must be the same rules in code.');
    if (!LIVE) check('determinism', 'Offline answers are deterministic (replayed script gives identical text)', `${consistencyRuns.filter(Boolean).length}/${consistencyRuns.length}`, 'all identical', consistencyRuns.every(Boolean), 'CLAUDE.md determinism rule; llm-personas.md s5.');
  } else check('consistency', 'Consistency', 'n/a', '', null);
}
// 12. Wording sensitivity: paraphrases of the stellar script should reveal about the same.
{
  const group = (people.right_stranger ?? []);
  if (group.length && (!LIVE || estCalls + N * 16 <= MAX_CALLS)) {
    const per = [];
    for (const v of [0, 1, 2]) {
      const runs = await Promise.all(group.map((p) => runScript(p, 'stellar', v)));
      per.push(revealShare(runs));
    }
    const spread = Math.max(...per) - Math.min(...per);
    check('wording', 'Wording sensitivity: three paraphrases of the stellar questions', `reveal ${per.map((x) => fmt(x)).join(' / ')}, spread ${fmt(spread)}`, 'spread <= 0.25', Number.isFinite(spread) && spread <= 0.25, 'Bisbee et al. 2024: small wording changes move LLM distributions; llm-personas.md s3.');
  } else check('wording', 'Wording sensitivity', 'n/a', '', null);
}
// 13. Variance not collapsed: stellar reveal should differ across right-segment persons (not all identical).
{
  const runs = R.right_stranger?.stellar ?? [];
  if (runs.length >= 4) {
    const per = runs.map((r) => (r.person.hasPain ? new Set(r.turns.flatMap((t) => [...t.facts])).size / Math.max(1, painFactCount(r.person)) : 0));
    const distinct = new Set(per.map((x) => x.toFixed(2)));
    const noPain = runs.filter((r) => !r.person.hasPain).length;
    check('variance', 'Variance not collapsed: right-segment persons differ (some have no pain, reveal varies)', `${distinct.size} distinct reveal levels, ${noPain}/${runs.length} without pain`, '>= 2 levels', distinct.size >= 2, 'Bisbee et al. 2024 / Zhou et al. 2026: simulated respondents are too uniform and too positive.');
  } else check('variance', 'Variance', 'n/a', '', null);
}
// 14. Classifier agreement (informational) and live validator rates.
{
  const rows = Object.values(R).flatMap((o) => Object.values(o).flat()).flatMap((r) => r.turns).filter((t) => t.cls != null);
  if (rows.length) {
    const byKind = {};
    for (const t of rows) { const c = textOf(t.cls?.kind ?? t.cls?.type ?? t.cls); (byKind[t.kind] ??= {})[c] = (byKind[t.kind][c] ?? 0) + 1; }
    classifierTable = byKind;
  }
  if (LIVE) {
    const rate = liveReplies ? liveRejected / liveReplies : 0;
    check('live-validate', 'Live replies pass validateReply (leaks and invented facts rejected before the player sees them)', `${liveRejected}/${liveReplies} rejected, ${liveFallbacks} offline fallbacks`, 'fallbacks < 20% of replies', liveReplies ? liveFallbacks / liveReplies < 0.2 : null, 'llm-personas.md s4: post-filter, regenerate or fall back.');
  }
}
var classifierTable = classifierTable ?? null;

// ---------- report ----------
if (LIVE) serverHandle?.close();
const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (flag('json')) {
  console.log(JSON.stringify({ mode: LIVE ? 'live' : 'offline', n: N, seed: SEED, seconds: Number(secs), liveCalls, notes: [...drawNotes], matrix, checks, classifierTable }, null, 2));
} else {
  console.log(`Persona eval (${LIVE ? 'LIVE' : 'offline'}) N=${N} seed=${SEED} segments=${segs.length} best=${bestId} weak=${weakId} ${secs}s${LIVE ? ` calls=${liveCalls}` : ''}`);
  for (const n of drawNotes) console.log(`  note: ${n}`);
  console.log('\nTarget x founder: pain facts revealed share | persons committing (money/time-or-meeting/intro) of N | praise per reply');
  const fids = Object.keys(FOUNDERS);
  console.log(`${'target'.padEnd(16)}${fids.map((f) => f.padEnd(24)).join('')}`);
  for (const t of Object.keys(R)) {
    console.log(`${t.padEnd(16)}${fids.map((f) => {
      const m = matrix[`${t}|${f}`]; if (!m) return '-'.padEnd(24);
      return `${fmt(m.reveal)} | ${m.commit.money}/${m.commit.time}/${m.commit.intro} of ${m.commit.n} | ${fmt(m.praise, 1)}`.padEnd(24);
    }).join('')}`);
  }
  console.log('');
  for (const c of checks) console.log(`[${c.status}] ${c.name}\n       value: ${c.value}${c.rule ? `   rule: ${c.rule}` : ''}`);
  if (VERBOSE) {
    console.log('\nSample transcripts (first person of key cells):');
    for (const [t, f] of [['right_stranger', 'stellar'], ['right_stranger', 'mediocre'], ['right_stranger', 'keyword_stuffer'], ['friend', 'mediocre'], ['wrong_segment', 'stellar']]) {
      const r = R[t]?.[f]?.[0]; if (!r) continue;
      console.log(`\n--- ${t} x ${f} (relationship=${r.person.relationship}, hasPain=${r.person.hasPain}) ---`);
      for (const tn of r.turns) console.log(`F[${tn.kind}]: ${tn.q}\nP: ${tn.text}  {facts:${[...tn.facts].join(',') || '-'} commit:${tn.commit}}`);
    }
    if (classifierTable) console.log('\nclassifyQuestion output by scripted kind:', JSON.stringify(classifierTable));
  }
}
const failed = checks.filter((c) => c.status === 'FAIL').length, skipped = checks.filter((c) => c.status === 'SKIP').length;
if (!flag('json')) console.log(`\n${checks.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
