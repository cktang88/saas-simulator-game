// node analyze.mjs out/*.json → markdown tables (targets vs measured) + out/summary.json
import fs from 'fs';
const R = process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public';
const { OUTCOME_TARGETS: T } = await import(R + '/data/outcomes.js');

const HM = +(process.env.HABIT_MONTH ?? 6);
const cells = {};
for (const f of process.argv.slice(2)) {
  if (!f.endsWith('.json') || f.endsWith('summary.json')) continue;
  let j; try { j = JSON.parse(fs.readFileSync(f)); } catch { continue; }
  if (!j.cell) continue;
  const k = `${j.cell.path}-${j.cell.model}-${j.cell.policy}`;
  (cells[k] ??= { ...j.cell, runs: [], errors: new Set() }).runs.push(...j.runs);
  for (const e of j.errors ?? []) cells[k].errors.add(e);
}
const q = (arr, p) => { const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
const share = (R, f) => R.length ? R.filter(f).length / R.length : null;
const by = (d, D) => d != null && d <= D;
const M = (r, mo) => r[`mrr${mo}`] ?? 0; // dead runs have 0; runs that ended early (death) carry 0

function metrics(c) {
  const R = c.runs;
  const m = {
    n: R.length,
    pctAnyRevenueBy12mo: share(R, (r) => by(r.firstPaid, 365)),
    pctFirstCustomerWithin30dOfLaunch: share(R, (r) => { const l = r.launchDay ?? r.firstShip; return l != null && r.firstPaid != null && r.firstPaid - l <= 30; }),
    pctFirstContractBy12mo: share(R, (r) => by(r.firstPaid, 365)),
    pctReach1kMrrBy12mo: share(R, (r) => by(r.d1k, 365)),
    pctReach1kMrrBy24mo: share(R, (r) => by(r.d1k, 730)),
    pctReach10kMrrBy12mo: share(R, (r) => by(r.d10k, 365)),
    pctReach10kMrrBy24mo: share(R, (r) => by(r.d10k, 730)),
    pctReach100kMrrBy36mo: share(R, (r) => by(r.d100k, 1095)),
    pctReach1MArrBy24mo: share(R, (r) => by(r.d100k, 730)),
    medianMrrAt12mo: q(R.map((r) => M(r, 12)), 0.5),
    medianMrrAt12moAllStarters: q(R.map((r) => M(r, 12)), 0.5),
    bottomQuartileMrrAt12mo: q(R.map((r) => M(r, 12)), 0.25),
    medianMrrAt24mo: q(R.map((r) => M(r, 24)), 0.5),
    medianMrrAt24moRevenueEarners: q(R.filter((r) => M(r, 24) > 0).map((r) => M(r, 24)), 0.5),
    p90MrrAt24mo: q(R.map((r) => M(r, 24)), 0.9),
    p95MrrAt24mo: q(R.map((r) => M(r, 24)), 0.95),
    medianMrrAt36mo: q(R.map((r) => M(r, 36)), 0.5),
    p95MrrAt36mo: q(R.map((r) => M(r, 36)), 0.95),
    medianDaysTo1kIfReached: q(R.filter((r) => r.d1k != null).map((r) => r.d1k - (r.launchDay ?? r.firstShip ?? 0)), 0.5),
    medianMonthsToFirstContractIfReached: (() => { const v = q(R.filter((r) => r.firstPaid != null).map((r) => r.firstPaid), 0.5); return v == null ? null : +(v / 30.4).toFixed(1); })(),
    pctDeadBy12mo: share(R, (r) => by(r.death, 365)), pctDeadBy24mo: share(R, (r) => by(r.death, 730)), pctDeadBy36mo: share(R, (r) => by(r.death, 1095)),
    pctQuitBy12mo: share(R, (r) => by(r.quit, 365)), pctQuitBy24mo: share(R, (r) => by(r.quit, 730)), pctQuitBy36mo: share(R, (r) => by(r.quit, 1095)),
    pctDeadOrQuitBy24mo: share(R, (r) => by(r.death, 730) || by(r.quit, 730)),
    pctStillActiveAt36mo: share(R, (r) => !by(r.death, 1095) && !by(r.quit, 1095)),
    pctBelow10kAt24mo: share(R, (r) => M(r, 24) < 10000),
    pctRaisedAny: share(R, (r) => r.raised > 0), pctRaised250k: share(R, (r) => r.raised >= 250000),
    pctForcedJobEnd: share(R, (r) => r.job === 'full_time'), pctBurnout: share(R, (r) => r.burnouts > 0),
    meanAdSpend: Math.round(R.reduce((a, r) => a + (r.adSpend ?? 0), 0) / Math.max(1, R.length)),
    meanInterviews: Math.round(R.reduce((a, r) => a + (r.interviews ?? 0), 0) / Math.max(1, R.length)),
    meanShipped: Math.round(R.reduce((a, r) => a + (r.shipped ?? 0), 0) / Math.max(1, R.length)),
    msPerRun: Math.round(R.reduce((a, r) => a + r.ms, 0) / Math.max(1, R.length)),
  };
  // Luck: mean events per run and share of runs with ≥1, by type.
  const luck = {};
  for (const r of R) for (const [k, v] of Object.entries(r.luck ?? {})) { luck[k] ??= { events: 0, runs: 0 }; luck[k].events += v; luck[k].runs++; }
  for (const k of Object.keys(luck)) luck[k] = { perRun: +(luck[k].events / R.length).toFixed(2), pctRuns: +(luck[k].runs / R.length).toFixed(2) };
  // Habits met at month 12 (share of runs alive and measured).

  const habits = {};
  for (const r of R) for (const [k, v] of Object.entries(r.habits?.[HM] ?? {})) { habits[k] ??= [0, 0]; habits[k][1]++; if (v) habits[k][0]++; }
  for (const k of Object.keys(habits)) habits[k] = +(habits[k][0] / habits[k][1]).toFixed(2);
  const act = {};
  for (const r of R) for (const [k, v] of Object.entries(r.habits?.[`act${HM}`] ?? {})) { act[k] ??= []; act[k].push(v); }
  for (const k of Object.keys(act)) act[k] = q(act[k], 0.5);
  const src = {};
  for (const r of R) for (const [k, [t, p]] of Object.entries(r.sourceMix ?? {})) { src[k] ??= [0, 0]; src[k][0] += t / R.length; src[k][1] += p / R.length; }
  for (const k of Object.keys(src)) src[k] = src[k].map((x) => Math.round(x));
  const hours = {};
  for (const r of R) for (const [k, v] of Object.entries(r.hours ?? {})) hours[k] = (hours[k] ?? 0) + v / R.length / Math.max(1, (r.days ?? 1095) / 365);
  return { m, luck, habits, act12: act, src, hours: Object.fromEntries(Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)])) };
}

const out = {};
for (const [k, c] of Object.entries(cells)) out[k] = { ...metrics(c), errors: [...c.errors].slice(0, 5) };
const fmt = (v, key = '') => v == null ? '—' : typeof v === 'number' ? (v <= 1 && v >= 0 && /^pct/.test(key) ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString('en-US')) : String(v);
const fmtT = (t, key) => Array.isArray(t) ? `${fmt(t[0], key)}–${fmt(t[1], key)}` : '';
const inR = (v, t) => (v == null || !Array.isArray(t)) ? '?' : (v >= t[0] - 1e-9 && v <= t[1] + 1e-9 ? 'in' : v < t[0] ? 'LOW' : 'HIGH');

// ---- target table (average policy vs OUTCOME_TARGETS) ----
console.log('## Targets vs measured (policy = average)\n\n| cell | metric | target | measured | in/out |\n|---|---|---|---|---|');
for (const [k, c] of Object.entries(out)) {
  const [path, model, pol] = k.split('-');
  if (pol !== 'average') continue;
  const t = T[path]?.[model] ?? {};
  for (const [mk, tv] of Object.entries(t)) {
    if (mk === 'sources' || !Array.isArray(tv)) continue;
    const v = c.m[mk];
    if (v === undefined) { console.log(`| ${path} ${model} | ${mk} | ${fmtT(tv, mk)} | not measurable | – |`); continue; }
    console.log(`| ${path} ${model} | ${mk} | ${fmtT(tv, mk)} | ${fmt(v, mk)} | ${inR(v, tv)} |`);
  }
}
// ---- policy expectations ----
const E = T.policies.expectations;
console.log('\n## Policy expectations\n\n| cell | metric | target | measured | in/out |\n|---|---|---|---|---|');
const pairs = new Set(Object.keys(out).map((k) => k.split('-').slice(0, 2).join('-')));
for (const pm of pairs) {
  const a = out[`${pm}-average`], e = out[`${pm}-elite`], x = out[`${pm}-mistakes`];
  const indie = pm.startsWith('indie');
  const mult = (num, den) => den > 0 ? num / den : (num > 0 ? Infinity : null);
  const rows = [];
  if (a && e) {
    const med = mult(e.m.medianMrrAt24mo, a.m.medianMrrAt24mo);
    rows.push(['eliteMedianMrrAt24moMultiple', E.eliteMedianMrrAt24moMultiple, med, `elite ${fmt(e.m.medianMrrAt24mo)} / avg ${fmt(a.m.medianMrrAt24mo)}`]);
    rows.push(['eliteP90MrrAt24moMultiple', E.eliteP90MrrAt24moMultiple, mult(e.m.p90MrrAt24mo, a.m.p90MrrAt24mo), `elite ${fmt(e.m.p90MrrAt24mo)} / avg ${fmt(a.m.p90MrrAt24mo)}`]);
    if (indie) rows.push(['elitePctStillBelow10kMrrAt24moIndie', E.elitePctStillBelow10kMrrAt24moIndie, e.m.pctBelow10kAt24mo, '']);
    if (indie) rows.push(['elitePctReach100kMrrBy36moIndie', E.elitePctReach100kMrrBy36moIndie, e.m.pctReach100kMrrBy36mo, '']);
  }
  if (x) {
    rows.push(['mistakesPctDeadOrQuitBy24mo', E.mistakesPctDeadOrQuitBy24mo, x.m.pctDeadOrQuitBy24mo, `dead ${fmt(x.m.pctDeadBy24mo, 'pct')} / quit ${fmt(x.m.pctQuitBy24mo, 'pct')}`]);
    if (indie) rows.push(['mistakesPctReach10kMrrBy24moIndie', E.mistakesPctReach10kMrrBy24moIndie, x.m.pctReach10kMrrBy24mo, '']);
  }
  for (const [name, t, v, note] of rows) console.log(`| ${pm} | ${name} | ${fmtT(t, name.includes('Pct') ? 'pct' : '')} | ${v === Infinity ? '∞ (avg = 0)' : name.includes('Pct') ? fmt(v, 'pct') : v == null ? '—' : v.toFixed(2) + '×'} ${note ? `(${note})` : ''} | ${v === Infinity ? 'n/a' : inR(v, t)} |`);
}
// ---- distribution per cell ----
console.log('\n## Distributions per cell\n\n| cell | n | any rev 12 | $1k@12 | $1k@24 | $10k@24 | $100k@36 | MRR12 p25/p50 | MRR24 p50/p90/p95 | MRR36 p50/p95 | dead 24/36 | quit 24/36 | active 36 | raised>0 / ≥250k | forced job | burnout | ms/run |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const P = (v) => fmt(v, 'pct');
for (const [k, c] of Object.entries(out).sort()) {
  const m = c.m;
  console.log(`| ${k} | ${m.n} | ${P(m.pctAnyRevenueBy12mo)} | ${P(m.pctReach1kMrrBy12mo)} | ${P(m.pctReach1kMrrBy24mo)} | ${P(m.pctReach10kMrrBy24mo)} | ${P(m.pctReach100kMrrBy36mo)} | ${fmt(m.bottomQuartileMrrAt12mo)}/${fmt(m.medianMrrAt12mo)} | ${fmt(m.medianMrrAt24mo)}/${fmt(m.p90MrrAt24mo)}/${fmt(m.p95MrrAt24mo)} | ${fmt(m.medianMrrAt36mo)}/${fmt(m.p95MrrAt36mo)} | ${P(m.pctDeadBy24mo)}/${P(m.pctDeadBy36mo)} | ${P(m.pctQuitBy24mo)}/${P(m.pctQuitBy36mo)} | ${P(m.pctStillActiveAt36mo)} | ${P(m.pctRaisedAny)}/${P(m.pctRaised250k)} | ${P(m.pctForcedJobEnd)} | ${P(m.pctBurnout)} | ${m.msPerRun} |`);
}
// ---- luck ----
const types = [...new Set(Object.values(out).flatMap((c) => Object.keys(c.luck)))].sort();
console.log(`\n## Luck events: mean per run (share of runs with ≥1)\n\n| cell | ${types.join(' | ')} |\n|---|${types.map(() => '---').join('|')}|`);
for (const [k, c] of Object.entries(out).sort()) console.log(`| ${k} | ${types.map((t) => c.luck[t] ? `${c.luck[t].perRun} (${Math.round(c.luck[t].pctRuns * 100)}%)` : '0').join(' | ')} |`);
// ---- habits & activity ----
const hk = ['customer_contact', 'ship_fast', 'many_shots', 'build_in_public', 'charge_early', 'unscalable_concierge', 'pmf_measurement', 'default_alive'];
console.log(`\n## Scorecard habits met at month ${HM} (share of runs alive then; activity columns are medians)\n\n| cell | ${hk.join(' | ')} | conv/wk | ships/mo | posts/wk | launches/yr |\n|---|${hk.map(() => '---').join('|')}|---|---|---|---|`);
for (const [k, c] of Object.entries(out).sort()) console.log(`| ${k} | ${hk.map((h) => c.habits[h] == null ? '—' : `${Math.round(c.habits[h] * 100)}%`).join(' | ')} | ${c.act12.customerConversationsPerWeek ?? '—'} | ${c.act12.shippedFeaturesPerMonth ?? '—'} | ${c.act12.publicPostsPerWeek ?? '—'} | ${c.act12.launchesPerYear ?? '—'} |`);
console.log('\n## Acquisition (mean subs started / paid ≥1 month per run) and hours per year\n');
for (const [k, c] of Object.entries(out).sort()) console.log(`- **${k}**: ${Object.entries(c.src).sort((a, b) => b[1][0] - a[1][0]).map(([s, [t, p]]) => `${s} ${t}/${p}`).join(', ')}; ad spend $${c.m.meanAdSpend.toLocaleString()}; interviews ${c.m.meanInterviews}; shipped ${c.m.meanShipped}. Hours/yr: ${Object.entries(c.hours).map(([h, v]) => `${h} ${v}`).join('; ')}${c.errors.length ? `. Errors: ${c.errors.join(' | ').slice(0, 300)}` : ''}`);
fs.writeFileSync(new URL('./out/summary.json', import.meta.url), JSON.stringify(out, null, 1));
