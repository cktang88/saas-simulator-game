// Building the marketing site with LLMs (the 2026 default). Two families of paths, each with its own paradigm:
//  - An AI coding agent on your own repo (Claude Code / Cursor / Codex, the plans in product/agent.js): most founder
//    hours, but you own the code, choose static/SSR rendering, and nothing caps the quality except your spec, copy
//    brief and review. Uses the same plan allowance as product work (usageFor), so a site sprint eats agent hours.
//  - AI app builders generating the site (Lovable / v0 / Bolt / Replit): fewest hours, but each has its own billing
//    unit, rendering default and lock-in. Lovable ships a client-rendered React SPA (Vite) with one index.html head,
//    so per-page meta and crawlable HTML need extra work or a later move; v0 generates Next.js on Vercel (static or
//    server-rendered pages by default); Bolt lets you pick the framework (Vite SPA unless you ask for Astro/Next)
//    and re-sends the growing project as context, so tokens per edit rise with every page; Replit's agent builds and
//    hosts a React + Express app, billed by effort in arrears, and hosting ties you to Replit.
// What the player does decides the outcome, not the tool alone: a positioning-first copy brief and a page spec set
// the quality; reviewing the output strips generic AI copy; SSR/meta/speed checks fix the SEO and page-speed
// defaults; iterating on real data (a panel run or traffic since the build) improves it, while blind redesigns go in
// circles. A one-shot prompt with generic copy reads like every other AI-built site and ships SPA SEO problems.
//
// Sources: docs/research/tools/2026q4/web-content.md §1 (Lovable credits per task: 0.5 button, 1.2 auth, 1.7 landing
// page; monthly credits expire, no refunds [verified: lovable.dev/pricing]; Bolt token-based, v0 Vercel/React,
// Replit effort-based [third-party]); docs/research/tools/deep/d07-ai-coding.md (Bolt Pro $25 = 10M tokens, Replit
// Core $20 incl. $20 credits); growth/seoDynamics.js (CSR marketing pages index slower and drop pages, Vercel/MERJ).
// Page speed: Google's "good" LCP threshold is 2.5 s (Core Web Vitals); Deloitte "Milliseconds Make Millions" (2020):
// 0.1 s faster mobile pages lifted retail conversion ~8%; Portent (2022): B2B pages loading in 1 s convert ~3x a
// 5 s page. The game uses a deliberately smaller slope [design]. All hours, credit burn, ceilings and lock-in hours
// below are [design] estimates unless tagged otherwise.
//
// Framer / Webflow: not offered (user direction, 2026-10). See SITE_NOTES.

import { clamp, round2, monthKey, uid, rng } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { setModifier } from '../../core/market.js';
import { logMistake } from '../../core/operator.js';
import { PLANS, DEFAULT_PLAN, DEFAULT_WORKFLOW, usageFor, throughputFactor, reworkShare } from '../product/agent.js';
import { activePlan } from '../product/engine.js';
import { ensureSeo, technicalSetup, migrateSite, liveArticles } from '../growth/seoDynamics.js';

// billing: plan (coding-agent allowance) | credits (per task, expire, no refunds) | money (USD credits) | tokens
// (context grows with the project) | effort (billed in arrears). rendering: the default output; ssrFix: how an
// SSR/prerender check is satisfied ('choose' = pick static/SSR at build, 'extra' = extra hours, 'migrate' = not
// possible in the tool). ceiling: best copy/structure quality the tool reaches with a perfect brief and review.
// lcp: largest-contentful-paint seconds on mobile with no speed pass. lockInHours: rework to move off it later.
export const SITE_PATHS = {
  agent_repo: {
    label: 'AI coding agent on your own repo (Claude Code / Cursor / Codex)', billing: 'plan', monthly: 0,
    buildHours: 10, iterateHours: 2, rendering: 'static', ssrFix: 'choose', ssrHours: 0, metaHours: 1, speedHours: 1,
    ceiling: 1, lcp: 2.0, lockInHours: 0, loopBase: 0.15, agentHoursPerBuild: 8, agentHoursPerIterate: 1.5,
    note: 'Most hours, full control: Astro/Next static pages in your repo, your own deploy. Uses your coding plan\'s allowance.',
  },
  lovable: {
    label: 'Lovable (chat to full-stack app)', vendor: 'Lovable', billing: 'credits', monthly: 25, allowance: 100,
    buildUnits: 9, iterateUnits: 2.5, loopUnits: 6, unitUsd: 0.25, unitName: 'credits',
    buildHours: 3, iterateHours: 0.75, rendering: 'csr', ssrFix: 'migrate', ssrHours: 0, metaHours: 1.5, speedHours: 1,
    ceiling: 0.85, lcp: 3.4, lockInHours: 16, loopBase: 0.35,
    note: 'Pro $25: 100 credits/month, charged per task; unused monthly credits expire, failed attempts are not refunded. Output is a client-rendered React SPA.',
  },
  v0: {
    label: 'v0 by Vercel (UI and pages in Next.js)', vendor: 'v0', billing: 'money', monthly: 30, unverified: true, allowance: 30,
    buildUnits: 3, iterateUnits: 0.8, loopUnits: 1.5, unitUsd: 1, unitName: 'USD of credits',
    buildHours: 4, iterateHours: 1, rendering: 'static', ssrFix: 'choose', ssrHours: 0, metaHours: 0.5, speedHours: 0.75,
    ceiling: 0.9, lcp: 2.2, lockInHours: 3, loopBase: 0.2,
    note: '~$30/user [third-party]. React/shadcn pages deployed to Vercel; static or server-rendered by default. Frontend-first: a marketing site is its sweet spot.',
  },
  bolt: {
    label: 'Bolt.new (in-browser, token-metered)', vendor: 'Bolt', billing: 'tokens', monthly: 25, allowance: 10,
    buildUnits: 2, iterateUnits: 0.5, unitsPerPage: 0.25, loopUnits: 1.5, unitUsd: 2.5, unitName: 'M tokens',
    buildHours: 4, iterateHours: 1, rendering: 'csr', ssrFix: 'choose', ssrHours: 1, metaHours: 1, speedHours: 1,
    ceiling: 0.85, lcp: 3.0, lockInHours: 5, loopBase: 0.3,
    note: 'Pro $25: 10M tokens/month. Every prompt re-sends the project, so each edit costs more as the site grows. Vite SPA unless you ask for Astro or Next.',
  },
  replit: {
    label: 'Replit Agent (build and host)', vendor: 'Replit', billing: 'effort', monthly: 20, allowance: 20,
    buildUnits: 12, iterateUnits: 3, loopUnits: 6, unitUsd: 1, unitName: 'USD of effort',
    buildHours: 5, iterateHours: 1, rendering: 'csr', ssrFix: 'extra', ssrHours: 2.5, metaHours: 1, speedHours: 1,
    ceiling: 0.85, lcp: 3.2, lockInHours: 9, loopBase: 0.3,
    note: 'Core $20 incl. $20 of usage; beyond that effort-based pricing billed in arrears (no hard stop). Hosting and database live on Replit.',
  },
};
export const SITE_PATH_ORDER = Object.keys(SITE_PATHS);

// Dated notes (no mechanics): tools some teams still use, and stacks from older founder lists that are now outdated.
export const SITE_NOTES = [
  { id: 'framer_webflow', date: '2026-10', text: 'Some teams still use Framer ($10-30/mo per site) or Webflow (~$25/mo) for designer-led marketing sites. Most founders now build the site with an LLM, so the game models those paths.' },
  { id: 'tips_io', date: '2026-10', outdated: true, text: 'tips.io (HTML + Tailwind playground with AI edits, Show HN Nov 2024): tiny and unconfirmed as maintained; v0 and Lovable cover the niche.' },
  { id: 'reweb', date: '2026-10', outdated: true, text: 'Reweb (once a Next.js + Tailwind visual builder) pivoted to an AI UI design tool that exports to code or Figma; not a site builder any more.' },
  { id: 'angellist_stack', date: '2026-10', outdated: true, text: 'The AngelList "stack" perks page no longer lists startup tools: angellist.com/stack now only covers AngelList\'s own fund, SPV and RUV products.' },
];

export const SITE = {
  briefHours: 1, specHours: 1, reviewHours: { every: 1.5, skim: 0.5, none: 0 },
  // How much of the brief survives into the page: unreviewed output drifts to the model's generic copy [design].
  keep: { every: 1, skim: 0.75, none: 0.45 },
  lcpGood: 2.5, speedPass: 0.6, lcpFloor: 1.2, slowPerSecond: 0.03, slowCap: 0.12, // [design], see header sources
  genericPenalty: 0.06, // "looks like every other AI site": same template, gradient hero, stock claims [design]
  loopHours: 1, loopSpec: 0.12, loopReview: 0.08,
  iterateLift: 0.12, blindLimit: 2,
};

// Generic AI copy the page drifts to when the brief is weak or nobody reviews the output (the landing panel's own
// buzzword checks then score it down).
const FILLER = [
  'Supercharge your workflow with our AI-powered, all-in-one platform.',
  'Seamless integration. Effortless onboarding. Results that scale.',
  'Unlock the power of next-gen automation and transform your business today.',
  'Trusted by forward-thinking teams who want to work smarter, not harder.',
  'Built for the future of work: robust, secure and best-in-class.',
];
const BUZZ = /(revolutioniz|seamless|all-in-one|cutting-edge|supercharge|game-chang|leverage|synerg|world-class|best-in-class|empower|10x|effortless|robust|ai-powered|next-gen|unlock)/gi;

/** Positioning-first copy brief quality 0-1 (deterministic): who it is for, their pain, the difference, proof, a
 *  number and one CTA. Length and buzzwords never help. */
export function briefScore(state, brief) {
  const t = String(brief ?? '');
  const lower = t.toLowerCase();
  const icp = `${state.company?.icp ?? ''} ${state.company?.oneLiner ?? ''}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const parts = {
    audience: icp.some((w) => lower.includes(w)) || /\bfor (\w+ ){0,3}(owners|founders|teams|managers|accountants|agencies|stores|clinics|developers)\b/.test(lower),
    pain: /(tired|spend|waste|hours|manual|spreadsheet|hate|struggl|every (week|day|month)|painful|slow|miss|chas)/.test(lower),
    difference: /(instead of|unlike|without|vs\.?|versus|compared to|the only|no more)/.test(lower),
    proof: /(customer|quote|testimonial|case study|\d+ (teams|stores|users|customers)|logo|review)/.test(lower),
    number: /\d+(\.\d+)?\s?(%|hours?|minutes?|min|x|days|\$)|\$\d+/.test(lower),
    cta: /(start|try|book|sign up|get started|free trial|join the waitlist|reply)/.test(lower),
  };
  const hits = Object.values(parts).filter(Boolean).length;
  const buzz = (lower.match(BUZZ) ?? []).length;
  return { score: round2(clamp(hits / 6 - 0.08 * buzz, 0, 1)), parts, buzz };
}

/** The site state (old saves: none until the first build). */
export function siteBuildSlice(state) {
  const c = state.company;
  if (!c.siteBuild) return null;
  const b = c.siteBuild;
  b.iterations ??= []; b.blind ??= 0; b.loops ??= 0; b.wastedUsd ??= 0; b.migrations ??= [];
  b.usage ??= { month: null, units: 0 };
  return b;
}

function chargeUnits(state, b, path, units, label) {
  const p = SITE_PATHS[path];
  if (p.billing === 'plan') return 0;
  const m = monthKey(state);
  if (b.usage.month !== m) b.usage = { month: m, units: 0 }; // monthly allowance: unused units expire
  const left = Math.max(0, p.allowance - b.usage.units);
  const over = Math.max(0, units - left);
  b.usage.units = round2(b.usage.units + units);
  const usd = round2(over * p.unitUsd);
  if (usd > 0) post(state, { amount: -usd, counterparty: p.vendor, description: `${p.vendor}: ${label} beyond the monthly allowance`, category: 'software', method: 'card' });
  return usd;
}

// The coding-agent path draws on the same plan allowance as product work (product/agent.js usageFor).
function chargeAgent(state, agentHours, w) {
  const planId = activePlan(state) ?? DEFAULT_PLAN;
  const a = state.apps.product?.agent;
  const m = monthKey(state);
  const usage = a?.usage ?? { month: m, hours: 0, overageUsd: 0 };
  if (usage.month !== m) Object.assign(usage, { month: m, hours: 0, overageUsd: 0 });
  const u = usageFor(planId, w, { sessionHours: agentHours, used: usage.hours, overageSoFar: usage.overageUsd });
  usage.hours = round2(usage.hours + u.allowanceUsed);
  usage.overageUsd = round2(usage.overageUsd + u.overageUsd);
  if (u.overageUsd > 0) post(state, { amount: -u.overageUsd, counterparty: PLANS[planId].tool, description: `${PLANS[planId].label}: extra usage building the website`, category: 'software', method: 'card', meta: { dev: true, usage: true } });
  return { planId, stalledHours: u.hoursStalled, overageUsd: u.overageUsd };
}

function ensureSubscription(state, path) {
  const p = SITE_PATHS[path];
  if (!p.monthly) return null;
  const pb = state.apps.product?.builder;
  if (pb?.active && pb.tool === path) return pb.recurringId; // the product app builder bill covers the same workspace
  const subs = (state.company.siteSubs ??= {});
  const live = subs[path] && (state.recurring ?? []).some((r) => r.id === subs[path] && r.active);
  if (live) return subs[path];
  post(state, { amount: -p.monthly, counterparty: p.vendor, description: `${p.vendor} (first month, marketing site)`, category: 'software', method: 'card' });
  subs[path] = addRecurring(state, { vendor: p.vendor, amount: p.monthly, category: 'software', dayOfMonth: 1 + (state.day % 28), note: 'AI site builder (marketing site)' }).id;
  return subs[path];
}

const reviewOf = (r) => (r in SITE.keep ? r : 'skim');

/** Founder hours a build will take (preview for the UI and the caller's ctx.act). */
export function buildHours(path, { spec = false, review = 'skim', checks = {}, framework = null } = {}) {
  const p = SITE_PATHS[path];
  let h = p.buildHours + SITE.briefHours + (spec ? SITE.specHours : 0) + SITE.reviewHours[reviewOf(review)];
  if (checks.ssr && p.ssrFix === 'extra') h += p.ssrHours;
  if (checks.ssr && p.ssrFix === 'choose' && path === 'bolt' && framework !== 'astro') h += p.ssrHours;
  if (checks.meta) h += p.metaHours;
  if (checks.speed) h += p.speedHours;
  return round2(h);
}

/** Generated page text: the brief where it survived, generic AI filler where it did not. */
function pageText(brief, keepShare, generic) {
  const lines = String(brief).split('\n').map((l) => l.trim()).filter(Boolean);
  const kept = lines.slice(0, Math.max(1, Math.round(lines.length * keepShare)));
  const nFill = Math.round(generic * FILLER.length);
  return [...kept, ...FILLER.slice(0, nFill)].join('\n');
}

/**
 * Build (or rebuild) the marketing site. Returns { build, site, hours, usd, warnings }. The caller charges `hours`
 * via ctx.act and passes `site` to setWebsite (website.js). Inputs are what the player decides:
 *  path: SITE_PATHS id; brief: copy brief text; spec: wrote a page spec first; review: every | skim | none;
 *  checks: { ssr, meta, speed }; framework: 'astro' | 'next' | null (Bolt/agent path); pages: page count.
 */
export function buildSite(state, { path, brief = '', spec = false, review = 'skim', checks = {}, framework = null, pages = 4, redirectMap = true } = {}) {
  const p = SITE_PATHS[path];
  if (!p) throw new Error('Unknown site path');
  review = reviewOf(review);
  const prev = siteBuildSlice(state);
  const bs = briefScore(state, brief);
  const w = { ...(state.apps.product?.agent?.workflow ?? DEFAULT_WORKFLOW), review: review === 'every' ? 'every' : review === 'none' ? 'none' : 'skim', mode: spec ? 'plan' : 'oneshot' };
  const warnings = [];
  let hours = buildHours(path, { spec, review, checks, framework });
  let usd = 0;
  // Rendering: what the tool emits unless the player makes it crawlable.
  let rendering = p.rendering;
  if (checks.ssr && p.ssrFix !== 'migrate') rendering = 'static';
  if (path === 'bolt' && (framework === 'astro' || framework === 'next')) rendering = 'static';
  if (checks.ssr && p.ssrFix === 'migrate') warnings.push(`${p.vendor} only outputs a client-rendered SPA. Prerendering means moving the site to a static/SSR framework later (~${p.lockInHours} h).`);
  // Per-page meta and sitemap: only with the meta check (v0/Next has a metadata API, but someone has to fill it).
  const meta = !!checks.meta;
  const lcp = round2(Math.max(SITE.lcpFloor, p.lcp * (checks.speed ? SITE.speedPass : 1)));
  // Copy: the brief sets quality; review decides how much of it survives the generation.
  const keepShare = SITE.keep[review] * (0.6 + 0.4 * bs.score);
  const generic = round2(clamp(1 - bs.score * SITE.keep[review] - (spec ? 0.1 : 0), 0, 1));
  const copyQuality = round2(p.ceiling * clamp(0.3 + 0.7 * bs.score * SITE.keep[review] + (spec ? 0.05 : 0), 0, 1));
  // Fix loops ("it broke the hero again"): the agent or builder goes in circles; a spec and a reviewer stop it early.
  const loopP = clamp(p.loopBase - (spec ? SITE.loopSpec : 0) - (review === 'every' ? SITE.loopReview : 0), 0.03, 0.6);
  const loops = rng(state) < loopP ? (rng(state) < loopP ? 2 : 1) : 0;
  hours += loops * SITE.loopHours;
  // Billing, by paradigm.
  ensureSubscription(state, path);
  let wastedUsd = 0, agent = null;
  const ledger = { usage: prev && prev.path === path ? prev.usage : { month: null, units: 0 } }; // allowances are per tool
  if (p.billing === 'plan') {
    const agentHours = round2(p.agentHoursPerBuild * throughputFactor(w) * (1 + reworkShare(w)) + loops * 2);
    agent = chargeAgent(state, agentHours, w);
    usd += agent.overageUsd;
    if (agent.stalledHours > 0) { hours += agent.stalledHours; warnings.push(`Your coding plan ran out mid-build: ${agent.stalledHours} h done by hand or waiting for the window.`); }
  } else {
    const perPage = p.unitsPerPage ? p.unitsPerPage * pages : 0;
    const units = p.buildUnits + perPage + loops * p.loopUnits;
    usd += chargeUnits(state, ledger, path, units, p.unitName);
    wastedUsd = round2(loops * p.loopUnits * p.unitUsd);
  }
  const build = {
    id: uid('site'), path, day: state.day, rendering, meta, lcp, copyQuality, generic, briefScore: bs.score, briefParts: bs.parts,
    spec, review, checks: { ssr: !!checks.ssr, meta, speed: !!checks.speed }, framework, pages,
    iterations: [], blind: 0, loops: (prev?.loops ?? 0) + loops, wastedUsd: round2((prev?.wastedUsd ?? 0) + wastedUsd),
    usage: ledger.usage, migrations: prev?.migrations ?? [], hoursSpent: round2((prev?.hoursSpent ?? 0) + hours),
  };
  // Moving to another path (outgrowing a builder) is a migration: lock-in rework hours, and an SEO migration if the
  // site already has pages ranking.
  if (prev && prev.path !== path) {
    const lock = SITE_PATHS[prev.path].lockInHours;
    hours += lock;
    build.migrations.push({ day: state.day, from: prev.path, to: path, lockInHours: lock, redirectMap });
    if (liveArticles(state).length) {
      const r = migrateSite(state, { redirectMap, rendering });
      hours += r.hoursCost;
    }
  }
  const S = ensureSeo(state);
  if (!(prev && prev.path !== path && liveArticles(state).length)) S.tech.rendering = rendering;
  if (meta) { const r = technicalSetup(state, { gsc: false, sitemap: true }); hours += r.hoursCost; }
  state.company.siteBuild = build;
  applySiteBuild(state);
  build.hoursSpent = round2((prev?.hoursSpent ?? 0) + hours);
  // Traceable consequences.
  const fn = 'positioning_landing';
  if (generic >= 0.5) logMistake(state, { functionId: fn, id: 'generic_ai_site', label: 'Shipped generic AI copy on the marketing site', cost: { customers: round2(generic * 0.6) }, delayed: true, detail: `${Math.round(generic * 100)}% of the page is the model's stock copy: it reads like every other AI-built site. A stellar operator writes a positioning-first brief (who it is for, their pain, the difference, proof, one number, one CTA) and reviews every section before publishing.`, app: 'website', key: `generic:${build.id}` });
  if (rendering === 'csr') logMistake(state, { functionId: 'content_seo_geo', id: 'spa_marketing_site', label: 'Marketing site ships as a client-rendered SPA', cost: { days: 14 }, delayed: true, detail: `${p.vendor ?? 'The build'} renders pages in JavaScript: Google indexes them slower and drops some, and AI crawlers that do not run JS see an empty shell. ${p.ssrFix === 'migrate' ? `Fixing it means moving to a static/SSR framework (~${p.lockInHours} h).` : 'Ask for static or server-rendered pages at build time.'}`, app: 'website', key: `csr:${build.id}` });
  if (!meta) logMistake(state, { functionId: 'content_seo_geo', id: 'site_missing_meta', label: 'No per-page titles, meta descriptions or sitemap', cost: { days: 7, hours: p.metaHours }, delayed: true, detail: 'Every page shares one title and description, and there is no sitemap: search results show the same snippet and new pages are found late. It is a 1-hour check at build time.', app: 'website', key: `meta:${build.id}` });
  if (lcp > SITE.lcpGood) warnings.push(`Mobile LCP ~${lcp}s (good is under ${SITE.lcpGood}s). A speed pass (images, fonts, bundle) gets it to ~${round2(Math.max(SITE.lcpFloor, p.lcp * SITE.speedPass))}s.`);
  if (loops >= 2 || build.wastedUsd >= 10) logMistake(state, { functionId: 'ai_building', id: 'site_credit_burn', label: `${p.vendor ?? 'Agent'} fix loops while building the site`, cost: { hours: loops * SITE.loopHours, usd: wastedUsd }, circles: true, detail: `${loops} broken-output loop(s)${wastedUsd ? `, ${p.unitName} burned with no refund ($${wastedUsd})` : ''}. A page spec up front and reviewing each change stops the loop after one try.`, app: 'website', key: `loops:${build.id}` });
  const site = { source: 'build', url: `${path} build`, title: String(brief).split('\n').map((l) => l.trim()).find(Boolean) ?? '', description: meta ? String(brief).split('\n').map((l) => l.trim()).filter(Boolean)[1] ?? '' : '', headings: String(brief).split('\n').map((l) => l.trim()).filter((l) => l && l.length < 80).slice(0, 10), text: pageText(brief, keepShare, generic), builtWith: path };
  return { build, site, hours: round2(hours), usd: round2(usd), loops, warnings };
}

/** Landing multiplier from page speed and AI sameness (the panel separately judges the copy itself). */
export function siteBuildMult(build) {
  if (!build) return 1;
  const slow = clamp(SITE.slowPerSecond * Math.max(0, build.lcp - SITE.lcpFloor), 0, SITE.slowCap); // every second counts, not only past the 2.5 s line
  return round2((1 - slow) * (1 - SITE.genericPenalty * build.generic) * 10000) / 10000;
}
export function applySiteBuild(state) {
  setModifier(state, 'landing', 'site-build', siteBuildMult(state.company.siteBuild));
}

/** Iterate: worth it only on real data (a panel run or measured traffic after the build). Blind redesigns burn hours
 *  and credits and go in circles. Returns { hours, usd, useful }. */
export function iterateSite(state, { brief = null } = {}) {
  const b = siteBuildSlice(state);
  if (!b) throw new Error('Build the site first');
  const p = SITE_PATHS[b.path];
  const evalDay = state.company.website?.eval?.day ?? -1;
  const lastIter = b.iterations.at(-1)?.day ?? b.day;
  const useful = evalDay >= lastIter;
  let hours = p.iterateHours, usd = 0;
  if (p.billing === 'plan') {
    const a = chargeAgent(state, p.agentHoursPerIterate, state.apps.product?.agent?.workflow ?? DEFAULT_WORKFLOW);
    usd += a.overageUsd; hours += a.stalledHours;
  } else usd += chargeUnits(state, b, b.path, p.iterateUnits + (p.unitsPerPage ? p.unitsPerPage * b.pages : 0), p.unitName);
  if (useful) {
    const nb = brief != null ? briefScore(state, brief).score : b.briefScore;
    b.briefScore = Math.max(b.briefScore, nb);
    b.copyQuality = round2(Math.min(p.ceiling, b.copyQuality + SITE.iterateLift * (1 - b.copyQuality) + 0.2 * Math.max(0, nb - b.briefScore)));
    b.generic = round2(Math.max(0, b.generic - 0.15));
    b.blind = 0;
  } else {
    b.blind++;
    if (b.blind >= SITE.blindLimit) logMistake(state, { functionId: 'positioning_landing', id: 'redesign_without_data', label: 'Redesigning the site without data', cost: { hours: hours * b.blind, usd }, circles: true, detail: `${b.blind} iterations since the last time you measured anything. Run the landing-page panel or wait for traffic, then change the one thing the data points at.`, app: 'website', key: `blind:${b.id}:${b.blind}` });
  }
  b.iterations.push({ day: state.day, useful, hours: round2(hours), usd: round2(usd) });
  b.hoursSpent = round2((b.hoursSpent ?? 0) + hours);
  applySiteBuild(state);
  return { hours: round2(hours), usd: round2(usd), useful };
}

/** Operator read 0-1 for the site build (spec, brief, review, checks, data-driven iteration, waste). */
export function siteBuildScore(build) {
  if (!build) return 0;
  let s = 0.3 * build.briefScore;
  s += build.spec ? 0.1 : 0;
  s += { every: 0.15, skim: 0.06, none: 0 }[build.review] ?? 0;
  s += build.rendering === 'static' ? 0.12 : 0;
  s += build.meta ? 0.1 : 0;
  s += build.lcp <= SITE.lcpGood ? 0.08 : 0;
  s += build.iterations.some((i) => i.useful) ? 0.1 : 0;
  s += build.blind >= SITE.blindLimit ? -0.05 : 0.05;
  return round2(clamp(s, 0, 1));
}

/** What a stellar operator would have done differently (feedback for the UI and mistakes). */
export function siteCoaching(build) {
  if (!build) return [];
  const out = [];
  const p = build.briefParts ?? {};
  if (build.briefScore < 0.8) out.push(`Brief: add ${[!p.audience && 'who it is for', !p.pain && 'their pain', !p.difference && 'what you do instead of the alternative', !p.proof && 'proof', !p.number && 'one number', !p.cta && 'one call to action'].filter(Boolean).join(', ')}.`);
  if (!build.spec) out.push('Write a page spec first (sections, one CTA, pricing, FAQ, analytics). It is the prompt, and it cuts fix loops.');
  if (build.review !== 'every') out.push('Read every generated section and replace stock copy with your words.');
  if (build.rendering === 'csr') out.push(SITE_PATHS[build.path].ssrFix === 'migrate' ? `Move the marketing pages to a static/SSR framework (v0/Next or Astro in your repo) before you publish content at scale.` : 'Ask for static or server-rendered pages (Astro or Next) so crawlers see the HTML.');
  if (!build.meta) out.push('Add per-page titles, meta descriptions, Open Graph tags and a sitemap.');
  if (build.lcp > SITE.lcpGood) out.push('Run a speed pass: compress images, self-host fonts, cut the JS bundle.');
  if (!build.iterations.some((i) => i.useful)) out.push('Iterate on data: run the panel or read real traffic, then change one thing.');
  return out;
}
