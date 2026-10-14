// Prospect list import: column mapping, normalization and validation (pure, testable).
import { isEmail, domainOf, hash } from '../../core/util.js';
import { ROLE_PREFIXES, FREE_MAIL, SALES } from './params.js';

// Target fields a CSV column can map to.
export const FIELDS = [
  { key: 'firstName', label: 'First name', guess: [/^first ?name$|^first$|^given/] },
  { key: 'lastName', label: 'Last name', guess: [/^last ?name$|^last$|^surname|^family/] },
  { key: 'fullName', label: 'Full name', guess: [/^(full ?)?name$|^contact( name)?$|^person/] },
  { key: 'email', label: 'Email', guess: [/e-?mail/] },
  { key: 'title', label: 'Job title', guess: [/title|position|role|job/] },
  { key: 'company', label: 'Company', guess: [/^company( name)?$|^organi[sz]ation|^account( name)?$|^business/] },
  { key: 'domain', label: 'Website / domain', guess: [/website|domain|url|^site$|^web$/] },
  { key: 'linkedin', label: 'LinkedIn URL', guess: [/linkedin/] },
  { key: 'industry', label: 'Industry', guess: [/industry|vertical|sector/] },
  { key: 'size', label: 'Company size', guess: [/size|employees|headcount/] },
  { key: 'notes', label: 'Notes', guess: [/note|comment|trigger|signal/] },
];

// headers (already lower-cased by parseCsv) → { field: header|'' }
export function guessMapping(headers) {
  const map = {};
  const used = new Set();
  for (const f of FIELDS) {
    // LinkedIn columns often contain "url" too, so match the specific fields first.
    const h = headers.find((x) => !used.has(x) && f.guess.some((re) => re.test(x)) && !(f.key === 'domain' && /linkedin/.test(x)) && !(f.key === 'title' && /company|website/.test(x)));
    map[f.key] = h ?? '';
    if (h) used.add(h);
  }
  return map;
}

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function splitName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

export function normalizeEmail(e) {
  return String(e ?? '').trim().toLowerCase().replace(/^mailto:/, '');
}

export function isRoleAddress(email) {
  const local = normalizeEmail(email).split('@')[0] ?? '';
  return ROLE_PREFIXES.includes(local.replace(/[._-]?\d+$/, ''));
}
export const isFreeMail = (email) => FREE_MAIL.includes(normalizeEmail(email).split('@')[1] ?? '');

export function normalizeLinkedin(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(s)) return s;
  if (/^([a-z]{2,3}\.)?linkedin\.com\//i.test(s)) return `https://${s}`;
  return '';
}

// Raw CSV row + mapping → normalized prospect record.
export function mapRow(row, mapping) {
  const g = (k) => (mapping[k] ? String(row[mapping[k]] ?? '').trim() : '');
  let firstName = g('firstName'), lastName = g('lastName');
  if (!firstName && g('fullName')) ({ firstName, lastName } = splitName(g('fullName')));
  const email = normalizeEmail(g('email'));
  let domain = domainOf(g('domain'));
  if (!domain && email.includes('@') && !isFreeMail(email)) domain = email.split('@')[1];
  const company = g('company') || (domain ? cap(domain.split('.')[0]) : '');
  return { firstName, lastName, email, title: g('title'), company, domain, linkedin: normalizeLinkedin(g('linkedin')), industry: g('industry'), size: g('size'), notes: g('notes') };
}

// Validate one prospect. existing: Set of emails already in the CRM; seen: Set of emails earlier in the file.
// Returns { issues: [{level:'error'|'warn', text}], status: 'ok'|'warn'|'skip' }.
export function validateProspect(p, { existing = new Set(), seen = new Set() } = {}) {
  const issues = [];
  if (!p.email) issues.push({ level: 'error', text: 'No email' });
  else if (!isEmail(p.email) || /\.\.|@.*@|\s/.test(p.email)) issues.push({ level: 'error', text: 'Invalid email syntax' });
  else {
    if (existing.has(p.email)) issues.push({ level: 'error', text: 'Already in CRM (duplicate)' });
    else if (seen.has(p.email)) issues.push({ level: 'error', text: 'Duplicate row in file' });
    if (isRoleAddress(p.email)) issues.push({ level: 'warn', text: 'Role address (info@, sales@…): low quality, rarely a decision-maker, more complaints' });
    if (isFreeMail(p.email)) issues.push({ level: 'warn', text: 'Personal mailbox (gmail etc.): fine for a solo owner, odd for B2B' });
    if (p.domain && !isFreeMail(p.email) && !p.email.endsWith('@' + p.domain) && !p.email.endsWith('.' + p.domain)) issues.push({ level: 'warn', text: `Email domain doesn't match ${p.domain}` });
  }
  if (!p.firstName) issues.push({ level: 'warn', text: 'No first name: {{firstName}} will fall back to "there"' });
  if (!p.company && !p.domain) issues.push({ level: 'warn', text: 'No company or website: nothing to research or personalize from' });
  const status = issues.some((i) => i.level === 'error') ? 'skip' : issues.length ? 'warn' : 'ok';
  return { issues, status };
}

export function validateRows(rows, mapping, existingEmails = []) {
  const existing = new Set(existingEmails.map(normalizeEmail));
  const seen = new Set();
  return rows.map((row) => {
    const p = mapRow(row, mapping);
    const v = validateProspect(p, { existing, seen });
    if (p.email) seen.add(p.email);
    return { prospect: p, ...v };
  });
}

// Hidden ground truth of an address (what a verifier would find), deterministic per email.
export function trueEmailStatus(email) {
  const e = normalizeEmail(email);
  if (!isEmail(e)) return 'invalid';
  const u = (parseInt(hash(`verify:${e}`), 36) % 10000) / 10000;
  const sh = SALES.verify.shares;
  // Role addresses on small business domains are disproportionately catch-all.
  const shift = isRoleAddress(e) ? 0.1 : 0;
  if (u < sh.valid - shift) return 'valid';
  if (u < sh.valid + sh.catch_all) return 'catch_all';
  if (u < sh.valid + sh.catch_all + sh.invalid) return 'invalid';
  return 'unknown';
}
