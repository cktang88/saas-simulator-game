// Public CRM API for other apps (owned by the Sales apps). Signatures are a stable contract.
import { ensure } from '../../core/state.js';

// Inbound lead from marketing (demo request, contact form, inbound signup that wants sales help).
// lead: { name, email, title?, company, domain?, source, note? } → returns the created/merged record.
export function addInboundLead(state, lead) {
  const crm = ensure(state, 'crm', () => ({ companies: [], contacts: [], deals: [], activities: [], inboundQueue: [] }));
  crm.inboundQueue ??= [];
  crm.inboundQueue.push({ ...lead, day: state.day });
  return lead;
}
