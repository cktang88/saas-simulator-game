// Public CRM API for other apps (owned by the Sales apps). Signatures are a stable contract.
import { notify } from '../../core/state.js';
import { uid } from '../../core/util.js';
import { ensureCrm, addContact, addActivity as logActivity, contactName, companyOf, upsertCompany, companyById } from './model.js';
import { normalizeEmail } from './csv.js';
import { isOpen } from './deals.js';

// Inbound lead from marketing (demo request, contact form, inbound signup that wants sales help).
// lead: { name, email, title?, company, domain?, source, note? } → returns the created/merged record.
// The lead lands in the CRM's Inbound triage queue; the founder accepts (deal + Mail thread) or dismisses it.
export function addInboundLead(state, lead) {
  const crm = ensureCrm(state);
  const email = normalizeEmail(lead.email);
  let contact = email ? crm.contacts.find((c) => c.email === email) : null;
  if (contact) {
    logActivity(state, { type: 'inbound', text: `Came back inbound via ${lead.source ?? 'website'}${lead.note ? `: "${lead.note}"` : ''}`, companyId: contact.companyId, contactId: contact.id });
    contact.warm = true;
  } else {
    try {
      contact = addContact(state, { fullName: lead.name, email, title: lead.title ?? '', company: lead.company ?? '', domain: lead.domain ?? '', notes: lead.note ?? '' }, { source: lead.source ?? 'inbound', status: 'inbound', warm: true, allowNoEmail: true }).contact;
    } catch {
      return null; // unusable lead (bad email)
    }
  }
  const already = crm.inboundQueue.find((q) => q.contactId === contact.id && q.status === 'new');
  if (!already) {
    // Keep the original lead fields (name, email, company, title…) so other apps can read the queue.
    crm.inboundQueue.push({ ...lead, id: uid('inb'), email: contact.email, company: lead.company || companyOf(state, contact)?.name || '', contactId: contact.id, companyId: contact.companyId, source: lead.source ?? 'inbound', note: lead.note ?? '', day: state.day, status: 'new' });
    notify(state, `Inbound lead: ${contactName(contact)}${companyOf(state, contact) ? ` (${companyOf(state, contact).name})` : ''} via ${lead.source ?? 'website'}. Triage it in the CRM.`, { type: 'good', app: 'crm' });
  }
  return contact;
}

// Read-only helpers for other apps (analytics, home).
export function pipelineSummary(state) {
  const crm = state.apps.crm;
  if (!crm) return { open: 0, openValue: 0, won: 0, lost: 0 };
  const open = crm.deals.filter(isOpen);
  return { open: open.length, openValue: open.reduce((a, d) => a + (d.amount ?? 0), 0), won: crm.deals.filter((d) => d.stage === 'won').length, lost: crm.deals.filter((d) => d.stage === 'lost').length };
}

// Log an activity (interview, call, email, note, commitment) on a CRM company, creating the company if needed.
// { companyName?, domain?, crmCompanyId?, contactEmail?, type, summary, day? } → { companyId, contactId } or null.
export function addActivity(state, { companyName = '', domain = '', crmCompanyId = null, contactEmail = '', type = 'note', summary = '', day = state.day } = {}) {
  const crm = ensureCrm(state);
  let co = crmCompanyId ? companyById(state, crmCompanyId) : null;
  if (!co && (domain || companyName)) co = upsertCompany(state, { name: companyName, domain, source: 'activity' });
  const email = normalizeEmail(contactEmail);
  const ct = email ? crm.contacts.find((c) => c.email === email) : null;
  if (!co && ct) co = companyOf(state, ct);
  if (!co) return null;
  logActivity(state, { type, text: summary || type, companyId: co.id, contactId: ct?.id ?? null, dealId: crm.deals.find((d) => d.companyId === co.id && isOpen(d))?.id ?? null, day });
  return { companyId: co.id, contactId: ct?.id ?? null };
}

// Companies for other apps (interview recruiting, product personas).
export function findCompanies(state) {
  return (state.apps.crm?.companies ?? []).map((c) => ({ id: c.id, name: c.name, domain: c.domain, websiteText: c.site?.text || undefined }));
}
