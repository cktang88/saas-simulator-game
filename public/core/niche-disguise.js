// Niche dossier DISGUISE pass (shared by the server worker and the browser; pure, no DOM, no state, no clock).
//
// Web-grounded research returns real facts about a real niche. Before anything is cached or shown we:
//   - rename real companies (exampleCompanies, agencies, and any "Name Inc/LLC/Group..." found in free text) to generated
//     names, KEEPING well-known software vendors (tools) and public communities / associations / events / newsletters;
//   - multiply every numeric range by a seeded factor in [FUDGE_MIN, FUDGE_MAX] and round it (both ends of a range use the
//     same factor, so ordering holds);
//   - strip email addresses, phone numbers and person names from free text; citations are kept untouched.
// Everything is deterministic in (seedKey, input), so the same research disguises the same way on every machine.

export const FUDGE_MIN = 0.8;
export const FUDGE_MAX = 1.25;
export const FUDGE_NOTE = `Figures are rounded and multiplied by a seeded factor between ${FUDGE_MIN} and ${FUDGE_MAX} (about -20%/+25%), company and agency names are invented, people are never named. Treat as realistic for the niche, not as exact statistics.`;

/** 16 hex chars from two FNV-1a passes (cache keys: hex only, so the server can validate them). */
export function nicheHash(str) {
  const s = String(str);
  let a = 0x811c9dc5, b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a ^= c; a = Math.imul(a, 0x01000193);
    b ^= c + i; b = Math.imul(b, 0x85ebca6b); b ^= b >>> 13;
  }
  const h = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return h(a) + h(b);
}

/** Deterministic stream in [0,1) from a string (independent of any game state). */
export function seeded(str) {
  let a = parseInt(nicheHash(str).slice(0, 8), 16) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ allow-lists (real names that may stay)

export const KEEP_VENDORS = new Set(['quickbooks', 'xero', 'hubspot', 'salesforce', 'stripe', 'square', 'toast', 'servicetitan', 'clio', 'dentrix', 'eaglesoft', 'open dental', 'epic', 'cerner', 'athenahealth', 'slack', 'notion', 'google workspace', 'microsoft 365', 'zendesk', 'okta', 'shopify', 'mailchimp', 'quickbooks online', 'gusto', 'adp', 'paychex', 'docusign', 'zapier', 'airtable', 'excel', 'google sheets', 'calendly', 'jobber', 'housecall pro', 'procore', 'buildertrend', 'mindbody', 'opentable', 'resy', 'apollo', 'zoominfo', 'linkedin', 'meta', 'google ads', 'yelp', 'g2', 'capterra', 'canva', 'wordpress', 'wix', 'squarespace']);

const FIRST_NAMES = new Set('james john robert michael william david richard joseph thomas charles mary patricia jennifer linda elizabeth barbara susan jessica sarah karen nancy lisa margaret betty sandra ashley emily donna michelle carol amanda melissa deborah stephanie rebecca laura sharon cynthia kathleen amy angela anna brenda pamela nicole samantha katherine christine helen debra rachel carolyn janet maria heather diane julie joyce victoria kelly christina lauren joan evelyn olivia judith megan cheryl andrea hannah jacqueline martha gloria teresa sara janice marie julia kathryn daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald jason edward jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander patrick frank raymond jack dennis jerry tyler aaron jose adam nathan henry zachary douglas peter kyle noah ethan jeremy walter christian keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy bruce gabriel joe logan alan juan albert willie elijah wayne randy vincent mason roy ralph bobby russell bradley philip eugene priya raj amit sanjay wei li chen ahmed omar fatima aisha mohammed carlos luis miguel pedro sofia isabella mike sarah jane jim bob tom tim sam ben dan don ed fred greg hank ian jake jeff jen jenny joel josh karl kate katie kim leo lucy luke mia nick nina pat paul pete phil rob ron rose ruth ryan sally sean steve sue tina tony vic will zoe amanda brad chris cindy dave diana erin gina jill jon kara kyle liam lori mary max molly nora oscar paula quinn rick sheila todd tracy wendy'.split(' '));

const STATE_AND_PLACE = /^(?:Texas|California|Florida|New York|Ohio|Georgia|Illinois|Michigan|Washington|Oregon|Colorado|Arizona|Nevada|Utah|Virginia|Carolina|Dakota|Jersey|Mexico|Canada|America|United|Dental|Medical|Small|Business|Association|Society|Academy|Board)$/;

// ------------------------------------------------------------------ names

const ADJ = ['Harbor', 'Summit', 'Cedar', 'Ironwood', 'Bright', 'Lakeshore', 'Northgate', 'Redwood', 'Silverline', 'Maple', 'Granite', 'Willow', 'Copperfield', 'Bluebird', 'Stonebridge', 'Ridgeway', 'Clearwater', 'Foxhall', 'Brookside', 'Oakmont', 'Pinecrest', 'Evergreen', 'Westfield', 'Kestrel', 'Meridian', 'Juniper', 'Tidewater', 'Beacon', 'Sable', 'Aspen'];
const KIND_SUFFIX = {
  company: ['Group', 'Partners', 'Holdings', 'Services', 'Co', 'Associates'],
  marketing: ['Media', 'Marketing', 'Digital', 'Growth Partners', 'Creative'],
  recruiting: ['Talent', 'Search Partners', 'Staffing', 'Recruiting'],
  dev: ['Labs', 'Software Studio', 'Engineering', 'Dev Shop'],
  pr: ['Communications', 'PR', 'Public Relations'],
  consulting: ['Advisors', 'Consulting', 'Advisory'],
};
export function fakeName(r, kind = 'company') {
  const suf = KIND_SUFFIX[kind] ?? KIND_SUFFIX.company;
  return `${ADJ[Math.floor(r() * ADJ.length)]} ${suf[Math.floor(r() * suf.length)]}`;
}

export const isVendor = (name) => KEEP_VENDORS.has(String(name ?? '').trim().toLowerCase());

// ------------------------------------------------------------------ text scrubbing

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g;
const TITLED = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g;
const CORP = /\b(?:[A-Z][\w&'-]+\s){1,3}(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Co\.|GmbH|LLP|PLLC|Partners|Group|Holdings)\b/g;

/** Strip emails, phones and person names from free text. */
export function scrubPeople(text) {
  let t = String(text ?? '').replace(EMAIL, '[contact]').replace(PHONE, '[phone]').replace(TITLED, 'a staff member');
  t = t.replace(/\b([A-Z][a-z]+)\s+(?:[A-Z]\.\s+)?([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g, (m, f, l) => (FIRST_NAMES.has(f.toLowerCase()) && !STATE_AND_PLACE.test(l) ? 'a staff member' : m));
  t = t.replace(/\b(?:[A-Z][a-z]+ [A-Z][a-z]+)(?= (?:fixed|said|says|told|hired|founded|started|runs|ran|led|joined|noted|explained|recalled|wrote|owns|decided|quit|resigned|managed)\b)/g, 'a staff member');
  t = t.replace(/\b(?:founder|owner|CEO|CFO|COO|president|manager|director|dentist|attorney|partner)\s+[A-Z][a-z]+ [A-Z][a-z]+/g, (m) => m.split(/\s+/)[0]);
  t = t.replace(/\b([A-Z][a-z]+)\s+(said|says|told|explained)\b/g, (m, f, v) => (FIRST_NAMES.has(f.toLowerCase()) ? `an owner ${v}` : m));
  return t;
}

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------------ numbers

function roundNice(x) {
  if (!Number.isFinite(x)) return x;
  const a = Math.abs(x);
  if (a >= 1000) { const p = 10 ** (Math.floor(Math.log10(a)) - 1); return Math.round(x / p) * p; } // 2 significant digits
  if (a >= 100) return Math.round(x / 5) * 5;
  if (a >= 10) return Math.round(x);
  return Math.round(x * 10) / 10;
}
const factor = (r) => FUDGE_MIN + (FUDGE_MAX - FUDGE_MIN) * r();
const isRange = (v) => v && typeof v === 'object' && Number.isFinite(v.lo) && Number.isFinite(v.hi);
function fudgeRange(v, r, integer) {
  if (!isRange(v)) return v;
  const f = factor(r);
  let lo = roundNice(v.lo * f), hi = roundNice(v.hi * f);
  if (integer) { lo = Math.max(v.lo > 0 ? 1 : 0, Math.round(lo)); hi = Math.max(lo, Math.round(hi)); }
  if (hi < lo) hi = lo;
  return { lo, hi };
}

// ------------------------------------------------------------------ the pass

const FREE_TEXT_ARRAYS = ['workflows', 'vocabulary', 'painTriggers', 'incidents', 'objections'];

/**
 * disguise(raw, { seedKey }) → a new dossier (input untouched) with disguised:true and the fudge note.
 * Idempotent: a dossier already marked disguised is returned as a copy. Expects the normalised dossier shape
 * (core/niche-research.js normalizeDossier).
 */
export function disguise(raw, { seedKey = '' } = {}) {
  const d = JSON.parse(JSON.stringify(raw ?? {}));
  if (d.disguised) return d;
  const alias = new Map(); // real name (lower) -> invented
  const used = new Set();
  const rn = seeded(`${seedKey}|names`);
  const aliasFor = (real, kind) => {
    const k = real.trim().toLowerCase();
    if (!alias.has(k)) {
      let n, tries = 0;
      do { n = fakeName(rn, kind); tries++; } while (used.has(n) && tries < 40);
      used.add(n); alias.set(k, n);
    }
    return alias.get(k);
  };

  // 1. real companies named as examples / agencies (vendors and communities are not in these lists, but keep any vendor by name).
  for (const c of d.exampleCompanies ?? []) if (c.name && !isVendor(c.name)) c.name = aliasFor(c.name, 'company');
  for (const a of d.agencies ?? []) if (a.name && !isVendor(a.name)) a.name = aliasFor(a.name, ({ marketing: 'marketing', recruiting: 'recruiting', dev: 'dev', pr: 'pr' })[a.kind] ?? 'consulting');
  // names of companies learned from the lists above, kept to rewrite free text. Capture the REAL names first.
  const realNames = [...(raw.exampleCompanies ?? []), ...(raw.agencies ?? [])].map((x) => x.name).filter((n) => n && !isVendor(n));

  const keepWords = new Set([...(d.tools ?? []).map((t) => String(t.name).toLowerCase()), ...(d.communities ?? []).map((c) => String(c.name).toLowerCase())]);
  const text = (s) => {
    let t = String(s ?? '');
    for (const real of realNames) t = t.replace(new RegExp(escRx(real), 'gi'), alias.get(real.trim().toLowerCase()) ?? 'a local firm');
    t = t.replace(CORP, (m) => (isVendor(m) || keepWords.has(m.toLowerCase()) || [...used].some((u) => m.trim().startsWith(u)) ? m : aliasFor(m, 'company')));
    return scrubPeople(t).trim();
  };

  d.description = text(d.description);
  for (const k of FREE_TEXT_ARRAYS) if (Array.isArray(d[k])) d[k] = d[k].map(text);
  for (const c of d.exampleCompanies ?? []) c.note = text(c.note);
  for (const a of d.archetypes ?? []) { a.name = text(a.name); a.note = text(a.note); }
  for (const x of d.roles ?? []) { x.title = text(x.title); x.cares = (x.cares ?? []).map(text); }
  for (const a of d.agencies ?? []) { a.pricing = text(a.pricing); }
  if (d.spend) d.spend.budgetNorm = text(d.spend.budgetNorm);
  if (d.buying) { d.buying.process = text(d.buying.process); d.buying.signers = (d.buying.signers ?? []).map(text); }
  if (typeof d.seasonality === 'string') d.seasonality = text(d.seasonality);

  // 2. numbers: one seeded factor per range, rounded.
  const rf = seeded(`${seedKey}|fudge`);
  (d.archetypes ?? []).forEach((a) => { a.employees = fudgeRange(a.employees, rf, true); a.revenueUsd = fudgeRange(a.revenueUsd, rf); a.countInRegion = fudgeRange(a.countInRegion, rf, true); });
  if (d.spend) { d.spend.problemUsdPerMonth = fudgeRange(d.spend.problemUsdPerMonth, rf); d.spend.softwareUsdPerMonth = fudgeRange(d.spend.softwareUsdPerMonth, rf); }
  if (d.buying) d.buying.cycleDays = fudgeRange(d.buying.cycleDays, rf, true);
  for (const a of d.agencies ?? []) a.priceUsd = fudgeRange(a.priceUsd, rf);

  d.disguised = true;
  d.fudge = FUDGE_NOTE;
  return d;
}

/** True if a string still looks like it holds an email, phone number or titled person name. */
export const looksLikePII = (s) => { const t = String(s ?? ''); return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t) || new RegExp(PHONE.source).test(t) || new RegExp(TITLED.source).test(t); };
