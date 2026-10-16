// CRM -> Warm intros & referrals: the workspace for the double opt-in intro flow (apps/sales/warm-intros.js).
// Numbered how-to, connectors with goodwill, mutuals per connector, a warm-path search for CRM prospects, customer
// referral timing, open requests with the next step, and why each action is disabled.
import { html, on, modal, toast, badge, stat } from '../../core/ui.js';
import { fmtDate } from '../../core/util.js';
import { BLURB_JUDGE, judgeBlurb, fromJudge } from '../../core/intro-blurb.js';
import { readOperator, functionLabel } from '../../core/operator.js';
import { adviceFor } from '../../core/advice.js';
import {
  WI, connectors, connectorById, ledgerOf, asksWithin, knownTies, mapped, mapMutuals, mapCompany, pathsTo, prequalify,
  requestIntro, closeLoop, returnFavor, momentOf, STATUS_LABEL, nextStep, warmStats, ensureWarm,
} from './warm-intros.js';

const drafts = {}; // blurb drafts by target key, kept across re-renders
let pathCompany = '';
const MIN = (h) => `${Math.round(h * 60)} min`;
const KIND = { network: ['Network', ''], customer: ['Customer', 'good'], investor: ['Investor', 'accent'], advisor: ['Advisor', 'accent'] };
const MOMENT = { win: ['Right after a win', 'good'], happy: ['Happy', 'good'], neutral: ['Neutral', ''], at_risk: ['At risk: do not ask', 'bad'] };

function connectorState(s, c) {
  const l = ledgerOf(s, c.id);
  const a90 = asksWithin(s, c.id, 90);
  const a30 = asksWithin(s, c.id, 30);
  if (l.burned) return { label: 'Stopped responding', cls: 'bad', why: 'Goodwill is burned: repay favours and close old loops before asking again.' };
  if (c.kind === 'customer') {
    const m = momentOf(s, s.apps.success?.accounts?.[c.ref]);
    if (m === 'at_risk') return { label: MOMENT.at_risk[0], cls: 'bad', why: 'This account is at risk: asking for referrals now backfires. Fix the account first.', moment: m };
    return { label: MOMENT[m][0], cls: MOMENT[m][1], why: '', moment: m };
  }
  if (a30 >= 1) return { label: 'Asked this month', cls: 'warn', why: 'You asked them in the last 30 days: another ask now costs goodwill.' };
  if (a90 >= 2) return { label: 'Fatigued', cls: 'warn', why: `${a90} asks in 90 days: their yes rate is lower.` };
  return { label: 'Ready', cls: 'good', why: '' };
}

function guide(s) {
  const steps = [
    ['Map your connectors', 'Network, happy customers, investors and advisors appear below. Strong ties and people who know your buyers matter most.'],
    ['Find a specific target', `Check a connector's LinkedIn mutuals and shared past employers (${MIN(WI.hours.map)}), or search for a warm path to a company already in your CRM.`],
    ['Pre-qualify', `Look at the target's site, team and hiring (${MIN(WI.hours.prequal)}) so you don't spend a favour on a poor fit.`],
    ['Ask for one named person', `Write a 3-5 sentence forwardable blurb: who you are, why them now, a small ask that's easy to decline. No deck, no booking link (${MIN(WI.hours.ask)}).`],
    ['Double opt-in', 'The connector asks the target first. Either can say no. If both say yes, the intro lands in Mail and in CRM -> Inbound.'],
    ['Reply fast, close the loop, repay', 'Reply within a day. Thank the connector and tell them how it went within a week. Return favours. Goodwill decides the next yes.'],
  ];
  return html`<section class="panel"><h2>How warm intros work</h2>
    <ol class="small">${steps.map(([t, d]) => html`<li><b>${t}.</b> ${d}</li>`)}</ol>
    <p class="hint">Referred B2B leads are often quoted converting at about 11-26% vs 1-3% for cold outreach (vendor and aggregator figures, unverified). A good intro is worth far more than a cold email; a bad ask costs you the connector.</p></section>`;
}

function needsYou(s) {
  const rs = (ensureWarm(s).requests ?? []).filter((r) => nextStep(s, r)).slice(-12).reverse();
  if (!rs.length) return '';
  return html`<section class="panel"><h2>Needs you</h2><ul class="list">${rs.map((r) => html`<li>
    <b>${r.connectorName}</b> → ${r.targetName || r.targetCompany || 'anyone'} · ${badge(STATUS_LABEL[r.status] ?? r.status, r.status === 'introduced' ? 'good' : '')}
    <span class="${r.loopMissed || r.ghosted ? 'bad' : 'muted'} small">${nextStep(s, r)}</span>
    ${r.status === 'introduced' && !r.followedUp ? html`<button class="sm" data-wi-inbound="1">Open Inbound</button>` : ''}
    ${nextStep(s, r).includes('loop') || nextStep(s, r).includes('thank') ? html`<button class="sm" data-wi-loop="${r.id}">Thank + report back (${MIN(WI.hours.closeLoop)})</button>` : ''}
  </li>`)}</ul></section>`;
}

function connectorsPanel(s, list, sel) {
  if (!list.length) {
    return html`<section class="panel"><h2>Your connectors</h2><p class="empty">Nobody to ask yet. Build your network in Messages -> Your network (from your bio and LinkedIn). Customers appear here after your first CRM deal is won, investors after a SAFE closes, advisors after you recruit one in Advisors.</p></section>`;
  }
  return html`<section class="panel"><h2>Your connectors (${list.length})</h2>
    <div class="table-wrap"><table><thead><tr><th>Who</th><th>Goodwill</th><th>Asks (12 mo)</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((c) => {
    const l = ledgerOf(s, c.id);
    const st = connectorState(s, c);
    const mappedRecently = l.mappedDay != null && s.day - l.mappedDay < 30;
    return html`<tr class="${sel === c.id ? 'active' : ''}">
      <td><a href="#/crm/warm:${c.id}">${c.name}</a> ${badge(KIND[c.kind][0], KIND[c.kind][1])}<div class="muted small">${c.label}</div></td>
      <td style="min-width:90px"><div class="meter"><div style="width:${Math.round(l.goodwill * 100)}%"></div></div><span class="small">${Math.round(l.goodwill * 100)}/100</span></td>
      <td>${asksWithin(s, c.id, 365)} <span class="muted small">· ${l.loopsClosed} thanked · ${l.intros} intros</span></td>
      <td>${badge(st.label, st.cls)}${st.why ? html`<div class="muted small">${st.why}</div>` : ''}</td>
      <td class="nowrap">
        <button class="sm" data-wi-map="${c.id}" ${mappedRecently ? 'disabled' : ''} title="${mappedRecently ? 'Mapped in the last 30 days: nothing new to find yet.' : 'Check LinkedIn mutuals and shared past employers'}">Map mutuals (${MIN(WI.hours.map)})</button>
        <button class="sm" data-wi-favor="${c.id}" title="An intro back, feedback, a hire referral, sharing their launch">Return a favour (${MIN(WI.hours.favor)})</button>
      </td></tr>`;
  })}
    </tbody></table></div></section>`;
}

function connectorDetail(s, c) {
  if (!c) return html`<section class="panel"><h2>Ask for an intro</h2><p class="empty">Pick a connector above to see who they know.</p></section>`;
  const st = connectorState(s, c);
  const ties = knownTies(s, c);
  const reqs = ensureWarm(s).requests;
  const blocked = st.moment === 'at_risk' ? st.why : ledgerOf(s, c.id).burned ? st.why : '';
  return html`<section class="panel"><h2>${c.name}: who they know</h2>
    ${st.why ? html`<div class="callout ${st.cls === 'bad' ? 'bad' : 'warn'} small">${st.why}</div>` : ''}
    ${!mapped(s, c.id) ? html`<p class="empty">You haven't looked at who ${c.name} knows yet. Map their mutuals first: asking blind usually means "who do you know?", which rarely works.</p>` : !ties.length ? html`<p class="empty">No mutual connections found that matter for you. Ask someone else, or ask ${c.name} how you can help them instead.</p>` : html`
      <div class="table-wrap"><table><thead><tr><th>Person</th><th>Connection</th><th>Your research</th><th></th></tr></thead><tbody>
      ${ties.map((t) => {
    const asked = reqs.some((r) => r.tieId === t.id);
    return html`<tr><td><b>${t.name}</b><div class="muted small">${t.title}${t.title ? ' · ' : ''}${t.company}</div></td>
          <td class="small">${t.how}</td>
          <td>${t.band ? badge(`Fit: ${t.band}`, t.band === 'strong' ? 'good' : t.band === 'weak' ? 'bad' : 'warn') : html`<button class="sm" data-wi-pq="${t.id}">Pre-qualify (${MIN(WI.hours.prequal)})</button>`}</td>
          <td><button class="sm primary" data-wi-ask="${c.id}|${t.id}" ${blocked || asked ? 'disabled' : ''} title="${blocked || (asked ? 'You already asked for this person.' : '')}">Ask for this intro</button></td></tr>`;
  })}</tbody></table></div>`}
    <p class="small muted">${c.kind === 'customer' ? 'Customers: the best moment is right after a clear win (a hit success plan, a good QBR). A specific peer beats "who else has this problem?", but the open ask still works with a happy customer.' : c.kind === 'investor' ? 'Investors: one or two hand-picked portfolio intros a quarter. Flooding the portfolio burns them.' : c.kind === 'advisor' ? 'Advisors tire of intro asks faster than they tire of advice.' : 'Ask for one named person. Stellar founders ask each connector about once or twice a year.'}</p>
    <button class="sm" data-wi-ask="${c.id}|" ${blocked ? 'disabled' : ''} title="${blocked || 'Ask without naming a person (weaker)'}">${c.kind === 'customer' ? 'Ask who else has this problem' : 'Ask without a named person'}</button>
  </section>`;
}

function pathFinder(s) {
  const cos = (s.apps.crm?.companies ?? []).filter((co) => !Object.values(s.apps.success?.accounts ?? {}).some((a) => a.companyId === co.id));
  const sel = cos.find((co) => co.id === pathCompany) ?? null;
  const found = sel ? pathsTo(s, sel.id) : [];
  const searched = sel && ensureWarm(s).companySearches?.[sel.id] != null;
  return html`<section class="panel"><h2>Find a warm path to a prospect</h2>
    ${!cos.length ? html`<p class="empty">No prospects in the CRM yet. Add target accounts (Prospects or Import), then look for someone who can introduce you.</p>` : html`
    <div class="inline"><select id="wiCo"><option value="">Pick a CRM company…</option>${cos.slice(0, 300).map((co) => html`<option value="${co.id}" ${co.id === pathCompany ? 'selected' : ''}>${co.name}</option>`)}</select>
      <button class="sm" id="wiSearch" ${sel ? '' : 'disabled'} title="${sel ? 'Search every connector\'s mutuals at this company' : 'Pick a company first'}">Search mutuals (${MIN(WI.hours.mapCompany)})</button></div>
    ${sel && searched ? (found.length ? html`<ul class="list">${found.map(({ connector, tie }) => html`<li><b>${connector.name}</b> ${badge(KIND[connector.kind][0], KIND[connector.kind][1])} knows <b>${tie.name}</b> at ${tie.company} <span class="muted small">(${tie.how})</span> <button class="sm primary" data-wi-ask="${connector.id}|${tie.id}">Ask ${connector.name.split(' ')[0]}</button></li>`)}</ul>` : html`<p class="empty">No warm path found to ${sel.name}. Go direct with a researched, signal-based note instead of a cold blast.</p>`) : ''}`}
  </section>`;
}

function historyPanel(s) {
  const rs = (ensureWarm(s).requests ?? []).slice().reverse().slice(0, 40);
  return html`<section class="panel"><h2>Intro requests</h2>
    ${!rs.length ? html`<p class="empty">No intro asks yet. Start with step 1 above.</p>` : html`<div class="table-wrap"><table><thead><tr><th>Asked</th><th>Connector → target</th><th>Blurb</th><th>Status</th><th>Next step</th></tr></thead><tbody>
    ${rs.map((r) => html`<tr><td class="small">${fmtDate(s, r.day)}</td><td>${r.connectorName} → ${r.targetName || r.targetCompany || html`<span class="muted">anyone</span>`}${r.targetCompany && r.targetName ? html`<div class="muted small">${r.targetCompany}</div>` : ''}</td>
      <td>${badge(r.judge?.band ?? 'none', r.judge?.band === 'crisp' ? 'good' : r.judge?.band === 'none' ? 'bad' : 'warn')}</td>
      <td>${badge(STATUS_LABEL[r.status] ?? r.status, r.status === 'introduced' ? 'good' : r.status === 'backfired' ? 'bad' : '')}${r.ghosted ? html` ${badge('ghosted', 'bad')}` : ''}${r.loopClosed && !['no_reply', 'backfired'].includes(r.status) ? html` ${badge('thanked', 'good')}` : ''}</td>
      <td class="small">${nextStep(s, r)}</td></tr>`)}
    </tbody></table></div>`}</section>`;
}

export function warmView(s, selId = '') {
  const list = connectors(s);
  const sel = selId ? connectorById(s, selId) : null;
  const st = warmStats(s);
  const read = readOperator(s, 'warm_intros');
  const loops = (ensureWarm(s).requests ?? []).filter((r) => nextStep(s, r).match(/loop|thank/i)).length;
  const advice = read.tier !== 'unknown' ? adviceFor(s, 'warm_intros', read.coaching ?? [], { record: false }) : [];
  return html`
    <div class="stats">
      ${stat('Connectors', list.length, 'network, customers, investors, advisors')}
      ${stat('Open asks', st.open, 'waiting on a connector or target')}
      ${stat('Intros made', st.introduced, `${st.meetings} replied to`, st.introduced ? 'good' : '')}
      ${stat('Loops to close', loops, 'thank them, say how it went', loops ? 'warn' : '')}
      ${stat('Hours on intros', st.hours, 'asks and blurbs')}
    </div>
    ${needsYou(s)}
    <div class="grid-2">${guide(s)}${connectorDetail(s, sel)}</div>
    ${connectorsPanel(s, list, sel?.id)}
    ${pathFinder(s)}
    ${historyPanel(s)}
    ${read.tier !== 'unknown' ? html`<section class="panel"><h2>${functionLabel('warm_intros')}</h2><ul class="small">${read.evidence.map((e) => html`<li>${e}</li>`)}</ul>
      ${advice.length ? html`<ul class="small">${advice.map((a) => html`<li>${a.text ?? a}${a.from ? html` <span class="muted">(${a.from})</span>` : ''}</li>`)}</ul>` : html`<p class="hint">Want a read on how you ask? Recruit an advisor who covers go-to-market.</p>`}</section>` : ''}`;
}

function askModal(ctx, cid, tieId) {
  const s = ctx.state;
  const c = connectorById(s, cid);
  if (!c) return;
  const tie = tieId ? knownTies(s, c).find((t) => t.id === tieId) ?? null : null;
  const key = `${cid}|${tieId}`;
  const placeholder = tie ? `Hi ${tie.name.split(' ')[0]}, I'm ${s.founder.name}, founder of ${s.company.name}. [one concrete result for a company like ${tie.company}] [why them, now]. Open to a 15-minute call? No worries if not a fit.` : 'Who you are, the problem you solve with one concrete result, who exactly you want to meet and why, and a small easy-to-decline ask.';
  modal({
    title: tie ? `Ask ${c.name} to introduce you to ${tie.name}` : `Ask ${c.name} for an intro`,
    wide: true,
    body: html`<p class="small muted">${tie ? html`${tie.name} · ${tie.title} at ${tie.company} (${tie.how})${tie.band ? html` · your research: fit ${tie.band}` : ' · not pre-qualified'}` : html`No named person: connectors rarely act on "who do you know?". You can still type a company or person they might know.`}</p>
      ${tie ? '' : html`<label>Target person (optional) <input name="tName" /></label><label>Target company (optional) <input name="tCo" /></label>`}
      <label>Forwardable blurb (what ${c.name.split(' ')[0]} will paste to the target)<textarea name="blurb" rows="6" placeholder="${placeholder}">${drafts[key] ?? ''}</textarea></label>
      <p class="hint">Judged like a busy connector would: specific result, 3-5 sentences, why them, easy to say no, no deck or booking link. ${MIN(WI.hours.ask)} to write and send.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Send the ask', primary: true,
      onClick: async (d, form) => {
        const blurb = form.blurb.value;
        drafts[key] = blurb;
        const tName = tie?.name ?? form.tName?.value?.trim() ?? '';
        const tCo = tie?.company ?? form.tCo?.value?.trim() ?? '';
        const words = blurb.trim().split(/\s+/).filter(Boolean).length;
        const vague = !tie && !tName && !tCo && words < 15;
        await ctx.act(async (st) => {
          let judged = null;
          if (words >= 15) {
            const res = await ctx.llm.ask({
              task: 'intro_blurb_judge', system: BLURB_JUDGE.system, prompt: BLURB_JUDGE.prompt(blurb, { targetName: tName, targetCompany: tCo }), schema: BLURB_JUDGE.schema,
              fallback: () => { const j = judgeBlurb(blurb, { targetName: tName, targetCompany: tCo }); return { ...j.criteria, note: j.notes[0] ?? '' }; },
              temperature: 0.2, maxTokens: 300, cache: st.cache,
            });
            judged = { ...fromJudge(res.data, words), mock: Boolean(res.mock) };
          }
          const r = requestIntro(st, { connectorId: cid, tieId: tie?.id ?? null, targetName: tName, targetCompany: tCo, blurb, judged });
          if (!r.ok) throw new Error(r.error);
          delete drafts[key];
          const note = r.req.status === 'backfired' ? r.notes[0] : `Asked ${c.name}. Blurb: ${r.req.judge.band}${r.req.judge.notes?.[0] ? ` (${r.req.judge.notes[0]})` : ''}. ${r.notes.join(' ')}`;
          toast(note, r.req.status === 'backfired' ? 'bad' : r.req.judge.band === 'crisp' ? 'good' : 'warn', 7000);
        }, { hours: vague ? WI.hours.vagueAsk : WI.hours.ask, label: 'Intro request' });
      },
    }],
  });
}

export function wireWarm(root, ctx) {
  on(root, 'click', '[data-wi-map]', (e, el) => ctx.act((st) => { const r = mapMutuals(st, el.dataset.wiMap); if (!r.ok) throw new Error(r.error); toast(r.found ? `Found ${r.found} relevant mutual connection${r.found === 1 ? '' : 's'}.` : 'Nothing new that matters for you.', r.found ? 'good' : 'info'); ctx.navigate('crm', `warm:${el.dataset.wiMap}`); }, { hours: WI.hours.map, label: 'Mapping mutual connections' }));
  on(root, 'click', '[data-wi-pq]', (e, el) => ctx.act((st) => { const r = prequalify(st, el.dataset.wiPq); if (!r.ok) throw new Error(r.error); toast(`Your read: fit looks ${r.band}.`, r.band === 'strong' ? 'good' : r.band === 'weak' ? 'warn' : 'info'); }, { hours: WI.hours.prequal, label: 'Pre-qualifying an intro target' }));
  on(root, 'click', '[data-wi-favor]', (e, el) => ctx.act((st) => { const r = returnFavor(st, el.dataset.wiFavor); if (!r.ok) throw new Error(r.error); toast(r.diminishing ? 'Appreciated, but a second favour this month adds little.' : 'They noticed. Goodwill up.', 'good'); }, { hours: WI.hours.favor, label: 'Returning a favour' }));
  on(root, 'click', '[data-wi-loop]', (e, el) => ctx.act((st) => { const r = closeLoop(st, el.dataset.wiLoop); if (!r.ok) throw new Error(r.error); toast('Thanked them and reported back.', 'good'); }, { hours: WI.hours.closeLoop, label: 'Closing the loop with a connector' }));
  on(root, 'click', '[data-wi-ask]', (e, el) => { const [cid, tieId] = el.dataset.wiAsk.split('|'); askModal(ctx, cid, tieId || null); });
  on(root, 'click', '[data-wi-inbound]', () => ctx.navigate('crm', 'inbound'));
  on(root, 'change', '#wiCo', (e, el) => { pathCompany = el.value; ctx.render(); });
  on(root, 'click', '#wiSearch', () => ctx.act((st) => { const r = mapCompany(st, pathCompany); toast(r.paths.length ? `${r.paths.length} warm path${r.paths.length === 1 ? '' : 's'} found.` : 'No warm path found.', r.paths.length ? 'good' : 'info'); }, { hours: WI.hours.mapCompany, label: 'Searching mutual connections' }));
}
