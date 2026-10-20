// Bank → Back office: pick the vendor for each back-office function (bank, tax, cap table, mailroom, contracts) and see
// how the stack fits the company. Engine: money/backoffice.js. Vendor facts: money/vendors.js, legal/catalog.js.
// Fit notes are facts about the company; what an expert would change goes through the advice gate (core/advice.js).

import { html, on, formData, badge } from '../../core/ui.js';
import { money, fmtDate, pct } from '../../core/util.js';
import { learningMode, adviceFor } from '../../core/advice.js';
import { yearOf, dayForIso } from './common.js';
import {
  ensureBackoffice, bank, BANKS, apMode, bankSwitchHours, switchBank, setReserve, sweepReserve, sweepHours, reserveAcct,
  TAX_SERVICES, taxService, setTaxService, rdCredit, CAP_VENDORS, capPrice, capMigrationHours, chooseCapVendor, stakeholders,
  pulleyMigrationQuote, migrateOffPulley, DATES, MAILROOM, mailroom, setMailroom, isNonUsFounder, gradeBackOffice, RETIRED,
  billingPlatform, morProvider, opsHours,
} from './backoffice.js';
import { CONTRACT_COUNSEL, CLM } from '../legal/catalog.js';
import { setCounsel, setClm, ensureLegal } from '../legal/sim.js';
import { usd } from './ui.js';

const ID = 'bank';
const FN = { bank: 'cash_runway', spend: 'cash_runway', books: 'bookkeeping_close_tax', tax: 'bookkeeping_close_tax', billing: 'payments_dunning', cap: 'fundraising', contracts: 'legal_hygiene', mail: 'legal_hygiene' };

function stackPanel(s) {
  const g = gradeBackOffice(s);
  const coach = learningMode(s);
  return html`<section class="panel"><h2>Your back-office stack</h2>
    ${coach && g.tier !== 'unknown' ? html`<p>${badge(`Stack fit: ${g.tier}`, g.tier === 'stellar' || g.tier === 'good' ? 'good' : g.tier === 'average' ? 'warn' : 'bad')} <span class="small muted">score ${g.score} (learning mode)</span></p>` : ''}
    <div class="table-wrap"><table><thead><tr><th>Function</th><th>Setup</th>${coach ? html`<th class="r">Fit</th>` : ''}</tr></thead><tbody>
      ${g.areas.map((a) => html`<tr><td>${a.label}</td><td class="small">${a.why}${(() => { const adv = a.stellar ? adviceFor(s, FN[a.id], [a.stellar], { record: false }) : []; return adv.length ? html`<div class="small muted">${adv.map((x) => html`${x.text} (${x.from}) `)}</div>` : ''; })()}</td>${coach ? html`<td class="r">${pct(a.score, 0)}</td>` : ''}</tr>`)}
    </tbody></table></div>
    <p class="small muted">Back-office hours charged in the last 3 months (bill pay, notices, reconciliations, admin): ${opsHours(s, 3)}h.</p></section>`;
}

function bankPanel(s) {
  const b = ensureBackoffice(s);
  const cur = bank(s);
  const res = reserveAcct(s);
  const manual = cur.subAccounts === 'manual';
  const prevMonthSwept = b.reserve.lastSweepMonth;
  return html`<section class="panel"><h2>Bank</h2>
    <p class="small">${cur.label}: ${cur.paradigm} <span class="muted">${cur.status}</span></p>
    <div class="grid-2">${Object.entries(BANKS).map(([k, v]) => html`<div class="card"><b>${v.label}</b> ${k === b.bank ? badge('Current', 'good') : ''}<div class="small">${v.paradigm}</div>
      <ul class="small"><li>Sub-accounts: ${v.subAccounts === 'envelopes' ? 'envelopes with % rules on every deposit' : v.subAccounts === 'manual' ? 'yes, moved by hand' : 'one account'}</li><li>Bill pay: ${v.billPay === 'automated' ? 'captured, approved, scheduled, synced' : 'typed in by hand'}</li><li>Treasury: ${v.treasury ? 'yes' : 'no'}</li><li>${v.monthly ? `${usd(v.monthly)}/mo` : '$0/mo'}</li></ul>
      <div class="small muted">${v.status}${v.trap ? ` ${v.trap}` : ''}</div>
      ${k === b.bank ? '' : html`<button class="sm" data-bo-bank="${k}">Move operating account (${bankSwitchHours(s)}h)</button>`}</div>`)}</div>
    <h3>Tax reserve</h3>
    <p class="small muted">Bill pay now: ${apMode(s) === 'automated' ? 'automated' : 'manual'}. Reserve balance: ${usd(res?.balance ?? 0)}. ${cur.subAccounts === 'envelopes' ? 'Relay splits each deposit by rule.' : cur.subAccounts === 'manual' ? `Moved by hand once a month (${sweepHours}h). Last swept: ${prevMonthSwept ?? 'never'}.` : 'This bank has a single account.'} Tax payments draw on the reserve first.</p>
    ${cur.subAccounts === 'none' ? '' : html`<form id="boReserve" class="inline"><label>Share of each deposit for taxes (%) <input type="number" name="pct" min="0" max="40" step="1" value="${Math.round((b.reserve.pct ?? 0) * 100)}"/></label><button class="sm">Save rule</button>${manual && b.reserve.pct > 0 ? html`<button class="sm" type="button" data-bo="sweep">Sweep last month (${sweepHours}h)</button>` : ''}</form>`}
  </section>`;
}

function taxPanel(s) {
  const b = ensureBackoffice(s);
  const y = yearOf(s);
  const rd = rdCredit(s, y);
  return html`<section class="panel"><h2>Tax</h2>
    ${Object.entries(TAX_SERVICES).map(([k, v]) => html`<div class="${ID}-row"><span><b>${v.label}</b> ${k === b.tax ? badge('Current', 'good') : ''}<div class="small">${v.paradigm} <span class="muted">${v.source}</span></div></span><span>${k === b.tax ? '' : html`<button class="sm" data-bo-tax="${k}">Switch (0.5h)</button>`}</span></div>`)}
    <p class="small muted">R&D credit estimate for ${y}: qualified spend ${money(rd.qre)} → ${money(rd.credit)} credit (6% simplified method), ${money(rd.usable)} usable against payroll tax this year${rd.captured ? `; claimed by ${taxService(s).label} at filing (fee ${money(rd.fee)})` : '; the generic CPA files without a credit study'}.</p></section>`;
}

function capPanel(s) {
  const b = ensureBackoffice(s);
  const cur = CAP_VENDORS[b.cap.vendor];
  const pulley = b.cap.vendor === 'pulley';
  const q = pulley ? pulleyMigrationQuote(s) : null;
  return html`<section class="panel"><h2>Cap table</h2>
    ${pulley ? html`<div class="callout bad"><b>Pulley shuts down ${fmtDate(s, dayForIso(s, DATES.pulleyShutdown))}.</b> ${q.assisted ? `Carta's assisted migration (year-1 price match, unused Pulley months credited) is open until ${fmtDate(s, dayForIso(s, DATES.pulleyAssistCutoff))}.` : 'The assisted window has closed: a self-serve export at list price.'} <button class="sm primary" data-bo="pulley">${q.assisted ? 'Sign with Carta (assisted)' : 'Export and move to Carta'} (${q.hours}h)</button></div>` : ''}
    <p class="small">${cur?.label ?? b.cap.vendor}: ${cur?.paradigm ?? ''} · ${stakeholders(s)} holder(s)${b.cap.price ? ` · ${usd(b.cap.price)}/yr` : ''}</p>
    <div class="table-wrap"><table class="small"><thead><tr><th>Vendor</th><th>Price now</th><th>409A</th><th>Workflow</th><th></th></tr></thead><tbody>
      ${Object.entries(CAP_VENDORS).map(([k, v]) => html`<tr><td><b>${v.label}</b>${v.dead ? html` ${badge('shutting down', 'bad')}` : v.closed ? html` ${badge('closed to new customers', 'warn')}` : ''}</td><td>${v.sel ? (capPrice(s, k) ? `${usd(capPrice(s, k))}/yr` : 'free') : '—'}</td><td>${v.includes409a ? 'in Build+' : v.separate409a ? usd(v.separate409a) : k === 'spreadsheet' ? 'appraiser' : '—'}</td><td>${v.paradigm} <span class="muted">${v.source}</span></td><td>${v.sel && k !== b.cap.vendor ? html`<button class="sm" data-bo-cap="${k}">Move (${capMigrationHours(s)}h)</button>` : ''}</td></tr>`)}
    </tbody></table></div></section>`;
}

function mailPanel(s) {
  const b = ensureBackoffice(s);
  const k = mailroom(s);
  const recent = b.mail.notices.slice(0, 5);
  return html`<section class="panel"><h2>Mail & address</h2>
    <p class="small">${MAILROOM[k].label}. ${MAILROOM[k].note}</p>
    ${Object.entries(MAILROOM).filter(([kk]) => kk !== 'bundled').map(([kk, v]) => html`<div class="${ID}-row"><span>${v.label}${v.monthly ? ` · ${usd(v.monthly)}/mo (${usd(v.annualMonthly)} annual)` : ''}</span><span>${kk === k ? badge('Current', 'good') : kk === 'home' && isNonUsFounder(s) ? html`<span class="small muted">needs a US address</span>` : html`<button class="sm" data-bo-mail="${kk}">Use (${kk === 'stable' ? 1.5 : 1}h incl. IRS 8822-B and state updates)</button>`}</span></div>`)}
    ${recent.length ? html`<ul class="small">${recent.map((n) => html`<li>${fmtDate(s, n.day)}: ${n.who} ${n.missed ? (n.settled ? badge('missed: penalty', 'bad') : badge('not seen', 'warn')) : badge('received', 'good')}</li>`)}</ul>` : ''}
  </section>`;
}

function contractsPanel(s) {
  if (s.company.model === 'b2c') return '';
  const L = ensureLegal(s);
  return html`<section class="panel"><h2>Contracts</h2>
    ${Object.entries(CONTRACT_COUNSEL).map(([k, v]) => html`<div class="${ID}-row"><span><b>${v.label}</b> ${L.counsel === k ? badge('Current', 'good') : ''}<div class="small">${v.paradigm}${v.perDoc ? ` ${usd(v.perDoc)} per document [design].` : ''}</div></span><span>${L.counsel === k ? '' : html`<button class="sm" data-bo-counsel="${k}">Use${v.setupHours ? ` (${v.setupHours}h)` : ''}</button>`}</span></div>`)}
    <h3>Contract tool</h3>
    ${Object.entries(CLM).map(([k, v]) => html`<div class="${ID}-row"><span>${v.label}${v.outdated ? html` ${badge('outdated for small teams', 'warn')}` : ''} <span class="small muted">${v.src ?? ''}</span></span><span>${L.clm === k ? badge('Current', 'good') : html`<button class="sm" data-bo-clm="${k}">Use${v.setupHours ? ` (${v.setupHours}h)` : ''}</button>`}</span></div>`)}
  </section>`;
}

function billingPanel(s) {
  const pl = billingPlatform(s);
  const st = s.stripe?.settings ?? {};
  return html`<section class="panel"><h2>Billing</h2><p class="small">${pl.label}: ${pl.paradigm}${st.merchantOfRecord ? ` Merchant of record: ${morProvider(s).label}.` : ''} <a href="#/stripe/settings">Billing settings →</a></p></section>`;
}

function retiredPanel() {
  return html`<section class="panel"><h2>Retired and outdated tools</h2><ul class="small">${RETIRED.map((r) => html`<li><b>${r.name}</b>: ${r.status}. ${r.note}</li>`)}</ul>
    <p class="small muted">Many 2024 back-office guides (e.g. SignalFire's) still list some of these. Source: docs/research/tools/2026q4/back-office-finance.md.</p></section>`;
}

export function backofficeView(s) {
  ensureBackoffice(s);
  return html`${stackPanel(s)}<div class="grid-2">${bankPanel(s)}${taxPanel(s)}</div>${capPanel(s)}<div class="grid-2">${mailPanel(s)}${contractsPanel(s)}</div>${billingPanel(s)}${retiredPanel()}`;
}

export function wireBackoffice(root, ctx) {
  const s = ctx.state;
  on(root, 'click', '[data-bo-bank]', (e, el) => ctx.act((st) => { const r = switchBank(st, el.dataset.boBank); ctx.toast(`Operating account moved to ${r.to}.`, 'good'); }, { hours: bankSwitchHours(s), label: 'Move bank account' }));
  on(root, 'submit', '#boReserve', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setReserve(st, (f.pct ?? 0) / 100), { hours: 0.1, label: 'Tax reserve rule' }); });
  on(root, 'click', '[data-bo]', (e, el) => {
    const a = el.dataset.bo;
    if (a === 'sweep') ctx.act((st) => { const amt = sweepReserve(st); ctx.toast(`Moved ${usd(amt)} to the tax reserve.`, 'good'); }, { hours: sweepHours, label: 'Tax reserve sweep' });
    if (a === 'pulley') { const q = pulleyMigrationQuote(s); ctx.act((st) => { const r = migrateOffPulley(st, 'carta'); ctx.toast(`Cap table moved to Carta (${r.price ? `${usd(r.price)} year 1` : 'free tier'}).`, 'good'); }, { hours: q.hours, label: 'Cap table migration' }); }
  });
  on(root, 'click', '[data-bo-tax]', (e, el) => ctx.act((st) => setTaxService(st, el.dataset.boTax), { hours: 0.5, label: 'Tax service onboarding' }));
  on(root, 'click', '[data-bo-cap]', (e, el) => ctx.act((st) => { const r = chooseCapVendor(st, el.dataset.boCap); ctx.toast(`Cap table on ${r.vendor}${r.price ? ` (${usd(r.price)}/yr)` : ''}.`, 'good'); }, { hours: capMigrationHours(s), label: 'Cap table migration' }));
  on(root, 'click', '[data-bo-mail]', (e, el) => ctx.act((st) => setMailroom(st, el.dataset.boMail), { hours: el.dataset.boMail === 'stable' ? 1.5 : 1, label: 'Business address' }));
  on(root, 'click', '[data-bo-counsel]', (e, el) => ctx.act((st) => setCounsel(st, el.dataset.boCounsel), { hours: CONTRACT_COUNSEL[el.dataset.boCounsel]?.setupHours ?? 0.1, label: 'Contract counsel' }));
  on(root, 'click', '[data-bo-clm]', (e, el) => ctx.act((st) => setClm(st, el.dataset.boClm), { hours: Math.max(0.1, CLM[el.dataset.boClm]?.setupHours ?? 0.1), label: 'Contract tool' }));
}
