// Demo video for the landing page and sales calls. The founder writes the script and chooses how it is produced
// (scrappy screen recording vs a polished edit). The script decides the quality; polish only amplifies a good
// script (it can't rescue a bad one). An LLM judges the script; offline, a deterministic heuristic does.
// Effect sizes are [design] game assumptions. Vendors' claims of +20-80% from landing-page video are marketing
// numbers, so the game keeps this modest.

import { ensureMarket, setModifier, shippedFeatures } from '../../core/market.js';
import { logMistake } from '../../core/operator.js';
import { clamp, words, uid } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { rubricText } from '../../core/rubric.js';
import { rubricSchema, cleanRubric, to5, to10 } from '../../core/rubric-schema.js';
import { DEMO_RUBRIC } from './rubric.js';

export const DEMO = {
  styles: {
    loom: { label: 'Scrappy screen recording', hours: 1.5, cap: 0.06, factor: 0.9 },     // one take, no edit [design]
    standard: { label: 'Cleaned-up recording', hours: 4, cap: 0.08, factor: 1 },          // trim, captions [design]
    polished: { label: 'Polished edit (voiceover, motion)', hours: 12, cap: 0.1, factor: 1.08 }, // [design]
  },
  wpm: 150,
  idealSeconds: [60, 120],  // landing demo sweet spot [design]
  tooLongSeconds: 240,
  minQuality: 0.45,         // below this the video doesn't help [design]
  salesCap: 0.03,           // max conversion lift on sales demos/calls [design]
  staleFeatures: 3,         // features shipped since recording before the demo is out of date [design]
};

export const DEMO_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['rubric', 'notes'],
  properties: {
    rubric: rubricSchema(DEMO_RUBRIC),
    notes: { type: 'array', items: { type: 'string' }, description: 'Up to 4 notes, max 35 words each: as the prospect watching: your reaction, quoting the line that lost you' },
  },
};

/** Rubric (1-5) <-> the 1-10 fields scriptQuality reads (jargon: 10 = awful). Fills whichever side is missing. */
export function normalizeDemoJudge(d) {
  if (d.rubric) {
    const r = cleanRubric(d.rubric, DEMO_RUBRIC);
    return { ...d, rubric: r, hook: to10(r.hook), problemFirst: to10(r.problem_first), showsProduct: to10(r.shows_product), outcome: to10(r.outcome), cta: to10(r.cta), jargon: 11 - to10(r.plain_language) };
  }
  const rubric = cleanRubric({ hook: to5(d.hook), problem_first: to5(d.problemFirst), shows_product: to5(d.showsProduct), outcome: to5(d.outcome), cta: to5(d.cta), plain_language: to5(11 - d.jargon) }, DEMO_RUBRIC);
  return { ...d, rubric };
}

const BUZZ = /(revolutioniz|seamless|all-in-one|cutting-edge|supercharge|game-chang|leverage|synerg|world-class|best-in-class|empower|10x|effortless|robust|ai-powered)/gi;

export const scriptSeconds = (script) => Math.round((words(script) / DEMO.wpm) * 60);

// Deterministic judge: specificity and structure, not length. Padding and buzzwords hurt.
export function heuristicDemo(state, script) {
  const t = String(script ?? '');
  const lower = t.toLowerCase();
  const sents = t.split(/[.\n!?]+/).map((x) => x.trim()).filter(Boolean);
  const first = sents.slice(0, 2).join(' ').toLowerCase();
  const icp = (`${state.company.icp ?? ''} ${state.company.oneLiner ?? ''}`).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const icpHit = icp.some((w) => first.includes(w));
  const pain = /(tired|spend|waste|hours|manual|spreadsheet|hate|struggl|problem|every (week|day|month)|painful|slow|miss)/.test(first);
  const feats = shippedFeatures(state).map((f) => (f.title ?? '').toLowerCase()).filter(Boolean);
  const featHits = feats.filter((f) => f.split(/\W+/).filter((w) => w.length > 3).some((w) => lower.includes(w))).length;
  const steps = (lower.match(/\b(click|open|type|select|import|connect|drag|press|here you|watch|now i|then i|next)\b/g) ?? []).length;
  const nums = (t.match(/\d+(\.\d+)?\s?(%|hours?|minutes?|min|x|days|seconds)/gi) ?? []).length;
  const buzz = (lower.match(BUZZ) ?? []).length;
  const cta = /(start|try|book|sign up|get started|free trial|link below|reply)/.test(sents.slice(-2).join(' ').toLowerCase());
  const ws = lower.split(/\W+/).filter(Boolean);
  const distinct = new Set(ws).size / Math.max(1, ws.length);
  const pad = distinct < 0.45 ? 0.5 : 1;
  return normalizeDemoJudge({
    hook: clamp((2 + (icpHit ? 3 : 0) + (pain ? 3 : 0)) * pad, 1, 10),
    problemFirst: clamp((pain ? 6 : 3) + (/(product|feature|we built|introducing)/.test(first) ? -2 : 1), 1, 10),
    showsProduct: clamp((1 + Math.min(4, steps) + Math.min(3, featHits * 1.5)) * pad, 1, 10),
    outcome: clamp(2 + Math.min(4, nums * 2) + (/(result|now|saved|done in|in under|instead)/.test(lower) ? 3 : 0), 1, 10),
    cta: cta ? 8 : 2,
    jargon: clamp(1 + buzz * 2.5, 1, 10),
    notes: [!icpHit && 'Name your viewer in the first sentence.', !pain && 'Open with the pain, not your product.', steps < 3 && 'Show real clicks in the product, not claims.', !nums && 'Put a number on the outcome (minutes saved).', !cta && 'End with one next step.', buzz && 'Cut the buzzwords.'].filter(Boolean),
  });
}

function claimsUnshipped(state, script) {
  const lower = String(script).toLowerCase();
  const planned = (state.apps.product?.features ?? []).filter((f) => f.status !== 'shipped' && f.title).map((f) => f.title.toLowerCase());
  return planned.filter((t) => t.length > 5 && lower.includes(t)).length;
}

/** Combine judge fields and length into script quality 0-1. */
export function scriptQuality(judge, script) {
  const j = judge;
  const raw = (0.2 * j.hook + 0.15 * j.problemFirst + 0.3 * j.showsProduct + 0.15 * j.outcome + 0.1 * j.cta) / 10 + 0.1 * (1 - (j.jargon - 1) / 9);
  const sec = scriptSeconds(script);
  const len = sec > DEMO.tooLongSeconds ? 0.6 : sec > DEMO.idealSeconds[1] * 1.5 ? 0.85 : sec < 30 ? 0.7 : 1;
  return clamp(raw * len, 0, 1);
}

export function demoLift(state) {
  const d = state.company.demoVideo;
  if (!d) return { landing: 1, sales: 1 };
  const style = DEMO.styles[d.style];
  const stale = shippedFeatures(state).length - d.featuresAtRecord >= DEMO.staleFeatures;
  const q = d.quality * style.factor;
  const useful = clamp((q - DEMO.minQuality) / (1 - DEMO.minQuality), 0, 1);
  const k = stale ? 0.5 : 1;
  return { landing: 1 + style.cap * useful * k, sales: 1 + DEMO.salesCap * useful * k, stale };
}

export function applyDemo(state) {
  const l = demoLift(state);
  setModifier(state, 'landing', 'demo-video', +l.landing.toFixed(4));
  setModifier(state, 'conversion', 'demo-video', +l.sales.toFixed(4));
}

/** Record the demo: caller charges the style's hours via ctx.act. judge = LLM or heuristic result. */
export function recordDemo(state, { script, style = 'standard', judge }) {
  const quality = scriptQuality(judge, script);
  const unshipped = claimsUnshipped(state, script);
  const d = { id: uid('dmo'), day: state.day, style, script: String(script).slice(0, 6000), seconds: scriptSeconds(script), judge, quality: unshipped ? quality * 0.7 : quality, featuresAtRecord: shippedFeatures(state).length, unshipped };
  const prev = state.company.demoVideo;
  state.company.demoVideo = d;
  applyDemo(state);
  const sunk = DEMO.styles[style].hours;
  if (d.quality < DEMO.minQuality && style !== 'loom') {
    logMistake(state, { functionId: 'positioning_landing', id: 'polished_bad_demo', label: 'Polished a demo with a weak script', cost: { hours: sunk * 0.5 }, circles: true, detail: `${sunk} h of editing on a script that scored ${Math.round(d.quality * 100)}. Polish amplifies a good script; it doesn't fix a bad one.`, app: 'website', key: `bad_demo:${d.id}` });
  }
  if (unshipped) logMistake(state, { functionId: 'positioning_landing', id: 'demo_shows_unshipped', label: 'Demo promises features you have not shipped', cost: { reputation: 1, customers: 0.2 }, delayed: true, detail: 'Viewers will ask for what the video shows.', app: 'website', key: `unshipped:${d.id}` });
  if (d.seconds > DEMO.tooLongSeconds) notify(state, `Your demo runs ${Math.round(d.seconds / 60)}+ minutes. Landing-page viewers leave long before the end.`, { type: 'warn', app: 'website' });
  if (prev) d.rerecord = true;
  return d;
}

export async function judgeDemo(ctx, script) {
  const st = ctx.state;
  const res = await ctx.llm.ask({
    task: 'demo_video_script', rubric: DEMO_RUBRIC,
    system: `You are a skeptical buyer-side reviewer of SaaS demo videos in 2026. Target customer: ${st.company.icp || st.company.oneLiner || 'a small business owner'}. Judge only the script, not what it claims.\n${rubricText(DEMO_RUBRIC)}\nLength is scored elsewhere; padding, repeated phrases and buzzwords never raise a score. Quote the line behind every score of 2 or lower in notes.`,
    prompt: `Script (${scriptSeconds(script)} seconds when read aloud):\n\n${String(script).slice(0, 6000)}`,
    schema: DEMO_SCHEMA, temperature: 0.2, maxTokens: 2400,
    fallback: () => heuristicDemo(st, script), cache: st.cache,
  });
  return { judge: normalizeDemoJudge(res.data), mock: res.mock };
}

export const demoOnDay = (state) => { if (state.company.demoVideo && state.day % 14 === 0) applyDemo(state); };
