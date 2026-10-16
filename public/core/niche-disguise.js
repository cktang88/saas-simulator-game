// Niche dossier DISGUISE pass (shared by the server worker and the browser; pure, no DOM, no state, no clock).
//
// Web-grounded research returns real facts about a real niche. Before anything is cached or shown we:
//   - rename real companies (exampleCompanies, agencies, and any "Name Inc/LLC/Group..." found in free text) to generated
//     names, KEEPING well-known software vendors (tools) and public communities / associations / events / newsletters;
//   - multiply every numeric range by a seeded factor in [FUDGE_MIN, FUDGE_MAX] and round it (both ends of a range use the
//     same factor, so ordering holds);
//   - strip email addresses, phone numbers, street addresses and person names from free text; citations are kept untouched;
//   - RE-IDENTIFICATION GUARD: wherever an aliased entity appears (same sentence, or the whole note of an example company /
//     agency), also scrub what would re-identify it: HQ town (state/region stays), investor / PE firm names, exact counts
//     (bucketed into ranges), exact dates, award names, product launches and website domains, and fudge leftover numbers.
//     Market-level statements with no aliased entity are untouched; vendors, associations, regulators and events stay named.
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

export const KEEP_VENDORS = new Set(['quickbooks', 'xero', 'hubspot', 'salesforce', 'stripe', 'square', 'toast', 'servicetitan', 'clio', 'dentrix', 'eaglesoft', 'open dental', 'epic', 'cerner', 'athenahealth', 'slack', 'notion', 'google workspace', 'microsoft 365', 'zendesk', 'okta', 'shopify', 'mailchimp', 'quickbooks online', 'gusto', 'adp', 'paychex', 'docusign', 'zapier', 'airtable', 'excel', 'google sheets', 'calendly', 'jobber', 'housecall pro', 'procore', 'buildertrend', 'mindbody', 'opentable', 'resy', 'apollo', 'zoominfo', 'linkedin', 'meta', 'google ads', 'yelp', 'g2', 'capterra', 'canva', 'wordpress', 'wix', 'squarespace', 'denticon', 'carestack', 'curve dental', 'tab32', 'weave', 'adit', 'dentally', 'modmed', 'nextech', 'kareo', 'tebra', 'simplepractice', 'vagaro', 'fresha']);

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
const TITLED = /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z'-]+(?:\s+(?:[A-Z]\.\s+)?[A-Z][a-z'-]+)?/g;
const CORP = /\b(?:[A-Z][\w&'-]+\s){1,3}(?:Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Co\.|GmbH|LLP|PLLC|Partners|Group|Holdings)\b/g;
const STREET = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Parkway|Pkwy|Highway|Hwy|Place|Pl|Circle|Cir|Trail|Trl|Freeway|Fwy|Expressway';
const ADDRESS = new RegExp(`\\b\\d{1,6}\\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\\.?\\s+)?(?:(?:[A-Z]|\\d)[\\w'.-]*\\s+){1,3}(?:${STREET})\\b\\.?(?:,?\\s+(?:Suite|Ste|Unit|Apt|Floor|Fl|#)\\.?\\s*[\\w-]+)?(?:,\\s*[A-Z][a-z]+(?:\\s[A-Z][a-z]+)?,\\s*[A-Z]{2}(?:\\s+\\d{5}(?:-\\d{4})?)?)?`, 'g');
const PO_BOX = /\bP\.?\s?O\.?\s*Box\s+\d+\b/gi;
const SUITE = /\b(?:Suite|Ste\.?)\s+\d+[A-Z]?\b/g;
const STATE_ZIP = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;
const CREDENTIALED = /\b([A-Z][a-z'-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z'-]+){1,2}),?\s+(?:DDS|DMD|MD|DO|DVM|CPA|Esq\.?|JD|PhD|RN|MBA|FACP|PA-C|NP|MSc|BDS|OD|PharmD|CFP|CFA)\b\.?/g;
const ROLE_WORD = `(?:${['co-?founder', 'founder', 'owner', 'CEO', 'CFO', 'COO', 'CTO', 'president', 'chairman', 'chairwoman', 'managing partner', 'principal', 'manager', 'director', 'dentist', 'attorney', 'partner', 'founded by', 'led by', 'run by', 'headed by', 'started by'].map((w) => (/^[a-z]/.test(w) ? `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}` : w)).join('|')})`;
const ROLE_NAME = new RegExp(`\\b(${ROLE_WORD})\\s+(?:Dr\\.?\\s+)?([A-Z][a-z'-]+)(?:\\s+[A-Z]\\.)?(?:\\s+([A-Z][a-z'-]+))?`, 'g');
const TITLE_WORD = '(?:Founder|Co-?Founder|CEO|CFO|COO|CTO|Owner|President|Chairman|Director|VP|Vice President|Chief|Head|Managing|Partner|Principal|Manager|Practice|Office|Senior|Regional|Dentist|Doctor|Hygienist|Consultant|Executive|Advisor|Board|Associate)';
const NAME_DASH_TITLE = new RegExp(`\\b([A-Z][a-z'-]+(?:\\s+[A-Z]\\.)?(?:\\s+[A-Z][a-z'-]+){1,2})\\s*[\\u2014\\u2013|]\\s*(?=${TITLE_WORD}\\b)|\\b([A-Z][a-z'-]+(?:\\s+[A-Z]\\.)?(?:\\s+[A-Z][a-z'-]+){1,2})\\s+-\\s+(?=${TITLE_WORD}\\b)`, 'g');
const NAME_COMMA_TITLE = /\b([A-Z][a-z'-]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z'-]+){1,2}),\s+(?=(?:the\s+)?(?:CEO|CFO|COO|CTO|founder|co-founder|co-owner|owner|president|chairman|managing partner|managing director|director|VP|vice president|chief)\b)/g;

const ORG_WORDS = new Set('Association Society Board Academy Council Commission Department Agency Administration Bureau Institute Federation Chamber Foundation Group Partners Holdings Capital Equity Ventures Associates Services Inc LLC Company Dental Medical Health Healthcare Practice Practices Clinic Clinics Management Network Alliance Solutions Systems Software Digital Media Marketing Creative Labs Advisors Consulting Insurance Care Smile Smiles'.split(' '));
const REGION_WORDS = new Set('Southwest Southeast Northeast Northwest Midwest Midatlantic Pacific Gulf Metroplex Dallas-Fort Worth DFW Texas'.split(' '));
const notNameWord = (w) => STATE_AND_PLACE.test(w) || ORG_WORDS.has(w) || REGION_WORDS.has(w) || US_STATES.has(w) || /^(?:The|A|An|Our|Their|This|That|These|Those|Some|Many|Most|One|Each|Every)$/.test(w);
const personish = (words) => words.length > 0 && words.every((w) => !notNameWord(w));

/** Strip emails, phones, street addresses and person names from free text. */
export function scrubPeople(text) {
  let t = String(text ?? '').replace(EMAIL, '[contact]').replace(PHONE, '[phone]');
  t = t.replace(ADDRESS, 'a local office').replace(PO_BOX, 'a local office').replace(STATE_ZIP, (m) => m.slice(0, 2)).replace(SUITE, 'a suite');
  t = t.replace(TITLED, (m) => { const w = m.split(/\s+/); const last = w[w.length - 1]; return w.length > 2 && notNameWord(last) ? `a staff member ${last}` : 'a staff member'; });
  t = t.replace(CREDENTIALED, (m, nm) => (personish(nm.split(/\s+/)) ? 'a staff member' : m));
  t = t.replace(NAME_DASH_TITLE, (m, a, b) => (personish((a || b).split(/\s+/)) ? 'a staff member, ' : m));
  t = t.replace(NAME_COMMA_TITLE, (m, a) => (personish(a.split(/\s+/)) ? 'a staff member, ' : m));
  t = t.replace(/\b([A-Z][a-z]+)\s+(?:[A-Z]\.\s+)?([A-Z][a-z]+(?:-[A-Z][a-z]+)?)\b/g, (m, f, l) => (FIRST_NAMES.has(f.toLowerCase()) && !STATE_AND_PLACE.test(l) && !ORG_WORDS.has(l) ? 'a staff member' : m));
  t = t.replace(/\b(?:[A-Z][a-z]+ [A-Z][a-z]+)(?= (?:fixed|said|says|told|hired|founded|started|runs|ran|led|joined|noted|explained|recalled|wrote|owns|decided|quit|resigned|managed)\b)/g, (m) => (personish(m.split(' ')) ? 'a staff member' : m));
  t = t.replace(ROLE_NAME, (m, role, a, b) => {
    const strong = /founded|led|run|headed|started|founder|CEO|CFO|COO|CTO|president|chairman|chairwoman|principal|managing/i.test(role);
    const ok = b ? personish([a, b]) && (FIRST_NAMES.has(a.toLowerCase()) || strong) : FIRST_NAMES.has(a.toLowerCase());
    return ok ? role : m;
  });
  t = t.replace(/\b([A-Z][a-z]+)\s+(said|says|told|explained)\b/g, (m, f, v) => (FIRST_NAMES.has(f.toLowerCase()) ? `an owner ${v}` : m));
  return t;
}

const escRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------------ re-identification scrubbing

const US_STATES = new Set(['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Canada', 'Ontario', 'Mexico']);
const CITIES = 'Dallas|Houston|Austin|San Antonio|Fort Worth|El Paso|Arlington|Plano|Irving|Frisco|McKinney|Carrollton|Garland|Richardson|Denton|Lewisville|Allen|Flower Mound|Mesquite|Grand Prairie|Round Rock|Cedar Park|Georgetown|Pflugerville|Sugar Land|The Woodlands|Katy|Pearland|Conroe|Cypress|Humble|League City|Galveston|Corpus Christi|Laredo|Lubbock|Amarillo|Waco|Killeen|Tyler|Beaumont|Midland|Odessa|Abilene|Brownsville|McAllen|San Marcos|New Braunfels|Southlake|Grapevine|Keller|Coppell|Addison|Rockwall|Wylie|Prosper|Little Elm|Phoenix|Tempe|Scottsdale|Denver|Atlanta|Miami|Orlando|Tampa|Jacksonville|Nashville|Charlotte|Raleigh|Chicago|Columbus|Cleveland|Detroit|Minneapolis|Seattle|Portland|Boston|Philadelphia|Pittsburgh|Brooklyn|Los Angeles|San Diego|San Francisco|San Jose|Sacramento|Las Vegas|Salt Lake City|Oklahoma City|Tulsa|Kansas City|St\\. Louis|Indianapolis|Louisville|Memphis|New Orleans|Baltimore|Boise'.split('|').sort((x, y) => y.length - x.length).join('|');
const CITY_RX = new RegExp(`\\b(in|at|near|of|from|around|outside|to|out of|into)\\s+(${CITIES})(?![\\w-]|\\s+(?:Fort|metro|area|Metroplex))(,\\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?))?`, 'g');
const BASED_RX = /\b(headquartered|based|located|HQ(?:'d)?|operating out of|operates out of)\s+(?:in|at|out of)\s+(?!the\b)([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})(?:,\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?|[A-Z]{2}))?/g;
const HYPHEN_BASED = /\b((?:[A-Z][a-z]+-)?[A-Z][a-z]+(?: [A-Z][a-z]+)?)-(?:based|headquartered)\b/g;

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const MONTH_RX = new RegExp(`\\b(?:(in|since|by|during|from|until|through|on|as of|last|this|next|early|late|mid|back in)[ -]+)?(${MONTHS})\\b\\.?(\\s+\\d{1,2}(?:st|nd|rd|th)?\\b)?(,?\\s+(?:19|20)\\d\\d\\b)?`, 'g');
const QUARTER_RX = /\b(?:(?:in|since|by|during|from|until|through|as of|last|this|next|early|late|back in)\s+)?(?:Q[1-4]|[1-4]Q|H[12])[\s-]*(?:FY|CY)?['’]?(?:19|20)?\d{2}\b/g;
const NUMDATE_RX = /\b(?:\d{1,2}\/\d{1,2}\/(?:19|20)?\d{2}|(?:19|20)\d\d-\d{2}-\d{2})\b/g;
const YEAR_RX = /\b(?:(in|since|by|during|from|until|through|as of|back in|founded|established|launched|opened|acquired)\s+)?((?:19|20)\d\d)\b(?!\s*(?:%|[a-z]*\s?(?:locations|offices)))/g;

const PE_NAMES = 'KKR|Blackstone|Carlyle|TPG|Bain Capital|Warburg Pincus|Vista Equity|Thoma Bravo|Summit Partners|General Atlantic|Insight Partners|Sequoia|Andreessen Horowitz|a16z|Accel|Tiger Global|Francisco Partners|Hellman & Friedman|Leonard Green|Welsh,? Carson|Harvest Partners|Shore Capital|Charlesbank|Audax|American Securities|Ares Management|Cressey & Company|Lee Equity|Madison Dearborn|New Mountain Capital|L Catterton|Brentwood Associates|Berkshire Partners|Genstar|Stonepeak|Kohlberg|Olympus Partners|Cortec|Riverside Company|Frazier Healthcare'.split('|').join('|');
const INVEST_ORG = '(?:Capital|Equity|Ventures?|Associates|Investors?|Investments?|Growth Partners|Partners|Management|Fund|Funds|Asset Management)';
const NAMESEQ = "(?:[A-Z][\\w&'.-]*)(?:\\s+(?:&\\s+)?[A-Z][\\w&'.-]*){0,4}";
const INVEST_SKIP = /^(?:PE|VC|Venture|Private|Equity|Investor|Growth|Institutional|Angel|Seed|Debt|Fund|Founder|Self|Bootstrapped|Customer|Community)$/i;

const COUNT_NOUN = 'locations?|offices?|clinics?|practices|practice|sites?|employees|staff|team members|dentists|doctors|providers|hygienists|customers|clients|patients|stores|branches|members|users|accounts|centers|facilities|restaurants|shops|franchisees|rooftops|stations|dental offices|physicians|attorneys|technicians';
const QUAL = '(?:(?:more than|over|about|around|roughly|approximately|nearly|almost|up to|at least|~)\\s+)?';
const COUNT_RANGE = new RegExp(`(?<![\\w$.,\\uE000])${QUAL}(\\d[\\d,]*)(?:\\s*\\+|\\s+plus)?(?:\\s*(?:-|\\u2013|to)\\s*(\\d[\\d,]*)\\+?)?(\\s+(?:[a-z-]+\\s+){0,2}?)(${COUNT_NOUN})\\b`, 'g');
const COUNT_HYPHEN = new RegExp(`(?<![\\w$.,\\uE000])${QUAL}(\\d[\\d,]*)\\+?-(location|office|clinic|practice|site|employee|doctor|dentist|store|branch|provider)\\b`, 'g');
const EDGES = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const fmtInt = (n) => (n >= 1000 ? n.toLocaleString('en-US') : String(n));
/** Bucket a count into a coarse range ("180" -> "100-250"); small counts (<5) stay as they are. */
export function bucketCount(n) {
  if (!(n >= 5)) return String(n);
  let i = EDGES.length - 1;
  while (i >= 0 && EDGES[i] > n) i--;
  return i === EDGES.length - 1 ? `${fmtInt(EDGES[i])}+` : `${fmtInt(EDGES[i])}-${fmtInt(EDGES[i + 1])}`;
}
const toNum = (x) => Number(String(x).replace(/,/g, ''));

const AWARD_RX = /\b(?:(?:the|a|an)\s+)?(?!(?:Won|Named|Received|Earned|Awarded|Ranked|Recipient)\b)(?:\d{4}\s+)?(?:[A-Z][\w'&.-]*\s+(?:(?:to|of|in|for|and|the)\s+)?){0,7}(?:Awards?|Prize)\b/g;
const RANKING_RX = /\b(?:Inc\.?\s?(?:5000|500)(?:\s+list)?|Best Places to Work(?:\s+in\s+[A-Z][a-z]+)?|Fastest[- ]Growing(?:\s+[A-Z][\w-]*){0,3}|(?:Top|Best)\s+\d+\s+[A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})/g;
const LAUNCH_RX = /\b(launched|introduced|unveiled|released|rolled out|debuted)\s+(?:(?:its|their|a|an|the)\s+)?(?:(?:new|own)\s+)?(?:"[^"]{2,60}"|“[^”]{2,60}”|[A-Z][\w+-]*(?:\s[A-Z][\w+-]*){0,3})/g;
const DOMAIN_RX = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|us|ai|app|health|dental|biz|info|care)\b(?:\/[^\s,;)]*)?/gi;

const VENDOR_CUSTOMER = /^[“"(]?(?:[A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+)+|[A-Z][\w&'-]{3,}(?<!s))\s+(?:\w+\s+){0,2}?(?:migrated|moved|switched|rolled out|deployed|went live|selected|chose|adopted|signed|implemented|converted|transitioned)\b|\b(?:customers?|clients?)\s+(?:such as |like |including )?[A-Z]/;
const SENT_SPLIT = /((?<=[.!?])\s+(?=[A-Z"'(“]))/;
const ENTITY_STARTERS = /^(?:Most|Many|Some|Several|Larger|Smaller|Newer|Older|When|Once|After|Before|Because|Since|While|Often|Typically|Usually|Recently|Today)$/;

const NUM_RX = /(?<![\w.])(\$?)(\d[\d,]*(?:\.\d+)?)(\s?(?:[kKmMbB]|million|billion|thousand)\b)?(?![\d]|\.\d)/g;
/** Multiply standalone numbers (>= 10 or dollar amounts) by one seeded factor; years and percentages are left alone. */
export function fudgeNumbers(text, f) {
  return String(text ?? '').replace(NUM_RX, (m, dollar, num, suf) => {
    const v = toNum(num);
    if (!Number.isFinite(v) || (!dollar && v < 10) || (!dollar && !suf && v >= 1900 && v <= 2099)) return m;
    if (/^\s?%/.test(suf ?? '')) return m;
    const out = roundNice(v * f);
    const dec = num.includes('.') && Math.abs(out) < 10;
    const shown = dec ? out.toFixed(1) : num.includes(',') && Math.abs(out) >= 1000 ? Math.round(out).toLocaleString('en-US') : String(Math.round(out * 10) / 10);
    return `${dollar}${shown}${suf ?? ''}`;
  });
}

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
function fudgeRange(v, r, integer, fixed = null) {
  if (!isRange(v)) return v;
  const f = fixed ?? factor(r);
  let lo = roundNice(v.lo * f), hi = roundNice(v.hi * f);
  if (integer) { lo = Math.max(v.lo > 0 ? 1 : 0, Math.round(lo)); hi = Math.max(lo, Math.round(hi)); }
  if (hi < lo) hi = lo;
  return { lo, hi };
}

// ------------------------------------------------------------------ the pass

const FREE_TEXT_ARRAYS = ['workflows', 'vocabulary', 'painTriggers', 'incidents', 'objections'];
const GENERIC_TAIL = new Set('inc inc. llc llp ltd corp corporation co co. pllc pc pa group partners holdings associates services agency media marketing digital creative company management'.split(' '));
const PROTECT_ORG = new RegExp(`\\b(?:(?:The|the)\\s+)?(?:[A-Z][\\w&'-]*\\s+){0,5}(?:Association|Society|Board|Academy|Council|Commission|Department|Agency|Administration|Bureau|Institute|Federation|Chamber|Foundation|Alliance)(?:\\s+of\\s+(?:[A-Z][\\w&'-]*\\s?){1,4})?|\\b(?:[A-Z][\\w&'-]*\\s+){0,4}(?:Summit|Conference|Expo|Congress|Symposium|Convention|Forum|Meeting)(?:\\s+(?:19|20)\\d\\d)?\\b|\\b(?:HIPAA|OSHA|FDA|FTC|CMS|IRS|HHS|ADA|DANB|SBA|CDC|EEOC|DOL)\\b`, 'g');

/** Alias for one real name: stable per (seedKey, real name); first words never repeat inside a dossier. */
function makeAliaser(seedKey, srcLower, realFirstWords) {
  const alias = new Map(); const usedFull = new Set(); const usedFirst = new Set();
  return (real, kind) => {
    const k = real.trim().toLowerCase();
    if (alias.has(k)) return alias.get(k);
    const r = seeded(`${seedKey}|alias|${k}`);
    const suf = KIND_SUFFIX[kind] ?? KIND_SUFFIX.company;
    const start = Math.floor(r() * ADJ.length), sIdx = Math.floor(r() * suf.length);
    let pick = null;
    for (let strict = 1; strict >= 0 && !pick; strict--) {
      for (let step = 0; step < ADJ.length * suf.length && !pick; step++) {
        const adj = ADJ[(start + step) % ADJ.length], sf = suf[(sIdx + Math.floor(step / ADJ.length)) % suf.length];
        const n = `${adj} ${sf}`;
        if (usedFull.has(n) || srcLower.includes(n.toLowerCase()) || realFirstWords.has(adj.toLowerCase())) continue;
        if (strict && usedFirst.has(adj)) continue;
        pick = n;
      }
    }
    pick ??= `${ADJ[start]} ${suf[sIdx]} ${alias.size + 2}`;
    usedFull.add(pick); usedFirst.add(pick.split(' ')[0]); alias.set(k, pick);
    return pick;
  };
}

/**
 * disguise(raw, { seedKey }) → a new dossier (input untouched) with disguised:true and the fudge note.
 * Idempotent: a dossier already marked disguised is returned as a copy. Expects the normalised dossier shape
 * (core/niche-research.js normalizeDossier).
 */
export function disguise(raw, { seedKey = '' } = {}) {
  const d = JSON.parse(JSON.stringify(raw ?? {}));
  if (d.disguised) return d;
  const srcLower = JSON.stringify(raw ?? {}).toLowerCase();

  // names of companies learned from the lists (captured BEFORE they are renamed).
  const realList = [...(d.exampleCompanies ?? []).map((x) => ({ n: x.name, kind: 'company' })), ...(d.agencies ?? []).map((a) => ({ n: a.name, kind: ({ marketing: 'marketing', recruiting: 'recruiting', dev: 'dev', pr: 'pr' })[a.kind] ?? 'consulting' }))]
    .filter((x) => x.n && !isVendor(x.n));
  const realFirstWords = new Set(realList.map((x) => String(x.n).trim().split(/\s+/)[0].toLowerCase()));
  const aliasFor = makeAliaser(seedKey, srcLower, realFirstWords);

  // token vault: aliases and protected names are swapped for opaque tokens while scrubbing, restored at the end.
  const vault = []; const aliasIds = new Set(); const vendorIds = new Set();
  const tok = (text, type) => { vault.push(text); const i = vault.length - 1; if (type === 'alias') aliasIds.add(i); if (type === 'vendor') vendorIds.add(i); return `${i}`; };
  const restore = (t) => { let s = t, prev; do { prev = s; s = s.replace(/(\d+)/g, (m, i) => vault[+i]); } while (s !== prev); return s; };
  const TOKEN = /(\d+)/g;
  const hasTok = (s, set) => { for (const m of s.matchAll(TOKEN)) if (set.has(+m[1])) return true; return false; };

  const aliasTok = new Map(); // real lower -> token
  const tokenFor = (real, kind) => { const k = real.trim().toLowerCase(); if (!aliasTok.has(k)) aliasTok.set(k, tok(aliasFor(real, kind), 'alias')); return aliasTok.get(k); };
  const variantsOf = (name) => {
    const out = new Set(); let w = String(name).trim().replace(/^the\s+/i, '').split(/\s+/);
    out.add(w.join(' '));
    while (w.length > 2 && GENERIC_TAIL.has(w[w.length - 1].toLowerCase().replace(/,$/, ''))) { w = w.slice(0, -1); out.add(w.join(' ').replace(/,$/, '')); }
    if (w.length === 2 && GENERIC_TAIL.has(w[1].toLowerCase()) && !isVendor(w[0]) && w[0].length > 3 && !US_STATES.has(w[0])) out.add(w[0]); // "Smile Growth Agency" -> "Smile Growth" handled above; "Acme Group" -> "Acme"
    return [...out].filter((v) => v.length > 3 && !isVendor(v));
  };
  const nameRules = [];
  for (const { n, kind } of realList) for (const v of variantsOf(n)) nameRules.push({ v, real: n, kind });
  nameRules.sort((a, b) => b.v.length - a.v.length);
  for (const { n, kind } of realList) tokenFor(n, kind); // stable order: lists first

  const keepNames = [...new Set([...KEEP_VENDORS, ...(d.tools ?? []).map((t) => String(t.name ?? '').toLowerCase()), ...(d.communities ?? []).map((c) => String(c.name ?? '').toLowerCase())].filter((n) => n.length > 1))].sort((a, b) => b.length - a.length);
  const vendorSet = new Set([...KEEP_VENDORS, ...(d.tools ?? []).map((t) => String(t.name ?? '').toLowerCase())]);
  const keepRx = keepNames.length ? new RegExp(`(?<![\\w\\uE000])(?:${keepNames.map(escRx).join('|')})(?![\\w\\uE001])`, 'gi') : null;
  const keepWords = new Set(keepNames);
  const fn = factor(seeded(`${seedKey}|notes`));

  const protect = (t) => {
    if (keepRx) t = t.replace(keepRx, (m) => tok(m, vendorSet.has(m.toLowerCase()) ? 'vendor' : 'keep'));
    return t.replace(PROTECT_ORG, (m) => tok(m, 'keep'));
  };

  // Scrub the attributes that re-identify an entity inside ONE sentence (tokens present).
  const bucketTok = (s) => s
    .replace(COUNT_HYPHEN, (m, n, noun) => (toNum(n) >= 5 ? tok(`${bucketCount(toNum(n))} ${noun}`, 'num') : m))
    .replace(COUNT_RANGE, (m, a, b, mid, noun) => {
      const n1 = toNum(a), n2 = b ? toNum(b) : n1;
      if (!(Math.max(n1, n2) >= 5)) return m;
      const bk = bucketCount(b ? (n1 + n2) / 2 : n1);
      return tok(`${bk}${mid}${noun}`, 'num');
    });
  const scrubEntity = (s, full, fudge) => {
    s = s.replace(AWARD_RX, 'an industry award');
    s = s.replace(RANKING_RX, (m) => (/^Inc|Fastest/.test(m) ? 'a growth ranking' : /Best Places/.test(m) ? 'a workplace ranking' : 'an industry ranking'));
    s = s.replace(MONTH_RX, (m, pre, mon, day, yr) => (pre || day || yr ? 'recently' : m));
    s = s.replace(QUARTER_RX, 'recently').replace(NUMDATE_RX, 'recently');
    s = s.replace(YEAR_RX, (m, pre, yr, off, str) => {
      const recent = +yr >= 2022, adj = !pre && /^\s+[a-z]/.test(str.slice(off + m.length));
      if (pre === 'founded' || pre === 'established' || pre === 'opened') return `${pre} ${recent ? 'recently' : 'some years ago'}`;
      if (adj) return recent ? 'recent' : 'earlier';
      return recent ? 'recently' : 'some years ago';
    });
    s = s.replace(/\brecently(?:\s+(?:to|and|through|until|-)\s+recently)+/g, 'recently').replace(/\b(?:in|since|by|during|as of|back in)\s+recently\b/g, 'recently').replace(/\b(?:in|during) some years ago\b/g, 'some years ago');
    s = s.replace(BASED_RX, (m, kw, a, b) => {
      if (US_STATES.has(a) || REGION_WORDS.has(a)) return m;
      const st = b && (US_STATES.has(b) || /^[A-Z]{2}$/.test(b)) ? b : null;
      return `${kw} in ${st ?? 'the region'}`;
    });
    s = s.replace(HYPHEN_BASED, (m, nm, off) => {
      const first = nm.split(/[ -]/)[0];
      return US_STATES.has(nm) || REGION_WORDS.has(nm) || REGION_WORDS.has(first) || /^Dallas-Fort Worth$/.test(nm) || (off === 0 && !new RegExp(`^(?:${CITIES})$`).test(nm)) ? m : 'regional';
    });
    s = s.replace(CITY_RX, (m, prep, city, st) => `${prep} ${st ? st.replace(/^,\s*/, '') : 'the region'}`);
    s = s.replace(new RegExp(`(?<![\\w\\uE000-])(?:${CITIES})(?![\\w\\u2013-]|\\s+(?:Fort|metro|area|Metroplex))(?=\\s+[a-z])`, 'g'), 'regional')
      .replace(new RegExp(`(?<![\\w\\uE000-])(?:${CITIES})(?![\\w\\u2013-]|\\s+(?:Fort|metro|area|Metroplex))`, 'g'), 'the region');
    // investors and parents
    s = s.replace(new RegExp(`(${NAMESEQ})-(?:backed|owned|funded|led|financed)\\b`, 'g'), (m, nm) => (INVEST_SKIP.test(nm.split(/\s+/).pop()) ? m : 'PE-backed'));
    s = s.replace(new RegExp(`\\b(backed|funded|financed|owned|invested in|recapitali[sz]ed|sponsored|capitali[sz]ed|controlled|majority-owned|led)\\s+by\\s+${NAMESEQ}`, 'g'), (m, v) => `${v} by a PE firm`);
    s = s.replace(new RegExp(`\\b(acquired|bought|purchased|taken private|merged)\\s+by\\s+${NAMESEQ}`, 'g'), (m, v) => `${v} by a larger operator`);
    s = s.replace(new RegExp(`\\b(portfolio company of|subsidiary of|division of|unit of|arm of)\\s+${NAMESEQ}`, 'g'), (m, v) => `${v} ${v.startsWith('portfolio') ? 'a PE firm' : 'a larger group'}`);
    s = s.replace(new RegExp(`\\bfrom\\s+(?:[A-Z][\\w&'.-]*\\s+){1,3}${INVEST_ORG}\\b`, 'g'), 'from a growth-equity investor');
    s = s.replace(new RegExp(`\\b(?:${PE_NAMES})\\b(?:\\s+(?:Capital|Partners|Equity|Management|Group|Global|Associates)\\b)?`, 'g'), 'a PE firm');
    s = s.replace(new RegExp(`(?<![\\w\\uE001])(?:[A-Z][\\w&'.-]*\\s+){1,3}(?:Capital|Equity|Ventures?|Investors?|Investments?|Growth Partners)(?:\\s+(?:Partners|LP|LLC|Fund\\s+[IVX]+|[IVX]+))?\\b`, 'g'), 'a PE firm');
    s = s.replace(/\ba PE firm(?:\s+(?:and|&)\s+a PE firm)+/g, 'a PE firm');
    s = bucketTok(s);
    s = s.replace(LAUNCH_RX, (m, v) => `${v} a new product`);
    s = s.replace(DOMAIN_RX, 'its website');
    if (full && fudge) s = fudgeNumbers(s, fn);
    return s;
  };
  const entityPass = (t, item, fudge) => {
    const parts = t.split(SENT_SPLIT);
    for (let i = 0; i < parts.length; i += 2) {
      const sent = parts[i];
      if (item || hasTok(sent, aliasIds)) parts[i] = scrubEntity(sent, true, fudge);
      else if (hasTok(sent, vendorIds) && VENDOR_CUSTOMER.test(sent.replace(TOKEN, 'X')) && !ENTITY_STARTERS.test(sent.split(/\s+/)[0])) parts[i] = scrubEntity(sent, false, false);
    }
    return parts.join('');
  };

  const text = (s, { item = false, fudge = true } = {}) => {
    let t = String(s ?? '');
    const swap = (rules) => { for (const { v, real } of rules) t = t.replace(new RegExp(`(?<![\\w\\uE000])${escRx(v)}(?![\\w\\uE001])`, 'gi'), aliasTok.get(real.trim().toLowerCase())); };
    swap(nameRules.filter((x) => x.v === x.real.trim().replace(/^the\s+/i, ''))); // exact real names first, so associations never swallow them
    t = protect(t);
    swap(nameRules.filter((x) => x.v !== x.real.trim().replace(/^the\s+/i, ''))); // then shortened forms ("Acme Dental" for "Acme Dental Partners LLC")
    t = scrubPeople(t);
    t = entityPass(t, item, false);
    t = t.replace(CORP, (m) => (isVendor(m) || keepWords.has(m.trim().toLowerCase()) ? m : tokenFor(m, 'company')));
    t = entityPass(t, item, fudge);
    return restore(t).replace(/\s{2,}/g, ' ').trim();
  };

  // 1. real companies named as examples / agencies (vendors and communities are not in these lists, but keep any vendor by name).
  for (const c of d.exampleCompanies ?? []) if (c.name && !isVendor(c.name)) c.name = restore(aliasTok.get(c.name.trim().toLowerCase()));
  for (const a of d.agencies ?? []) if (a.name && !isVendor(a.name)) a.name = restore(aliasTok.get(a.name.trim().toLowerCase()));

  d.description = text(d.description);
  for (const k of FREE_TEXT_ARRAYS) if (Array.isArray(d[k])) d[k] = d[k].map((x) => text(x));
  for (const c of d.exampleCompanies ?? []) c.note = text(c.note, { item: true });
  for (const a of d.archetypes ?? []) { a.name = text(a.name); a.note = text(a.note); }
  for (const x of d.roles ?? []) { x.title = text(x.title); x.cares = (x.cares ?? []).map((y) => text(y)); }
  for (const a of d.agencies ?? []) { a.pricing = text(a.pricing, { item: true, fudge: false }); }
  if (d.spend) d.spend.budgetNorm = text(d.spend.budgetNorm);
  if (d.buying) { d.buying.process = text(d.buying.process); d.buying.signers = (d.buying.signers ?? []).map((y) => text(y)); }
  if (typeof d.seasonality === 'string') d.seasonality = text(d.seasonality);

  // 2. numbers: one seeded factor per range, rounded.
  const rf = seeded(`${seedKey}|fudge`);
  (d.archetypes ?? []).forEach((a) => { a.employees = fudgeRange(a.employees, rf, true); a.revenueUsd = fudgeRange(a.revenueUsd, rf); a.countInRegion = fudgeRange(a.countInRegion, rf, true); });
  if (d.spend) { d.spend.problemUsdPerMonth = fudgeRange(d.spend.problemUsdPerMonth, rf); d.spend.softwareUsdPerMonth = fudgeRange(d.spend.softwareUsdPerMonth, rf); }
  if (d.buying) d.buying.cycleDays = fudgeRange(d.buying.cycleDays, rf, true);
  for (const a of d.agencies ?? []) {
    const f = isRange(a.priceUsd) ? factor(rf) : null;
    a.priceUsd = fudgeRange(a.priceUsd, rf, false, f);
    a.pricing = fudgeNumbers(a.pricing, f ?? fn); // the agency's price text moves with its price range
  }

  d.disguised = true;
  d.fudge = FUDGE_NOTE;
  return d;
}

/** True if a string still looks like it holds an email, phone number, street address or titled / credentialed person name. */
export const looksLikePII = (s) => {
  const t = String(s ?? '');
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t) || new RegExp(PHONE.source).test(t) || new RegExp(TITLED.source).test(t) || new RegExp(ADDRESS.source).test(t) || new RegExp(PO_BOX.source, 'i').test(t) || /\b[A-Z][a-z]+ [A-Z][a-z]+,? (?:DDS|DMD|MD|DVM|CPA|Esq|PhD)\b/.test(t);
};
