// Pure ASO model (Apple App Store + Google Play): metadata validation that teaches the real field rules, indexed
// tokens and term relevance, keyword popularity / difficulty, rank from relevance + authority, search → page view →
// install funnel, page conversion levers, creative-test statistics, rating prompt yield with the 3-per-365-days cap,
// and guideline 2.3.7 rejection risk. No state, no DOM. Numbers: ./asoParams.js (docs/research/seo/aso.md).

import { ASO, CATEGORY_WORDS } from './asoParams.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function strHash(s) {
  let h = 0x811c9dc5;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}
const lerpCurve = (curve, x) => {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) { const [x0, y0] = curve[i - 1], [x1, y1] = curve[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return curve.at(-1)[1];
};

// ---------------- tokens ----------------

// Lower-case, strip punctuation, crude singular ("habits" → "habit") so plurals of a used word count as duplicates.
export const stem = (w) => { const t = String(w).toLowerCase().replace(/[^a-z0-9#+]/g, ''); return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t; };
export const tokensOf = (text) => String(text ?? '').toLowerCase().split(/[^a-z0-9#+']+/).map(stem).filter((w) => w && !ASO.stopWords.includes(w));
export const brandTokens = (brand) => tokensOf(brand);
const competitorIn = (text) => { const t = ` ${String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `; return ASO.competitorBrands.filter((b) => t.includes(` ${b} `)); };
const claimsIn = (text) => { const t = String(text ?? '').toLowerCase(); return ASO.claimTerms.filter((c) => (c.match(/^[a-z ]+$/) ? new RegExp(`\\b${c}\\b`).test(t) : t.includes(c))); };

// ---------------- validation (teaches the real rules) ----------------

/**
 * Validate one store's metadata. store 'ios' | 'play'. listing { name, subtitle, keywords, description }.
 * Returns { errors (block submission), warnings, wastedChars, usedChars, keywordTerms, competitors, claims, stuffing }.
 */
export function validateMetadata(store, listing, { brand = '', category = null } = {}) {
  const L = ASO.limits[store];
  const name = String(listing.name ?? ''), sub = String(listing.subtitle ?? ''), kw = store === 'ios' ? String(listing.keywords ?? '') : '', desc = String(listing.description ?? '');
  const errors = [], warnings = [];
  if (!name.trim()) errors.push('The name is required.');
  if (name.length > L.name) errors.push(`Name is ${name.length}/${L.name} characters: the store will not accept it.`);
  if (sub.length > L.subtitle) errors.push(`${store === 'ios' ? 'Subtitle' : 'Short description'} is ${sub.length}/${L.subtitle} characters.`);
  if (kw.length > L.keywords && store === 'ios') errors.push(`Keyword field is ${kw.length}/100 characters: App Store Connect rejects it.`);
  if (desc.length > L.description) errors.push(`Description is ${desc.length}/${L.description} characters.`);
  let wasted = 0;
  const shown = new Set([...tokensOf(name), ...tokensOf(sub)]);
  const terms = kw.split(',').map((x) => x.trim()).filter(Boolean);
  if (store === 'ios') {
    const spaces = (kw.match(/,\s+/g) ?? []).reduce((a, m) => a + m.length - 1, 0);
    if (spaces) { wasted += spaces; warnings.push(`${spaces} space(s) after commas: Apple separates on commas, so spaces just burn characters.`); }
    const seen = new Set();
    const dupes = [], repeatsShown = [], generic = [], plural = [];
    for (const t of terms) {
      for (const raw of t.toLowerCase().split(/\s+/).filter(Boolean)) {
        const w = stem(raw);
        if (!w) continue;
        if (shown.has(w)) { repeatsShown.push(raw); wasted += raw.length + 1; continue; }
        if (seen.has(w)) { (raw !== w ? plural : dupes).push(raw); wasted += raw.length + 1; continue; }
        if (ASO.genericWords.includes(w)) { generic.push(raw); wasted += raw.length + 1; }
        seen.add(w);
      }
    }
    if (repeatsShown.length) warnings.push(`Already in the name/subtitle (indexed once, repeating wastes characters): ${[...new Set(repeatsShown)].join(', ')}.`);
    if (dupes.length) warnings.push(`Repeated in the keyword field: ${[...new Set(dupes)].join(', ')}.`);
    if (plural.length) warnings.push(`Plural of a word you already use (Apple matches both): ${[...new Set(plural)].join(', ')}.`);
    if (generic.length) warnings.push(`Generic words Apple ignores or that add nothing ("app", "free", "best"...): ${[...new Set(generic)].join(', ')}.`);
    if (kw.length < 60) warnings.push(`Only ${kw.length}/100 keyword characters used: each unused character is search coverage you gave up.`);
    if (terms.some((t) => /\s/.test(t))) warnings.push('Multi-word phrases in the keyword field: single words separated by commas give the same combinations with fewer characters.');
  }
  // Brand of the developer matters little; other brands are a 2.3.7 rejection cause.
  const competitors = [...new Set([...competitorIn(name), ...competitorIn(sub), ...competitorIn(kw), ...competitorIn(desc)])].filter((c) => !tokensOf(brand).includes(stem(c)));
  if (competitors.length) warnings.push(`Other apps' names (${competitors.join(', ')}): guideline 2.3.7 rejection risk; Apple may strip keywords or reject the update.`);
  const claims = [...new Set([...claimsIn(name), ...claimsIn(sub)])];
  if (claims.length) warnings.push(store === 'play' ? `Play bans prices, promotions and ranking claims in the title (${claims.join(', ')}).` : `Pricing or ranking claims in the name/subtitle (${claims.join(', ')}): 2.3.7 and 2.3.1 risk.`);
  // Description stuffing: Play indexes the full description and penalises repetition; Apple doesn't index it at all.
  const descTokens = tokensOf(desc);
  const counts = descTokens.reduce((m, w) => ((m[w] = (m[w] ?? 0) + 1), m), {});
  const per1000 = desc.length ? Math.max(0, ...Object.entries(counts).filter(([w]) => w.length > 3).map(([, n]) => n)) / Math.max(1, desc.length / 1000) : 0;
  const stuffedDesc = desc.length >= 200 && per1000 > 12;
  if (stuffedDesc) warnings.push(store === 'play' ? 'The full description repeats the same keyword over and over: Play treats that as keyword spam.' : 'Description repeats one keyword many times: Apple does not index it, so it only reads badly.');
  if (store === 'ios' && desc && !kw) warnings.push('Apple does not index the description: keywords belong in the name, subtitle and keyword field.');
  const nameRepeat = tokensOf(`${name} ${sub}`).reduce((m, w) => ((m[w] = (m[w] ?? 0) + 1), m), {});
  const stuffing = Object.values(nameRepeat).some((n) => n >= 3) || stuffedDesc || (store === 'ios' && terms.length > 0 && wasted > 30);
  if (Object.values(nameRepeat).some((n) => n >= 3)) warnings.push('The name/subtitle repeats a word three or more times: reads as stuffing.');
  return { errors, warnings, wastedChars: wasted, usedChars: kw.length, keywordTerms: terms, competitors, claims, stuffing, category };
}

// Heuristic probability that App Review (or Play policy review) rejects this metadata [design].
export function rejectionRisk(store, v) {
  let p = store === 'ios' ? 0.03 : 0.02; // base rejection for any reason [design]
  if (v.competitors.length) p += store === 'ios' ? 0.45 + 0.1 * Math.min(3, v.competitors.length - 1) : 0.35;
  if (v.claims.length) p += store === 'play' ? 0.5 : 0.25;
  if (v.stuffing) p += 0.2;
  return clamp(p, 0, 0.9);
}

// ---------------- indexed terms & relevance ----------------

// Index of a listing: token → best field weight; Play also counts description occurrences.
export function indexOf(store, listing) {
  const W = ASO.fieldWeight;
  const idx = {};
  const add = (text, w) => { for (const t of tokensOf(text)) if (!(idx[t] >= w)) idx[t] = w; };
  if (!listing) return idx;
  add(listing.name, W.name);
  add(listing.subtitle, W.subtitle);
  if (store === 'ios') add(String(listing.keywords ?? '').replace(/,/g, ' '), W.keywords);
  else {
    const counts = tokensOf(listing.description).reduce((m, w) => ((m[w] = (m[w] ?? 0) + 1), m), {});
    for (const [t, n] of Object.entries(counts)) { const w = W.description * Math.min(1, n / 3); if (!(idx[t] >= w)) idx[t] = w; }
  }
  return idx;
}
// A search term matches when every word is indexed; weight = weakest field among its words (Apple combines words
// across name, subtitle and keyword field [P]).
export function termWeight(idx, term) {
  const ws = tokensOf(term);
  if (!ws.length) return 0;
  let w = Infinity;
  for (const t of ws) { if (!(idx[t] > 0)) return 0; w = Math.min(w, idx[t]); }
  return w;
}

// How well a word describes this app: own one-liner/ICP 1, category vocabulary 0.75, generic 0.15, competitor 0.1.
export function tokenFit(token, { appWords = [], category = null, brand = [] } = {}) {
  const t = stem(token);
  if (brand.includes(t) || appWords.includes(t)) return 1;
  if (ASO.competitorBrands.some((b) => stem(b) === t)) return 0.1;
  if (ASO.genericWords.includes(t)) return 0.15;
  if (category && (CATEGORY_WORDS[category] ?? []).map(stem).includes(t)) return 0.75;
  return 0.3;
}
export function termFit(term, ctx) {
  const ws = tokensOf(term);
  if (!ws.length) return 0;
  const f = ws.map((w) => tokenFit(w, ctx));
  return Math.min(...f) <= 0.15 ? Math.min(...f) : f.reduce((a, b) => a + b, 0) / f.length;
}
export const appWordsOf = (state) => [...new Set(tokensOf(`${state.company?.oneLiner ?? ''} ${state.company?.icp ?? ''}`).filter((w) => w.length > 2 && !ASO.genericWords.includes(w)))];

// ---------------- keyword metrics (the hidden truth; tools show it with error) ----------------

export function termMetrics(term, { category = null, store = 'ios' } = {}) {
  const ws = tokensOf(term);
  const key = ws.join(' ');
  const n = Math.max(1, ws.length);
  const h = strHash(key), h2 = strHash(`${key}#kd`);
  const catHit = category && ws.some((w) => (CATEGORY_WORDS[category] ?? []).map(stem).includes(w));
  let pop = n === 1 ? 25 + 50 * h + (catHit ? 10 : 0) : n === 2 ? 8 + 37 * h + (catHit ? 5 : 0) : 5 + 20 * h;
  if (ws.some((w) => ASO.competitorBrands.includes(w))) pop = Math.max(pop, 70); // other apps' names are searched a lot
  pop = Math.round(clamp(pop, 5, 95));
  // Head terms are owned by big apps: one-word queries are much harder than their volume alone suggests [design].
  const difficulty = Math.round(clamp(pop * 0.85 + (n === 1 ? 18 : 0) + (h2 - 0.5) * 30 + (ws.some((w) => ASO.competitorBrands.includes(w)) ? 25 : 0), 1, 99));
  const searches = ASO.searchBase[store] * Math.pow(10, pop / 22);
  return { term: key, popularity: pop, difficulty, searches };
}
export function isRealQuery(term, { category = null, appWords = [] } = {}) {
  const ws = tokensOf(term);
  if (ws.length <= 1) return true;
  const related = ws.some((w) => appWords.includes(w) || (category && (CATEGORY_WORDS[category] ?? []).map(stem).includes(w)));
  return strHash(`${ws.join(' ')}#q`) < (related ? ASO.pairRealQuery.related : ASO.pairRealQuery.other);
}

// Search terms a listing can rank for: single indexed words, the player's tracked phrases, the name/subtitle
// phrases, and long-tail combinations of a name/subtitle word with another indexed word that people actually search
// (Apple combines words across fields [P]; the name and subtitle carry the anchor terms).
export function searchUniverse(store, listing, { tracked = [], category = null, appWords = [], brand = [] } = {}) {
  const idx = indexOf(store, listing);
  const usable = (t) => !brand.includes(t) && !ASO.genericWords.includes(t);
  const toks = Object.keys(idx).filter(usable).sort((a, b) => idx[b] - idx[a]).slice(0, ASO.maxTokens);
  const anchors = tokensOf(`${listing?.name ?? ''} ${listing?.subtitle ?? ''}`).filter(usable);
  const set = new Set(toks);
  for (const t of tracked) { const k = tokensOf(t).join(' '); if (k) set.add(k); }
  const phrase = (s) => tokensOf(s).filter((t) => !brand.includes(t)).join(' ');
  for (const p of [phrase(listing?.name), phrase(listing?.subtitle)]) if (p && p.split(' ').length <= 4) set.add(p);
  for (const a of new Set(anchors)) for (const t of toks) {
    if (a === t) continue;
    for (const pair of [`${a} ${t}`, `${t} ${a}`]) if (isRealQuery(pair, { category, appWords })) set.add(pair);
  }
  return [...set];
}

// ---------------- rank ----------------

export function authority({ velocity = 0, ratings = 0, stars = null }) {
  const A = ASO.authority;
  return Math.max(0, A.velocity * Math.log10(1 + Math.max(0, velocity)) + A.ratings * Math.min(1, Math.log10(1 + ratings) / 2) + (stars == null || ratings < 5 ? 0 : A.stars * clamp((stars - 3.5) / 1.3, -1, 1)));
}
export function targetRank({ difficulty, weight, fit, authority: a }) {
  if (!(weight > 0)) return ASO.unranked;
  const R = ASO.rank;
  const strength = weight * (0.4 + 0.6 * fit) * (a + R.authorityOffset);
  return clamp(Math.round(R.scale * Math.exp((difficulty - strength) / R.softness)), 1, ASO.unranked);
}
// Ranks settle in log space: each day closes 1/settleDays of the gap.
export function settleRank(current, target, store) {
  const c = Math.log(current ?? ASO.unranked), t = Math.log(target);
  return Math.exp(c + (t - c) / ASO.settleDays[store]);
}
// Sum term views with diminishing weight 1/(1 + i/k), largest first [design: overlapping searchers].
export function overlapSum(rows) {
  const out = { imps: 0, views: 0, convViews: 0 };
  rows.sort((a, b) => b.v - a.v).forEach((x, i) => {
    const w = 1 / (1 + i / ASO.overlapK);
    out.views += x.v * w; out.imps += x.imp * w; out.convViews += x.v * w * (ASO.fitConv[0] + ASO.fitConv[1] * x.fit);
  });
  return out;
}
export const tapAt = (rank) => (rank > ASO.tapByRank.at(-1)[0] ? 0 : lerpCurve(ASO.tapByRank, rank));

// ---------------- conversion ----------------

export const starIndex = (stars) => lerpCurve(ASO.starIndex, clamp(stars, 1, 5));
export function starMult(stars, ratings) {
  if (stars == null || ratings < ASO.noStars.minRatings) return ASO.noStars.mult;
  return starIndex(stars) / starIndex(4.5) * (stars < ASO.cliff.below ? ASO.cliff.mult : 1);
}
export const creativeMult = (q, video = false) => ASO.creative.base + ASO.creative.span * clamp(q, 0, 1) + (video ? ASO.creative.video : 0);
export const copyMult = (score) => ASO.copy.base + ASO.copy.span * clamp(score ?? 0.4, 0, 1);

/** Product-page conversion (page view → install). */
export function pageCvr(store, { shotsQ = 0.3, video = false, copyScore = null, stars = null, ratings = 0, replies = false, testLift = 0 } = {}) {
  return ASO.pageCvr[store] * creativeMult(shotsQ, video) * copyMult(copyScore) * starMult(stars, ratings) * (replies ? ASO.replyCvr : 1) * (1 + clamp(testLift, -0.3, ASO.maxTestLift));
}

// Screenshot caption quality: benefit + specifics, short, no buzzwords, speaks the user's words [design heuristic].
const BUZZ = ['revolution', 'seamless', 'all-in-one', 'next-gen', 'cutting-edge', 'unlock', 'supercharge', 'game-chang', 'leverage', 'world-class', 'empower', 'ai-powered', 'effortless', 'innovative', 'ultimate', 'powerful'];
const BENEFIT = /\b(save|get|finish|read|sleep|lose|track|build|stop|never|in \d|every|minutes?|seconds?|hours?|days?|weeks?|more|less|without|faster|calm|done|keep|learn|plan|see)\b/i;
export function captionScore(captions = [], appWords = []) {
  const cs = captions.map((c) => String(c ?? '').trim()).filter(Boolean).slice(0, 5);
  if (!cs.length) return 0;
  const per = cs.map((c, i) => {
    const wc = c.split(/\s+/).length;
    let s = 0.2;
    if (wc >= 2 && wc <= 9) s += 0.2; else if (wc > 14) s -= 0.15;
    if (BENEFIT.test(c)) s += 0.25;
    if (/\d/.test(c)) s += 0.15;
    if (tokensOf(c).some((t) => appWords.includes(t))) s += 0.15;
    s -= 0.2 * BUZZ.filter((b) => c.toLowerCase().includes(b)).length;
    if (/^(home|settings|dashboard|screen|feature|login|sign up)\b/i.test(c)) s -= 0.2; // describes the UI, not the outcome
    return clamp(s, 0, 1) * (i < 3 ? 1.2 : 0.6);
  });
  const weight = cs.map((_, i) => (i < 3 ? 1.2 : 0.6)).reduce((a, b) => a + b, 0);
  const uniq = new Set(cs.map((c) => c.toLowerCase())).size / cs.length;
  return clamp((per.reduce((a, b) => a + b, 0) / weight) * (cs.length >= 3 ? 1 : 0.7) * uniq, 0, 1);
}
export const screenshotQuality = (production, captions, appWords) => clamp(0.5 * (ASO.production[production] ?? 0.1) + 0.5 * captionScore(captions, appWords) + (production === 'dev' ? -0.05 : 0), 0, 1);

// ---------------- creative tests (PPO / Play experiments) ----------------

// True relative effect of a treatment from one uniform draw u; a stronger hypothesis (h ∈ 0..1, the treatment's
// quality above the current page) shifts the odds toward a win.
export function drawTestEffect(u, h = 0) {
  const O = ASO.test.outcomes;
  const shift = clamp(h, -0.5, 0.5) * 0.5;
  let v = clamp(u + shift, 0, 0.9999), acc = 0;
  for (const [p, eff] of O) { acc += p; if (v < acc) return eff + clamp(h, -0.5, 0.5) * 0.08; }
  return O.at(-1)[1];
}
// Two-proportion z-score of a treatment vs the control.
export function zScore(a, b) {
  if (!(a.views > 0 && b.views > 0)) return 0;
  const p1 = a.installs / a.views, p2 = b.installs / b.views;
  const p = (a.installs + b.installs) / (a.views + b.views);
  const se = Math.sqrt(p * (1 - p) * (1 / a.views + 1 / b.views));
  return se > 0 ? (p2 - p1) / se : 0;
}
// Verdict for a running test: 'running' | 'winner' | 'loser' | 'inconclusive' (out of time). Called once a day: a
// result counts only after every arm has enough installs and the 90% threshold has held for a few days in a row,
// so daily peeking at a small test doesn't crown noise [design].
export function testVerdict(t, store) {
  const T = ASO.test;
  const ctl = t.arms[0];
  const days = t.days ?? 0;
  let best = null;
  for (const arm of t.arms.slice(1)) { const z = zScore(ctl, arm); arm.z = z; if (!best || z > best.z) best = arm; }
  const enough = t.arms.every((a) => a.installs >= T.minInstalls) && days >= T.minDays;
  const up = enough && best && best.z >= T.z;
  const down = enough && t.arms.slice(1).every((a) => a.z <= -T.z);
  t.streak = up ? Math.max(0, t.streak ?? 0) + 1 : down ? Math.min(0, t.streak ?? 0) - 1 : 0;
  if (t.streak >= T.holdDays) return { verdict: 'winner', arm: best };
  if (t.streak <= -T.holdDays) return { verdict: 'loser', arm: best };
  if (days >= T.maxDays[store]) return { verdict: 'inconclusive', arm: best };
  return { verdict: 'running', arm: best };
}

// ---------------- ratings ----------------

/**
 * Ratings per install from the prompt plan. SKStoreReviewController shows at most 3 prompts per user per 365 days
 * and the OS may skip any of them [P]: asking more often than that does nothing.
 * plan { strategy: 'none'|'after_aha'|'on_open'|'timer', perYear }, promptRate from APPSTORE.promptRate.
 */
export function ratingYield(plan, promptRate, { writeReviewLink = false } = {}) {
  const strategy = plan?.strategy ?? 'none';
  const asked = strategy === 'none' ? 0 : Math.max(1, Math.round(plan?.perYear ?? 1));
  const shown = Math.min(ASO.promptCap, asked);
  const first = promptRate[strategy] ?? promptRate.none;
  const volunteer = promptRate.none;
  let prompted = 0;
  for (let i = 0; i < shown; i++) prompted += first * ASO.repeatPromptYield[i];
  return { perInstall: prompted + volunteer + (writeReviewLink ? ASO.writeReviewLink : 0), shownPerUser: shown, asked, prompted, volunteer };
}
