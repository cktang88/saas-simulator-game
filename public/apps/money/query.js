// Query builder for the Analytics app: pick a dataset, filter, group (by a field or a week/month bucket of a
// date field), aggregate. Pure, testable in Node. Day fields are game days; buckets are calendar weeks/months.

import { ensureStripe, monthlyAmount } from '../../core/stripe.js';
import { isoDate } from '../../core/util.js';
import { monthOf, weekKey, median, catLabel } from './common.js';
import { classifiedEvents } from './metrics.js';
import { bookCategory } from './ledger.js';

const isLive = (s) => s.status === 'active' || s.status === 'past_due';

// fields: { name: { label, type: 'number'|'string'|'day'|'bool' } }
export function datasets(state) {
  const st = ensureStripe(state);
  const custById = new Map(st.customers.map((c) => [c.id, c]));
  const name = (id) => custById.get(id)?.name ?? id;
  return {
    subscriptions: {
      label: 'Subscriptions',
      fields: { id: { type: 'string' }, customer: { type: 'string' }, plan: { type: 'string' }, status: { type: 'string' }, interval: { type: 'string' }, price: { type: 'number' }, quantity: { type: 'number' }, mrr: { type: 'number' }, source: { type: 'string' }, startDay: { type: 'day' }, trialEndDay: { type: 'day' }, canceledDay: { type: 'day' }, cancelReason: { type: 'string' }, paidMonths: { type: 'number' } },
      rows: () => st.subscriptions.map((s) => ({ id: s.id, customer: name(s.customerId), plan: state.plans.find((p) => p.id === s.planId)?.name ?? s.planId, status: s.status, interval: s.interval, price: s.price, quantity: s.quantity ?? 1, mrr: isLive(s) ? monthlyAmount(s) : 0, source: s.source, startDay: s.startDay, trialEndDay: s.trialEndDay, canceledDay: s.canceledDay, cancelReason: s.cancelReason, paidMonths: s.paidMonths })),
    },
    customers: {
      label: 'Customers',
      fields: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, company: { type: 'string' }, country: { type: 'string' }, source: { type: 'string' }, createdDay: { type: 'day' }, cardBrand: { type: 'string' }, mrr: { type: 'number' }, paying: { type: 'bool' } },
      rows: () => st.customers.map((c) => {
        const subs = st.subscriptions.filter((s) => s.customerId === c.id && isLive(s));
        const m = subs.reduce((a, s) => a + monthlyAmount(s), 0);
        return { id: c.id, name: c.name, email: c.email, company: c.company, country: c.country, source: c.source, createdDay: c.createdDay, cardBrand: c.card?.brand, mrr: m, paying: m > 0 };
      }),
    },
    charges: {
      label: 'Charges',
      fields: { id: { type: 'string' }, customer: { type: 'string' }, day: { type: 'day' }, amount: { type: 'number' }, fee: { type: 'number' }, net: { type: 'number' }, status: { type: 'string' }, failureCode: { type: 'string' }, method: { type: 'string' }, country: { type: 'string' } },
      rows: () => st.charges.map((c) => ({ id: c.id, customer: name(c.customerId), day: c.day, amount: c.amount, fee: c.fee, net: c.status === 'failed' ? 0 : c.amount - c.fee, status: c.status, failureCode: c.failureCode, method: c.method, country: custById.get(c.customerId)?.country ?? '' })),
    },
    bank: {
      label: 'Bank transactions',
      fields: { id: { type: 'string' }, day: { type: 'day' }, counterparty: { type: 'string' }, description: { type: 'string' }, amount: { type: 'number' }, category: { type: 'string' }, method: { type: 'string' }, account: { type: 'string' }, balanceAfter: { type: 'number' } },
      rows: () => state.bank.txns.map((t) => ({ id: t.id, day: t.day, counterparty: t.counterparty, description: t.description, amount: t.amount, category: catLabel(bookCategory(state, t)), method: t.method, account: t.accountId, balanceAfter: t.balanceAfter })),
    },
    daily: {
      label: 'Daily metrics',
      fields: { day: { type: 'day' }, cash: { type: 'number' }, stripeBalance: { type: 'number' }, mrr: { type: 'number' }, customers: { type: 'number' }, trialing: { type: 'number' } },
      rows: () => state.metrics.daily.map((d) => ({ ...d })),
    },
    events: {
      label: 'MRR events',
      fields: { day: { type: 'day' }, type: { type: 'string' }, amount: { type: 'number' }, subId: { type: 'string' }, customer: { type: 'string' }, source: { type: 'string' } },
      rows: () => classifiedEvents(state).map((e) => ({ day: e.day, type: e.type, amount: e.amount, subId: e.subId, customer: name(e.customerId), source: e.source })),
    },
  };
}

export const OPS = { '=': 'is', '!=': 'is not', '>': '>', '>=': '≥', '<': '<', '<=': '≤', contains: 'contains', empty: 'is empty', notempty: 'is not empty' };
export const AGGS = ['count', 'sum', 'avg', 'median', 'min', 'max'];

function coerce(v, type) {
  if (type === 'number' || type === 'day') return v === '' || v == null ? null : Number(v);
  if (type === 'bool') return v === true || v === 'true' || v === 'yes' || v === '1';
  return String(v ?? '');
}
export function matches(row, { field, op, value }, type) {
  const x = row[field];
  if (op === 'empty') return x == null || x === '';
  if (op === 'notempty') return !(x == null || x === '');
  const v = coerce(value, type);
  if (op === 'contains') return String(x ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
  if (type === 'string') {
    const a = String(x ?? '').toLowerCase(), b = String(v).toLowerCase();
    return op === '=' ? a === b : op === '!=' ? a !== b : op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
  }
  if (x == null) return false;
  return op === '=' ? x === v : op === '!=' ? x !== v : op === '>' ? x > v : op === '>=' ? x >= v : op === '<' ? x < v : x <= v;
}

export function aggregate(vals, agg) {
  const v = vals.filter((x) => Number.isFinite(x));
  if (agg === 'count') return vals.length;
  if (!v.length) return null;
  if (agg === 'sum') return v.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return v.reduce((a, b) => a + b, 0) / v.length;
  if (agg === 'median') return median(v);
  if (agg === 'min') return Math.min(...v);
  if (agg === 'max') return Math.max(...v);
  return null;
}

// spec: { dataset, filters: [{ field, op, value }], groupBy: field|null, bucket: 'day'|'week'|'month'|null, agg, aggField }
// → { columns, rows, kind: 'grouped'|'raw', total }
export function runQuery(state, spec, ds = datasets(state)) {
  const d = ds[spec.dataset];
  if (!d) throw new Error(`Unknown dataset ${spec.dataset}`);
  const types = Object.fromEntries(Object.entries(d.fields).map(([k, f]) => [k, f.type]));
  let rows = d.rows();
  for (const f of spec.filters ?? []) if (f.field && types[f.field]) rows = rows.filter((r) => matches(r, f, types[f.field]));
  if (!spec.groupBy) {
    const cols = Object.keys(d.fields);
    return { kind: 'raw', columns: cols, rows: rows.slice(0, 1000), total: rows.length, value: spec.agg ? aggregate(rows.map((r) => (spec.agg === 'count' ? 1 : r[spec.aggField])), spec.agg) : null };
  }
  const gtype = types[spec.groupBy];
  const keyOf = (r) => {
    const v = r[spec.groupBy];
    if (gtype === 'day') {
      if (v == null) return '(none)';
      if (spec.bucket === 'month') return monthOf(state, v);
      if (spec.bucket === 'week') return weekKey(state, v);
      return isoDate(state, v);
    }
    return v == null || v === '' ? '(none)' : String(v);
  };
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const agg = spec.agg ?? 'count';
  let out = [...groups.entries()].map(([k, rs]) => ({ group: k, value: aggregate(agg === 'count' ? rs.map(() => 1) : rs.map((r) => r[spec.aggField]), agg), count: rs.length }));
  if (gtype === 'day') out.sort((a, b) => a.group.localeCompare(b.group));
  else out.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return { kind: 'grouped', columns: [spec.groupBy + (gtype === 'day' && spec.bucket ? ` (${spec.bucket})` : ''), `${agg}${agg === 'count' ? '' : `(${spec.aggField})`}`, 'rows'], rows: out, total: rows.length, timeSeries: gtype === 'day' };
}
