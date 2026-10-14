// LLM judges for growth work (ad creatives, UGC briefs, social posts, community posts, SEO articles) and their
// deterministic offline fallbacks. Heuristics reward specificity and ICP fit and punish generic, buzzwordy
// or AI-slop copy. All judges return a `skill` in 0..1 that nudges the statistical model; they never decide
// outcomes alone (LLM = judgment, statistics = scale).

import { REALISM, averageField } from '../../core/llm.js';

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

// Meta-style ad review: personal-attribute claims and guarantees get rejected [design, based on Meta ad policies].
export function policyCheck(text) {
  const t = String(text ?? '').toLowerCase();
  if (/\b(are you|you're|you are)\s+(fat|overweight|depressed|broke|in debt|diabetic|anxious|lonely|bald)\b/.test(t)) return 'Rejected: asserts personal attributes ("are you…"). Meta prohibits implying you know someone\'s health, finances or identity.';
  if (/guarantee(d)?\s+(results|income|weight|money)|get rich|lose \d+ ?(lbs|kg) in/.test(t)) return 'Rejected: unrealistic or guaranteed outcome claims.';
  return null;
}

// ---------------- Ad creatives ----------------

export const CREATIVE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reaction', 'stopScroll', 'hook', 'clarity', 'relevance', 'specificity', 'generic', 'wouldClick'],
  properties: {
    reaction: { type: 'string', description: 'One blunt sentence, in character, as you scroll past.' },
    stopScroll: { type: 'number', description: '0-1: chance the first 3 seconds / headline stops your thumb.' },
    hook: { type: 'number', description: '1-10 hook strength' },
    clarity: { type: 'number', description: '1-10: do I get what it is and who it is for?' },
    relevance: { type: 'number', description: '1-10: message-market fit for someone like me' },
    specificity: { type: 'number', description: '1-10: concrete outcomes, numbers, situations vs vague claims' },
    generic: { type: 'boolean', description: 'true if it could be an ad for any app in this category' },
    wouldClick: { type: 'number', description: '0-1 probability I tap through' },
  },
};

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
  return {
    reaction: generic ? 'Looks like every other app ad. Scrolled.' : s > 0.6 ? 'That first line is about my exact situation. I paused.' : 'Not sure this is for me.',
    stopScroll: +clamp(0.1 + s * 0.35, 0.05, 0.5).toFixed(2), hook: stuffed ? Math.min(hook, 3) : noVerb ? Math.min(hook, 5) : hook, clarity, relevance: stuffed ? Math.min(relevance, 4) : relevance, specificity, generic,
    wouldClick: +clamp(0.005 + s * s * 0.04, 0.002, 0.06).toFixed(3),
  };
}

// Combine panel answers into a 0..1 skill score (generic copy is penalized).
export function creativeSkill(results) {
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const genericShare = results.filter((d) => d.generic).length / Math.max(1, results.length);
  const s = 0.35 * avg('hook') / 10 + 0.25 * avg('relevance') / 10 + 0.2 * avg('specificity') / 10 + 0.2 * avg('clarity') / 10;
  return clamp(s - 0.15 * genericShare + 0.1 * (clamp((avg('stopScroll') ?? 0.25) / 0.35, 0, 1.4) - 0.7), 0, 1);
}

export async function judgeCreative(ctx, c) {
  const state = ctx.state;
  const icp = state.company.icp || state.company.oneLiner || 'the target customer';
  const persona = state.company.model === 'b2c' ? 'a person in the target audience scrolling Instagram Reels / TikTok on their phone at night' : 'a busy professional in the target audience scrolling LinkedIn / Instagram between meetings';
  const res = await ctx.llm.panel({
    task: 'ad_creative_review',
    system: `${REALISM}\nYou are ${persona}. Target customer profile: ${icp}. It is late 2026; your feed is full of AI-made ads.`,
    prompt: `This ad appears in your feed (${c.format.replace('_', ' ')}${c.platformHint ? ` on ${c.platformHint}` : ''}).\nFIRST 3 SECONDS / HOOK: ${c.hook}\nPRIMARY TEXT: ${c.primaryText}\nHEADLINE: ${c.headline}\nBUTTON: ${c.cta}\nProduct: ${state.company.oneLiner || state.company.name}. Judge it as you would react in real life.`,
    schema: CREATIVE_SCHEMA, temperature: 0.7, maxTokens: 400,
    fallback: () => creativeHeuristic(state, c),
    cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  return { skill: creativeSkill(results), results, mock: results.some((r) => r.mock) };
}

// ---------------- UGC briefs ----------------

export const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['clarity', 'hookStrength', 'icpFit', 'actionable', 'feedback', 'missing'],
  properties: {
    clarity: { type: 'number', description: '1-10 could a creator film this without asking questions?' },
    hookStrength: { type: 'number', description: '1-10 strength of the suggested opening hooks' },
    icpFit: { type: 'number', description: '1-10 does it target a specific viewer with a specific pain?' },
    actionable: { type: 'number', description: '1-10 concrete shots, dos/donts, length, CTA' },
    feedback: { type: 'string' },
    missing: { type: 'array', items: { type: 'string' } },
  },
};

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
  return {
    clarity, hookStrength, icpFit, actionable,
    feedback: struct < 3 ? 'Creators will improvise because the brief lacks structure: give hooks, length, shots, dos/don\'ts and the CTA.' : 'Clear enough to film. Sharper, specific hooks would help.',
    missing: [!has(/hook|first (3|three) sec/) && 'Hook options for the first 3 seconds', !has(/(15|20|30|45|60)\s?(s|sec|seconds)|length/) && 'Video length', !has(/don'?t|avoid|do not/) && "Dos and don'ts", !has(/cta|call to action|link|download|try/) && 'Call to action'].filter(Boolean),
  };
}
export async function judgeBrief(ctx, b) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'ugc_brief_review',
    system: `You are an experienced UGC creator and performance creative strategist in 2026 who has filmed hundreds of paid social ads. Be blunt. Target customer: ${state.company.icp || state.company.oneLiner}.`,
    prompt: `Rate this creator brief for a ${state.company.model === 'b2c' ? 'consumer subscription app' : 'B2B SaaS'} (${state.company.oneLiner || state.company.name}).\nHOOK IDEAS: ${b.hook}\nKEY MESSAGE: ${b.keyMessage}\nNOTES / SHOTS / DOS & DON'TS: ${b.notes}`,
    schema: BRIEF_SCHEMA, temperature: 0.5, maxTokens: 500,
    fallback: () => briefHeuristic(state, b), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const score = clamp((avg('clarity') + avg('hookStrength') * 1.3 + avg('icpFit') + avg('actionable') * 0.7) / 40, 0, 1);
  return { score, results, mock: results.some((r) => r.mock) };
}

// ---------------- Social posts (build in public, launch announcements) ----------------

export const POST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reaction', 'hook', 'specificity', 'authenticity', 'value', 'salesy', 'engage'],
  properties: {
    reaction: { type: 'string' },
    hook: { type: 'number', description: '1-10 does the first line make you read on?' },
    specificity: { type: 'number', description: '1-10 real numbers, real story, real lessons' },
    authenticity: { type: 'number', description: '1-10 sounds like a human founder, not AI/LinkedIn-bro' },
    value: { type: 'number', description: '1-10 useful or interesting to a reader who does not care about the product' },
    salesy: { type: 'boolean' },
    engage: { type: 'number', description: '0-1 chance you like/comment/repost' },
  },
};
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
  return { reaction: salesy ? 'Another founder selling at me.' : story ? 'Real numbers and a real story, I read it all.' : 'Fine, scrolled on.', hook, specificity, authenticity, value, salesy, engage: +clamp((hook + value) / 20 * 0.06, 0.002, 0.08).toFixed(3) };
}
export function postSkill(results) {
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const salesyShare = results.filter((d) => d.salesy).length / Math.max(1, results.length);
  return clamp((avg('hook') * 1.3 + avg('specificity') + avg('authenticity') + avg('value') * 1.2) / 45 - 0.12 * salesyShare, 0, 1);
}
export async function judgePost(ctx, text, platform, purpose = 'build in public') {
  const state = ctx.state;
  const audience = platform === 'linkedin' ? 'a LinkedIn user in the founder\'s network (operators, founders, people in the industry)' : platform === 'x' ? 'an X/Bluesky user who follows indie founders and builders' : 'someone who knows the founder personally';
  const res = await ctx.llm.panel({
    task: 'social_post_review',
    system: `${REALISM}\nYou are ${audience}. The year is 2026 and your feed is flooded with AI-written "lessons" posts.`,
    prompt: `The founder of ${state.company.name} (${state.company.oneLiner || 'a startup'}) posted this (${purpose}) on ${platform}:\n---\n${String(text).slice(0, 3000)}\n---\nReact as you really would.`,
    schema: POST_SCHEMA, temperature: 0.7, maxTokens: 350,
    fallback: () => postHeuristic(state, text), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  return { skill: postSkill(results), results, mock: results.some((r) => r.mock) };
}

// ---------------- Community posts (Reddit / Discord / Slack) ----------------

export const COMMUNITY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reaction', 'helpfulness', 'relevance', 'promotional', 'wouldReport'],
  properties: {
    reaction: { type: 'string' },
    helpfulness: { type: 'number', description: '1-10 useful to members even if they never buy' },
    relevance: { type: 'number', description: '1-10 on-topic for this community' },
    promotional: { type: 'number', description: '0-1 how much this is self-promotion' },
    wouldReport: { type: 'boolean', description: 'Would you report it / would a mod remove it?' },
  },
};
export function communityHeuristic(state, post) {
  const t = `${post.title} ${post.body}`;
  const link = /https?:\/\/|www\.|\.com\b|\.app\b|\.io\b/i.test(t);
  const name = state.company.name && t.toLowerCase().includes(state.company.name.toLowerCase());
  const pitch = /(i built|we built|check out|my (app|tool|startup)|sign up|launching|free trial|discount)/i.test(t);
  const helpful = clamp(3 + Math.min(3, specifics(t) * 0.8) + (wc(post.body) > 80 ? 2 : 0) + (/\?/.test(post.title) ? 0.5 : 0) - (pitch ? 2 : 0), 1, 10);
  const promotional = clamp((link ? 0.35 : 0) + (name ? 0.25 : 0) + (pitch ? 0.35 : 0), 0, 1);
  return { reaction: promotional > 0.5 ? 'Thinly veiled ad. Downvoted.' : helpful > 6 ? 'Actually useful, saved it.' : 'Meh.', helpfulness: helpful, relevance: clamp(4 + icpOverlap(state, t) * 5, 1, 10), promotional, wouldReport: promotional > 0.6 };
}
export async function judgeCommunityPost(ctx, post) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'community_post_review',
    system: `${REALISM}\nYou are a long-time member (and part-time moderator) of the community "${post.community}" (${post.kind}). Self-promotion rules are strict; you can smell a stealth ad.`,
    prompt: `New post:\nTITLE: ${post.title}\n---\n${String(post.body).slice(0, 3000)}\n---\nThe author is the founder of ${state.company.name}.`,
    schema: COMMUNITY_SCHEMA, temperature: 0.6, maxTokens: 300,
    fallback: () => communityHeuristic(state, post), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f);
  return {
    helpfulness: (avg('helpfulness') ?? 5) / 10, relevance: (avg('relevance') ?? 5) / 10, promotional: avg('promotional') ?? 0.5,
    report: results.filter((r) => r.wouldReport).length / Math.max(1, results.length), results, mock: results.some((r) => r.mock),
  };
}

// ---------------- SEO / GEO articles ----------------

export const ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['intentMatch', 'originality', 'depth', 'aiSlop', 'informational', 'citable', 'feedback'],
  properties: {
    intentMatch: { type: 'number', description: '1-10 does it answer exactly what someone searching the query wants?' },
    originality: { type: 'number', description: '1-10 first-hand experience, data, opinions not found in the top 10 results' },
    depth: { type: 'number', description: '1-10' },
    aiSlop: { type: 'number', description: '0-1 how much it reads like generic AI-generated filler' },
    informational: { type: 'boolean', description: 'true if the query is informational (likely to show an AI Overview), false if commercial/transactional' },
    citable: { type: 'number', description: '0-1 chance an LLM answer engine would cite this page (clear facts, comparisons, pricing, unique data)' },
    feedback: { type: 'string' },
  },
};
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
  return {
    intentMatch: clamp(3 + inTitle * 3 + inBody * 2 + (n > 600 ? 1 : 0), 1, 10),
    originality: clamp(3 + (firstHand ? 3 : 0) + Math.min(3, specifics(body) * 0.4) - slop * 4, 1, 10),
    depth: clamp(2 + Math.min(5, n / 300) + Math.min(2, headings * 0.4), 1, 10),
    aiSlop: +slop.toFixed(2),
    informational: !commercial,
    citable: +clamp(0.05 + (commercial ? 0.15 : 0) + (firstHand ? 0.15 : 0) + Math.min(0.2, specifics(body) * 0.02) - slop * 0.3, 0, 0.6).toFixed(2),
    feedback: slop > 0.4 ? 'Reads like AI filler: Google\'s helpful-content systems and readers will discount it.' : firstHand ? 'First-hand detail gives it a real chance.' : 'Competent but nothing the top results do not already say. Add your own data or experience.',
  };
}
export async function judgeArticle(ctx, a) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'seo_article_review',
    system: 'You are a senior SEO editor in 2026 who has watched AI Overviews and LLM answer engines eat informational clicks. You reward pages with first-hand experience, original data and exact intent match, and you punish AI slop.',
    prompt: `Target query: "${a.query}"\nTITLE: ${a.title}\n---\n${String(a.body).slice(0, 12000)}\n---\nSite: ${state.company.name}, ${state.company.oneLiner}.`,
    schema: ARTICLE_SCHEMA, temperature: 0.4, maxTokens: 400,
    fallback: () => articleHeuristic(state, a), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f);
  const slop = avg('aiSlop') ?? 0.3;
  const q = clamp(((avg('intentMatch') ?? 5) * 1.2 + (avg('originality') ?? 5) * 1.3 + (avg('depth') ?? 5) * 0.8) / 33, 0, 1);
  return {
    quality: q, slop, informational: results.filter((r) => r.informational).length >= results.length / 2,
    citable: avg('citable') ?? 0.1, results, mock: results.some((r) => r.mock),
  };
}

// ---------------- App Store listing (ASO) ----------------

export const ASO_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['relevance', 'clarity', 'keywordUse', 'stuffing', 'feedback'],
  properties: {
    relevance: { type: 'number', description: '1-10 would the target user searching the store find and recognise this?' },
    clarity: { type: 'number', description: '1-10 does the title+subtitle say what it does and for whom in 2 seconds?' },
    keywordUse: { type: 'number', description: '1-10 keyword field: relevant, non-duplicated, uses the 100 characters well' },
    stuffing: { type: 'boolean', description: 'keyword stuffing, competitor names or misleading terms (Apple rejects or ranks down)' },
    feedback: { type: 'string' },
  },
};
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
  return { relevance, clarity, keywordUse, stuffing, feedback: stuffing ? 'Keyword stuffing or over-length fields: Apple will reject or bury this.' : repeatsTitle ? 'Don\'t repeat title words in the keyword field; Apple already indexes the title.' : 'Clear enough. Test a subtitle that names the outcome, not the feature.' };
}
export async function judgeAso(ctx, a) {
  const state = ctx.state;
  const res = await ctx.llm.panel({
    task: 'aso_listing_review',
    system: `You are an App Store Optimization specialist in 2026. Target user: ${state.company.icp || state.company.oneLiner}. Apple limits: title 30, subtitle 30, keyword field 100 characters.`,
    prompt: `TITLE: ${a.title}\nSUBTITLE: ${a.subtitle}\nKEYWORDS: ${a.keywords}\nDESCRIPTION (first lines): ${String(a.description ?? '').slice(0, 600)}`,
    schema: ASO_SCHEMA, temperature: 0.3, maxTokens: 300,
    fallback: () => asoHeuristic(state, a), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const stuffed = results.some((r) => r.stuffing);
  const score = clamp((avg('relevance') + avg('clarity') + avg('keywordUse')) / 30 - (stuffed ? 0.4 : 0), 0, 1);
  return { score, results, mock: results.some((r) => r.mock), feedback: results[0]?.feedback ?? '' };
}
