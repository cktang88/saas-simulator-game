// Scripted negotiators for the negotiation tests. They play through the same public engine API a player uses and only
// read what a player can see (viewOf): their own weights, the researched bands they paid hours to look up, the counterparty
// priorities they researched, and the counteroffers. Four tiers separate by BEHAVIOUR (preparation, anchor, trades,
// concession discipline, bluffs, walk discipline), never by volume.
import * as N from '../../public/core/negotiation.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Player utility of a package from the view (the player's own side). */
export function uP(view, pkg) {
  let p = 0;
  for (const i of view.issues) {
    let u;
    if (i.type === 'num') { const t = (clamp(Number(pkg[i.id]), i.min, i.max) - i.min) / ((i.max - i.min) || 1); u = i.pDir > 0 ? t : 1 - t; }
    else u = i.options.find((o) => o.id === String(pkg[i.id]))?.pu ?? 0;
    p += i.yourWeight * u;
  }
  return p;
}
// value at stance s in [0,1] from the worst (0) to the best (1) for the player, on one issue.
export function valueAt(i, s) {
  if (i.type === 'num') {
    const best = i.pDir > 0 ? i.max : i.min, worst = i.pDir > 0 ? i.min : i.max;
    const step = i.step ?? (i.max - i.min) / 100;
    return Math.round((worst + s * (best - worst)) / step) * step;
  }
  const sorted = i.options.slice().sort((a, b) => a.pu - b.pu);
  const lo = sorted[0].pu, hi = sorted.at(-1).pu;
  const target = lo + s * (hi - lo);
  return sorted.slice().sort((a, b) => Math.abs(a.pu - target) - Math.abs(b.pu - target))[0].id;
}
export function stanceOfValue(i, v) {
  if (i.type === 'num') { const best = i.pDir > 0 ? i.max : i.min, worst = i.pDir > 0 ? i.min : i.max; return clamp((Number(v) - worst) / ((best - worst) || 1), 0, 1); }
  const sorted = i.options.slice().sort((a, b) => a.pu - b.pu);
  const o = i.options.find((x) => x.id === String(v)) ?? sorted[0];
  return (o.pu - sorted[0].pu) / ((sorted.at(-1).pu - sorted[0].pu) || 1);
}
const pkgFrom = (view, stances, overrides = {}) => Object.fromEntries(view.issues.map((i) => [i.id, overrides[i.id] ?? valueAt(i, stances[i.id])]));
const hi = (v) => v.issues.filter((i) => i.yourWeight >= 0.1).map((i) => i.id);

/**
 * tier: 'stellar' | 'good' | 'average' | 'mediocre'. opts.anchor: { id: value } numeric first-offer overrides per issue
 * (adapters give their researched band), opts.maxRounds. Returns the closed negotiation.
 */
export function runNegotiator(state, negId, tier, opts = {}) {
  const get = () => N.viewOf(state, N.getNegotiation(state, negId));
  const neg = N.getNegotiation(state, negId);
  const isOpen = () => neg.status === 'open';
  let v = get();
  const prep = { stellar: ['batna', 'norms', 'counterparty', 'counterparty'], good: ['batna', 'norms'], average: [], mediocre: [] }[tier];
  for (const p of prep) N.prepare(state, negId, p);
  v = get();
  const issues = v.issues;
  // stances: 1 = my ideal
  let st = Object.fromEntries(issues.map((i) => [i.id, 1]));
  const known = (id) => v.known.priorities[id];
  const claim = opts.claim ?? null;
  const roundsMax = opts.maxRounds ?? 9;
  const threshold = (v.batna?.value ?? 0.15);
  let r = 0, prevCounterU = null;
  const first = () => {
    if (tier === 'mediocre') return { offer: pkgFrom(v, Object.fromEntries(issues.map((i) => [i.id, 1])), opts.anchorMed ?? {}), message: opts.bluff ? 'We have another offer on the table, so this is my best.' : 'This is the price. Take it or leave it.', claim: opts.bluff ? 'alternative' : undefined };
    if (tier === 'average') { st = Object.fromEntries(issues.map((i) => [i.id, 0.6])); return { offer: pkgFrom(v, st, opts.anchorAvg ?? {}), message: 'Here is our proposal.' }; }
    // good / stellar: sharp anchor on the money issues, trade room on the issues the other side researched as high priority
    st = Object.fromEntries(issues.map((i) => [i.id, tier === 'stellar' ? (known(i.id) === 'high' && i.yourWeight < 0.1 ? 0.5 : known(i.id) === 'low' ? 0.85 : 0.72) : 0.72]));
    return { offer: pkgFrom(v, st, opts.anchor ?? {}), message: tier === 'stellar' ? 'This reflects the market for a deal this size. What matters most to you here?' : 'Here is our proposal.', claim: tier === 'stellar' && v.batna?.real && opts.mention !== false ? 'alternative' : undefined };
  };
  let play = first();
  while (isOpen() && r < roundsMax) {
    r++;
    const rep = N.playRoundSync(state, negId, play);
    if (!isOpen()) break;
    v = get();
    const cp = v.last.cp;
    if (!cp) break;
    const uCounter = uP(v, cp);
    // acceptance rule by tier
    if (tier === 'mediocre' && r >= 2) { N.acceptCounter(state, negId); break; }
    if (tier === 'average' && (r >= 4 || rep.final) && uCounter >= threshold - 0.1) { N.acceptCounter(state, negId); break; }
    if (tier === 'good' && (r >= 4 || rep.final) && uCounter >= threshold + 0.03) { N.acceptCounter(state, negId); break; }
    if (tier === 'stellar') {
      const gain = uCounter - (prevCounterU ?? -1);
      prevCounterU = uCounter;
      // keep pushing while they are still conceding; close when the concessions dry up (or they say it is final)
      if (r >= 3 && uCounter >= threshold + 0.1 && (gain < 0.025 || rep.final || r >= 8)) { N.acceptCounter(state, negId); break; }
    }
    // next offer
    const cpStance = Object.fromEntries(issues.map((i) => [i.id, stanceOfValue(i, cp[i.id])]));
    if (tier === 'average' || tier === 'mediocre') {
      for (const i of issues) st[i.id] = (st[i.id] + cpStance[i.id]) / 2; // meet them halfway on everything
      play = { offer: pkgFrom(v, st), message: 'Let us meet in the middle.', split: r >= 3 };
    } else if (tier === 'good') {
      for (const i of issues) if (i.yourWeight < 0.1 || r >= 3) st[i.id] = Math.max(cpStance[i.id], st[i.id] - 0.16 / r);
      play = { offer: pkgFrom(v, st), message: 'I moved on a few points; I need movement from you too.' };
    } else {
      // stellar: trade. Give where the other side's priority is high and mine is low, ask where mine is high; steps shrink.
      for (const i of issues) {
        const give = (known(i.id) === 'high' || known(i.id) === 'medium') && i.yourWeight < 0.12;
        const step = 0.3 / Math.sqrt(r);
        if (give) st[i.id] = Math.max(cpStance[i.id], st[i.id] - 2 * step);
        else if (i.yourWeight >= 0.1) st[i.id] = Math.max(cpStance[i.id], st[i.id] - 0.25 * step);
        else st[i.id] = Math.max(cpStance[i.id], st[i.id] - 0.7 * step);
      }
      play = { offer: pkgFrom(v, st), message: 'If you can hold the money terms, I can be flexible on the items you flagged.' };
    }
  }
  if (isOpen()) {
    // out of patience: take the counter if it beats the alternative, else walk
    const v2 = get();
    if (v2.last.cp && uP(v2, v2.last.cp) >= threshold) N.acceptCounter(state, negId); else N.walkAway(state, negId);
  }
  return neg;
}

/** A package at a given stance (0 = worst for the player, 1 = best) on every issue, from what the player can see. */
export function offerAt(state, negId, s, overrides = {}) {
  const v = N.viewOf(state, N.getNegotiation(state, negId));
  return pkgFrom(v, Object.fromEntries(v.issues.map((i) => [i.id, s])), overrides);
}
