// Operator read for infra_ops: hosting platform fit, ops upkeep, observability depth, uptime paging and status page,
// SMS registration hygiene, and the infra mistakes that cost money or hours. Scores are [design] weights; the
// tier behaviours live in data/operator-tiers.js (infra_ops).

import { clamp, round2 } from '../../core/util.js';
import { registerOperatorReader, hasOperatorReader, shrink, tierFromScore } from '../../core/operator.js';
import { productSlice } from './store.js';
import { HOSTS, hostingSlice, effectivePlatform, hostFit } from './hosting.js';
import { OBS, obsSlice, obsFit } from './observability.js';
import { releasesSlice } from './releases.js';
import { smsHygiene } from '../emailops/sms.js';

export function readInfraOps(state) {
  const p = state.apps?.product;
  const h = p?.hosting;
  const o = p?.observability;
  if (!h?.platform && !o?.vendor) return { tier: 'unknown', evidence: [], coaching: ['Choose a hosting platform that fits your stage and an error tool with source maps before your first customers arrive.'] };
  const hs = hostingSlice(productSlice(state));
  const os = obsSlice(state);
  const rel = releasesSlice(productSlice(state));
  const id = effectivePlatform(state);
  const fit = id ? hostFit(state, id) : 0.5;
  const of = obsFit(state);
  const ins = state.apps?.insights?.flags ?? {};
  const sms = smsHygiene(state);
  const mistakes = (state.mistakes ?? []).filter((m) => m.functionId === 'infra_ops').length;
  const upkeep = clamp(1 - hs.opsDebt / 4, 0, 1);
  const raw = 0.3 * fit + 0.25 * of + 0.1 * upkeep + 0.15 * (ins.paging ? 1 : 0) + 0.1 * (ins.statusPage ? 1 : 0) + 0.1 * (sms == null ? 0.7 : sms) - 0.06 * Math.min(5, mistakes);
  const score = shrink(clamp(raw, 0, 1), 6, 0.5, 2);
  const tier = tierFromScore(score);
  const evidence = [
    id ? `Hosting: ${HOSTS[id].label} (${HOSTS[id].shape}), stage fit ${Math.round(fit * 100)}%${id === 'vercel' ? (hs.spendCap ? ', spend cap on' : ', no spend cap') : ''}${hs.opsDebt ? `, ${hs.opsDebt} week(s) of skipped upkeep` : ''}` : 'Hosting billed through the cloud provider in AI costs',
    os.vendor ? `Observability: ${OBS[os.vendor].label}${rel.flags.sourcemaps ? ' with source maps and releases' : ' WITHOUT source maps (unreadable traces)'}` : 'No error tool: customers report your bugs',
    `${ins.paging ? 'Uptime paging on' : 'No uptime paging'}, ${ins.statusPage ? 'public status page' : 'no status page'}`,
    sms == null ? 'No SMS' : `SMS hygiene ${Math.round(sms * 100)}% (registration, email fallback, pumping guard, one segment)`,
    `${mistakes} infra mistake(s) logged; ${hs.incidents} platform incident(s), ${hs.spikes} usage spike(s), ${hs.moves.length} migration(s)`,
  ];
  const coaching = [];
  if (id === 'vercel' && !hs.spendCap) coaching.push('Set a Vercel spend cap and alert: a bot crawl or viral spike otherwise bills thousands in bandwidth and functions.');
  if (id === 'aws' && fit < 0.5) coaching.push('Raw AWS without a platform engineer costs hours every week. Run a PaaS (Railway, Render) or Porter on your AWS credits until load demands more.');
  if (id === 'porter' && fit < 0.5) coaching.push('Porter is a ~$200/mo cluster floor: worth it with AWS credits or own-cloud customers, not before.');
  if (id === 'render' && fit < 0.7) coaching.push('Fixed instances do not scale themselves: resize to the load (and off the free tier, which cold-starts).');
  if (os.vendor && !rel.flags.sourcemaps) coaching.push('Upload source maps and tag releases in CI: minified traces make every fix ~1.8x slower.');
  if (os.vendor === 'datadog' && of < 0.5) coaching.push('Datadog is per-host infrastructure monitoring for Series A+ teams with Kubernetes. Sentry plus an uptime pager covers a seed team at a fraction of the cost.');
  if (!os.vendor) coaching.push('Add Sentry (or PostHog error tracking pre-seed) so bad releases surface in minutes, not from tickets.');
  if (!ins.paging) coaching.push('An uptime check that pages your phone (Better Stack, AppSignal or Insights) turns overnight outages from hours into minutes.');
  if (sms != null && sms < 0.6) coaching.push('Register 10DLC (or verify toll-free) before sending SMS, keep an email fallback for codes and geo-restrict the code endpoint.');
  if (tier !== 'stellar') coaching.push('What a stellar operator does: a $20-ish PaaS that fits the next 12-18 months of load with a spend cap, Sentry with source maps (+ PostHog for product), a cheap uptime pager with a status page, SMS only after carrier registration, and a staged migration to Porter or AWS once credits or customers justify it.');
  return { tier, score: round2(score), raw: round2(clamp(raw, 0, 1)), n: 6, evidence, coaching };
}

if (!hasOperatorReader('infra_ops')) registerOperatorReader('infra_ops', readInfraOps);
