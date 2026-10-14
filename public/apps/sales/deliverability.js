// Sending infrastructure & deliverability model (pure). Secondary domains, inboxes, SPF/DKIM/DMARC,
// warmup ramp, per-inbox caps, reputation, inbox placement, bounces and spam complaints.
import { clamp } from '../../core/util.js';
import { SALES } from './params.js';

export function warmupProgress(inbox, day) {
  if (inbox.warmupStartDay == null) return 0;
  return clamp((day - inbox.warmupStartDay) / SALES.warmupDays, 0, 1);
}

// Recommended cold sends/day for an inbox given warmup age (ramp 5–10 → 15 → 30).
export function recommendedCap(inbox, day) {
  if (inbox.warmupStartDay == null) return 0;
  const age = day - inbox.warmupStartDay;
  for (const [d, cap] of SALES.warmupRamp) if (age < d) return cap;
  return SALES.safeCapPerInbox;
}

// What the inbox will actually send today (player's limit; 'auto' follows the ramp).
export function effectiveCap(inbox, day) {
  if (inbox.paused) return 0;
  const rec = recommendedCap(inbox, day);
  if (inbox.dailyLimit == null || inbox.dailyLimit === 'auto') return rec || 5; // no warmup: 'auto' still trickles 5/day
  return clamp(Math.round(inbox.dailyLimit), 0, 200);
}

export const authComplete = (domain) => Boolean(domain.auth?.spf && domain.auth?.dkim && domain.auth?.dmarc);

// Multiplicative placement penalty for missing authentication (Gmail/Yahoo 2024, Outlook May 2025, Gmail Nov 2025 enforcement).
export function authFactor(domain) {
  const a = domain.auth ?? {};
  let f = 1;
  if (!a.spf) f *= 0.7;
  if (!a.dkim) f *= 0.55;
  if (!a.dmarc) f *= 0.85;
  return f;
}

/**
 * Probability an email lands in the primary inbox (vs spam / rejected).
 * domain.reputation 0..100; warmup 0..1; content 0..1 copy score; spam 0..1 spamminess; overCap = sends above recommended / recommended.
 */
export function inboxPlacement({ domain, warmup, content = 0.6, spam = 0, overCap = 0, trackOpens = false }) {
  const rep = clamp(domain.reputation ?? 50, 0, 100);
  let p = 0.93 * authFactor(domain) * (0.4 + 0.6 * warmup) * (0.3 + 0.7 * rep / 100);
  p *= 0.85 + 0.15 * content;
  p *= 1 - 0.5 * spam;
  if (overCap > 0) p *= Math.max(0.4, 1 - 0.6 * overCap);
  if (trackOpens) p *= 0.97; // tracking pixel may hurt placement (unverified practitioner claim)
  if (rep < 25) p *= 0.4; // providers start rejecting (5xx) a burnt domain
  return clamp(p, 0.02, 0.97);
}

export function bounceProbability(trueStatus, { role = false } = {}) {
  const p = SALES.bounce[trueStatus] ?? SALES.bounce.unknown;
  return clamp(p * (role ? SALES.roleAddressPenalty.bounce : 1), 0, 0.6);
}

// Targeting factor by personalization tier: irrelevance is punished quickly in cold email.
const TIER_COMPLAINT = { generic: 2.5, basic: 1.3, researched: 0.7, warm: 0.3 };

export function complaintProbability({ tier = 'basic', spam = 0, hasOptOut = true, overCap = 0, role = false, hallucination = false }) {
  let p = SALES.complaintBase * (TIER_COMPLAINT[tier] ?? 1) * (1 + 2 * spam) * (hasOptOut ? 1 : 1.6) * (1 + overCap);
  if (role) p *= SALES.roleAddressPenalty.complaint;
  if (hallucination) p *= 4;
  return clamp(p, 0, 0.05);
}

// Daily reputation update for a domain. stats = today's { sent, bounced, complaints, positive, overCap, warmup }.
export function nextReputation(domain, { sent = 0, bounced = 0, complaints = 0, positive = 0, overSends = 0, warmup = 0, warmupOn = false }) {
  const rep = domain.reputation ?? 50;
  const target = warmupOn ? 50 + 40 * warmup : 45;
  let r = rep + (target - rep) * 0.05;
  const bounceRate = sent ? bounced / sent : 0;
  r -= bounced * (bounceRate > SALES.bounceHealthy ? 1.5 : 0.5);
  r -= complaints * 8;
  r -= overSends * 0.4;
  r += positive * 0.5;
  if (!authFactor(domain) || authFactor(domain) < 0.6) r -= sent * 0.05;
  return clamp(r, 0, 100);
}

// Rolling health over the last `days` of a domain's daily log.
export function domainHealth(domain, day, days = 30) {
  const log = (domain.log ?? []).filter((x) => x.day > day - days);
  const t = log.reduce((a, x) => ({ sent: a.sent + x.sent, bounced: a.bounced + x.bounced, complaints: a.complaints + x.complaints }), { sent: 0, bounced: 0, complaints: 0 });
  return { ...t, bounceRate: t.sent ? t.bounced / t.sent : 0, complaintRate: t.sent ? t.complaints / t.sent : 0 };
}

export function healthLabel(rate, healthy, ceiling) {
  return rate >= ceiling ? 'bad' : rate >= healthy ? 'warn' : 'good';
}

// Is a lookalike domain sensible? .com, no hyphens/numbers, contains the brand (Instantly help center).
export function checkSecondaryDomain(name, primary = '') {
  const n = String(name).trim().toLowerCase();
  const issues = [];
  if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(n)) issues.push('Not a valid domain');
  if (primary && n === primary.toLowerCase()) issues.push('Never send cold email from your primary domain');
  if (/-/.test(n.split('.')[0])) issues.push('Avoid hyphens');
  if (/\d/.test(n.split('.')[0])) issues.push('Avoid numbers');
  if (!n.endsWith('.com')) issues.push('Prefer .com for cold sending');
  const brand = (primary.split('.')[0] ?? '').toLowerCase();
  if (brand && !n.includes(brand)) issues.push(`Doesn't contain your brand "${brand}"; prospects may not trust it`);
  return issues;
}
