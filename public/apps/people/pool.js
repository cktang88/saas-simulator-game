// Option pool accounting, kept dependency-free so any people module can use it without importing sim.js.
import { clamp, round2 } from '../../core/util.js';

export function vestedPct(m, day) {
  const g = m.grant;
  if (!g || day < g.cliffDay) return 0;
  const months = Math.floor((day - g.vestStart) / 30.4);
  return round2(g.pct * clamp(months / (g.vestYears * 12), 0, 1));
}

// Option pool in use (% of company): live grants, plus what departed members had vested when they left
// (vested options are exercised or held; only the unvested part returns to the pool). [design: exercise assumed]
export function poolUsed(p) {
  return p.members.reduce((a, m) => {
    const pct = m.equityPct || 0;
    if (!pct) return a;
    if (m.status !== 'gone') return a + pct;
    const end = m.endDay ?? m.leftDay;
    return m.grant && m.grant.status !== 'pending' && end != null ? a + vestedPct(m, end) : a;
  }, 0);
}
