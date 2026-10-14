// Tab: Cap table (Carta-style), option pool, dilution modeler and exit waterfall.

import { html, on, table, stat, formData, toast } from '../../core/ui.js';
import { money, pct } from '../../core/util.js';
import { post } from '../../core/bank.js';
import { capRows, fdShares, poolTotal, grantedShares, outstandingSafes, pricedRound, setPoolPct, waterfall, founderPct } from './captable.js';
import { ensureFr, totalRaised } from './sim.js';
import { drafts } from './drafts.js';

const sh = (n) => Math.round(n).toLocaleString('en-US');

export function renderCap(ctx) {
  const s = ctx.state;
  const fr = ensureFr(s);
  const c = drafts.calc;
  const { rows, total } = capRows(fr.cap, { assumedPost: c.assumedPost });
  const fp = founderPct(fr.cap, { assumedPost: c.assumedPost });
  const safes = outstandingSafes(fr.cap);
  const overPool = grantedShares(fr.cap) > (fr.cap.pool ?? 0);
  // Dilution modeler: next priced round
  const sim = pricedRound(fr.cap, { preMoney: c.preMoney, investment: c.investment, poolTargetPost: c.pool, series: 'Next round', investor: 'New investors' });
  const after = capRows(sim.cap).rows;
  const holders = [...new Set([...rows.map((r) => r.name), ...after.map((r) => r.name)])];
  const pctOf = (list, name) => list.filter((r) => r.name === name).reduce((a, r) => a + r.pct, 0);
  // SAFE preview
  const safePreview = { ...fr.cap, safes: [...fr.cap.safes, { id: 'preview', holder: 'New SAFE', amount: c.safeAmount, cap: c.safeCap, status: 'outstanding' }] };
  const fpSafe = founderPct(safePreview, { assumedPost: c.assumedPost });
  // Waterfall
  const debt = fr.loans.reduce((a, l) => a + l.remaining, 0);
  const wf = waterfall(fr.cap, c.exitValue, { debt, fees: c.exitValue * c.fees });
  return html`
    <div class="stats">
      ${stat('Founder ownership', pct(fp), 'fully diluted, SAFEs as-converted', fp < 0.5 ? 'warn' : 'good')}
      ${stat('Fully diluted shares', sh(total), `${sh(fdShares(fr.cap))} excl. SAFEs`)}
      ${stat('Unconverted SAFEs', String(safes.length), safes.length >= 4 ? '4+ stacked SAFEs is a red flag' : money(safes.reduce((a, x) => a + x.amount, 0)), safes.length >= 4 ? 'bad' : '')}
      ${stat('Total raised', money(totalRaised(s)), 'equity + accelerator')}
    </div>
    <section class="panel">
      <h2>Cap table</h2>
      ${table({ columns: [
        { label: 'Holder', render: (r) => html`<b>${r.name}</b>` },
        { label: 'Class', render: (r) => html`<span class="small">${r.cls}</span>` },
        { label: 'Shares', align: 'right', render: (r) => (r.estimated ? html`<i>~${sh(r.shares)}</i>` : sh(r.shares)) },
        { label: 'Fully diluted', align: 'right', render: (r) => pct(r.pct, 2) },
        { label: 'Invested', align: 'right', render: (r) => (r.invested ? money(r.invested) : '') },
      ], rows })}
      <p class="small muted">Founders hold 10,000,000 common shares (standard Clerky/Atlas issuance). Post-money SAFEs are shown as-converted: ownership = investment ÷ cap, fixed until the priced round, so each new SAFE dilutes only you. Uncapped SAFEs are estimated at an assumed next-round post-money of
        <input type="number" id="assumedPost" value="${c.assumedPost}" step="1000000" style="width:130px;display:inline-block" />.</p>
      ${overPool ? html`<div class="callout warn small">Granted options exceed the reserved pool. The board must increase the pool, which dilutes you.</div>` : ''}
      <form id="poolForm" class="inline"><label>Option pool (unissued, % post) <input type="number" name="pct" value="10" min="1" max="25" step="0.5" /></label><button>Create / top up pool ($500 legal, 0.5h)</button><span class="hint">Current pool ${sh(poolTotal(fr.cap))} shares, ${sh(grantedShares(fr.cap))} granted. Seed pools median 12.1% (Carta 2026).</span></form>
    </section>
    <div class="grid-2">
      <section class="panel">
        <h2>Dilution modeler</h2>
        <form id="calcForm" class="grid-2">
          <label>Pre-money ($) <input type="number" name="preMoney" value="${c.preMoney}" step="500000" /></label>
          <label>Raise ($) <input type="number" name="investment" value="${c.investment}" step="100000" /></label>
          <label>Pool target (% post) <input type="number" name="pool" value="${c.pool * 100}" step="0.5" /></label>
          <label style="align-self:end"><button>Model priced round</button></label>
        </form>
        <p class="small">New investors ${pct(c.investment / (c.preMoney + c.investment))} · price/share $${sim.price.toFixed(4)} · pool top-up ${sh(sim.poolTopUp)} shares (comes out of the pre-money: the "option pool shuffle")${sim.conversions.length ? ` · ${sim.conversions.length} SAFE(s) convert` : ''}.</p>
        ${table({ columns: [
          { label: 'Holder', render: (n) => n },
          { label: 'Now', align: 'right', render: (n) => pct(pctOf(rows, n)) },
          { label: 'After', align: 'right', render: (n) => pct(pctOf(after, n)) },
        ], rows: holders })}
        <h3>Add a SAFE</h3>
        <form id="safeCalc" class="inline"><label>Amount <input type="number" name="safeAmount" value="${c.safeAmount}" step="25000" /></label><label>Post-money cap <input type="number" name="safeCap" value="${c.safeCap}" step="250000" /></label><button>Preview</button></form>
        <p class="small">That SAFE holder gets ${pct(c.safeAmount / c.safeCap)}; you go from ${pct(fp)} to <b>${pct(fpSafe)}</b>.</p>
      </section>
      <section class="panel">
        <h2>Exit waterfall</h2>
        <form id="wfForm" class="inline"><label>Exit price ($) <input type="number" name="exitValue" value="${c.exitValue}" step="500000" /></label><label>Fees % <input type="number" name="fees" value="${c.fees * 100}" step="0.5" /></label><button>Run</button></form>
        <p class="small muted">1x non-participating preferred (the 2026 default): each investor takes its money back or converts to common, whichever is more. Unconverted SAFEs get their money back or their as-converted share. Debt (RBF balance ${money(debt)}) and fees come off the top.</p>
        ${table({ columns: [
          { label: 'Holder', render: (p) => p.name },
          { label: 'Takes', render: (p) => html`<span class="small">${p.pref ? (p.converted ? 'converts' : 'preference') : 'common'}</span>` },
          { label: 'Payout', align: 'right', render: (p) => money(p.payout) },
        ], rows: wf.payouts })}
        <p><b>You take home ${money(wf.founderTake)}</b> (before tax) of a ${money(c.exitValue)} sale.</p>
      </section>
    </div>`;
}

export function wireCap(root, ctx) {
  const upd = (patch) => { Object.assign(drafts.calc, patch); ctx.render(); };
  on(root, 'submit', '#calcForm', (e) => { e.preventDefault(); const f = formData(e.target); upd({ preMoney: Math.max(1e5, f.preMoney || 0), investment: Math.max(0, f.investment || 0), pool: Math.min(0.3, Math.max(0, (f.pool || 0) / 100)) }); });
  on(root, 'submit', '#safeCalc', (e) => { e.preventDefault(); const f = formData(e.target); upd({ safeAmount: Math.max(0, f.safeAmount || 0), safeCap: Math.max(1e5, f.safeCap || 1e6) }); });
  on(root, 'submit', '#wfForm', (e) => { e.preventDefault(); const f = formData(e.target); upd({ exitValue: Math.max(0, f.exitValue || 0), fees: Math.min(0.2, Math.max(0, (f.fees || 0) / 100)) }); });
  on(root, 'change', '#assumedPost', (e) => upd({ assumedPost: Math.max(1e6, Number(e.target.value) || 15e6) }));
  on(root, 'submit', '#poolForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => {
      if (!st.company.incorporated && (st.company.entity ?? 'none') === 'none') throw new Error('Incorporate first: an option plan needs a corporation and a board consent.');
      const fr = ensureFr(st);
      fr.cap = setPoolPct(fr.cap, Math.min(0.25, Math.max(0.01, (f.pct || 10) / 100)));
      post(st, { amount: -500, counterparty: 'Startup law firm', description: 'Equity incentive plan & board consent', category: 'legal', method: 'card' });
      toast('Option pool updated.', 'good');
    }, { hours: 0.5, label: 'Option pool' });
  });
}
