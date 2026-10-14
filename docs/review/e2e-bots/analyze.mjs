import fs from 'fs';
const files = process.argv.slice(2);
const q = (arr, p) => { const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
const mo = (d) => d == null ? null : +(d / 30.4).toFixed(1);
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const fmt = (arr, f = (x) => x) => { const v = [q(arr, 0.1), q(arr, 0.5), q(arr, 0.9)]; return v.every((x) => x == null) ? '—' : v.map((x) => x == null ? '—' : f(x)).join(' / '); };
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f));
  const R = j.runs, n = R.length;
  const reach = (k) => R.filter((r) => r[k] != null).length;
  const monthsVals = (k) => R.map((r) => mo(r[k] ?? r[k]));
  const mrrAt = (m) => R.map((r) => (r.monthly?.[m - 1]?.mrr ?? (r.death != null ? 0 : null)));
  const dead = (d) => R.filter((r) => (r.death ?? r.deathDay) != null && (r.death ?? r.deathDay) <= d).length;
  const hrs = {};
  for (const r of R) { const y = Math.max(0.25, (r.monthly?.length ?? 36) / 12); for (const [k, v] of Object.entries(r.hours ?? {})) hrs[k] = (hrs[k] ?? 0) + v / y / n; }
  const yrs = 1;
  console.log(`\n### ${j.bot} (n=${n}) ${f}`);
  console.log(`errors: ${JSON.stringify(j.errors ?? []).slice(0, 300)}`);
  console.log(`| metric | p10 / p50 / p90 | share reaching |\n|---|---|---|`);
  console.log(`| months to 1st feature | ${fmt(monthsVals('firstShip'))} | ${pct(reach('firstShip'), n)} |`);
  console.log(`| months to MVP (3 features) | ${fmt(monthsVals('mvp'))} | ${pct(reach('mvp'), n)} |`);
  console.log(`| months to 1st paying customer | ${fmt(monthsVals('firstPaid'))} | ${pct(reach('firstPaid'), n)} |`);
  console.log(`| months to $1k MRR | ${fmt(monthsVals('d1k'))} | ${pct(reach('d1k'), n)} |`);
  console.log(`| months to $10k MRR | ${fmt(monthsVals('d10k'))} | ${pct(reach('d10k'), n)} |`);
  for (const m of [12, 24, 36]) console.log(`| MRR @${m}mo ($) | ${fmt(mrrAt(m), Math.round)} | mean ${Math.round(mrrAt(m).filter((x) => x != null).reduce((a, b) => a + b, 0) / Math.max(1, mrrAt(m).filter((x) => x != null).length))} |`);
  console.log(`| dead (bank overdrawn 14d) by m12 / m24 / m36 | ${pct(dead(365), n)} / ${pct(dead(730), n)} / ${pct(dead(1095), n)} | |`);
  console.log(`| burnout ≥1 episode | ${pct(R.filter((r) => r.burnouts > 0).length, n)} | |`);
  console.log(`| forced back to a full-time job (personal savings < 0 for 2 months) | ${pct(R.filter((r) => r.job === 'full_time').length, n)} | |`);
  console.log(`| end personal savings ($) / FICO | ${fmt(R.map((r) => r.personal), Math.round)} / ${fmt(R.map((r) => r.fico))} | |`);
  console.log(`| end company cash ($) | ${fmt(R.map((r) => r.cash), Math.round)} | |`);
  console.log(`| save size (MB) / ms per sim-year | ${fmt(R.map((r) => r.size / 1e6), (x) => x.toFixed(1))} / ${fmt(R.flatMap((r) => r.yearMs ?? [r.ms / yrs]), Math.round)} | |`);
  console.log(`| MRR drift (events − live MRR) | max ${Math.max(...R.map((r) => Math.abs(r.mrrDrift ?? 0)))} | |`);
  console.log(`hours/yr by label (mean): ${Object.entries(hrs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${Math.round(v / yrs)}`).join('; ')}`);
  if (R[0].funnel) { const fk = Object.keys(R[0].funnel).filter((k) => k !== 'lostReasons'); console.log(`funnel (mean over run): ${fk.map((k) => `${k} ${Math.round(R.reduce((a, r) => a + (r.funnel[k] ?? 0), 0) / n)}`).join(', ')}`);
    const lr = {}; for (const r of R) for (const [k, v] of r.funnel.lostReasons) lr[k] = (lr[k] ?? 0) + v; console.log(`lost reasons (total): ${Object.entries(lr).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('; ')}`); }
  for (const k of ['adSpend', 'adTrials', 'adPaid', 'cac', 'revenue', 'raised', 'pitches', 'evalS', 'partnersWon', 'raisedDay']) if (R[0][k] !== undefined) console.log(`${k}: ${fmt(R.map((r) => r[k]), Math.round)}${k === 'raised' ? ` · raised>0: ${pct(R.filter((r) => r.raised > 0).length, n)}, ≥$250k: ${pct(R.filter((r) => r.raised >= 250000).length, n)}, ≥$500k: ${pct(R.filter((r) => r.raised >= 500000).length, n)}` : ''}`);
  if (R[0].sourceMix) { const sm = {}; for (const r of R) for (const [k, v] of r.sourceMix) sm[k] = (sm[k] ?? 0) + v / n; console.log(`subs by source (mean): ${Object.entries(sm).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`); }
  if (R[0].stats) { const sm = {}; for (const r of R) for (const [k, v] of Object.entries(r.stats)) { sm[k] ??= [0, 0]; sm[k][0] += v[0] / n; sm[k][1] += v[1] / n; } console.log(`organic visits/signups (mean): ${Object.entries(sm).map(([k, v]) => `${k} ${Math.round(v[0])}/${Math.round(v[1])}`).join(', ')}`); }
  if (R[0].invStatus) { const sm = {}; for (const r of R) for (const [k, v] of Object.entries(r.invStatus)) sm[k] = (sm[k] ?? 0) + v / n; console.log(`investor status (mean of 40): ${JSON.stringify(Object.fromEntries(Object.entries(sm).map(([k, v]) => [k, +v.toFixed(1)])))}`); }
}
