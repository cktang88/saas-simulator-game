// Operator-tier inputs for customer discovery, read from what the player DID: whom they talked to (reconciled with
// the hidden market), how they asked, what commitments they earned from people who could really give them, how well
// they synthesised, and whether they kept to criteria set in advance. Pure and read-only (apps/outcomes/readers.js
// readCustomerDiscovery calls it). Returns null when there is no simulated interview, claim or hypothesis, so the
// older honour-system read is unchanged for those games.

import { truthOf } from '../../core/truth.js';
import { disc, mean } from './store.js';
import { COMMIT_RANK, CLOSE, synthesisQuality } from './synthesis.js';
import { hypothesisDiscipline } from './hypotheses.js';

const STRONG = new Set(['intro', 'pilot', 'loi', 'preorder']);

/** Segments where it is worth interviewing: pain strength within reach of the best segment. */
export function strongSegments(state) {
  const t = truthOf(state);
  const strength = (s) => s.painPrevalence * s.intensity;
  const top = Math.max(...t.segments.map(strength), 0.01);
  return new Set(t.segments.filter((s) => strength(s) >= 0.5 * top && strength(s) >= 0.2).map((s) => s.id));
}

export function discoveryComponents(state) {
  const r = disc(state);
  const real = r.interviews.filter((i) => i.real && i.status === 'done');
  const sim = real.filter((i) => i.sim);
  if (!sim.length && !r.claims.length && !r.hyps.length) return null;
  const strong = sim.length ? strongSegments(state) : new Set();
  const per = real.map((iv) => {
    const g = iv.grade ?? {};
    const q = (g.score ?? 40) / 100;
    const selfOrOffline = g.selfReported || g.source === 'offline heuristic';
    const qAdj = selfOrOffline ? 0.5 + (q - 0.5) * (iv.sim ? 0.85 : 0.5) : q;
    const c = g.commitments ?? [];
    if (iv.sim) {
      const h = iv.hidden;
      const stranger = !CLOSE.has(h.relationship) && h.relationship !== 'friend';
      const good = h.hasPain && !h.fraud && strong.has(h.segmentId) && stranger;
      const who = h.fraud || h.segmentId === 'outsider' ? 0 : good ? 1 : h.hasPain && !stranger ? 0.35 : strong.has(h.segmentId) && stranger ? 0.45 : 0.15;
      const counted = c.some((x) => STRONG.has(x));
      const commit = counted ? (good ? 1 : 0.15) : c.includes('followup') ? 0.25 : 0;
      return { q: qAdj, who: iv.excluded && who < 0.5 ? who * 0.8 : who, commit, sim: true, pain: good, close: !stranger, hypo: (g.hypotheticals?.length ?? 0) + (g.leadingQuestions?.length ?? 0) + (g.pitching?.length ?? 0), fraud: !!h.fraud, outsider: who === 0 };
    }
    return { q: qAdj, who: iv.channel && iv.channel !== 'warm' && iv.channel !== 'friends' ? 1 : 0.2, commit: c.some((x) => STRONG.has(x)) ? 1 : c.includes('followup') ? 0.3 : 0, sim: false, close: iv.channel === 'warm' || iv.channel === 'friends', hypo: (g.hypotheticals?.length ?? 0) + (g.leadingQuestions?.length ?? 0) + (g.pitching?.length ?? 0) };
  });
  const synth = synthesisQuality(state);
  const hyp = hypothesisDiscipline(state);
  const n = real.length;
  const m = (k) => (per.length ? mean(per.map((p) => p[k])) : null);
  const traps = [];
  const hypoAvg = per.length ? mean(per.map((p) => p.hypo)) : 0;
  if (hypoAvg >= 1.5) traps.push('hypotheticals');
  if (n >= 4 && (m('commit') ?? 0) < 0.1) traps.push('compliments');
  if (n >= 3 && per.filter((p) => p.close).length / n >= 0.5) traps.push('warm_only');
  if (per.filter((p) => !p.commit).length / Math.max(1, n) > 0.6 && n >= 4) traps.push('no_ask');
  const wrong = per.filter((p) => p.sim && p.outsider).length;
  if (wrong >= 2 && wrong / Math.max(1, sim.length) >= 0.3) traps.push({ id: 'wrong_people', text: 'A third or more of your calls were with people outside the market that has this problem (or panel fraud). Sharpen the target and screen on a recent, specific behaviour.' });
  if (n >= 5 && synth == null) traps.push({ id: 'no_synthesis', text: 'Many conversations and no written pattern claims: write claims per segment, citing the behaviour behind them.' });
  if (n >= 5 && !hyp) traps.push({ id: 'no_hypothesis', text: 'No hypothesis with pass/fail criteria set before the interviews. Without one, any result feels like a yes.' });
  return { n, q: m('q'), who: m('who'), commit: m('commit'), synth, hyp: hyp?.score ?? null, hypN: hyp?.n ?? 0, traps, simN: sim.length, claims: r.claims.length };
}
