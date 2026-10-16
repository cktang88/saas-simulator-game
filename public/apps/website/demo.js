// Demo video for the landing page and sales calls. The founder writes the script and chooses how it is produced
// (scrappy screen recording vs a polished edit). The script decides the quality; polish only amplifies a good
// script (it can't rescue a bad one). An LLM judges the script; offline, a deterministic heuristic does.
// Effect sizes are [design] game assumptions. Vendors' claims of +20-80% from landing-page video are marketing
// numbers, so the game keeps this modest.

import { ensureMarket, setModifier, shippedFeatures } from '../../core/market.js';
import { logMistake } from '../../core/operator.js';
import { clamp, words, uid } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { companyStage } from '../../core/network.js';
import { rubricText } from '../../core/rubric.js';
import { rubricSchema, cleanRubric, to5, to10 } from '../../core/rubric-schema.js';
import { DEMO_RUBRIC } from './rubric.js';

// Video/demo tools (docs/research/tools/2026q4/web-content.md §3). Each is a different paradigm, not a price tier:
//  - Loom: send-now async message. Free Starter: 25 videos, 5 min each [verified: Atlassian support]; Business
//    ~$18/user [third-party]. Best for sales follow-ups (personal, hosted link), weak above the fold.
//  - Screen Studio: macOS recorder with auto-zoom and smoothed cursor; exports an MP4/GIF file, no hosting or share
//    link. ~$29/mo [third-party, conflicting reports]. Best for one cinematic landing/launch clip.
//  - Tella: lightly produced screen+camera clip with a hosted player. Pro $13/user [verified: tella.com/pricing].
//  - Descript: edit the transcript and the video follows; filler-word removal. ~$24/user [third-party]. Best for
//    talk-based and long-form (webinars, launch talks): it softens the long-video penalty, at more hours.
//  - Capsule: enterprise brand-locked motion templates. Custom pricing [third-party]; the $ figure here is a
//    [design] placeholder. Overkill before a marketing team exists.
//  - Arcade: interactive click-through demo (not a video). Free 1-3 demos, Pro ~$32 [third-party]. Interactive
//    tours are widely reported to convert better on landing pages (vendor claims; the size here is [design]), but
//    they break faster when the UI changes.
// hours = founder hours per asset; cap = max landing lift; factor = production polish on script quality;
// fit = multiplier on the lift for each use (landing page, sales follow-up, launch post). All lifts are [design].
export const VIDEO_TOOLS = {
  loom: { label: 'Loom (async screen + camera)', vendor: 'Loom', hours: 0.75, cap: 0.05, factor: 0.9, fit: { landing: 0.7, sales: 1.3, launch: 0.6 }, monthly: 0, paidMonthly: 18, paidUnverified: true, freeVideos: 25, freeMaxSeconds: 300, best: 'sales', note: 'Free: 25 videos of 5 minutes. Hosted link, viewer notifications: the async follow-up tool.' },
  screen_studio: { label: 'Screen Studio (auto-zoom recorder, macOS)', vendor: 'Screen Studio', hours: 1.5, cap: 0.1, factor: 1.08, fit: { landing: 1, sales: 0.8, launch: 1.15 }, monthly: 29, unverified: true, macOnly: true, best: 'launch', note: 'Polished cursor zooms in ~1 h. Exports a file: no hosting, no share link, no viewer data.' },
  tella: { label: 'Tella (hosted, lightly edited clips)', vendor: 'Tella', hours: 2, cap: 0.09, factor: 1.03, fit: { landing: 0.95, sales: 1.1, launch: 1 }, monthly: 13, best: 'landing', note: 'Pro $13/user: unlimited videos, hosted player, custom domain on Premium.' },
  descript: { label: 'Descript (edit the transcript)', vendor: 'Descript', hours: 4, cap: 0.09, factor: 1.05, fit: { landing: 0.85, sales: 0.9, launch: 1.1 }, monthly: 24, unverified: true, longForm: true, best: 'launch', note: 'Text-based editing and filler removal. Built for talks, webinars and podcasts, slow for a 60-second clip.' },
  capsule: { label: 'Capsule (brand-locked motion templates)', vendor: 'Capsule', hours: 6, cap: 0.11, factor: 1.12, fit: { landing: 1, sales: 0.7, launch: 1.1 }, monthly: 1000, unverified: true, needsStage: 'funded', best: 'launch', note: 'Enterprise, custom pricing: a template system for marketing teams making many on-brand videos.' },
  arcade: { label: 'Arcade (interactive click-through demo)', vendor: 'Arcade', hours: 2, cap: 0.14, factor: 1.05, fit: { landing: 1, sales: 1, launch: 0.8 }, monthly: 0, paidMonthly: 32, paidUnverified: true, freeDemos: 3, interactive: true, staleFeatures: 2, best: 'landing', note: 'Viewers click through the real flow at their own pace. Breaks when the UI changes.' },
};
export const VIDEO_USES = { landing: 'Landing page (above the fold)', sales: 'Sales follow-up', launch: 'Launch post (Product Hunt, X, LinkedIn)' };

export const DEMO = {
  styles: {
    // Legacy production styles (old saves); new recordings pick a tool from VIDEO_TOOLS.
    loom: { label: 'Scrappy screen recording', hours: 1.5, cap: 0.06, factor: 0.9, legacy: true },     // one take, no edit [design]
    standard: { label: 'Cleaned-up recording', hours: 4, cap: 0.08, factor: 1, legacy: true },          // trim, captions [design]
    polished: { label: 'Polished edit (voiceover, motion)', hours: 12, cap: 0.1, factor: 1.08, legacy: true }, // [design]
  },
  wpm: 150,
  idealSeconds: [60, 120],  // landing demo sweet spot [design]
  tooLongSeconds: 240,
  minQuality: 0.45,         // below this the video doesn't help [design]
  salesCap: 0.03,           // max conversion lift on sales demos/calls [design]
  // A weak demo is worse than none: a confusing or buggy-looking video above the fold costs trust. Penalty grows from 0 at
  // minQuality to these maxima at quality 0 [design; kept smaller than the best-case lift].
  badLanding: 0.04, badSales: 0.015,
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
  // A step is a sentence that shows an action ON something (verb plus at least three other words), counted once per
  // sentence: a list of verbs ("click open type select") is not a walkthrough. Numbers count once per sentence too.
  const STEP = /\b(click(s|ed)?|opens?|type|select|imports?|connects?|drag|press|pick|pulls?|match(es|ed)?|flag(s|ged)?|shows?|see|upload|here you|watch|now i|then i|next)\b/g;
  const isStep = (s) => { const w = s.toLowerCase().split(/\W+/).filter(Boolean); const v = (s.toLowerCase().match(STEP) ?? []).length; return v > 0 && w.length - v >= 3; };
  const unique = [...new Set(sents.map((s) => s.toLowerCase()))];
  const steps = unique.filter(isStep).length;
  const nums = unique.filter((s) => /\d+(\.\d+)?\s?(%|hours?|minutes?|min|x|days|seconds)/i.test(s) && s.split(/\s+/).length >= 6).length;
  const buzz = (lower.match(BUZZ) ?? []).length;
  const cta = /(start|try|book|sign up|get started|free trial|link below|reply)/.test(sents.slice(-2).join(' ').toLowerCase());
  const ws = lower.split(/\W+/).filter(Boolean);
  const distinct = new Set(ws).size / Math.max(1, ws.length);
  const repeated = sents.length - unique.length; // the same sentence twice is padding
  const pad = distinct < 0.45 || repeated >= 2 ? 0.5 : repeated ? 0.8 : 1;
  return normalizeDemoJudge({
    hook: clamp((2 + (icpHit ? 3 : 0) + (pain ? 3 : 0)) * pad, 1, 10),
    problemFirst: clamp((pain ? 6 : 3) + (/(product|feature|we built|introducing)/.test(first) ? -2 : 1), 1, 10),
    showsProduct: clamp((1 + Math.min(4, steps) + Math.min(3, featHits * 1.5)) * pad, 1, 10),
    outcome: clamp(2 + Math.min(4, nums * 2) + (/(result|now|saved|done in|in under|instead)/.test(lower) ? 3 : 0), 1, 10),
    cta: cta ? 8 : 2,
    jargon: clamp(1 + buzz * 2.5, 1, 10),
    // The viewer's reactions (what they saw or missed), not coaching: prescriptions only reach the player through advice.
    notes: [!icpHit && 'I couldn\'t tell in the first seconds who this is for.', !pain && 'It opened on the product, not on a problem I have.', steps < 3 && 'I never really saw the product do anything.', !nums && 'Nothing told me how much time or money it saves.', !cta && 'It ended without a clear next step.', buzz && 'The buzzwords lost me.', repeated && 'It repeated itself.'].filter(Boolean),
  });
}

function claimsUnshipped(state, script) {
  const lower = String(script).toLowerCase();
  const planned = (state.apps.product?.features ?? []).filter((f) => f.status !== 'shipped' && f.title).map((f) => f.title.toLowerCase());
  return planned.filter((t) => t.length > 5 && lower.includes(t)).length;
}

/** Combine judge fields and length into script quality 0-1. opts.interactive: a click-through demo has no read-aloud
 *  length; opts.longForm: transcript editing (Descript) tightens a long talk, so the length penalty is softer [design]. */
export function scriptQuality(judge, script, { interactive = false, longForm = false } = {}) {
  const j = judge;
  const raw = (0.2 * j.hook + 0.15 * j.problemFirst + 0.3 * j.showsProduct + 0.15 * j.outcome + 0.1 * j.cta) / 10 + 0.1 * (1 - (j.jargon - 1) / 9);
  const sec = scriptSeconds(script);
  const len = interactive ? 1 : sec > DEMO.tooLongSeconds ? (longForm ? 0.8 : 0.6) : sec > DEMO.idealSeconds[1] * 1.5 ? (longForm ? 0.95 : 0.85) : sec < 30 ? 0.7 : 1;
  return clamp(raw * len, 0, 1);
}

const FUNCTION_OF_USE = { landing: 'positioning_landing', sales: 'discovery_demo', launch: 'launch_community_referral' };
export const styleOf = (d) => (d?.tool && VIDEO_TOOLS[d.tool]) || DEMO.styles[d?.style] || DEMO.styles.standard;
const round1 = (x) => Math.round(x * 10) / 10;
// Best-case lift of a tool for a use: sales lifts run on DEMO.salesCap, launch posts on twice the landing cap.
const fitOf = (t, use) => (use === 'sales' ? DEMO.salesCap : use === 'launch' ? 2 * t.cap : t.cap) * (t.fit?.[use] ?? 1) * t.factor;

/** Lift of one recorded asset for one use (landing, sales, launch). Old saves (no tool/use) read as before. */
export function assetLift(state, d, use = d?.use ?? 'landing') {
  if (!d) return { landing: 1, sales: 1, launch: 1, stale: false, bad: false };
  const style = styleOf(d);
  const fit = style.fit?.[use] ?? 1;
  const stale = shippedFeatures(state).length - (d.featuresAtRecord ?? 0) >= (style.staleFeatures ?? DEMO.staleFeatures);
  const q = d.quality * style.factor;
  const useful = clamp((q - DEMO.minQuality) / (1 - DEMO.minQuality), 0, 1);
  const bad = clamp((DEMO.minQuality - q) / DEMO.minQuality, 0, 1);
  const k = stale ? 0.5 : 1;
  // A landing demo helps sales calls less than a follow-up made for the deal (legacy demos keep their old effect) [design].
  const salesShare = d.tool && use !== 'sales' ? 0.6 : 1;
  return {
    landing: 1 + style.cap * fit * useful * k - DEMO.badLanding * bad,
    sales: 1 + DEMO.salesCap * (d.tool ? (d.use === 'sales' ? (style.fit?.sales ?? 1) : salesShare * (style.fit?.sales ?? 1)) : fit) * useful * k - DEMO.badSales * bad,
    launch: 1 + 2 * style.cap * fit * useful * k - DEMO.badLanding * bad, // launch posts lean on the video more [design]
    stale, bad: bad > 0,
  };
}

export function demoLift(state) {
  const c = state.company;
  if (!c.demoVideo && !c.salesVideo) return { landing: 1, sales: 1 };
  const land = assetLift(state, c.demoVideo, 'landing');
  const out = { landing: c.demoVideo ? land.landing : 1, sales: c.demoVideo ? land.sales : 1, stale: land.stale, bad: land.bad };
  if (c.salesVideo) out.sales = Math.max(out.sales, assetLift(state, c.salesVideo, 'sales').sales);
  return out;
}

/** Launch-post multiplier from the launch video, for launch channels (Product Hunt, X, LinkedIn) [design]. */
export const launchVideoMult = (state) => (state.company.launchVideo ? assetLift(state, state.company.launchVideo, 'launch').launch : 1);

export function applyDemo(state) {
  const l = demoLift(state);
  setModifier(state, 'landing', 'demo-video', +l.landing.toFixed(4));
  setModifier(state, 'conversion', 'demo-video', +l.sales.toFixed(4));
}

/** The founder's video kit: computer OS, tool subscriptions and free-plan counters. Old saves get defaults. */
export function videoKit(state) {
  const k = (state.company.videoKit ??= {});
  k.os ??= 'mac'; k.subs ??= {}; k.counts ??= {}; k.history ??= [];
  return k;
}

function subscribeVideo(state, toolId, why = '') {
  const t = VIDEO_TOOLS[toolId], k = videoKit(state);
  if (k.subs[toolId]) return 0;
  const usd = t.monthly || t.paidMonthly || 0;
  if (!usd) return 0;
  post(state, { amount: -usd, counterparty: t.vendor, description: `${t.vendor} subscription (first month)${why ? `: ${why}` : ''}`, category: 'software', method: 'card' });
  k.subs[toolId] = { day: state.day, recurringId: addRecurring(state, { vendor: t.vendor, amount: usd, category: 'software', dayOfMonth: 1 + (state.day % 28), note: `${t.vendor} (video/demo)` }).id };
  return usd;
}

/** Pay for Loom Business or Arcade Pro before the free cap bites. */
export const upgradeVideoTool = (state, toolId) => subscribeVideo(state, toolId, 'upgrade from the free plan');

/** Founder hours for one asset (the caller charges them via ctx.act). */
export const videoHours = (toolId, style = 'standard') => (VIDEO_TOOLS[toolId]?.hours ?? DEMO.styles[style]?.hours ?? DEMO.styles.standard.hours);

/** The tool a stellar operator picks for a use at this stage (no Capsule before a marketing team, Screen Studio only on a Mac). */
export function bestToolFor(state, use) {
  const funded = companyStage(state) === 'funded';
  const mac = videoKit(state).os === 'mac';
  return Object.entries(VIDEO_TOOLS)
    .filter(([, t]) => (!t.needsStage || funded) && (!t.macOnly || mac))
    .sort((a, b) => fitOf(b[1], use) - fitOf(a[1], use) || a[1].hours - b[1].hours)[0][0];
}

/** Record an asset. The caller charges videoHours(tool) via ctx.act. judge = LLM or heuristic result.
 *  tool: a VIDEO_TOOLS id (new recordings), or omitted with a legacy style. use: landing | sales | launch. */
export function recordDemo(state, { script, style = 'standard', tool = null, use = 'landing', judge }) {
  const t = tool ? VIDEO_TOOLS[tool] : null;
  if (tool && !t) throw new Error('Unknown video tool');
  const kit = videoKit(state);
  if (t?.macOnly && kit.os !== 'mac') throw new Error(`${t.vendor} is a macOS app. On ${kit.os === 'windows' ? 'Windows' : 'Linux'} use Tella, Loom or Descript.`);
  const fn = FUNCTION_OF_USE[use] ?? 'positioning_landing';
  let j = judge;
  let seconds = scriptSeconds(script);
  const extra = [];
  // Loom free Starter: 25 videos of 5 minutes. A long take is cut at 5:00 (the ending and CTA are lost); the 26th
  // video deletes the oldest, and the links already sent in follow-ups die with it.
  if (tool === 'loom' && !kit.subs.loom) {
    if (seconds > t.freeMaxSeconds) {
      seconds = t.freeMaxSeconds;
      j = normalizeDemoJudge({ ...j, rubric: undefined, cta: 1, notes: [...(j.notes ?? []), 'It cut off before the end.'] });
      extra.push('Loom free cuts recordings at 5 minutes: your ending and call to action were lost.');
      logMistake(state, { functionId: fn, id: 'loom_free_cutoff', label: 'Loom free plan cut the video at 5 minutes', cost: { hours: t.hours }, circles: true, detail: 'The recording stopped before the call to action. Keep it under 2 minutes, or pay for Loom Business (~$18/user [third-party]) before recording long ones.', app: 'website', key: `loom_cut:${state.day}` });
    }
    kit.counts.loom = (kit.counts.loom ?? 0) + 1;
    if (kit.counts.loom > t.freeVideos) {
      extra.push('Loom free keeps 25 videos: the oldest was deleted to make room.');
      logMistake(state, { functionId: fn, id: 'loom_cap_deleted', label: 'Hit the 25-video Loom cap: old follow-up links now 404', cost: { reputation: 0.5, hours: 0.5 }, delayed: true, detail: 'Prospects who open an old follow-up see a dead link. Upgrade before the cap, or keep one evergreen demo and record personal videos only for live deals.', app: 'website', key: `loom_cap:${kit.counts.loom}` });
    }
  } else if (tool === 'arcade' && !kit.subs.arcade) {
    kit.counts.arcade = (kit.counts.arcade ?? 0) + 1;
    if (kit.counts.arcade > t.freeDemos) subscribeVideo(state, 'arcade', `more than ${t.freeDemos} demos`);
  } else if (t) {
    subscribeVideo(state, tool);
  }
  if (t?.needsStage && companyStage(state) !== t.needsStage) {
    const bt = VIDEO_TOOLS[bestToolFor(state, use)];
    logMistake(state, { functionId: fn, id: 'video_tool_overkill', label: `${t.vendor} before you have a marketing team`, cost: { usd: t.monthly, hours: Math.max(0, t.hours - bt.hours) }, detail: `${t.vendor} is a brand-locked template system for teams shipping many on-brand videos. One founder demo needs ${bt.vendor}. Cancel the subscription in Money unless you will make videos at volume.`, app: 'website', key: `overkill:${tool}` });
  }
  const quality = scriptQuality(j, script, { interactive: !!t?.interactive, longForm: !!t?.longForm });
  const unshipped = claimsUnshipped(state, script);
  const d = { id: uid('dmo'), day: state.day, style: tool ?? style, tool, use, script: String(script).slice(0, 6000), seconds, judge: j, quality: unshipped ? quality * 0.7 : quality, featuresAtRecord: shippedFeatures(state).length, unshipped, notes: extra };
  // The tool should fit the use (async follow-up vs above the fold vs launch). A mismatch costs lift or hours, and the
  // record names the better pick.
  if (t) {
    const best = bestToolFor(state, use), bt = VIDEO_TOOLS[best];
    const gap = fitOf(bt, use) - fitOf(t, use);
    d.bestTool = best;
    if (best !== tool && (gap > 0.02 || t.hours - bt.hours > 1.5)) {
      logMistake(state, { functionId: fn, id: 'video_tool_mismatch', label: `${t.vendor} for a ${use} video`, cost: { hours: Math.max(0, round1(t.hours - bt.hours)), customers: round1(gap * 5) }, detail: `A stellar operator would use ${bt.vendor} here: ${bt.note} Best case about +${(fitOf(bt, use) * 100).toFixed(1)}% for this use vs +${(fitOf(t, use) * 100).toFixed(1)}% [design].`, app: 'website', key: `mismatch:${d.id}` });
    }
    kit.history.push({ day: state.day, tool, use, quality: +d.quality.toFixed(3) });
  }
  const slot = use === 'sales' ? 'salesVideo' : use === 'launch' ? 'launchVideo' : 'demoVideo';
  const prev = state.company[slot];
  state.company[slot] = d;
  applyDemo(state);
  const sunk = t ? t.hours : DEMO.styles[style].hours;
  const cheap = t ? t.hours <= 1 : style === 'loom';
  if (d.quality < DEMO.minQuality && !cheap) {
    logMistake(state, { functionId: fn, id: 'polished_bad_demo', label: 'Polished a demo with a weak script', cost: { hours: sunk * 0.5 }, circles: true, detail: `${sunk} h of editing on a script that scored ${Math.round(d.quality * 100)}. Polish amplifies a good script; it doesn't fix a bad one.`, app: 'website', key: `bad_demo:${d.id}` });
  }
  if (d.quality < DEMO.minQuality) logMistake(state, { functionId: fn, id: 'weak_demo_published', label: `Published a weak demo video${use === 'sales' ? ' in sales follow-ups' : use === 'launch' ? ' for the launch' : ' on the landing page'}`, cost: { customers: 0.3 }, delayed: true, detail: `Script quality ${Math.round(d.quality * 100)}: a confusing demo converts about ${Math.round(DEMO.badLanding * clamp((DEMO.minQuality - d.quality) / DEMO.minQuality, 0, 1) * 100)}% worse than no video [design]. Rewrite the script (who it's for, real clicks, one number, one next step) or take it down.`, app: 'website', key: `weak_demo:${d.id}` });
  if (unshipped) logMistake(state, { functionId: fn, id: 'demo_shows_unshipped', label: 'Demo promises features you have not shipped', cost: { reputation: 1, customers: 0.2 }, delayed: true, detail: 'Viewers will ask for what the video shows.', app: 'website', key: `unshipped:${d.id}` });
  if (d.seconds > DEMO.tooLongSeconds && !t?.interactive) notify(state, `Your demo runs ${Math.round(d.seconds / 60)}+ minutes. Landing-page viewers leave long before the end.`, { type: 'warn', app: 'website' });
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

export const demoOnDay = (state) => { if ((state.company.demoVideo || state.company.salesVideo) && state.day % 14 === 0) applyDemo(state); };
