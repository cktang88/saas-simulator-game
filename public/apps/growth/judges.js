// LLM judges for growth work (ad creatives, UGC briefs, social posts, community posts, SEO articles) and their
// deterministic offline fallbacks. Heuristics reward specificity and ICP fit and punish generic, buzzwordy
// or AI-slop copy. All judges return a `skill` in 0..1 that nudges the statistical model; they never decide
// outcomes alone (LLM = judgment, statistics = scale).

import { REALISM, averageField } from '../../core/llm.js';
import { rubricText } from '../../core/rubric.js';
import { AD_CRITERIA, BRIEF_CRITERIA, POST_CRITERIA, COMMUNITY_CRITERIA, ARTICLE_CRITERIA, ASO_CRITERIA, rubricSkill, to5, withRubric } from './rubrics.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wc = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

export const BUZZ = ['revolutioniz', 'seamless', 'all-in-one', 'next-gen', 'cutting-edge', 'unlock', 'supercharge', 'game-chang', 'leverage', 'synerg', 'world-class', 'best-in-class', 'empower', 'transform your', '10x', 'ai-powered', 'effortless', 'robust', 'elevate', 'take your', 'to the next level', 'innovative', 'solution'];
export const SLOP = ["in today's fast-paced", 'in the ever-evolving', 'delve', 'tapestry', 'landscape of', 'navigating the', 'it is important to note', "whether you're a", 'look no further', 'comprehensive guide', 'unleash', 'harness the power', 'in conclusion', 'embark on', 'realm of', 'game-changer', 'elevate your', 'a testament to', 'ultimate guide', 'dive deep'];
const GENERIC_HOOKS = ['tired of', 'are you looking for', 'introducing', 'meet ', 'the best app', 'say goodbye', 'imagine a world'];

export const countHits = (text, list) => { const t = String(text ?? '').toLowerCase(); return list.filter((b) => t.includes(b)).length; };
const icpWords = (state) => [...new Set(`${state.company.icp} ${state.company.oneLiner}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4))];
export const icpOverlap = (state, text) => {
  const t = String(text ?? '').toLowerCase();
  const ws = icpWords(state);
  if (!ws.length) return 0.3;
  return clamp(ws.filter((w) => t.includes(w)).length / Math.min(6, ws.length), 0, 1);
};
// Only numbers attached to a unit or an outcome count as specifics ("23 books", "12 minutes", "$49"), not bare digits.
const specifics = (text) => (String(text ?? '').match(/\d+(\.\d+)?\s?(%|x\b|×|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?|k\b|books?|clients?|customers?|stores?|orders?|invoices?|users?|people|kids?|times?|steps?|pages?)|\$\s?\d+/gi) ?? []).length;
// Share of tokens that are ICP keywords: stuffing the ICP description into an ad is not message-market fit.
const icpDensity = (state, text) => {
  const toks = String(text ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!toks.length) return 0;
  const ws = new Set(icpWords(state));
  return toks.filter((w) => ws.has(w)).length / toks.length;
};
const hasVerb = (t) => /\b(is|are|was|were|am|be|get|got|use|try|make|made|stop|start|read|save|saved|lost|spent|finish|finished|need|want|hate|love|do|did|does|can|will|turn|cut|find|found|lose|took|take|run|built|keep|miss|wish|know|felt|feel)\b|\w+(ed|ing)\b/i.test(String(t));
export const slopScore = (text) => clamp(countHits(text, SLOP) / 3 + countHits(text, BUZZ) / 8, 0, 1);

// Writing check used by the creative judge (a violating claim is weak copy). What the PLATFORM does with an ad
// (submission review odds, post-approval sweeps, strikes, bans, appeals) lives in growth/adpolicy.js.
export function policyCheck(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\b(are you|you're|you are)\s+(fat|overweight|depressed|broke|in debt|diabetic|anxious|lonely|bald)\b/.test(t)) return 'Rejected: asserts personal attributes ("are you…"). Meta prohibits implying you know someone\'s health, finances or identity.';
  if (/guarantee(d)?\s+(results|income|weight|money)|get rich|lose \d+ ?(lbs|kg) in/.test(t)) return 'Rejected: unrealistic or guaranteed outcome claims.';
  return null;
}

const has = (re, t) => re.test(String(t ?? '').toLowerCase());

// ---------------- Ad creatives ----------------

const CREATIVE_BASE = {
  type: 'object', additionalProperties: false,
  required: ['reaction', 'stopScroll', 'hook', 'clarity', 'relevance', 'specificity', 'generic', 'wouldClick'],
  properties: {
    reaction: { type: 'string', description: 'One blunt sentence, in character, as you scroll past.' },
    stopScroll: { type: 'number', description: '0-1: chance the first 3 seconds / headline stops your thumb (real thumb-stop rates: weak under 0.2, top ads 0.35-0.45).' },
    hook: { type: 'number', description: '1-10 hook strength' },
    clarity: { type: 'number', description: '1-10: do I get what it is and who it is for?' },
    relevance: { type: 'number', description: '1-10: message-market fit for someone like me' },
    specificity: { type: 'number', description: '1-10: concrete outcomes, numbers, situations vs vague claims' },
    generic: { type: 'boolean', description: 'true if it could be an ad for any app in this category' },
    wouldClick: { type: 'number', description: '0-1 probability I tap through. Real feed CTR is about 0.005-0.02; even a great ad rarely beats 0.05.' },
  },
};
export const CREATIVE_SCHEMA = withRubric(CREATIVE_BASE, AD_CRITERIA);

export function creativeHeuristic(state, c) {
  const all = `${c.hook} ${c.primaryText} ${c.headline}`;
  const buzz = countHits(all, BUZZ);
  const fit = icpOverlap(state, all);
  const spec = specifics(all);
  const hookWords = wc(c.hook);
  const genericHook = countHits(c.hook, GENERIC_HOOKS) > 0;
  const question = /\?/.test(c.hook);
  const hook = clamp(4 + (hookWords > 0 && hookWords <= 12 ? 1.5 : -1) + (question ? 0.5 : 0) + Math.min(2, spec) * 0.8 + fit * 2 - (genericHook ? 2 : 0) - buzz * 0.6, 1, 10);
  const clarity = clamp(4 + (wc(c.headline) > 1 && wc(c.headline) < 10 ? 1.5 : 0) + fit * 2.5 + (wc(c.primaryText) > 12 && wc(c.primaryText) < 120 ? 1 : -0.5) - buzz * 0.5, 1, 10);
  const relevance = clamp(3 + fit * 6 - buzz * 0.3, 1, 10);
  const specificity = clamp(2.5 + Math.min(4, spec) * 1.3 + fit - buzz * 0.5, 1, 10);
  const stuffed = icpDensity(state, all) > 0.3;
  const noVerb = !hasVerb(c.hook);
  const generic = buzz >= 2 || genericHook || (fit < 0.15 && spec === 0) || stuffed;
  const s = Math.max(0, (hook + clarity + relevance + specificity) / 40 - (stuffed ? 0.35 : 0) - (noVerb ? 0.12 : 0));
  const policy = policyCheck(all) ? 2 : 0;
  const hookF = stuffed ? Math.min(hook, 3) : noVerb ? Math.min(hook, 5) : hook, relF = stuffed ? Math.min(relevance, 4) : relevance;
  const cta5 = clamp(2 + (String(c.cta ?? '').trim() ? 1 : -1) + (/\b(start|try|get|download|book|shop)\b/i.test(c.cta ?? '') ? 1 : 0) + (/trial|free|\$\d|demo|template/i.test(all) ? 1 : 0), 1, 5);
  return {
    hook_stop: to5(hookF), icp_match: to5(relF), concrete_promise: to5(specificity), clarity_offer: to5(clarity),
    credibility: clamp(4 - buzz - policy - (stuffed ? 2 : 0) + (spec ? 1 : 0), 1, 5), cta_fit: cta5,
    evidence: generic ? `Generic or buzzword copy: "${String(c.hook).slice(0, 60)}"` : `Hook: "${String(c.hook).slice(0, 60)}"`,
    reaction: generic ? 'Looks like every other app ad. Scrolled.' : s > 0.6 ? 'That first line is about my exact situation. I paused.' : 'Not sure this is for me.',
    stopScroll: +clamp(0.1 + s * 0.35, 0.05, 0.5).toFixed(2), hook: stuffed ? Math.min(hook, 3) : noVerb ? Math.min(hook, 5) : hook, clarity, relevance: stuffed ? Math.min(relevance, 4) : relevance, specificity, generic,
    wouldClick: +clamp(0.005 + s * s * 0.04, 0.002, 0.06).toFixed(3),
  };
}

// Combine panel answers into a 0..1 skill score (generic copy is penalized). The rubric score (fixed weights over
// per-criterion 1-5 scores) carries 40%, the older holistic 1-10 fields 60%, so one odd number cannot swing it.
export function creativeSkill(results) {
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const genericShare = results.filter((d) => d.generic).length / Math.max(1, results.length);
  const s = 0.35 * avg('hook') / 10 + 0.25 * avg('relevance') / 10 + 0.2 * avg('specificity') / 10 + 0.2 * avg('clarity') / 10;
  const holistic = clamp(s - 0.15 * genericShare + 0.1 * (clamp((avg('stopScroll') ?? 0.25) / 0.35, 0, 1.4) - 0.7), 0, 1);
  const rub = rubricSkill(results, AD_CRITERIA);
  return rub == null ? holistic : clamp(0.6 * holistic + 0.4 * rub - 0.1 * genericShare * rub, 0, 1);
}

export async function judgeCreative(ctx, c) {
  const state = ctx.state;
  const icp = state.company.icp || state.company.oneLiner || 'the target customer';
  const persona = state.company.model === 'b2c' ? 'a person in the target audience scrolling Instagram Reels / TikTok on their phone at night' : 'a busy professional in the target audience scrolling LinkedIn / Instagram between meetings';
  const res = await ctx.llm.panel({
    task: 'ad_creative_review', rubric: AD_CRITERIA,
    system: `${REALISM}\nYou are ${persona}. Target customer profile: ${icp}. It is late 2026; your feed is full of AI-made ads. Stay in character: you decide in about a second whether to stop, so score what would make you stop and tap, not what a marketer would admire. Longer copy, buzzwords and repeated audience keywords earn nothing.\n${rubricText(AD_CRITERIA)}`,
    prompt: `This ad appears in your feed (${c.format.replace('_', ' ')}${c.platformHint ? ` on ${c.platformHint}` : ''}).\nFIRST 3 SECONDS / HOOK: ${c.hook}\nPRIMARY TEXT: ${c.primaryText}\nHEADLINE: ${c.headline}\nBUTTON: ${c.cta}\nShown as: "${state.company.name} · Sponsored". That and the ad above are all you see; you know nothing else about the product. Judge it as you would react in real life.`,
    schema: CREATIVE_SCHEMA, temperature: 0.7, maxTokens: 2000,
    fallback: () => creativeHeuristic(state, c),
    cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  return { skill: creativeSkill(results), results, mock: results.some((r) => r.mock) };
}

// ---------------- UGC briefs ----------------

const BRIEF_BASE = {
  type: 'object', additionalProperties: false,
  required: ['clarity', 'hookStrength', 'icpFit', 'actionable', 'feedback', 'missing'],
  properties: {
    clarity: { type: 'number', description: '1-10 could a creator film this without asking questions?' },
    hookStrength: { type: 'number', description: '1-10 strength of the suggested opening hooks' },
    icpFit: { type: 'number', description: '1-10 does it target a specific viewer with a specific pain?' },
    actionable: { type: 'number', description: '1-10 concrete shots, dos/donts, length, CTA' },
    feedback: { type: 'string', description: 'Two or three blunt sentences: what you would have to guess and the first fix.' },
    missing: { type: 'array', items: { type: 'string', description: 'under 12 words' }, description: 'At most 4 missing sections, most important first.' },
  },
};
export const BRIEF_SCHEMA = withRubric(BRIEF_BASE, BRIEF_CRITERIA);

export function briefHeuristic(state, b) {
  const all = `${b.hook} ${b.keyMessage} ${b.notes}`;
  const fit = icpOverlap(state, all);
  const buzz = countHits(all, BUZZ);
  const has = (re) => re.test(all.toLowerCase());
  const struct = [has(/hook|first (3|three) sec/), has(/\b(15|20|30|45|60)\s?(s|sec|seconds)\b|length/), has(/don'?t|avoid|do not/), has(/show|film|screen|record|b-roll|demo/), has(/cta|call to action|link|download|try/)].filter(Boolean).length;
  const clarity = clamp(3 + struct + (wc(all) > 60 ? 1 : 0) - buzz * 0.5, 1, 10);
  const hookStrength = clamp(3.5 + (wc(b.hook) > 3 && wc(b.hook) < 25 ? 2 : 0) + Math.min(2, specifics(b.hook)) + fit * 2 - buzz * 0.7, 1, 10);
  const icpFit = clamp(3 + fit * 6, 1, 10);
  const actionable = clamp(2 + struct * 1.5, 1, 10);
  const hookLines = String(b.hook ?? '').split(/\n|\||;|\d\)\s|\d\.\s/).filter((x) => wc(x) > 3).length;
  const points = String(b.keyMessage ?? '').split(/\n|•/).filter((x) => wc(x) > 2).length;
  return {
    hook_options: clamp(1 + Math.min(3, hookLines) + (specifics(b.hook) ? 1 : 0) - (buzz > 1 ? 1 : 0), 1, 5),
    viewer_pain: clamp(1 + Math.round(fit * 3) + (specifics(all) ? 1 : 0) - (buzz > 1 ? 1 : 0), 1, 5),
    talking_points: clamp(1 + (wc(b.keyMessage) > 8 ? 1 : 0) + (points >= 3 && points <= 5 ? 2 : points >= 1 ? 1 : 0) + (wc(b.keyMessage) > 150 ? -1 : 0), 1, 5),
    shots_format: clamp(1 + (has(/\b(15|20|30|45|60)\s?(s|sec|seconds)\b|length/, all) ? 1.5 : 0) + (has(/9:16|vertical|aspect/, all) ? 1 : 0) + (has(/show|film|screen|record|b-roll|demo/, all) ? 1.5 : 0), 1, 5),
    dos_donts: clamp(1 + (has(/don'?t|avoid|do not|never/, all) ? 2 : 0) + (has(/#ad|disclos|sponsor|paid partnership/, all) ? 1.5 : 0) + (has(/competitor|claim/, all) ? 0.5 : 0), 1, 5),
    deliverables_cta: clamp(1 + (has(/cta|call to action|link|download|try/, all) ? 1.5 : 0) + (has(/\d+\s*(videos?|variations?)|revision|deadline|due|usage|rights|whitelist/, all) ? 2.5 : 0), 1, 5),
    evidence: struct < 3 ? 'Missing structure: ' + [!has(/hook|first (3|three) sec/, all) && 'hooks', !has(/(15|20|30|45|60)\s?(s|sec|seconds)|length/, all) && 'length', !has(/don'?t|avoid|do not/, all) && "dos/don'ts"].filter(Boolean).join(', ') : 'Structure present.',
    clarity, hookStrength, icpFit, actionable,
    feedback: struct < 3 ? 'Creators will improvise because the brief lacks structure: give hooks, length, shots, dos/don\'ts and the CTA.' : 'Clear enough to film. Sharper, specific hooks would help.',
    missing: [!has(/hook|first (3|three) sec/) && 'Hook options for the first 3 seconds', !has(/(15|20|30|45|60)\s?(s|sec|seconds)|length/) && 'Video length', !has(/don'?t|avoid|do not/) && "Dos and don'ts", !has(/cta|call to action|link|download|try/) && 'Call to action'].filter(Boolean),
  };
}
export async function judgeBrief(ctx, b) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'ugc_brief_review', rubric: BRIEF_CRITERIA,
    system: `You are an experienced UGC creator and performance creative strategist in 2026 who has filmed hundreds of paid social ads. Be blunt. Target customer: ${state.company.icp || state.company.oneLiner}. Judge the brief as the person who has to film it tomorrow without asking questions: a missing section means you would have to guess. Length and keyword repetition earn nothing.\n${rubricText(BRIEF_CRITERIA)}`,
    prompt: `Rate this creator brief for a ${state.company.model === 'b2c' ? 'consumer subscription app' : 'B2B SaaS'} (${state.company.oneLiner || state.company.name}).\nHOOK IDEAS: ${b.hook}\nKEY MESSAGE: ${b.keyMessage}\nNOTES / SHOTS / DOS & DON'TS: ${b.notes}`,
    schema: BRIEF_SCHEMA, temperature: 0.5, maxTokens: 2000,
    fallback: () => briefHeuristic(state, b), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const holistic = clamp((avg('clarity') + avg('hookStrength') * 1.3 + avg('icpFit') + avg('actionable') * 0.7) / 40, 0, 1);
  const rub = rubricSkill(results, BRIEF_CRITERIA);
  const score = rub == null ? holistic : clamp(0.5 * holistic + 0.5 * rub, 0, 1);
  return { score, results, mock: results.some((r) => r.mock) };
}

// ---------------- Social posts (build in public, launch announcements) ----------------

const POST_BASE = {
  type: 'object', additionalProperties: false,
  required: ['reaction', 'hook', 'specificity', 'authenticity', 'value', 'salesy', 'engage'],
  properties: {
    reaction: { type: 'string', description: 'One blunt sentence, in character.' },
    hook: { type: 'number', description: '1-10 does the first line make you read on?' },
    specificity: { type: 'number', description: '1-10 real numbers, real story, real lessons' },
    authenticity: { type: 'number', description: '1-10 sounds like a human founder, not AI/LinkedIn-bro' },
    value: { type: 'number', description: '1-10 useful or interesting to a reader who does not care about the product' },
    salesy: { type: 'boolean' },
    engage: { type: 'number', description: '0-1 chance you like/comment/repost' },
  },
};
export const POST_SCHEMA = withRubric(POST_BASE, POST_CRITERIA);
export function postHeuristic(state, text) {
  const first = String(text).split('\n')[0] ?? '';
  const spec = specifics(text);
  const buzz = countHits(text, BUZZ), slop = countHits(text, SLOP);
  const salesy = /(sign up|link in|check (it|us) out|use code|limited time|buy now|try it free)/i.test(text);
  const story = /\b(i|we)\b.*\b(learned|tried|failed|shipped|launched|lost|made|grew|mistake)/i.test(text);
  const hook = clamp(4 + (wc(first) > 3 && wc(first) < 18 ? 1.5 : -0.5) + Math.min(2, specifics(first)) + (/\?|:$/.test(first) ? 0.5 : 0) - slop, 1, 10);
  const specificity = clamp(2.5 + Math.min(4, spec) * 1.2 + (story ? 1.5 : 0), 1, 10);
  const authenticity = clamp(6 + (story ? 1.5 : 0) - buzz * 0.8 - slop * 1.5 - (salesy ? 1.5 : 0), 1, 10);
  const value = clamp(3 + (story ? 2 : 0) + Math.min(3, spec * 0.7) + (wc(text) > 40 ? 1 : 0) - (salesy ? 2 : 0), 1, 10);
  const links = (String(text).match(/https?:\/\/|www\./gi) ?? []).length;
  const lines = String(text).split('\n').filter((l) => l.trim()).length;
  const baited = /(comment (yes|below)|like if|repost if|agree\?|let that sink in|here are \d+ (lessons|tips))/i.test(text);
  const crit = {
    hook_line: to5(hook), specific_story: to5(specificity), founder_voice: to5(authenticity), reader_value: to5(value),
    promo_balance: clamp(5 - (salesy ? 2 : 0) - Math.max(0, links - 1) - (baited ? 1.5 : 0), 1, 5),
    platform_fit: clamp(2 + (lines >= 3 ? 1 : 0) + (wc(text) >= 25 && wc(text) <= 320 ? 2 : 0) - (baited ? 1 : 0), 1, 5),
    evidence: salesy ? `Sales language: "${(String(text).match(/(sign up|link in|check (it|us) out|use code|limited time|buy now|try it free)/i) ?? [''])[0]}"` : `First line: "${first.slice(0, 70)}"`,
  };
  return { ...crit, reaction: salesy ? 'Another founder selling at me.' : story ? 'Real numbers and a real story, I read it all.' : 'Fine, scrolled on.', hook, specificity, authenticity, value, salesy, engage: +clamp((hook + value) / 20 * 0.06, 0.002, 0.08).toFixed(3) };
}
export function postSkill(results) {
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const salesyShare = results.filter((d) => d.salesy).length / Math.max(1, results.length);
  const holistic = clamp((avg('hook') * 1.3 + avg('specificity') + avg('authenticity') + avg('value') * 1.2) / 45 - 0.12 * salesyShare, 0, 1);
  const rub = rubricSkill(results, POST_CRITERIA);
  return rub == null ? holistic : clamp(0.5 * holistic + 0.5 * rub - 0.08 * salesyShare, 0, 1);
}
export async function judgePost(ctx, text, platform, purpose = 'build in public') {
  const state = ctx.state;
  const audience = platform === 'linkedin' ? 'a LinkedIn user in the founder\'s network (operators, founders, people in the industry)' : platform === 'x' ? 'an X/Bluesky user who follows indie founders and builders' : 'someone who knows the founder personally';
  const res = await ctx.llm.panel({
    task: 'social_post_review', rubric: POST_CRITERIA,
    system: `${REALISM}\nYou are ${audience}. The year is 2026 and your feed is flooded with AI-written "lessons" posts. React as a reader deciding whether to read on and engage; hashtags, emoji, length and engagement bait earn nothing.\n${rubricText(POST_CRITERIA)}`,
    prompt: `The founder of ${state.company.name} (${state.company.oneLiner || 'a startup'}) posted this (${purpose}) on ${platform}:\n---\n${String(text).slice(0, 3000)}\n---\nReact as you really would.`,
    schema: POST_SCHEMA, temperature: 0.7, maxTokens: 2000,
    fallback: () => postHeuristic(state, text), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  return { skill: postSkill(results), results, mock: results.some((r) => r.mock) };
}

// ---------------- Community posts (Reddit / Discord / Slack) ----------------

const COMMUNITY_BASE = {
  type: 'object', additionalProperties: false,
  required: ['reaction', 'helpfulness', 'relevance', 'promotional', 'wouldReport'],
  properties: {
    reaction: { type: 'string', description: 'One or two blunt sentences, in character, as a member reading it.' },
    helpfulness: { type: 'number', description: '1-10 useful to members even if they never buy' },
    relevance: { type: 'number', description: '1-10 on-topic for this community' },
    promotional: { type: 'number', description: '0-1 how much this is self-promotion' },
    wouldReport: { type: 'boolean', description: 'Would you report it / would a mod remove it?' },
  },
};
export const COMMUNITY_SCHEMA = withRubric(COMMUNITY_BASE, COMMUNITY_CRITERIA);
export function communityHeuristic(state, post) {
  const t = `${post.title} ${post.body}`;
  const link = /https?:\/\/|www\.|\.com\b|\.app\b|\.io\b/i.test(t);
  const name = state.company.name && t.toLowerCase().includes(state.company.name.toLowerCase());
  const pitch = /(i built|we built|check out|my (app|tool|startup)|sign up|launching|free trial|discount)/i.test(t);
  const helpful = clamp(3 + Math.min(3, specifics(t) * 0.8) + (wc(post.body) > 80 ? 2 : 0) + (/\?/.test(post.title) ? 0.5 : 0) - (pitch ? 2 : 0), 1, 10);
  const promotional = clamp((link ? 0.35 : 0) + (name ? 0.25 : 0) + (pitch ? 0.35 : 0), 0, 1);
  const iBuilt = /\b(i|we) (built|make|made|run|work on|founded)\b|disclosure|my (own )?(app|tool|product)/i.test(t);
  const askQ = /\?/.test(post.body ?? '') && wc(post.body) > 30;
  const crit = {
    rules_fit: clamp(2 + icpOverlap(state, t) * 3 - (link && wc(post.body) < 40 ? 1.5 : 0) + (wc(post.body) > 60 ? 0.5 : 0), 1, 5),
    give_first: to5(helpful),
    disclosure: pitch || name ? (iBuilt ? 5 : 2) : 4,
    promo_ratio: clamp(5 - promotional * 5, 1, 5),
    earned_experience: clamp(1 + Math.min(3, specifics(t) * 0.8) + (/\b(i|we) (tried|learned|failed|lost|spent|tested|ran)\b/i.test(t) ? 1.5 : 0), 1, 5),
    invites_discussion: clamp(1 + (askQ ? 2.5 : /\?/.test(t) ? 1 : 0) + (/(feedback|what would you|how do you|has anyone)/i.test(t) ? 1.5 : 0), 1, 5),
    evidence: link || pitch ? `Promotional cues: ${[link && 'link', name && 'product name', pitch && 'pitch phrasing'].filter(Boolean).join(', ')}` : 'No promotional cues found.',
  };
  return { ...crit, reaction: promotional > 0.5 ? 'Thinly veiled ad. Downvoted.' : helpful > 6 ? 'Actually useful, saved it.' : 'Meh.', helpfulness: helpful, relevance: clamp(4 + icpOverlap(state, t) * 5, 1, 10), promotional, wouldReport: promotional > 0.6 };
}
export async function judgeCommunityPost(ctx, post) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'community_post_review', rubric: COMMUNITY_CRITERIA,
    system: `${REALISM}\nYou are a long-time member (and part-time moderator) of the community "${post.community}" (${post.kind}). Self-promotion rules are strict; you can smell a stealth ad. A link, the product name or a long post does not make a post helpful; an answer that stands alone does.\n${rubricText(COMMUNITY_CRITERIA)}`,
    prompt: `New post:\nTITLE: ${post.title}\n---\n${String(post.body).slice(0, 3000)}\n---\nAuthor profile (what you see if you click the username): runs ${state.company.name}${state.company.domain ? ` (${state.company.domain})` : ""}. Judge the post itself: a founder sharing a genuinely useful answer without pushing the product is fine; hiding the affiliation while promoting it is not.`,
    schema: COMMUNITY_SCHEMA, temperature: 0.6, maxTokens: 2000,
    fallback: () => communityHeuristic(state, post), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f);
  const sub = (keys) => rubricSkill(results, COMMUNITY_CRITERIA.filter((c) => keys.includes(c.key)));
  const mix = (holistic, r) => (r == null ? holistic : clamp(0.6 * holistic + 0.4 * r, 0, 1));
  return {
    helpfulness: mix((avg('helpfulness') ?? 5) / 10, sub(['give_first', 'earned_experience', 'invites_discussion'])),
    relevance: mix((avg('relevance') ?? 5) / 10, sub(['rules_fit'])),
    promotional: avg('promotional') ?? 0.5, rubric: rubricSkill(results, COMMUNITY_CRITERIA),
    report: results.filter((r) => r.wouldReport).length / Math.max(1, results.length), results, mock: results.some((r) => r.mock),
  };
}

// ---------------- SEO / GEO articles ----------------

const ARTICLE_BASE = {
  type: 'object', additionalProperties: false,
  required: ['intentMatch', 'originality', 'depth', 'aiSlop', 'informational', 'citable', 'feedback'],
  properties: {
    intentMatch: { type: 'number', description: '1-10 does it answer exactly what someone searching the query wants?' },
    originality: { type: 'number', description: '1-10 first-hand experience, data, opinions not found in the top 10 results' },
    depth: { type: 'number', description: '1-10' },
    aiSlop: { type: 'number', description: '0-1 how much it reads like generic AI-generated filler' },
    informational: { type: 'boolean', description: 'true if the query is informational (likely to show an AI Overview), false if commercial/transactional' },
    citable: { type: 'number', description: '0-1 chance an LLM answer engine would cite this page (clear facts, comparisons, pricing, unique data)' },
    feedback: { type: 'string', description: 'Two or three sentences: the biggest gap versus what ranks and gets cited, and the first fix.' },
  },
};
export const ARTICLE_SCHEMA = withRubric(ARTICLE_BASE, ARTICLE_CRITERIA);
export function articleHeuristic(state, a) {
  const body = `${a.title}\n${a.body}`;
  const n = wc(a.body);
  const qWords = String(a.query).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const inTitle = qWords.filter((w) => a.title.toLowerCase().includes(w)).length / Math.max(1, qWords.length);
  const inBody = qWords.filter((w) => a.body.toLowerCase().includes(w)).length / Math.max(1, qWords.length);
  const firstHand = /\b(we tested|i tested|our data|we found|in our|screenshot|we measured|our customers|i tried|we ran)\b/i.test(body);
  const headings = (a.body.match(/^#+\s|^\s*\d+\.\s/gm) ?? []).length;
  const slop = slopScore(body);
  const commercial = /\b(best|vs|alternative|alternatives|pricing|price|review|software|tool|app for|template)\b/i.test(a.query);
  const intentMatch = clamp(3 + inTitle * 3 + inBody * 2 + (n > 600 ? 1 : 0), 1, 10);
  const originality = clamp(3 + (firstHand ? 3 : 0) + Math.min(3, specifics(body) * 0.4) - slop * 4, 1, 10);
  const depth = clamp(2 + Math.min(5, n / 300) + Math.min(2, headings * 0.4), 1, 10);
  const kwCount = String(a.query).trim() ? String(a.body).toLowerCase().split(String(a.query).toLowerCase().trim()).length - 1 : 0;
  const stuffedQ = n > 0 && kwCount / Math.max(1, n / 100) > 3;
  const firstPara = wc(String(a.body).split(/\n\s*\n/)[0]);
  const directAnswer = firstPara >= 15 && firstPara <= 80;
  const sourced = (body.match(/https?:\/\/|according to|\(20\d\d\)|source:/gi) ?? []).length;
  const byline = /\b(by [A-Z][a-z]+|updated|published|author|disclosure|our product|we make)\b/i.test(body);
  const crit = {
    intent_match: clamp(to5(intentMatch) - (stuffedQ ? 2 : 0), 1, 5),
    first_hand_experience: to5(originality), depth_accuracy: to5(depth),
    citable_structure: clamp(1 + (headings >= 3 ? 1.5 : headings ? 0.5 : 0) + (directAnswer ? 1 : 0) + Math.min(1.5, sourced * 0.5) + Math.min(1, specifics(body) * 0.2), 1, 5),
    trust_signals: clamp(1 + (byline ? 1.5 : 0) + Math.min(2, sourced * 0.7) + (firstHand ? 0.5 : 0), 1, 5),
    no_filler: clamp(5 - slop * 4 - (stuffedQ ? 2 : 0) - (n > 1800 && specifics(body) < 3 ? 1 : 0), 1, 5),
    evidence: stuffedQ ? `Query repeated ${kwCount} times in ${n} words` : slop > 0.4 ? 'AI filler phrases present' : firstHand ? 'First-hand phrasing found' : 'No first-hand evidence found',
  };
  return {
    ...crit,
    intentMatch: stuffedQ ? Math.min(intentMatch, 4) : intentMatch,
    originality,
    depth,
    aiSlop: +slop.toFixed(2),
    informational: !commercial,
    citable: +clamp(0.05 + (commercial ? 0.15 : 0) + (firstHand ? 0.15 : 0) + Math.min(0.2, specifics(body) * 0.02) - slop * 0.3, 0, 0.6).toFixed(2),
    feedback: slop > 0.4 ? 'Reads like AI filler: Google\'s helpful-content systems and readers will discount it.' : firstHand ? 'First-hand detail gives it a real chance.' : 'Competent but nothing the top results do not already say. Add your own data or experience.',
  };
}
export async function judgeArticle(ctx, a) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'seo_article_review', rubric: ARTICLE_CRITERIA,
    system: `You are a senior SEO editor in 2026 who has watched AI Overviews and LLM answer engines eat informational clicks. You reward pages with first-hand experience, original data and exact intent match, and you punish AI slop. Repeating the query, extra length and generic headings earn nothing.\n${rubricText(ARTICLE_CRITERIA)}`,
    prompt: `Target query: "${a.query}"\nTITLE: ${a.title}\n---\n${String(a.body).slice(0, 12000)}\n---\nSite: ${state.company.name}, ${state.company.oneLiner}.`,
    schema: ARTICLE_SCHEMA, temperature: 0.4, maxTokens: 2000,
    fallback: () => articleHeuristic(state, a), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f);
  const slop = avg('aiSlop') ?? 0.3;
  const holistic = clamp(((avg('intentMatch') ?? 5) * 1.2 + (avg('originality') ?? 5) * 1.3 + (avg('depth') ?? 5) * 0.8) / 33, 0, 1);
  const rub = rubricSkill(results, ARTICLE_CRITERIA);
  const q = rub == null ? holistic : clamp(0.5 * holistic + 0.5 * rub, 0, 1);
  return {
    quality: q, rubric: rub, slop, informational: results.filter((r) => r.informational).length >= results.length / 2,
    citable: avg('citable') ?? 0.1, results, mock: results.some((r) => r.mock),
  };
}

// ---------------- App Store listing (ASO) ----------------

const ASO_BASE = {
  type: 'object', additionalProperties: false, required: ['relevance', 'clarity', 'keywordUse', 'stuffing', 'feedback'],
  properties: {
    relevance: { type: 'number', description: '1-10 would the target user searching the store find and recognise this?' },
    clarity: { type: 'number', description: '1-10 does the title+subtitle say what it does and for whom in 2 seconds?' },
    keywordUse: { type: 'number', description: '1-10 keyword field: relevant, non-duplicated, uses the 100 characters well' },
    stuffing: { type: 'boolean', description: 'keyword stuffing, competitor names or misleading terms (Apple rejects or ranks down)' },
    feedback: { type: 'string', description: 'Two sentences: the biggest problem and the first fix.' },
  },
};
export const ASO_SCHEMA = withRubric(ASO_BASE, ASO_CRITERIA);
export function asoHeuristic(state, a) {
  const t = String(a.title ?? ''), sub = String(a.subtitle ?? ''), kw = String(a.keywords ?? '');
  const kws = kw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const dup = kws.length - new Set(kws).size;
  const titleWords = new Set(t.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const repeatsTitle = kws.filter((k) => titleWords.has(k)).length;
  const words = `${t} ${sub} ${kw}`.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const maxRepeat = Math.max(0, ...Object.values(words.reduce((m, w) => ((m[w] = (m[w] ?? 0) + 1), m), {})));
  const stuffing = maxRepeat >= 4 || dup >= 2 || t.length > 30 || sub.length > 30 || kw.length > 100;
  const fit = icpOverlap(state, `${t} ${sub} ${kw} ${a.description ?? ''}`);
  const relevance = clamp(3 + fit * 6, 1, 10);
  const clarity = clamp(3 + (t.length >= 4 && t.length <= 30 ? 2 : 0) + (sub.length >= 10 && sub.length <= 30 ? 2 : 0) + (hasVerb(sub) ? 1.5 : 0) - countHits(`${t} ${sub}`, BUZZ), 1, 10);
  const keywordUse = clamp(2 + Math.min(4, kws.length / 3) + (kw.length >= 60 && kw.length <= 100 ? 2 : 0) - repeatsTitle * 0.7 - dup, 1, 10);
  const desc = String(a.description ?? '');
  const compNames = /\b(#1|best|free|\$\d|cheapest)\b/i.test(`${t} ${sub}`) || /\b(better than|unlike|vs\.?)\b/i.test(`${t} ${sub} ${kw} ${desc}`);
  const spaced = /,\s/.test(kw);
  const subDup = [...new Set(sub.toLowerCase().split(/\W+/).filter((w) => w.length > 2))].filter((w) => titleWords.has(w)).length;
  const crit = {
    title_clarity: clamp(1 + (t.length >= 4 && t.length <= 30 ? 1.5 : 0) + (wc(t) >= 2 ? 1.5 : 0) + (icpOverlap(state, t) > 0.15 ? 1 : 0) - (t.length > 30 ? 2 : 0), 1, 5),
    subtitle_benefit: clamp(1 + (sub.length >= 10 && sub.length <= 30 ? 2 : 0) + (hasVerb(sub) ? 1 : 0) + (subDup === 0 && sub ? 1 : 0) - (sub.length > 30 ? 2 : 0) - countHits(sub, BUZZ), 1, 5),
    keyword_field: clamp(1 + (kw.length >= 85 && kw.length <= 100 ? 2.5 : kw.length >= 60 && kw.length <= 100 ? 1.5 : kw.length > 100 ? -1 : 0) + Math.min(1.5, kws.length / 8) - repeatsTitle * 0.8 - dup * 1.2 - (spaced ? 0.8 : 0), 1, 5),
    description_hook: clamp(1 + (wc(desc) >= 15 ? 1.5 : 0) + Math.min(1.5, specifics(desc) * 0.7) + (icpOverlap(state, desc) > 0.2 ? 1 : 0) - countHits(desc, BUZZ) * 0.7, 1, 5),
    audience_match: to5(relevance),
    guideline_safe: clamp(5 - (stuffing ? 2.5 : 0) - (compNames ? 1.5 : 0) - (maxRepeat >= 3 ? 1 : 0), 1, 5),
    evidence: stuffing ? `Over-length or repeated terms (max repeat ${maxRepeat}, keyword field ${kw.length}/100)` : `Keyword field ${kw.length}/100 characters, ${repeatsTitle} duplicated from title`,
  };
  return { ...crit, relevance, clarity, keywordUse, stuffing, feedback: stuffing ? 'Keyword stuffing or over-length fields: Apple will reject or bury this.' : repeatsTitle ? 'Don\'t repeat title words in the keyword field; Apple already indexes the title.' : 'Clear enough. Test a subtitle that names the outcome, not the feature.' };
}
export async function judgeAso(ctx, a) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'aso_listing_review', rubric: ASO_CRITERIA,
    system: `You are an App Store Optimization specialist in 2026. Target user: ${state.company.icp || state.company.oneLiner}. Apple limits: title 30, subtitle 30, keyword field 100 characters. Words already in the title or subtitle are indexed, so repeating them in the keyword field wastes characters; stuffing, competitor names and claims like "#1" are guideline violations.\n${rubricText(ASO_CRITERIA)}`,
    prompt: `TITLE: ${a.title}\nSUBTITLE: ${a.subtitle}\nKEYWORDS: ${a.keywords}\nDESCRIPTION (first lines): ${String(a.description ?? '').slice(0, 600)}`,
    schema: ASO_SCHEMA, temperature: 0.3, maxTokens: 2000,
    fallback: () => asoHeuristic(state, a), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const stuffed = results.some((r) => r.stuffing);
  const holistic = clamp((avg('relevance') + avg('clarity') + avg('keywordUse')) / 30, 0, 1);
  const rub = rubricSkill(results, ASO_CRITERIA);
  const score = clamp((rub == null ? holistic : 0.5 * holistic + 0.5 * rub) - (stuffed ? 0.4 : 0), 0, 1);
  return { score, results, mock: results.some((r) => r.mock), feedback: results[0]?.feedback ?? '' };
}
