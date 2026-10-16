// Your domain: the first thing a founder buys. A registrar-style search (Cloudflare Registrar / Porkbun / Namecheap):
// type candidate names, see availability per TLD, registry-premium and aftermarket prices, buy one, and get feedback on
// how good a name it is. Pure logic (no DOM): the view is apps/website/domain-view.js.
//
// state.company.domain       the primary domain string (kept for every app that already reads it)
// state.company.domainInfo   { name, tld, registrar, boughtDay, paid, renewal, kind: 'registered'|'premium'|'aftermarket'
//                              |'connected'|'legacy', grade, recurringId, searches, collision, cdDay, lost, history[] }
//
// Availability is deterministic per name (hash), not per game: the same name is taken in every game, like the real world.

import { hash, clamp, rng, money } from '../../core/util.js';
import { post, addRecurring, balance } from '../../core/bank.js';
import { setModifier } from '../../core/market.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { recordPublicEvent } from '../../core/network.js';
import { newThread, addMessage } from '../../core/mail.js';

// ---- Prices (USD per year, [first year, renewal]) ----
// Sources (checked Oct 2026, registrar price pages and aggregators: domainoffer.net, domaindetails.com,
// namebuddy.ai/guides/ai-domain-cost): .com wholesale $10.26 (Verisign 2025, +7%/yr from 2026); Cloudflare at cost
// ~$10.46 reg = renewal; Porkbun ~$11.08 renewal; Namecheap first-year promos, renewal ~$18.68. .io ~$50 (Cloudflare,
// Porkbun ~$51.80). .ai: 2-year minimum registration, ~$80/yr at Cloudflare, $85-100 elsewhere. .co/.app/.dev/.xyz
// from the same registrars' 2026 lists, rounded [approx]. Verify live prices before buying for real.
export const REGISTRARS = {
  cloudflare: { label: 'Cloudflare Registrar', note: 'At-cost pricing, renewal = registration, no upsells. Needs Cloudflare DNS.' },
  porkbun: { label: 'Porkbun', note: 'Near-cost pricing, free WHOIS privacy, honest renewals.' },
  namecheap: { label: 'Namecheap', note: 'Cheap first-year promos; renewals cost noticeably more.' },
};
export const TLDS = {
  com: { label: '.com', prices: { cloudflare: [10.46, 10.46], porkbun: [11.08, 11.08], namecheap: [6.49, 18.68] }, takenMult: 1, why: 'The default. Customers type .com when they guess your address; email to you@company.com is never mistyped.' },
  io: { label: '.io', prices: { cloudflare: [50, 50], porkbun: [51.8, 51.8], namecheap: [34.98, 59.98] }, takenMult: 0.62, why: 'Accepted for developer tools; reads as "tech" to non-technical buyers.' },
  ai: { label: '.ai', prices: { cloudflare: [80, 80], porkbun: [85, 85], namecheap: [79.98, 99.98] }, takenMult: 0.58, minYears: 2, why: 'Fits an AI-first product; 2-year minimum registration.' },
  co: { label: '.co', prices: { cloudflare: [24.5, 24.5], porkbun: [26, 26], namecheap: [9.98, 32.98] }, takenMult: 0.6, why: 'Often mistyped as .com: some email and traffic goes to whoever owns the .com.' },
  app: { label: '.app', prices: { cloudflare: [14.2, 14.2], porkbun: [14.5, 14.5], namecheap: [12.98, 18.98] }, takenMult: 0.45, why: 'Fine for an app; HTTPS-only by design.' },
  dev: { label: '.dev', prices: { cloudflare: [12.2, 12.2], porkbun: [12.5, 12.5], namecheap: [10.98, 16.98] }, takenMult: 0.4, why: 'Fits developer tools only.' },
  xyz: { label: '.xyz', prices: { cloudflare: [11.2, 11.2], porkbun: [2.04, 12.98], namecheap: [1.98, 14.98] }, takenMult: 0.25, why: 'Cheap, but heavily used by spammers: some mail filters and buyers distrust it.' },
};
export const TLD_IDS = Object.keys(TLDS);

// Aftermarket (Afternic / Sedo / Atom listings): brandable names typically list at $2k-$5k, short dictionary .coms at
// five figures and up (DNJournal / Atom sale reports, 2024-26 [approx]). Escrow fee ~3.25% (Escrow.com). Who lists what
// and at which price is [design].
export const AFTERMARKET = { listedShare: 0.45, escrowFee: 0.0325, brandable: [1800, 7500], fiveLetter: [3000, 25000], dictionary: [6000, 60000], short: [12000, 150000] };
// Registry-premium short names on new TLDs: first year $150-$3,000, renewal stays premium [approx].
export const PREMIUM = [150, 3000];

// Founder minutes [design]: a registrar checkout + basic DNS is ~10-15 minutes; each search ~1-2 minutes of thinking.
export const DOMAIN_HOURS = { buy: 0.2, perSearch: 0.03, maxSearch: 1, connect: 0.25, aftermarket: 0.75 };

// Effects on landing conversion (core/market.js 'landing' modifier), all [design]: a clean, memorable domain is a small
// trust signal; a long hyphenated or brand-confusing one, or a free builder subdomain, costs a little. The spread is
// deliberately small: a domain never rescues a weak page.
export const DOMAIN_LANDING = { stellar: 1.03, good: 1.015, average: 1, mediocre: 0.97, collision: 0.95, none: 0.95, lost: 0.93 };

// Trademark collision: a cease-and-desist or UDRP complaint arrives within 1.5-6 months [design]; outside counsel review
// ~$900 (1-2 hours at 2026 small-firm rates) and the domain is surrendered.
export const CD = { minDays: 45, spanDays: 135, legalUsd: 900, hours: 4 };

const DICT = new Set(('ledger book desk flow stack base hub sync link task team form data note plan time shop track chat bill cash sale sales lead deal work list page site code ship launch pilot beacon bright cloud mail pay invoice crew field route fleet care health clinic dental law legal tax quote job jobs hire talent people pulse signal spark bolt rocket orbit nova atlas north true clear simple smart quick fast easy kind good one first prime peak summit ridge river lake stone oak pine maple cedar harbor bridge gate door key lock shield guard trust proof score rank grow growth scale level layer frame grid point line loop wave tide sun moon star sky blue green red gold silver iron steel glass paper pen ink word story voice sound music video photo snap pixel craft forge mill works labs lab studio media press news daily week month year home house nest den hive bee fox owl wolf bear lion tiger eagle hawk crow robin finch lark wren swift relay receipt receipts stock order orders cart market store retail menu table kitchen chef food meal fresh farm garden plant seed root leaf tree bloom field mate buddy pal friend circle club guild union metric metrics count counter tally sum audit review check verify').split(' '));
const FAMOUS = ['google', 'amazon', 'microsoft', 'stripe', 'notion', 'slack', 'figma', 'openai', 'shopify', 'salesforce', 'hubspot', 'airbnb', 'netflix', 'paypal', 'facebook', 'instagram', 'tesla', 'adobe', 'intuit', 'quickbooks', 'mailchimp', 'dropbox', 'github', 'oracle', 'spotify', 'linkedin', 'youtube', 'tiktok', 'twitter', 'canva', 'zapier', 'atlassian', 'chatgpt', 'xero', 'calendly', 'docusign', 'twilio', 'intercom', 'zendesk', 'squarespace', 'godaddy', 'vercel', 'apple', 'nike', 'uber', 'zoom', 'gusto', 'asana'];
const AFFIX = ['get', 'try', 'use', 'go', 'join', 'hey', 'meet', 'with'];
const SUFFIX = ['hq', 'app', 'labs', 'io', 'ai', 'team', 'co'];
export const FREE_HOSTS = /(\.vercel\.app|\.netlify\.app|\.framer\.(website|ai)|\.carrd\.co|\.webflow\.io|\.github\.io|\.pages\.dev|\.notion\.site|\.wixsite\.com|\.squarespace\.com|\.replit\.app|\.lovable\.app|\.bolt\.host|\.onrender\.com|\.herokuapp\.com)$/i;

const unit = (key) => parseInt(hash(key), 36) / 4294967296;
const between = (u, [lo, hi]) => Math.round(Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))) / 50) * 50; // log-uniform, rounded like a listing
export const slugOf = (name) => String(name ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/** "https://www.Ledgerly.com/pricing" -> { sld: 'ledgerly', tld: 'com' }; "Ledgerly" -> { sld: 'ledgerly', tld: null }. */
export function parseDomain(input) {
  let s = String(input ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
  s = s.replace(/\s+/g, '').replace(/[^a-z0-9.-]/g, '');
  const parts = s.split('.').filter(Boolean);
  if (!parts.length) return { sld: '', tld: null };
  if (parts.length === 1) return { sld: parts[0].replace(/^-+|-+$/g, ''), tld: null };
  return { sld: parts.slice(0, -1).join('-').replace(/^-+|-+$/g, ''), tld: parts.at(-1) };
}

const isDict = (w) => DICT.has(w);
const isCompound = (w) => { for (let i = 3; i <= w.length - 3; i++) if (isDict(w.slice(0, i)) && isDict(w.slice(i))) return true; return false; };
export const brandCollision = (sld) => FAMOUS.find((b) => sld === b || (b.length >= 5 && sld.includes(b)) || sld.split('-').includes(b)) ?? null;

/** Is a name easy to say and spell? Vowel share and long consonant runs (a 4+ consonant run is hard to say). */
export function pronounceable(sld) {
  const w = sld.replace(/[^a-z]/g, '');
  if (!w) return false;
  const vowels = (w.match(/[aeiouy]/g) ?? []).length / w.length;
  return vowels >= 0.25 && vowels <= 0.65 && !/[bcdfghjklmnpqrstvwxz]{4,}/.test(w) && !/(.)\1\1/.test(w);
}

/** Availability for one sld.tld. Deterministic per name. */
export function checkDomain(sld, tld, registrar = 'cloudflare') {
  const T = TLDS[tld];
  const domain = `${sld}.${tld}`;
  if (!T) return { domain, sld, tld, status: 'unsupported', note: 'This registrar does not sell that extension here.' };
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sld)) return { domain, sld, tld, status: 'invalid', note: 'Letters, numbers and inner hyphens only (1-63 characters).' };
  const [first, renew] = T.prices[registrar] ?? T.prices.cloudflare;
  const years = T.minYears ?? 1;
  const len = sld.length;
  const dict = isDict(sld), compound = isCompound(sld);
  const famous = FAMOUS.includes(sld);
  // .com: every 1-4 letter .com is registered; short and dictionary names nearly always are [approx: Verisign zone stats].
  let pTaken = len <= 4 ? 1 : len === 5 ? 0.97 : len === 6 ? 0.88 : len === 7 ? 0.74 : len === 8 ? 0.6 : len <= 10 ? 0.45 : len <= 14 ? 0.28 : 0.12;
  if (dict) pTaken = Math.max(pTaken, 0.995);
  else if (compound) pTaken = Math.max(pTaken, 0.82);
  if (/-|\d/.test(sld)) pTaken *= 0.5;
  pTaken = famous ? 1 : clamp(pTaken * (tld === 'com' ? 1 : T.takenMult * (dict ? 1.3 : 1)), 0, 1);
  const u = unit(`dom|${domain}`);
  const base = { domain, sld, tld, years, first, renew, dueNow: Math.round(first * years * 100) / 100 };
  if (u >= pTaken) {
    // Available. Short names on new TLDs are often registry-premium.
    if (tld !== 'com' && (len <= 4 || (dict && len <= 6))) {
      const price = between(unit(`prem|${domain}`), PREMIUM);
      return { ...base, status: 'premium', first: price, renew: price, dueNow: price * years, note: `Registry premium: ${money(price)}/yr every year, not just the first.` };
    }
    return { ...base, status: 'available' };
  }
  const u2 = unit(`after|${domain}`);
  if (!famous && u2 < AFTERMARKET.listedShare) {
    const band = len <= 4 || (dict && len <= 5) ? AFTERMARKET.short : (dict || compound) && tld === 'com' ? AFTERMARKET.dictionary : len === 5 ? AFTERMARKET.fiveLetter : AFTERMARKET.brandable;
    const price = between(unit(`ask|${domain}`), band) * (tld === 'com' ? 1 : 0.4);
    const fee = Math.round(price * AFTERMARKET.escrowFee);
    return { ...base, status: 'aftermarket', price, fee, dueNow: price + fee, note: `Parked and listed for sale (broker listing). ${money(price)} + ${money(fee)} escrow, then ${money(renew)}/yr renewal.` };
  }
  return { ...base, status: 'taken', note: famous ? 'Owned by a famous brand.' : 'Registered and in use. Not for sale.' };
}

/** A registrar-style results list: the typed name across TLDs, plus a few name ideas (.com only). */
export function searchDomains(state, query, registrar = 'cloudflare') {
  const { sld, tld } = parseDomain(query);
  if (!sld) return [];
  const tlds = tld && TLDS[tld] ? [tld, ...TLD_IDS.filter((t) => t !== tld)] : TLD_IDS;
  const out = tlds.map((t) => checkDomain(sld, t, registrar));
  if (tld && !TLDS[tld]) out.unshift(checkDomain(sld, tld, registrar));
  const brand = slugOf(state?.company?.name);
  const ideas = new Set();
  for (const b of new Set([sld, brand].filter(Boolean))) { for (const a of AFFIX.slice(0, 3)) ideas.add(`${a}${b}`); for (const x of SUFFIX.slice(0, 2)) ideas.add(`${b}${x}`); if (b !== sld) ideas.add(b); }
  ideas.delete(sld);
  const sugg = [...ideas].slice(0, 6).map((n) => ({ ...checkDomain(n, 'com', registrar), idea: true }));
  return [...out, ...sugg];
}

/** How good is this as a company's primary domain? Pure. score 0-100, tier, what is good, what is weak, and what a
 *  stellar founder would have done instead. */
const TLD_FIT = { ai: /\b(ai|a\.i\.|agents?|llms?|gpt|models?|copilot|machine learning)\b/i, io: /\b(developers?|devs?|api|apis|sdk|devops|engineers?|engineering|code|infra|data)\b/i, dev: /\b(developers?|devs?|api|apis|sdk|devops|engineers?|code)\b/i, app: /\b(apps?|mobile|ios|android|iphone)\b/i };
export const tldFits = (tld, oneLiner = '') => Boolean(TLD_FIT[tld]?.test(String(oneLiner)));

export function gradeDomain(domain, companyName = '', { registrar = null, kind = null, oneLiner = '' } = {}) {
  const { sld, tld } = parseDomain(domain);
  const brand = slugOf(companyName);
  const good = [], weak = [];
  let score = 0;
  if (tld === 'com') { score += 25; good.push('.com: what people guess and type'); }
  else if (['io', 'ai', 'app', 'dev'].includes(tld)) {
    if (tldFits(tld, oneLiner)) { score += 18; good.push(`${TLDS[tld].label} fits what you make`); } else { score += 8; weak.push(`${TLDS[tld].label} doesn't say anything about what you sell${oneLiner ? '' : ' (no one-liner yet)'}`); }
    weak.push(`Not .com: some visitors and email will go to ${sld}.com; own it later or make sure nobody confusing does`);
  }
  else if (tld === 'co') { score += 9; weak.push('.co is constantly mistyped as .com: you leak traffic and email to whoever owns the .com'); }
  else if (tld === 'xyz') { score += 2; weak.push('.xyz carries a spam reputation: some filters and buyers distrust it'); }
  else { score += 6; weak.push(`${tld ? `.${tld}` : 'That extension'} is unusual for a software company`); }
  const core = sld.replace(/-/g, '');
  if (core.length <= 8) { score += 25; good.push(`Short (${core.length} letters)`); }
  else if (core.length <= 12) { score += 18; good.push(`Reasonably short (${core.length} letters)`); }
  else if (core.length <= 16) { score += 8; weak.push(`Long (${core.length} letters): harder to remember and type`); }
  else weak.push(`Very long (${core.length} letters): nobody will remember it`);
  if (!sld.includes('-')) score += 10; else weak.push('Hyphens: people forget them, say "dash" on calls and land on the unhyphenated owner');
  if (!/\d/.test(sld)) score += 10; else weak.push('Numbers: "4 or four?" every time you say it out loud');
  if (pronounceable(sld)) { score += 10; good.push('Easy to say and spell'); } else weak.push('Hard to say or spell: fails the "radio test"');
  if (brand && core === brand) { score += 20; good.push('Matches your company name exactly'); }
  else if (brand && (AFFIX.some((a) => core === a + brand) || SUFFIX.some((x) => core === brand + x))) { score += 13; good.push(`Your name with a common prefix/suffix (${sld})`); }
  else if (brand && core.includes(brand)) { score += 6; weak.push('Contains your name, but padded with extra words'); }
  else if (brand) weak.push(`Doesn't match your company name "${companyName}": people can't find you by guessing`);
  const collision = brandCollision(sld);
  if (collision) { score = Math.min(score, 30); weak.unshift(`Uses the famous trademark "${collision}": expect a cease-and-desist or UDRP complaint, and buyers assume a scam`); }
  score = clamp(Math.round(score), 0, 100);
  if (tld === 'xyz') score = Math.min(score, 67); // spam reputation caps it at average
  const tier = collision ? 'mediocre' : score >= 85 ? 'stellar' : score >= 68 ? 'good' : score >= 50 ? 'average' : 'mediocre';
  const tips = [];
  if (tier !== 'stellar') {
    tips.push(brand ? `A stellar founder searches ${brand}.com first, then get${brand}.com / ${brand}hq.com, or a fitting .ai/.io if the product is AI or developer-first, and renames before launch if all of those are bad.` : 'A stellar founder picks a short, sayable name that matches the company, on .com or a TLD that fits the product.');
    if (collision) tips.push('Search the USPTO trademark database before buying anything that contains another brand.');
  }
  if (registrar === 'namecheap') tips.push('Namecheap\'s first-year promo renews higher; at-cost registrars (Cloudflare, Porkbun) are cheaper over the years.');
  if (kind === 'aftermarket') tips.push('Before revenue, a stellar founder rarely pays five figures for a domain: get<name>.com works until the name has earned it.');
  return { domain: `${sld}${tld ? `.${tld}` : ''}`, sld, tld, score, tier, good, weak, tips, collision };
}

/** The domain the company owns, if any (legacy saves: a domain typed in Settings is shown as owned). */
export function domainOf(state) {
  const d = state.company?.domain;
  if (!d) return null;
  const info = state.company.domainInfo;
  if (info?.name === d) return info;
  return { name: d, kind: 'legacy', registrar: null, boughtDay: null, renewal: null, grade: gradeDomain(d, state.company.name, { oneLiner: state.company.oneLiner }) };
}

export function founderEmail(state) {
  const d = state.company?.domain;
  if (!d) return null;
  const first = String(state.founder?.name ?? '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'founder';
  return `${first}@${d}`;
}

/** The site's address bar: your domain, or the free builder subdomain everyone can see you're on. */
export function siteHost(state) {
  if (state.company?.domain) return state.company.domain;
  const site = state.company?.website;
  if (site?.source === 'url' && site.url) { const h = String(site.url).replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, ''); if (h) return h; }
  return `${slugOf(state.company?.name) || 'yourcompany'}.carrd.co`;
}

/** A live site on a custom domain the founder already owns (fetched by URL), not yet recorded as the company domain. */
export function ownedSiteDomain(state) {
  const site = state.company?.website;
  if (state.company?.domain || site?.source !== 'url' || !site.url) return null;
  const h = String(site.url).replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, '').replace(/^www\./, '').toLowerCase();
  if (!h || !h.includes('.') || FREE_HOSTS.test(h) || /^(localhost|\d+\.\d+)/.test(h)) return null;
  return h;
}

/** The founder hours a purchase costs: checkout + the searching that led to it. */
export const purchaseHours = (searches = 0, kind = 'registered') => Math.round(((kind === 'aftermarket' ? DOMAIN_HOURS.aftermarket : kind === 'connected' ? DOMAIN_HOURS.connect : DOMAIN_HOURS.buy) + Math.min(DOMAIN_HOURS.maxSearch, searches * DOMAIN_HOURS.perSearch)) * 100) / 100;

function renewalRecurring(state, info) {
  const amount = Math.round((info.renewal / 12) * 100) / 100;
  const vendor = info.registrar === 'external' ? 'Domain registrar' : REGISTRARS[info.registrar]?.label ?? 'Domain registrar';
  const note = `${info.name} renewal ${money(info.renewal, { cents: true })}/yr (annual, amortized monthly)`;
  // The default stack carries a placeholder "Domains" line (core/bank.js seedDefaultStack): this domain replaces it.
  const seeded = (state.recurring ?? []).find((r) => r.active && !r.domain && /domains/i.test(r.note ?? '') && r.vendor === 'Namecheap');
  if (seeded) { Object.assign(seeded, { vendor, amount, note, domain: info.name }); return seeded.id; }
  return addRecurring(state, { vendor, amount, category: 'software', dayOfMonth: 12, note }).id;
}

/** Buy (or connect) the primary domain. Throws on a name you can't have. Returns the new domainInfo.
 *  The caller charges founder hours (purchaseHours) through ctx.act. */
export function buyDomain(state, query, { registrar = 'cloudflare', searches = 0, connect = false } = {}) {
  const { sld, tld } = parseDomain(query);
  if (!sld || !tld) throw new Error('Type a full domain, e.g. ledgerly.com.');
  if (state.company.domain === `${sld}.${tld}`) throw new Error('You already own that domain.');
  let r, kind, paid;
  if (connect) {
    r = { domain: `${sld}.${tld}`, sld, tld, renew: TLDS[tld]?.prices.cloudflare[1] ?? 15 };
    kind = 'connected'; paid = 0;
  } else {
    r = checkDomain(sld, tld, registrar);
    if (r.status === 'taken') throw new Error(`${r.domain} is taken and not for sale.`);
    if (r.status === 'invalid' || r.status === 'unsupported') throw new Error(r.note);
    kind = r.status === 'aftermarket' ? 'aftermarket' : r.status === 'premium' ? 'premium' : 'registered';
    paid = r.dueNow;
    if (balance(state) < r.dueNow + (kind === 'aftermarket' ? r.renew : 0)) throw new Error(`Not enough cash in the bank for ${r.domain} (${money(r.dueNow)}).`);
    if (kind === 'aftermarket') {
      post(state, { amount: -r.price, counterparty: 'Domain broker (escrow)', description: `Aftermarket purchase: ${r.domain}`, category: 'marketing', method: 'wire' });
      post(state, { amount: -r.fee, counterparty: 'Escrow service', description: `Escrow fee: ${r.domain}`, category: 'marketing', method: 'card' });
      post(state, { amount: -r.renew, counterparty: REGISTRARS[registrar].label, description: `${r.domain} transfer + 1 year`, category: 'software', method: 'card' });
      paid = r.price + r.fee + r.renew;
    } else {
      post(state, { amount: -r.dueNow, counterparty: REGISTRARS[registrar].label, description: `Domain ${r.domain} (${r.years} year${r.years > 1 ? 's' : ''})`, category: 'software', method: 'card' });
    }
  }
  const prev = domainOf(state);
  const grade = gradeDomain(r.domain, state.company.name, { registrar: connect ? null : registrar, kind, oneLiner: state.company.oneLiner });
  const info = {
    name: r.domain, tld, registrar: connect ? 'external' : registrar, boughtDay: state.day, paid, renewal: r.renew, kind, grade,
    searches, collision: grade.collision, history: [...(state.company.domainInfo?.history ?? [])],
  };
  if (prev) info.history.push({ name: prev.name, untilDay: state.day, why: 'replaced' });
  // A replaced domain keeps renewing only if you keep it; here it lapses (its recurring line is reused).
  const old = (state.recurring ?? []).find((x) => x.id === state.company.domainInfo?.recurringId);
  if (old) old.active = false;
  info.recurringId = renewalRecurring(state, info);
  if (grade.collision) info.cdDay = state.day + CD.minDays + Math.floor(rng(state) * CD.spanDays);
  state.company.domain = r.domain;
  state.company.domainInfo = info;
  recordPublicEvent(state, 'domain_registered', { domain: r.domain }); // WHOIS / zone-file feeds: web-design and "SEO" spam follows
  applyDomainEffects(state);
  logDomainMistakes(state, info);
  return info;
}

function logDomainMistakes(state, info) {
  const g = info.grade;
  const base = { functionId: 'positioning_landing', app: 'website' };
  if (info.collision) logMistake(state, { ...base, id: 'trademark_domain', label: `Registered a domain using the "${info.collision}" trademark`, cost: { usd: CD.legalUsd, hours: CD.hours, reputation: 1 }, delayed: true, detail: `${info.name} contains a famous brand. Brand owners watch new registrations; a cease-and-desist or UDRP complaint usually follows and you lose the domain. Search the USPTO database first.`, key: `tm_domain:${info.name}` });
  else if (g.tier === 'mediocre') logMistake(state, { ...base, id: 'weak_domain', label: `Picked a hard-to-remember domain (${info.name})`, cost: { customers: 0.2 }, delayed: true, detail: `${g.weak.slice(0, 2).join('. ')}. Visitors who hear the name can't find it, and the page converts a little worse [design].`, key: `weak_domain:${info.name}` });
  if (info.kind === 'aftermarket' && info.paid >= 10000 && !(state.stripe?.charges ?? []).length) logMistake(state, { ...base, id: 'overpaid_domain_prerevenue', label: `Spent ${money(info.paid)} on a domain before any revenue`, cost: { usd: info.paid - 15 }, detail: 'Pre-revenue, cash is runway. get<name>.com or a fitting TLD costs ~$10-80/yr and converts nearly as well.', key: `pricey_domain:${info.name}` });
  if ((info.history ?? []).filter((h) => h.why === 'replaced').length >= 2) logMistake(state, { ...base, id: 'domain_churn', label: 'Changed the company domain again', cost: { hours: 2, customers: 0.1 }, circles: true, detail: 'Every switch breaks links, email addresses and SEO you already built.', key: `domain_churn:${info.name}` });
}

/** Landing-conversion modifier from the domain (run daily and right after a purchase). */
export function applyDomainEffects(state) {
  const info = domainOf(state);
  let m;
  if (info) m = info.collision ? DOMAIN_LANDING.collision : DOMAIN_LANDING[info.grade?.tier] ?? 1;
  else if (state.company?.domainInfo?.lost) m = DOMAIN_LANDING.lost;
  else if (state.company?.website && !ownedSiteDomain(state)) m = DOMAIN_LANDING.none;
  else m = 1;
  setModifier(state, 'landing', 'domain', m);
  return m;
}

/** Daily: trademark consequences land; landing modifier kept in sync. */
export function domainOnDay(state) {
  const info = state.company?.domainInfo;
  if (info && !info.lost && info.cdDay != null && state.day >= info.cdDay && state.company.domain === info.name) {
    post(state, { amount: -CD.legalUsd, counterparty: 'Outside counsel', description: `Review of trademark complaint over ${info.name}`, category: 'legal', method: 'card' });
    const t = newThread(state, { subject: `Cease and desist: ${info.name}`, with: { name: `${info.collision ? info.collision[0].toUpperCase() + info.collision.slice(1) : 'Brand'} legal department`, email: 'legal@example.com' }, kind: 'system', app: 'website' });
    addMessage(state, t.id, { from: 'them', body: `Your domain ${info.name} uses our registered trademark "${info.collision}" and is likely to confuse consumers. Transfer the domain to us within 14 days or we will file a UDRP complaint and seek costs.` });
    info.lost = true; info.lostDay = state.day; info.cdDay = null;
    (info.history ??= []).push({ name: info.name, untilDay: state.day, why: 'trademark complaint' });
    state.company.domain = '';
    const r = (state.recurring ?? []).find((x) => x.id === info.recurringId);
    if (r) r.active = false;
    logMistake(state, { functionId: 'positioning_landing', id: 'lost_domain_trademark', label: `Lost ${info.name} to a trademark complaint`, cost: { usd: CD.legalUsd, hours: CD.hours, customers: 0.3 }, charge: true, detail: 'Links, email addresses and search rankings on that domain are gone. Pick a name you can own.', app: 'website', key: `lost_domain:${info.name}` });
    notify(state, `Cease-and-desist over ${info.name}: counsel says surrender it. Your site and email need a new domain (Website → Domain).`, { type: 'bad', app: 'website' });
  }
  applyDomainEffects(state);
}
