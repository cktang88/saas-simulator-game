// UI pieces for global and part-time hiring: company core hours, the region guide shown while writing a job, candidate
// location / time zone / overlap / English, and the Team view's overlap and hours. Rendering only; rules live in
// people/global.js and data/regions.js.

import { html, badge } from '../../core/ui.js';
import { money, pct } from '../../core/util.js';
import { REGION_DATA, partTimePremium, NIGHT_PREMIUM } from '../../data/regions.js';
import { JOB_ROLES, benefitsEligible, ACA_FULL_TIME_HOURS } from './catalog.js';
import {
  CORE_PRESETS, coreOf, overlapHours, overlapNeed, customerFacing, englishLabel, englishEstimate, partTimeFit, supportCoverage,
  coverageFrtMult, workMods, regionData, poolShare, regionFlow, loadRatio, fxFeePct,
} from './global.js';

export const utc = (tz) => `UTC${tz >= 0 ? '+' : '−'}${Math.abs(tz)}`;
export const coreLine = (s) => { const c = coreOf(s); return `${c.label}, ${String(c.start).padStart(2, '0')}:00–${String(c.end).padStart(2, '0')}:00 (${utc(c.tz)})`; };

// Share of a region's pool at or above each English level (the band the research puts the region in), as a short phrase.
function englishBand(rd) {
  const pro = rd.english[3] + rd.english[4];
  return `${pct(pro, 0)} at professional or better`;
}

export function companyHoursPanel(s, p) {
  const c = coreOf(s);
  const cover = supportCoverage(s);
  const presetKey = Object.entries(CORE_PRESETS).find(([, v]) => v.tz === c.tz && v.start === c.start && v.end === c.end)?.[0] ?? 'custom';
  return html`<section class="panel">
    <h2>Company core hours</h2>
    <p class="small muted">Overlap is measured against these hours. Candidates show how many hours a day their workday shares with yours; asking for more overlap than a region gives shrinks the pool or costs a night-shift premium (~+${Math.round(NIGHT_PREMIUM * 100)}%).</p>
    <form id="coreForm" class="inline">
      <label>Time zone <select name="preset">${Object.entries(CORE_PRESETS).map(([k, v]) => html`<option value="${k}" ${presetKey === k ? 'selected' : ''}>${v.label} (${utc(v.tz)})</option>`)}<option value="custom" ${presetKey === 'custom' ? 'selected' : ''}>Custom…</option></select></label>
      <label>UTC offset <input type="number" name="tz" value="${c.tz}" min="-12" max="14" step="0.5" style="width:70px" /></label>
      <label>From <input type="number" name="start" value="${c.start}" min="0" max="20" step="0.5" style="width:64px" /></label>
      <label>To <input type="number" name="end" value="${c.end}" min="4" max="24" step="0.5" style="width:64px" /></label>
      <button class="sm">Save (0.1h)</button>
    </form>
    <p class="small">Now: <b>${coreLine(s)}</b>.</p>
    ${cover ? html`<div class="callout ${cover.biz < 0.99 && !cover.planned ? 'warn' : ''} small"><b>Support coverage:</b> ${pct(cover.biz, 0)} of your business hours staffed, ${cover.hours24.toFixed(1)}h of 24 covered${cover.followTheSun ? ' (follow-the-sun)' : ''}. First response ×${coverageFrtMult(s).toFixed(2)}.
      ${cover.planned ? badge('handoff runbook in place', 'good') : html`Staff working while your customers sleep answer slower in your hours unless you plan the handoff. <button class="sm" data-plan-coverage>Write the handoff runbook and shift schedule (3h)</button>`}</div>` : ''}
  </section>`;
}

// Guide under the job form: what this role costs and risks in this region and engagement.
export function regionGuide(s, d, role = JOB_ROLES[d.role]) {
  const rd = regionData(d.region);
  const core = coreOf(s);
  const hours = Number(d.hoursPerWeek) || 40;
  const nat = rd.places.map((pl) => overlapHours(core, pl.tz, 9, 8));
  const natMin = Math.min(...nat), natMax = Math.max(...nat);
  const need = overlapNeed(d.role);
  const req = Number(d.requiredOverlap) || 0;
  const zone = poolShare(s, d.region, req, d.engagement === 'fractional' ? 4 : Math.min(8, Math.max(2, hours / 5)));
  const fit = partTimeFit(d.role);
  const part = d.engagement === 'part_time_employee' || d.engagement === 'fractional' || (d.engagement === 'contractor' && hours < 35);
  const cust = customerFacing(d.role);
  const warn = [];
  if (cust && natMax < Math.min(need, 5)) warn.push(`${role.label} needs about ${need}h of overlap with buyers' hours and ${rd.short} offers ${natMin === natMax ? natMin : `${natMin}–${natMax}`}h: replies, demos and renewals wait a day.`);
  if (cust && rd.english[3] + rd.english[4] < 0.6) warn.push(`Only ${pct(rd.english[3] + rd.english[4], 0)} of ${rd.short} applicants speak at professional level; this role sells or supports US and UK buyers, so test English before the offer.`);
  if (part && fit.fit < 0.5) warn.push(`${role.label} suits part-time poorly (${fit.note}); startups usually need ~${fit.load[0]}–${fit.load[1]}h a week. An overloaded part-timer burns out and leaves.`);
  if (part && fit.fit >= 0.5 && hours < fit.load[0] * 0.8) warn.push(`This role normally takes ${fit.load[0]}–${fit.load[1]}h a week; at ${hours}h expect overwork or slipped scope.`);
  if (d.engagement === 'contractor' && d.region !== 'us' && hours >= 30) warn.push('A full-time contractor abroad looks like an employee to a regulator (control, tools, integration). Use an EOR or Contractor of Record for staff-like work.');
  if (req > 0 && zone < 0.5 && !d.allowShift) warn.push(`Only ${pct(zone, 0)} of ${rd.short} applicants naturally overlap ${req}h with your core hours. Tick "accept shifted hours" to keep the pool at about +${Math.round(NIGHT_PREMIUM * 100)}% pay.`);
  const pt = part && d.engagement !== 'fractional' ? ` Part-time costs ~${Math.round(partTimePremium(hours) * 100)}% more per hour; output per paid hour is ~${Math.round((1 - 0.64 * (1 - hours / 40)) * 100)}% of a full-timer's after context switching [game assumption].` : '';
  const aca = d.engagement === 'part_time_employee' && d.region === 'us' ? ` Under ${ACA_FULL_TIME_HOURS}h/week no health plan is offered; at ${ACA_FULL_TIME_HOURS}h+ the employee is full-time for the ACA.` : '';
  return html`<div class="callout small"><b>${rd.label}:</b> ${rd.currency}; FX and payout fees ~${pct(rd.fxFeePct, 1)}; notice ${rd.noticeDays[0] === rd.noticeDays[1] ? `${rd.noticeDays[0]}` : `${rd.noticeDays[0]}–${rd.noticeDays[1]}`} days; first candidates take ~${rd.fillMult.toFixed(2)}× as long; ~${rd.holidays} public holidays; outage risk ${rd.outage >= 0.1 ? 'high' : rd.outage >= 0.04 ? 'moderate' : 'low'}; EOR statutory load ${pct(rd.eorLoad, 0)}.
    English: ${englishBand(rd)} <span class="muted">(EF EPI-shaped, game assumption)</span>. Overlap with your core hours: ${natMin === natMax ? `${natMin}h` : `${natMin}–${natMax}h`} a day. Pool depth ${rd.poolDepth.toFixed(1)}×, ${pct(rd.seniorShare, 0)} senior.${pt}${aca}
    <div class="muted">${rd.payNote}</div>
    ${warn.map((w) => html`<div class="neg" style="margin-top:4px">⚠ ${w}</div>`)}</div>`;
}

export function candidateGlobalLine(s, c) {
  if (c.tz == null) return null;
  const core = coreOf(s);
  const ov = overlapHours(core, c.tz, c.workStart ?? 9, c.windowLen ?? 8);
  return { ov, text: `${c.location} · ${utc(c.tz)} · ${ov}h overlap` };
}

// The candidate card block: where they are, hours, notice, pay in USD, English.
export function candidateGlobalCard(s, c) {
  if (c.tz == null) return '';
  const g = candidateGlobalLine(s, c);
  const est = englishEstimate(c);
  const contractor = c.engagement === 'contractor';
  const monthly = contractor ? c.expectation * c.hoursPerWeek * 52 / 12 : c.expectation / 12;
  const need = overlapNeed(c.role);
  const cust = customerFacing(c.role);
  const fx = fxFeePct(c.region);
  return html`<h3>Where and when</h3>
    <ul class="list small">
      <li><b>${c.location}</b> (${c.country}) · ${utc(c.tz)} · works ${String(Math.floor(c.workStart ?? 9)).padStart(2, '0')}:00 for ${(c.windowLen ?? 8)}h${c.nightShift ? html` ${badge('night shift (+10%)', 'warn')}` : ''}</li>
      <li>Overlap with your core hours (${coreLine(s)}): <b class="${g.ov >= need ? 'pos' : g.ov >= need / 2 ? '' : 'neg'}">${g.ov}h</b> a day${cust || c.role === 'engineer' ? ` · this role needs about ${Math.min(need, c.windowLen ?? 8)}h` : ''}</li>
      <li>${c.hoursPerWeek}h/week${c.partTime ? ' · part-time employee' : c.fractional ? ' · fractional' : ''} · ${c.seniority} · notice ${c.noticeDays} days · ${c.stage === 'new' ? html`<span class="muted">pay ask after the screen</span>` : html`asks <b>${contractor ? `$${c.expectation}/h` : `${money(c.expectation)}/yr`}</b> in USD (≈ ${money(monthly)}/month${fx ? `, + ~${pct(fx, 1)} FX/payout fees` : ''})`}</li>
      <li>English: ${est ? html`<b>${englishLabel(est.level)}</b> (${est.level.toFixed(1)}/5 ± ${est.sd.toFixed(1)}; from ${est.methods.join(', ')})` : html`<span class="muted">not assessed</span>`} · resume says "${englishLabel(c.englishClaim)}"${cust ? html` ${est && est.level < 3.5 ? badge('weak for a customer-facing role', 'bad') : ''}` : ''}</li>
    </ul>
    ${!est || est.sd > 0.7 ? html`<p class="hint">A resume claim is not a level. A structured interview that makes them talk through a real case, plus a written sample, narrows it (the interview reads their spoken English too).</p>` : ''}`;
}

export function teamGlobalCell(s, m) {
  if (m.tz == null || m.kind === 'ai_agent') return html`<span class="muted">—</span>`;
  const x = workMods(m);
  const hrs = m.hoursPerWeek ?? 40;
  return html`<div class="small"><b>${m.city ?? regionData(m.region).label}</b> · ${utc(m.tz)}</div>
    <div class="small ${x.short >= 2 ? 'neg' : x.short > 0 ? '' : 'pos'}">overlap ${m.overlapHours}h${m.nightShift ? ' · night shift' : ''}</div>
    <div class="small muted">${hrs}h/wk${hrs < 35 ? ` · ${Math.round(x.ptEff * 100)}% per-hour efficiency` : ''} · English ${m.english ?? '—'}/5${loadRatio(m) > 1.25 ? ' · overloaded' : ''}</div>`;
}

export function memberGlobalCard(s, m) {
  if (m.tz == null || m.kind === 'ai_agent') return '';
  const x = workMods(m);
  const rd = regionData(m.region);
  const hrs = m.hoursPerWeek ?? 40;
  const fit = partTimeFit(m.jobRole ?? m.role);
  const pen = (v) => `${Math.round((1 - v) * 100)}%`;
  return html`<h3>Where, when and how well it fits</h3>
    <ul class="list small">
      <li>${m.city ?? rd.label} (${utc(m.tz)}) · overlap ${m.overlapHours}h a day, role needs ~${x.need}h${x.short > 0 ? html` · <span class="neg">short by ${x.short}h: slower feedback loops, ${pen(x.speed)} less delivery, ~${(x.bugs).toFixed(2)}× bugs, +${(m.oddHours ?? 0) || 0}h/week of odd-hour calls for you</span>` : ''}</li>
      <li>English ${englishLabel(m.english ?? 5)} (${m.english ?? '—'}/5)${customerFacing(m.jobRole ?? m.role) ? html` · customer-facing effect on conversion, replies and CSAT: ${x.cust < 1 ? html`<span class="neg">−${pen(x.cust)}</span>` : 'none'}` : ''}</li>
      <li>${hrs}h/week${hrs < 40 ? ` · ${Math.round(x.ptEff * 100)}% of full-time output per paid hour (context switching)` : ''}${m.loadHours ? ` · the role needs ~${Math.round(m.loadHours)}h: ${loadRatio(m) > 1.25 ? html`<span class="neg">overloaded, burnout and quit risk are up</span>` : 'fits'}` : ''}${hrs < 40 && !m.loadHours ? ` (${fit.note})` : ''}</li>
      ${m.engagement === 'contractor' && m.region !== 'us' ? html`<li>Paper: ${m.cor ? 'Contractor of Record' : 'contractor'} · IP assignment ${m.ipLocal ? 'local-law' : m.ciiaa ? 'US form only' : 'none'}${m.classificationFlag ? html` · <span class="neg">staff-like work without an EOR or CoR</span>` : ''}</li>` : ''}
      ${m.moonFound ? html`<li class="neg">Working a second full-time job (found).</li>` : ''}
      ${m.outageLog?.length ? html`<li>${m.outageLog.reduce((a, o) => a + o.days, 0)} outage day(s) logged${m.stipend ? ' (backup stipend on)' : ''}</li>` : ''}
    </ul>
    ${rd.outage >= 0.04 ? html`<button class="sm" data-stipend="${m.id}">${m.stipend ? 'Stop backup power and internet stipend' : 'Backup power and internet stipend (~$60/mo)'}</button>` : ''}`;
}
