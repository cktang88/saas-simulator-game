// Public People API for other apps (owned by the People app). Signatures are a stable contract.

const active = (state) => (state.apps.people?.members ?? []).filter((m) => m.status === 'active');

// Engineering hours per week from employees, contractors and AI coding agents (excludes the founder).
export function devHoursPerWeek(state) {
  return active(state).filter((m) => m.role === 'engineer').reduce((a, m) => a + (m.hoursPerWeek ?? 40) * (m.productivity ?? 1), 0);
}

// Multiplier on founder + team coding speed from AI coding agents (1 = none).
export function aiCodingMultiplier(state) {
  return state.apps.people?.aiCodingMultiplier ?? 1;
}

// Support tickets per week the team (people + AI agents) can handle.
export function supportCapacity(state) {
  return active(state).filter((m) => m.role === 'support').reduce((a, m) => a + (m.ticketsPerWeek ?? 60), 0);
}

// Option grants for the cap table: [{ name, pct, vestingStartDay }]
export function optionGrants(state) {
  return active(state).filter((m) => m.equityPct > 0).map((m) => ({ name: m.name, pct: m.equityPct, vestingStartDay: m.startDay }));
}
