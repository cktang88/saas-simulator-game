// Deadlines from every app, shown on the Calendar. Read-only and derived on each render from the owning app's
// own data (Books tax calendar, Legal filings, Stripe disputes, CRM tasks, procurement asks, annual renewals),
// so nothing is copied into calendar state and nothing can drift out of date. Each links to the app that acts on it.

import { calendarItems } from '../money/compliance.js';
import { buildCalendar } from '../legal/deadlines.js';
import { ASK_LABEL } from '../success/model.js';

const safe = (fn) => { try { return fn() ?? []; } catch { return []; } };

/** [{ key, day, title, app, href, overdue, note }] with fromDay <= day < toDay (overdue items always included). */
export function deadlines(state, { fromDay = state.day, toDay = state.day + 30 } = {}) {
  const out = [];
  const seen = new Set();
  const add = (d) => {
    if (seen.has(d.key)) return;
    const overdue = d.day < state.day;
    if (!overdue && (d.day < fromDay || d.day >= toDay)) return;
    if (overdue && fromDay > state.day) return; // a future week view shows only that week's items
    seen.add(d.key);
    out.push({ ...d, overdue });
  };

  for (const it of safe(() => calendarItems(state))) {
    if (it.status && it.status !== 'overdue') continue; // done, extended, paid
    add({ key: it.id, day: it.day, title: it.title, app: it.owner === 'legal' ? 'legal' : 'books', note: it.kind === 'info' ? 'For awareness' : '' });
  }
  for (const it of safe(() => buildCalendar(state))) {
    if (it.status === 'done' || /^form-1120-/.test(it.key)) continue; // Books owns the federal return
    add({ key: it.key, day: it.dueDay, title: it.title, app: 'legal', note: it.amount ? `~$${Math.round(it.amount).toLocaleString('en-US')}` : '' });
  }
  for (const d of state.stripe?.disputes ?? []) {
    if (d.status === 'needs_response' && d.dueDay != null) add({ key: `dispute-${d.id}`, day: d.dueDay, title: `Respond to a $${Math.round(d.amount)} dispute`, app: 'stripe', href: `#/stripe/disputes/${d.id}` });
  }
  for (const t of state.apps?.crm?.tasks ?? []) {
    if (!t.done && t.dueDay != null) add({ key: `task-${t.id}`, day: t.dueDay, title: t.title, app: 'crm' });
  }
  for (const a of state.apps?.success?.asks ?? []) {
    if (a.status === 'open' && a.dueDay != null) add({ key: `ask-${a.id}`, day: a.dueDay, title: `${ASK_LABEL[a.kind] ?? 'Procurement ask'} due`, app: 'success', href: '#/success/asks' });
  }
  for (const sub of state.stripe?.subscriptions ?? []) {
    if (sub.interval === 'year' && ['active', 'past_due'].includes(sub.status) && !sub.cancelAtPeriodEnd && sub.currentPeriodEnd != null) {
      const name = state.stripe.customers?.find((c) => c.id === sub.customerId)?.name ?? 'An annual customer';
      if (sub.currentPeriodEnd >= state.day) add({ key: `renew-${sub.id}`, day: sub.currentPeriodEnd, title: `Renewal: ${name}`, app: 'success', href: `#/success/acct:${sub.id}` });
    }
  }
  return out.map((d) => ({ ...d, href: d.href ?? `#/${d.app}` })).sort((a, b) => a.day - b.day);
}
