// LLM judges for the player's channel work (affiliate outreach, partner kits, marketplace listings, PR pitches,
// ad reads, talk abstracts, co-marketing proposals, call scripts, mail notes, LTD applications, price-increase
// notices) with deterministic heuristic fallbacks. The judge returns a quality score that nudges the
// statistical model inside research ranges — it never decides outcomes alone (LLM = judgment, statistics = scale).

import { REALISM } from '../../core/llm.js';
import { BUZZ, SLOP, countHits, icpOverlap } from '../growth/judges.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const wc = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const specifics = (t) => (String(t ?? '').match(/\d+(\.\d+)?\s?(%|x|×|hours?|minutes?|days?|weeks?|months?|k\b)|\$\s?\d+|\d{2,}/gi) ?? []).length;

export const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'verdict', 'reply', 'issues', 'accept'],
  properties: {
    score: { type: 'number', description: '0-10: how well this works on someone like you (be harsh; 5 = ignorable, 8+ = rare).' },
    verdict: { type: 'string', description: 'One blunt sentence, in character.' },
    reply: { type: 'string', description: 'What you would actually write back (empty string if you would ignore it). Max 80 words.' },
    issues: { type: 'array', items: { type: 'string' }, description: 'Up to 3 specific problems.' },
    accept: { type: 'boolean', description: 'Would you say yes / take the next step?' },
  },
};

// kind → persona, task, ideal word range, keywords that a good artifact of this kind should contain.
export const KINDS = {
  affiliate_outreach: { persona: (s) => `a creator/blogger who already writes about ${s.company.icp || 'this category'} and receives ~20 affiliate pitches a week`, task: 'Judge this affiliate-recruitment DM sent to you.', words: [40, 140], keys: ['commission', '%', 'recurring', 'your', 'audience', 'link'], personal: true },
  affiliate_brief: { persona: () => 'an affiliate deciding whether this program is worth promoting to your audience', task: 'Judge this affiliate brief / partner kit.', words: [120, 500], keys: ['commission', 'cookie', 'payout', 'audience', 'demo', 'prohibit', 'brand', 'coupon', 'example'], personal: false },
  referral_email: { persona: (s) => `an existing paying customer (${s.company.icp || 'typical user'}) who is moderately happy with the product`, task: 'Judge this email announcing a referral program.', words: [50, 180], keys: ['both', 'free', 'credit', 'month', 'link', 'friend', 'colleague'], personal: false },
  listing: { persona: (s) => `someone browsing an app marketplace searching for a tool for: ${s.company.icp || s.company.oneLiner || 'their job'}`, task: 'Judge this app-store listing (name, tagline, description). Would you install it?', words: [80, 400], keys: ['minute', 'install', 'connect', 'sync', 'automatically', 'free', 'trial', 'review'], personal: false },
  comarketing: { persona: (s, x) => `the ${x?.contact ?? 'partnerships lead'} at ${x?.name ?? 'a partner company'} (${x?.category ?? 'software company'}, audience ~${x?.audience ?? '?'})`, task: 'Judge this co-marketing proposal from a smaller company. Big partners rarely reciprocate for seed startups.', words: [60, 220], keys: ['audience', 'webinar', 'newsletter', 'customers', 'both', 'date', 'overlap'], personal: true },
  partner_pitch: { persona: (s, x) => `the owner of ${x?.name ?? 'an agency'} (${x?.type ?? 'agency'}), who already sells to ${s.company.icp || 'your customers'} and gets pitched by SaaS partner programs constantly`, task: 'Judge this partner-program pitch.', words: [60, 220], keys: ['margin', '%', 'clients', 'referral', 'training', 'deal', 'revenue'], personal: true },
  pr_pitch: { persona: (s, x) => `a ${x?.tier === 'tier1' ? 'tier-1 tech reporter' : 'trade journalist'} covering ${x?.beat ?? 'startups'} who gets 100+ pitches a day and replies to ~3%`, task: 'Judge this media pitch. Is there a story?', words: [60, 150], keys: ['data', 'exclusive', 'embargo', 'customers', 'raised', 'found', '%', 'first'], personal: true },
  ad_read: { persona: (s, x) => `a listener/viewer of "${x?.name ?? 'the show'}" in the middle of an episode`, task: 'Judge this sponsored ad read / talking points.', words: [60, 200], keys: ['code', '/', 'free', 'trial', 'because', 'i '], personal: false },
  talk_abstract: { persona: () => 'a conference program committee reviewer with 300 CFP submissions to read', task: 'Judge this talk proposal. Reject vendor pitches.', words: [100, 300], keys: ['learn', 'data', 'lessons', 'mistakes', 'case', 'how'], personal: false },
  call_script: { persona: (s) => `a busy ${s.company.icp || 'business owner'} who just picked up an unknown number`, task: 'Judge this cold-call opener/script. Would you stay on the line and agree to a meeting?', words: [60, 250], keys: ['?', 'reason', 'noticed', 'minute', 'worth'], personal: false },
  mail_note: { persona: (s) => `a ${s.company.icp || 'decision maker'} opening physical mail at the office`, task: 'Judge this direct-mail note.', words: [30, 150], keys: ['you', 'noticed', '?', 'call', 'link'], personal: false },
  ltd_application: { persona: () => 'an AppSumo-style deal scout who rejects most applicants and cares about broad appeal, demo-ability and support readiness', task: 'Judge this lifetime-deal application.', words: [100, 350], keys: ['users', 'support', 'limits', 'demo', 'roadmap', 'customers'], personal: false },
  tool_idea: { persona: (s) => `a ${s.company.icp || 'potential customer'} searching Google/ChatGPT for a quick free tool`, task: 'Judge this free-tool idea and page copy: would you use it, and does it lead naturally to the paid product?', words: [40, 250], keys: ['free', 'calculator', 'generator', 'check', 'grader', 'template', 'result'], personal: false },
  listicle_pitch: { persona: () => 'the author of a "best tools for X" listicle who is pitched daily to add vendors', task: 'Judge this request to be included in your list.', words: [50, 160], keys: ['review', 'customers', 'differen', 'pricing', 'honest', 'compare'], personal: true },
  price_notice: { persona: (s) => `an existing paying customer (${s.company.icp || 'typical user'}) reading a price-increase email`, task: 'Judge this price-increase notice. How do you feel; would you cancel?', words: [80, 300], keys: ['why', 'new price', 'from', 'starting', 'keep', 'locked', 'annual', 'added', 'thank'], personal: false },
};

/**
 * Deterministic offline judge. Rewards: ideal length, kind-specific keywords, specifics (numbers), ICP fit,
 * personalization (names the recipient), a clear ask. Punishes: buzzwords, AI slop, walls of text.
 * → { score 0..10, verdict, reply, issues, accept }
 */
export function heuristicJudge(state, kind, text, extra = {}) {
  const k = KINDS[kind] ?? KINDS.affiliate_outreach;
  const t = String(text ?? '');
  const low = t.toLowerCase();
  const n = wc(t);
  const [lo, hi] = k.words;
  const len = n < lo * 0.5 ? -3 : n < lo ? -1 : n > hi * 1.6 ? -2.5 : n > hi ? -1 : 1;
  const keys = k.keys.filter((x) => low.includes(x)).length / k.keys.length;
  const buzz = countHits(t, BUZZ), slop = countHits(t, SLOP);
  const fit = icpOverlap(state, t);
  const spec = Math.min(4, specifics(t));
  const ask = /\?|would you|interested|can we|reply|book|call me|open to|let me know/i.test(t) ? 1 : 0;
  const name = extra.recipient && low.includes(String(extra.recipient).toLowerCase().split(/\s+/)[0]) ? 1 : 0;
  const personal = k.personal ? (name || /\{\{?\s*(first_?name|name)\s*\}?\}/i.test(t) ? 0.8 : -0.8) : 0;
  // Calibrated so a solid, specific draft lands ~6–8 and only exceptional work reaches 9 (real readers are harsh).
  let score = 2.2 + len + keys * 2.4 + Math.min(3, spec) * 0.4 + fit * 1.2 + ask * 0.5 + personal * 0.8 - buzz * 0.6 - slop * 0.8;
  if (kind === 'price_notice') {
    const hasDate = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2}|\bdays\b/i.test(t);
    const keep = /(keep|lock|grandfather|current price|annual)/i.test(t);
    const why = /(because|why|cost|invest|added|new feature|improv)/i.test(t);
    score += (hasDate ? 0.8 : -1) + (keep ? 0.6 : 0) + (why ? 0.8 : -1.2) - (/sorry for the inconvenience|unfortunately/i.test(t) ? 0.4 : 0);
  }
  score = +clamp(score, 0, 10).toFixed(1);
  const issues = [];
  if (n < lo) issues.push(`Too thin (${n} words) to be convincing.`);
  if (n > hi) issues.push(`Too long (${n} words): people skim.`);
  if (buzz + slop > 1) issues.push('Generic marketing language; reads like AI-written outreach.');
  if (keys < 0.3) issues.push('Missing the specifics this reader needs to decide.');
  if (k.personal && !personal) issues.push('Not personalized to the recipient.');
  if (!ask && kind !== 'price_notice' && kind !== 'listing' && kind !== 'affiliate_brief') issues.push('No clear ask or next step.');
  const accept = score >= 6.5;
  return {
    score,
    verdict: score >= 7 ? 'Specific and worth my time.' : score >= 5 ? 'Fine, but I see ten of these a week.' : 'Generic. I would ignore this.',
    reply: accept ? (kind === 'price_notice' ? 'Thanks for the heads-up and for keeping my price for now.' : 'Interesting — send me more details.') : '',
    issues: issues.slice(0, 3),
    accept,
  };
}

/**
 * Judge an artifact with the LLM panel (cached by content) and return { quality 0..1, score, results, mock }.
 * extra: context object passed to the persona builder ({ name, audience, tier, beat, recipient … }).
 */
export async function judgeArtifact(ctx, kind, text, extra = {}) {
  const state = ctx.state;
  const k = KINDS[kind];
  const company = `${state.company.name}: ${state.company.oneLiner || '(no one-liner)'}; ICP: ${state.company.icp || 'not specified'}`;
  const res = await ctx.llm.panel({
    task: `channels_${kind}`,
    system: `${REALISM}\nYou are ${k.persona(state, extra)}. The year is 2026.`,
    prompt: `${k.task}\nThe sender: ${company}.\n${extra.context ? `Context: ${extra.context}\n` : ''}\n=== TEXT ===\n${String(text).slice(0, 6000)}\n=== END ===`,
    schema: JUDGE_SCHEMA,
    temperature: 0.7,
    maxTokens: 500,
    fallback: () => heuristicJudge(state, kind, text, extra),
    cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const scores = results.map((r) => clamp(Number(r.score) || 0, 0, 10));
  const score = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  return { quality: +clamp(score / 10, 0, 1).toFixed(3), score: +score.toFixed(1), results, mock: results.every((r) => r.mock), day: state.day, words: wc(text) };
}

// A single persona reply (e.g. a partner answering a proposal), consistent with a decision the game already made.
export const REPLY_SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string', description: 'Max 120 words, in character, plain text.' } } };

export async function personaReply(ctx, { persona, situation, decision, fallback }) {
  const r = await ctx.llm.ask({
    task: 'channels_reply',
    system: `${REALISM}\nYou are ${persona}. The year is 2026. Write a short, realistic email reply.`,
    prompt: `${situation}\n\nYour decision (already made, do not change it): ${decision}.\nWrite the reply email consistent with that decision.`,
    schema: REPLY_SCHEMA,
    temperature: 0.8,
    maxTokens: 400,
    fallback,
    cache: ctx.state.cache,
  });
  return { ...r.data, mock: r.mock };
}
