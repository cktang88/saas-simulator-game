// Cold-email copy: variable rendering and deterministic quality heuristics (pure).
// Rules from docs/research/sales-and-research.md §2: under ~80 words, plain text, one soft CTA, no link in
// email 1, a specific verifiable trigger, no AI slop / buzzwords, an opt-out line.
import { clamp, words } from '../../core/util.js';

export const VARS = ['firstName', 'lastName', 'company', 'title', 'personalization', 'senderName', 'myCompany'];

export function renderTemplate(text, vars) {
  return String(text ?? '').replace(/\{\{\s*(\w+)\s*(?:\|\s*([^}]*))?\}\}/g, (_, k, dflt) => {
    const v = vars[k];
    return v != null && String(v).trim() !== '' ? String(v) : (dflt ?? (k === 'firstName' ? 'there' : '')).trim();
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function varsFor(state, contact, company) {
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    company: company?.name ?? '',
    title: contact?.title ?? '',
    personalization: contact?.personalization ?? '',
    senderName: state.founder?.name?.split(' ')[0] ?? '',
    myCompany: state.company?.name ?? '',
  };
}

export const BUZZWORDS = ['revolutioniz', 'seamless', 'all-in-one', 'next-gen', 'cutting-edge', 'unlock', 'supercharge', 'game-chang', 'leverage', 'synerg', 'world-class', 'best-in-class', 'empower', 'transform your', 'skyrocket', 'innovative', 'disrupt', 'robust', 'holistic', 'scalable solution', 'ai-powered', 'streamline', 'elevate', 'turbocharge', 'paradigm'];
export const AI_SLOP = ['i hope this email finds you', 'hope you are doing well', "hope you're doing well", 'hope this finds you', 'i came across your', 'i noticed that you', 'i was impressed by', 'impressive work', 'great things', 'in today\'s fast-paced', 'in today’s fast-paced', 'delve', 'i wanted to reach out', 'reaching out because', 'touch base', 'circle back', 'just following up', 'just checking in', 'bumping this', 'i\'d love to pick your brain', 'quick 15', 'take your business to the next level', 'as a fellow', 'dear sir', 'to whom it may concern', 'tailored solution', 'pain points'];
export const SPAM_WORDS = ['free!', '100% free', 'guarantee', 'act now', 'limited time', 'click here', 'buy now', 'winner', 'urgent', '$$$', 'risk-free', 'no risk', 'double your', 'earn money', 'cash bonus', '!!!'];
const ASK_RE = /\?|\b(worth a (look|chat)|open to|interested|mind if|want me to send|should i send|reply ['"]?yes|thoughts\b)/gi;
const HARD_CTA_RE = /\b(book (a|some) (time|call|demo|meeting)|calendly\.com|grab (a )?time|30[- ]min(ute)?s? (call|meeting|demo)|schedule a (call|demo))\b/i;
export const OPT_OUT_RE = /unsubscribe|opt[- ]?out|not (the right|relevant)|if (this|it)('s| is) not (relevant|a fit|for you)|let me know and i('ll| will) (stop|not)|reply ["'“]?(no|stop)|won't (email|bother|follow up)|stop (emailing|hearing)/i;

// Analyze one email template (subject + body). stepIndex 0 = first email.
export function analyzeCopy({ subject = '', body = '' }, stepIndex = 0) {
  const lower = `${subject}\n${body}`.toLowerCase();
  const plain = body.replace(/\{\{[^}]+\}\}/g, 'X');
  const w = words(plain);
  const links = (body.match(/https?:\/\/|www\./gi) ?? []).length;
  const asks = (body.match(ASK_RE) ?? []).length;
  const buzz = BUZZWORDS.filter((b) => lower.includes(b));
  const slop = AI_SLOP.filter((b) => lower.includes(b));
  const spam = SPAM_WORDS.filter((b) => lower.includes(b));
  const hasOptOut = OPT_OUT_RE.test(body);
  const usesPersonalization = /\{\{\s*personalization/.test(body);
  const usesCompany = /\{\{\s*company/.test(body + subject);
  const usesFirstName = /\{\{\s*firstName/.test(body);
  const hardCta = HARD_CTA_RE.test(body);
  const exclam = (body.match(/!/g) ?? []).length;
  const subjWords = words(subject);
  const issues = [];
  let score = 0.8;
  if (w > 80) { score -= Math.min(0.35, (w - 80) / 160); issues.push(`${w} words: keep cold emails under ~80`); }
  if (w < 20 && stepIndex === 0) { score -= 0.1; issues.push('Very short: give one concrete reason this is relevant to them'); }
  if (links && stepIndex === 0) { score -= Math.min(0.2, 0.1 * links); issues.push('Link in email 1 hurts placement and looks automated'); }
  else if (links > 1) { score -= 0.05; issues.push('More than one link'); }
  if (!asks) { score -= 0.15; issues.push('No clear ask: end with one easy question'); }
  if ((body.match(/\?/g) ?? []).length > 2) { score -= 0.08; issues.push('Several questions: one clear ask converts better'); }
  if (hardCta) { score -= 0.07; issues.push('Hard CTA (book 30 min / calendar link): a soft interest question gets more positive replies'); }
  score -= Math.min(0.3, buzz.length * 0.06);
  if (buzz.length) issues.push(`Buzzwords: ${buzz.join(', ')}`);
  score -= Math.min(0.35, slop.length * 0.09);
  if (slop.length) issues.push(`Reads like AI/template slop: "${slop.join('", "')}"`);
  score -= Math.min(0.3, spam.length * 0.1);
  if (spam.length) issues.push(`Spam-filter words: ${spam.join(', ')}`);
  if (subjWords > 7) { score -= 0.05; issues.push('Long subject line: 2–5 plain words look like a real email'); }
  if (/[A-Z]{5,}/.test(subject) || /!/.test(subject)) { score -= 0.08; issues.push('Shouty subject line'); }
  if (exclam > 1) { score -= 0.05; issues.push('Too many exclamation marks'); }
  if (stepIndex === 0 && !usesPersonalization) { score -= 0.08; issues.push('No {{personalization}} line: merge fields alone read as automation in 2026'); }
  if (!hasOptOut) issues.push('No opt-out line ("not relevant? just tell me and I won\'t follow up"): more spam complaints; CAN-SPAM requires an opt-out');
  if (usesPersonalization && stepIndex === 0 && !/^\s*(hi|hey|hello)?[^\n]{0,30}\n*\s*\{\{\s*personalization/i.test(body)) issues.push('Tip: put {{personalization}} in the first line, it is what shows in the inbox preview');
  return { words: w, links, asks, buzz, slop, spam, hasOptOut, usesPersonalization, usesCompany, usesFirstName, hardCta, score: clamp(score, 0.05, 1), issues };
}

// Spamminess 0..1 used by placement/complaints.
export const spamminess = (a) => clamp(a.spam.length * 0.25 + a.buzz.length * 0.05 + (a.links ? 0.1 : 0) + a.slop.length * 0.04, 0, 1);

const STOP = new Set(['about', 'their', 'there', 'which', 'would', 'could', 'should', 'these', 'those', 'where', 'while', 'after', 'before', 'really', 'great', 'things', 'noticed', 'company', 'business', 'website', 'saw', 'your', 'youre', 'that', 'with', 'from', 'have', 'this', 'just', 'what', 'love', 'loved', 'amazing', 'awesome', 'impressive', 'work', 'doing', 'team']);
const tokens = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9$%]+/).filter((t) => t.length >= 4 && !STOP.has(t));

// How specific/verifiable a personalization line is for this company (0..1).
// Rewards words that actually appear on their fetched website (or the player's research notes), numbers and
// proper nouns; punishes empty flattery ("love what you're doing").
export function specificity(line, company = {}) {
  const l = String(line ?? '').trim();
  if (!l) return 0;
  const lower = l.toLowerCase();
  if (AI_SLOP.some((s) => lower.includes(s)) && words(l) < 14) return 0.12;
  if (/^(love|loved|great|impressive|amazing|awesome) (what|the work|your)/i.test(l)) return 0.12;
  const site = company.site;
  const corpus = [site?.title, site?.description, (site?.headings ?? []).join(' '), site?.text?.slice(0, 8000), company.notes, company.research?.summary].filter(Boolean).join(' ').toLowerCase();
  const name = String(company.name ?? '').toLowerCase();
  const toks = [...new Set(tokens(l))].filter((t) => !name.includes(t));
  const hits = corpus ? toks.filter((t) => corpus.includes(t)).length : 0;
  const numbers = /\d/.test(l) ? 1 : 0;
  const proper = (l.slice(1).match(/\b[A-Z][a-z]{2,}/g) ?? []).length;
  let s = corpus ? 0.2 + Math.min(0.6, hits * 0.17) : 0.25 + Math.min(0.2, proper * 0.05);
  s += numbers * 0.1 + Math.min(0.1, proper * 0.03);
  if (words(l) < 6) s -= 0.1;
  if (words(l) > 40) s -= 0.1;
  return clamp(s, 0, 1);
}

// Short, plain, single-question human reply to a prospect (used for the mail reply gate).
export function replyQuality(body) {
  const w = words(body);
  const lower = String(body).toLowerCase();
  let q = 1;
  if (w > 150) q -= Math.min(0.4, (w - 150) / 300);
  if (w < 8) q -= 0.2;
  q -= Math.min(0.3, AI_SLOP.filter((s) => lower.includes(s)).length * 0.1 + BUZZWORDS.filter((b) => lower.includes(b)).length * 0.05);
  return clamp(q, 0.3, 1);
}

// Did the founder ask for / propose a meeting?
export const asksForMeeting = (body) => /\b(call|chat|meeting|meet|zoom|demo|walk ?through|show you|15|20|30)\b[^.?!]*(\?|\b(mon|tue|wed|thu|fri)\w*|next week|tomorrow|this week)|\b(free|available|time) (on|for|next|this|tomorrow)|calendly|cal\.com|grab (a )?time|book (a )?time|send (you )?(a )?(calendar )?invite/i.test(String(body));
