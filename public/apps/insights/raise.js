// Lets other apps open an Insights incident (status-page duty, support spike, churn bump) without importing the
// Insights UI. Same record shape as Insights' own incidents, so the incident log, Helpdesk status-page quality and
// the churn modifier all follow.
import { notify, ensure } from '../../core/state.js';
import { setModifier } from '../../core/market.js';
import { uid } from '../../core/util.js';

const CHURN_PER_SEVERITY = 0.06; // mirrors insights.js INCIDENT_CHURN_PER_SEVERITY [design]

/** source: 'release' | 'data_leak'. Returns the incident, or null when the company has no launched Insights state. */
export function raiseProductIncident(state, { cause, severity = 0.3, minutes = 60, major = false, source = 'release' }) {
  const ins = ensure(state, 'insights', () => ({}));
  ins.daily ??= []; ins.flags ??= {}; ins.incidents ??= []; ins.tasks ??= []; ins.security ??= []; ins.costs ??= []; ins.mods ??= { incident: 1 };
  const inc = { id: uid('inc'), day: state.day, kind: 'own', startHour: 12, overnight: false, major, minutes: Math.round(minutes), severity, founderHours: 0, cause, charged: 0, source };
  ins.incidents.unshift(inc);
  if (ins.incidents.length > 100) ins.incidents.length = 100;
  ins.lastOutageDay = state.day;
  const prev = ins.today?.day === state.day ? ins.today : null;
  ins.today = { day: state.day, id: inc.id, severity: Math.max(severity, prev?.severity ?? 0), cause, statusPosted: prev?.statusPosted ?? false };
  ins.mods.incident = Math.max(ins.mods.incident, 1 + CHURN_PER_SEVERITY * severity);
  setModifier(state, 'churn', 'incidents', Math.round(ins.mods.incident * 100) / 100);
  notify(state, `${major ? 'Major incident' : 'Incident'}: ${cause}. ${ins.flags.statusPage ? 'Post a status update.' : 'Customers will flood support without an update.'}`, { type: 'bad', app: 'insights' });
  return inc;
}
