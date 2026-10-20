// UI for the Research app tabs: Recruit, Synthesis, Hypotheses (Interviews stays in apps/research.js). Every action goes
// through ctx.act with founder hours. Nothing here prints a hidden fact: the player sees who they recruited (title,
// company, how they were reached) and what was said, never the truth behind it.

import { learningMode, reviewFor } from '../../core/advice.js';
import { html, on, toast } from '../../core/ui.js';
import { fmtDate, pct } from '../../core/util.js';
import { disc } from './store.js';
import { CHANNELS, CHANNEL_IDS, planBatch, recruitBatch, screenerQuality, targetRead, poolLeft, defaultIncentive, INTERVIEW_HOURS } from './recruit.js';
import { startSim, confirmSim, cancelSim } from './sim.js';
import { EVIDENCE, EVIDENCE_IDS, boardOf, tagInsight, mergeThemes, excludeInterview, addClaim, deleteClaim, claimQuality, synthesisQuality, enrichInsights, isBehavioural } from './synthesis.js';
import { addHypothesis, editCriteria, decideHypothesis, evaluateHypothesis, criteriaText, COMMIT_LEVELS, defaultCriteria } from './hypotheses.js';
import { adoptRequest, wtpEvidence, priceFromWtp } from './debrief.js';

const HOURS = { claim: 0.5, adopt: 0.5, hyp: 0.5, edit: 0.1, decide: 0.25, tag: 0.05, price: 0.25, checkNiche: 0.1 };
let rc = { channel: 'cold_email', sends: 10, incentive: null };
let hypDraft = { customer: '', problem: '', workaround: '', wtp: '', channel: 'cold_email', ...defaultCriteria() };
let claimDraft = { text: '', segmentId: '', kind: 'pain', cite: [] };
const relLabel = { friend: 'friend / family', warm: 'warm contact', stranger: 'stranger', investor: 'investor', founder: 'fellow founder' };
const mins = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} h`);

// ---------------------------------------------------------------- Recruit

export function recruitView(ctx) {
  const s = ctx.state; const d = disc(s); const r = d.recruit;
  const incentive = rc.incentive ?? (CHANNELS[rc.channel]?.paid ? defaultIncentive(s) : 0);
  const plan = planBatch(s, { channel: rc.channel, sends: rc.sends, target: r.target, screener: r.screener, incentive });
  const ch = CHANNELS[rc.channel];
  const waiting = d.interviews.filter((i) => i.sim && i.status === 'scheduled');
  const sq = screenerQuality(r.screener);
  return html`
    <div class="callout small"><b>Who you talk to decides what you learn.</b> Write who you want (role, kind of company, size) and a screener that asks about something they did recently. The market sends you whoever answers; friends are kind, communities are broad, panels carry professional respondents. Calls are real evidence here: they are verified, and so are their limits.</div>
    <div class="grid-2">
      <section class="panel"><h2>Target and screener</h2>
        <label>Who do you want to talk to? <span class="hint">A role, a kind of company, a size. "Small businesses" is not a target.</span>
          <textarea id="rc-target" rows="2" data-rctext="target" placeholder="e.g. operations managers at HVAC and plumbing companies with several locations">${r.target}</textarea></label>
        <p class="small ${plan.target.vague ? 'warn' : 'muted'}">${plan.target.vague ? 'Too vague to aim at.' : `Reads as a ${plan.target.sharp >= 0.7 ? 'sharp' : 'fair'} target (${Math.round(plan.target.sharp * 100)}/100).`}</p>
        ${plan.target.vague ? '' : html`<p class="small muted">${plan.target.nicheId ? html`Niche: <b>${plan.target.nicheLabel}</b>, about ${plan.target.pool} reachable people${plan.target.hard > 0.5 ? ', hard to reach' : ''}.` : 'Niche not checked: the estimates below use the broad segment until a batch goes out.'} <button type="button" class="sm" data-checkniche>Check niche (${mins(HOURS.checkNiche)})</button></p>`}
        <label>Screener questions <span class="hint">One per line. Ask what they did last month, how many, which tool. Not "do you struggle with…?"</span>
          <textarea id="rc-screener" rows="4" data-rctext="screener" placeholder="When did you last chase a late invoice? How many were open last month?&#10;What do you use to track them?&#10;How many locations does your company have?">${r.screener}</textarea></label>
        <p class="small ${sq < 0.3 ? 'warn' : 'muted'}">Screener quality ${Math.round(sq * 100)}/100${sq < 0.3 ? ': you will talk to whoever replies.' : ''}</p>
      </section>
      <section class="panel"><h2>Send a batch</h2>
        <form id="recruitForm">
          <label>Channel <select id="rc-channel" data-rc="channel">${CHANNEL_IDS.map((k) => html`<option value="${k}" ${rc.channel === k ? 'selected' : ''}>${CHANNELS[k].label}${CHANNELS[k].pooled ? ` (${poolLeft(s, k)} left)` : ''}</option>`)}</select></label>
          <p class="small muted">${ch.note}</p>
          <div class="grid-2"><label>${ch.paid ? 'Participants to request' : 'Messages to send'} <input id="rc-sends" data-rc="sends" type="number" min="1" max="40" value="${rc.sends}" /></label>
            ${rc.channel === 'friends' ? '' : html`<label>Incentive per completed call ($) <input id="rc-incentive" data-rc="incentive" type="number" min="0" step="5" value="${incentive}" /></label>`}</div>
          <div class="stats">
            <div class="stat"><div class="stat-label">Reply</div><div class="stat-value">${pct(plan.reply, 0)}</div><div class="stat-sub">show-up ${pct(plan.show, 0)}</div></div>
            <div class="stat"><div class="stat-label">Expected calls</div><div class="stat-value">${plan.expectedCompleted}</div><div class="stat-sub">from ${plan.sends} ${ch.paid ? 'requests' : 'messages'}</div></div>
            <div class="stat"><div class="stat-label">Your time</div><div class="stat-value">${mins(plan.hours)}</div><div class="stat-sub">${plan.hoursPerCompleted ? `~${plan.hoursPerCompleted} h per completed call all-in` : 'no calls expected'}</div></div>
            <div class="stat"><div class="stat-label">Cash per call</div><div class="stat-value">$${plan.usdPerCompleted}</div><div class="stat-sub">${ch.paid ? 'platform fee + incentive' : 'incentive'}${plan.ticketUsd ? ` · $${plan.ticketUsd} tickets` : ''}</div></div>
          </div>
          ${plan.warnings.map((w) => html`<p class="small warn">${w}</p>`)}
          <button class="primary">Send batch (${mins(plan.hours)})</button>
        </form>
        <p class="hint">Hard-to-reach customers reply less on every channel, so the same effort yields fewer calls. Each call also costs ${mins(INTERVIEW_HOURS.scheduling + INTERVIEW_HOURS.call + INTERVIEW_HOURS.notes)} to hold and write up. Intros banked: ${d.introCredits}.</p>
      </section>
    </div>
    <section class="panel"><h2>Booked calls</h2>
      ${waiting.length ? html`<div class="table-wrap"><table><thead><tr><th>Who</th><th>Reached via</th><th>Available</th><th></th></tr></thead><tbody>
        ${waiting.map((i) => html`<tr><td><b>${i.persona.name}</b><div class="small muted">${i.persona.role}, ${i.persona.company}</div></td><td class="small">${CHANNELS[i.channel]?.label}</td><td class="small">${fmtDate(s, i.day)}</td>
          <td>${s.day >= i.day ? html`<button class="primary sm" data-start="${i.id}">Start call (${mins(INTERVIEW_HOURS.scheduling)} to set up)</button>` : html`<button class="sm" data-confirm-sim="${i.id}">${i.confirmedDay != null ? 'Confirmed' : 'Send day-before confirmation'}</button>`} <button class="sm danger" data-cancel-sim="${i.id}">Cancel</button></td></tr>`)}</tbody></table></div>
        <p class="small muted">A short confirmation the day before cuts no-shows by about two thirds. Paid incentives are charged only for completed calls.</p>` : html`<p class="empty">Nobody booked. Send a batch above.</p>`}
    </section>
    <section class="panel"><h2>Past batches</h2>
      ${r.batches.length ? html`<div class="table-wrap"><table><thead><tr><th>Day</th><th>Channel</th><th class="r">Sent</th><th class="r">Replied</th><th class="r">Screened out</th><th class="r">Booked</th><th class="r">Target</th></tr></thead><tbody>
        ${r.batches.slice(0, 12).map((b) => html`<tr><td class="small">${fmtDate(s, b.day)}</td><td>${CHANNELS[b.channel]?.label}</td><td class="r">${b.sends}</td><td class="r">${b.responders}</td><td class="r">${b.screenedOut}</td><td class="r">${b.booked}</td><td class="small muted">${b.targetText ? b.targetText.slice(0, 40) : '(none)'}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No outreach yet.</p>`}
    </section>`;
}

export function bindRecruit(root, ctx) {
  const s = ctx.state;
  on(root, 'input', '[data-rctext]', (e, el) => { disc(s).recruit[el.dataset.rctext] = el.value; });
  on(root, 'change', '[data-rctext]', () => { ctx.save(); ctx.render(); });
  // Resolving (creating) the niche node is an explicit click, not every keystroke: estimates become niche-specific before you spend a batch.
  on(root, 'click', '[data-checkniche]', () => ctx.act((st) => { targetRead(st, disc(st).recruit.target, { create: true }); }, { hours: HOURS.checkNiche, label: 'Checking the niche' }));
  on(root, 'change', '[data-rc]', (e, el) => { rc[el.dataset.rc] = el.dataset.rc === 'channel' ? el.value : Number(el.value); if (el.dataset.rc === 'channel') rc.incentive = null; ctx.render(); });
  on(root, 'submit', '#recruitForm', async (e) => {
    e.preventDefault();
    const d = disc(s).recruit;
    const input = { channel: rc.channel, sends: rc.sends, target: d.target, screener: d.screener, incentive: rc.incentive ?? (CHANNELS[rc.channel]?.paid ? defaultIncentive(s) : 0) };
    const hours = planBatch(s, input).hours;
    const out = await ctx.act((st) => recruitBatch(st, input), { hours, label: 'Recruiting interviewees' });
    if (out) toast(out.booked.length ? `${out.booked.length} call${out.booked.length === 1 ? '' : 's'} booked${out.screenedOut ? `, ${out.screenedOut} screened out` : ''}.` : `Nobody booked this time (${out.noReply} no reply${out.screenedOut ? `, ${out.screenedOut} screened out` : ''}). The hours are spent.`, out.booked.length ? 'good' : 'warn');
  });
  on(root, 'click', '[data-start]', async (e, el) => {
    const iv = await ctx.act((st) => startSim(st, el.dataset.start), { hours: INTERVIEW_HOURS.scheduling, label: 'Scheduling an interview' });
    if (iv?.status === 'live') ctx.navigate('research', iv.id);
  });
  on(root, 'click', '[data-confirm-sim]', (e, el) => ctx.act((st) => confirmSim(st, el.dataset.confirmSim), { hours: 0.1, label: 'Confirm interview' }));
  on(root, 'click', '[data-cancel-sim]', (e, el) => ctx.act((st) => cancelSim(st, el.dataset.cancelSim)));
}

// ---------------------------------------------------------------- Synthesis

export function synthesisView(ctx) {
  const s = ctx.state; const d = disc(s);
  enrichInsights(s);
  const b = boardOf(s);
  const ins = d.insights.filter((i) => !i.rehearsal && i.evidenceType);
  // Only segments the player has actually met (from the people they spoke to), never the market's full hidden segment list.
  const met = b.segments.filter((g) => g.id !== 'none' && g.id !== 'outsider');
  const metLabel = (id) => met.find((g) => g.id === id)?.label ?? id;
  const segOptions = (sel) => html`<option value="">(no segment)</option>${met.map((g) => html`<option value="${g.id}" ${sel === g.id ? 'selected' : ''}>${g.label}</option>`)}`;
  const e = wtpEvidence(s);
  const sq = synthesisQuality(s);
  const seeGrade = learningMode(s) || reviewFor(s, 'customer_discovery').tier != null; // no claim grader for a real founder
  const themes = [...new Set(ins.map((i) => i.theme).filter(Boolean))];
  const convs = d.interviews.filter((i) => i.real && i.status === 'done' && !i.rehearsal);
  return html`
    <div class="callout small"><b>Count people, not quotes.</b> The board groups what each person did or paid by who they are. Opinions, compliments and "I would…" are shown apart from past behaviour and commitments, and friends are shown apart from strangers. Write a pattern claim per segment, citing the behaviour behind it.</div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Conversations</div><div class="stat-value">${b.people}</div><div class="stat-sub">${b.saturation.themes} distinct jobs heard</div></div>
      <div class="stat"><div class="stat-label">Behaviour vs opinion</div><div class="stat-value">${b.evidence.behaviour} : ${b.evidence.opinion}</div><div class="stat-sub">past behaviour/cost/commitment : opinion/compliment/hypothetical</div></div>
      <div class="stat"><div class="stat-label">Saturation</div><div class="stat-value">${b.saturation.saturated ? 'Yes' : b.people < 6 ? 'Too early' : 'No'}</div><div class="stat-sub">${b.saturation.saturated ? 'last 3 added no new jobs (in whom, though?)' : 'new interviews still add new jobs'}</div></div>
      <div class="stat"><div class="stat-label">Synthesis quality</div><div class="stat-value">${sq == null || !seeGrade ? '—' : Math.round(sq * 100)}</div><div class="stat-sub">${d.claims.length} claim${d.claims.length === 1 ? '' : 's'}</div></div>
    </div>
    <section class="panel"><h2>Pain × frequency × willingness to pay, by segment</h2>
      ${b.segments.length ? html`<div class="table-wrap"><table><thead><tr><th>Segment</th><th class="r">People</th><th class="r">Described it</th><th>Frequency</th><th class="r">Pay today</th><th class="r">Say they'd pay</th><th class="r">Commitments</th></tr></thead><tbody>
        ${b.segments.map((g) => html`<tr><td><b>${g.label}</b><div class="small">${g.sentence}</div>${g.flags.map((f) => html`<div class="small warn">${f}</div>`)}</td><td class="r">${g.n}</td><td class="r">${g.recent}/${g.n}</td><td class="small">${g.frequency ?? '—'}</td><td class="r">${g.costMedian ? `$${Math.round(g.costMedian)}/mo` : '—'}</td><td class="r">${g.statedMedian ? `$${Math.round(g.statedMedian)}/mo` : '—'}</td><td class="r">${g.commits}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Hold some calls and the board fills in.</p>`}
      ${b.contradictions.length ? html`<h3>Contradictions</h3><ul class="small">${b.contradictions.map((c) => html`<li>${c}</li>`)}</ul>` : ''}
      ${b.asks.length ? html`<h3>Feature asks</h3><ul class="small">${b.asks.map((a) => html`<li>"${a.text}" · ${a.count} account${a.count === 1 ? '' : 's'}${a.flag ? html` <span class="badge warn">${a.flag}</span>` : ''}</li>`)}</ul>` : ''}
    </section>
    <section class="panel"><h2>Willingness to pay</h2>
      <p class="small">What people <b>say</b> they would pay: ${e.stated ? `$${Math.round(e.stated)}/mo (${e.statedN} answers, hypothetical)` : 'no answers'}. What they <b>pay today</b> for their workaround: ${e.spend ? `$${Math.round(e.spend)}/mo (${e.spendN} people)` : 'not asked yet'}.</p>
      <div class="inline"><button data-price="spend" ${e.spend ? '' : 'disabled'}>Price from what they pay today (${mins(HOURS.price)})</button> <button data-price="stated" ${e.stated ? '' : 'disabled'}>Price from what they said (${mins(HOURS.price)})</button></div>
    </section>
    <section class="panel"><h2>Write a pattern claim</h2>
      <form id="claimForm">
        <label>Pattern <span class="hint">Who, what they did, how many. "4 of 6 ops managers at multi-site clinics re-keyed the schedule last week."</span><textarea id="cl-text" rows="2" data-claim="text">${claimDraft.text}</textarea></label>
        <div class="grid-2"><label>Segment <select data-claim="segmentId">${segOptions(claimDraft.segmentId)}</select></label>
          <label>Claim is that this is <select data-claim="kind"><option value="pain" ${claimDraft.kind === 'pain' ? 'selected' : ''}>a real problem for them</option><option value="weak" ${claimDraft.kind === 'weak' ? 'selected' : ''}>NOT a real problem for them</option></select></label></div>
        <div class="small">Cite the insights behind it:</div>
        <div class="small" style="max-height:180px;overflow:auto">${ins.filter((i) => !i.excluded).slice(0, 60).map((i) => html`<label style="display:flex;gap:6px;align-items:flex-start"><input style="flex:none;margin-top:3px" type="checkbox" data-cite="${i.id}" ${claimDraft.cite.includes(i.id) ? 'checked' : ''} /><span>${EVIDENCE[i.evidenceType].label}: ${String(i.text).slice(0, 110)} <span class="muted">(${i.who ?? ''}, ${relLabel[i.relationship] ?? i.relationship ?? ''})</span></span></label>`)}</div>
        <button class="primary">Add claim (${mins(HOURS.claim)})</button>
      </form>
      ${d.claims.length ? html`<h3>Your claims</h3>${d.claims.map((c) => { const g = claimQuality(s, c); return html`<div class="card"><b>${c.text}</b><div class="small muted">${c.segmentId ? metLabel(c.segmentId) : 'no segment'} · ${g.people} people${seeGrade ? html` · grade ${Math.round(g.q * 100)}/100 (segment-specific ${Math.round((g.parts.segmentSpecific ?? 0) * 100)}, behaviour ${Math.round((g.parts.behaviourBased ?? 0) * 100)}, strangers ${Math.round((g.parts.notFriends ?? 0) * 100)})` : ''} <button class="sm" data-del-claim="${c.id}">✕</button></div></div>`; })}` : ''}
    </section>
    <section class="panel"><h2>Insights</h2>
      <form id="mergeForm" class="inline"><select name="from">${themes.map((x) => html`<option>${x}</option>`)}</select> → <select name="to">${themes.map((x) => html`<option>${x}</option>`)}</select> <button class="sm">Merge themes</button></form>
      <p class="small muted">Set aside a whole conversation you do not trust (friends, an odd respondent). It then counts for nothing, including against you.</p>
      <div class="table-wrap"><table><thead><tr><th>Said</th><th>Who</th><th>Evidence</th><th>Segment</th><th></th></tr></thead><tbody>
        ${ins.slice(0, 80).map((i) => html`<tr class="${i.excluded ? 'muted' : ''}"><td class="small">${i.text.slice(0, 160)}${i.ask ? html` <span class="badge">asks</span>` : ''}</td><td class="small">${i.who}<div class="muted">${relLabel[i.relationship] ?? i.relationship ?? ''}</div></td>
          <td><select class="sm" data-tag-ev="${i.id}">${EVIDENCE_IDS.map((k) => html`<option value="${k}" ${i.evidenceType === k ? 'selected' : ''}>${EVIDENCE[k].label}</option>`)}</select></td>
          <td><select class="sm" data-tag-seg="${i.id}">${segOptions(i.segmentId)}</select></td>
          <td>${i.evidenceType === 'feature_wish' ? html`<button class="sm" data-adopt="${i.id}" title="Draft a feature from this request">Build this</button>` : ''} <button class="sm" data-del-ins="${i.id}" title="Remove">✕</button></td></tr>`)}
      </tbody></table></div>
      ${convs.length ? html`<h3>Conversations</h3><div class="small">${convs.slice(0, 40).map((c) => html`<label style="display:flex;gap:6px"><input style="flex:none;margin-top:3px" type="checkbox" data-excl="${c.id}" ${c.excluded ? 'checked' : ''} /> Set aside: ${c.persona.name} (${c.persona.company || c.persona.role}, ${CHANNELS[c.channel]?.label ?? c.channel})</label>`)}</div>` : ''}
    </section>`;
}

export function bindSynthesis(root, ctx) {
  const s = ctx.state;
  on(root, 'input', '[data-claim]', (e, el) => { claimDraft[el.dataset.claim] = el.value; });
  on(root, 'change', '[data-claim]', (e, el) => { claimDraft[el.dataset.claim] = el.value; });
  on(root, 'change', '[data-cite]', (e, el) => { const set = new Set(claimDraft.cite); el.checked ? set.add(el.dataset.cite) : set.delete(el.dataset.cite); claimDraft.cite = [...set]; });
  on(root, 'submit', '#claimForm', async (e) => {
    e.preventDefault();
    const d = { text: claimDraft.text, segmentId: claimDraft.segmentId, kind: claimDraft.kind, insightIds: claimDraft.cite };
    const c = await ctx.act((st) => addClaim(st, d), { hours: HOURS.claim, label: 'Synthesis: pattern claim' });
    if (c) { claimDraft = { text: '', segmentId: '', kind: 'pain', cite: [] }; ctx.render(); }
  });
  on(root, 'click', '[data-del-claim]', (e, el) => ctx.act((st) => deleteClaim(st, el.dataset.delClaim)));
  on(root, 'change', '[data-tag-ev]', (e, el) => ctx.act((st) => tagInsight(st, el.dataset.tagEv, { evidenceType: el.value }), { hours: HOURS.tag, label: 'Tag insight' }));
  on(root, 'change', '[data-tag-seg]', (e, el) => ctx.act((st) => tagInsight(st, el.dataset.tagSeg, { segmentId: el.value }), { hours: HOURS.tag, label: 'Tag insight' }));
  on(root, 'change', '[data-excl]', (e, el) => ctx.act((st) => excludeInterview(st, el.dataset.excl, el.checked, 'set aside by founder')));
  on(root, 'submit', '#mergeForm', (e) => { e.preventDefault(); const f = new FormData(e.target); ctx.act((st) => mergeThemes(st, f.get('from'), f.get('to')), { hours: HOURS.tag, label: 'Merge themes' }); });
  on(root, 'click', '[data-del-ins]', (e, el) => ctx.act((st) => { const sl = disc(st); sl.insights = sl.insights.filter((i) => i.id !== el.dataset.delIns); }));
  on(root, 'click', '[data-adopt]', async (e, el) => {
    const r = await ctx.act((st) => adoptRequest(st, el.dataset.adopt), { hours: HOURS.adopt, label: 'Draft a feature from a request' });
    if (r) toast('Draft feature created in Product. Check who asked and how many accounts did.', 'info');
  });
  on(root, 'click', '[data-price]', async (e, el) => {
    const r = await ctx.act((st) => priceFromWtp(st, el.dataset.price), { hours: HOURS.price, label: 'Price from interviews' });
    if (r) toast(`Suggested price from ${r.n} ${el.dataset.price === 'stated' ? 'hypothetical answers' : 'people who pay today'}: $${r.price}/mo.`, 'info');
  });
}

// ---------------------------------------------------------------- Hypotheses

export function hypothesesView(ctx) {
  const s = ctx.state; const d = disc(s);
  const c = hypDraft;
  const crit = { minDescribing: c.minDescribing, outOf: c.outOf, withinDays: c.withinDays, minCommits: c.minCommits, commitLevel: c.commitLevel, minSpend: c.minSpend, strangersOnly: c.strangersOnly };
  return html`
    <div class="callout small"><b>Decide what would change your mind before you talk to anyone.</b> Write the customer, the problem, today's workaround, the money and the channel, then pass/fail criteria. Only conversations after you write it count toward it, and only people who match the customer and are not friends. Loosening the bar after seeing results is a mistake the Scorecard remembers.</div>
    <section class="panel"><h2>New hypothesis</h2>
      <form id="hypForm">
        <label>Customer <input data-hyp="customer" value="${c.customer}" placeholder="operations managers at multi-site HVAC companies" /></label>
        <label>Problem <input data-hyp="problem" value="${c.problem}" placeholder="late invoices get chased by hand and cash arrives weeks late" /></label>
        <div class="grid-2"><label>Current workaround <input data-hyp="workaround" value="${c.workaround}" placeholder="spreadsheet and reminder emails" /></label><label>What they'd pay (guess) <input data-hyp="wtp" value="${c.wtp}" placeholder="$150/mo" /></label></div>
        <label>Channel <select data-hyp="channel">${CHANNEL_IDS.map((k) => html`<option value="${k}" ${c.channel === k ? 'selected' : ''}>${CHANNELS[k].label}</option>`)}</select></label>
        <h3>Pass criteria (set now)</h3>
        <div class="grid-3">
          <label>Must describe it <input type="number" min="1" data-hyp="minDescribing" value="${c.minDescribing}" /></label>
          <label>out of this many calls <input type="number" min="1" data-hyp="outOf" value="${c.outOf}" /></label>
          <label>within the last (days) <input type="number" min="3" data-hyp="withinDays" value="${c.withinDays}" /></label>
          <label>Commitments needed <input type="number" min="0" data-hyp="minCommits" value="${c.minCommits}" /></label>
          <label>of at least <select data-hyp="commitLevel">${Object.entries(COMMIT_LEVELS).map(([k, v]) => html`<option value="${k}" ${c.commitLevel === k ? 'selected' : ''}>${v}</option>`)}</select></label>
          <label>Median current spend ≥ ($/mo) <input type="number" min="0" data-hyp="minSpend" value="${c.minSpend}" /></label>
        </div>
        <p class="small muted">${criteriaText(crit)}</p>
        <button class="primary">Write hypothesis (${mins(HOURS.hyp)})</button>
      </form>
    </section>
    ${d.hyps.length ? d.hyps.map((h) => { const ev = evaluateHypothesis(s, h); return html`
      <section class="panel"><h2>${h.customer} <span class="badge ${ev.status === 'pass' ? 'good' : ev.status === 'fail' ? 'bad' : 'accent'}">${ev.status === 'collecting' ? 'collecting evidence' : ev.status === 'pass' ? 'criteria met' : 'criteria failed'}</span> ${h.decision ? html`<span class="badge">${h.decision.verdict}</span>` : ''}</h2>
        <p class="small">${h.problem}${h.workaround ? html` · today: ${h.workaround}` : ''}${h.wtp ? html` · guess: ${h.wtp}` : ''}</p>
        <p class="small"><b>Criteria:</b> ${criteriaText(h.criteria)}</p>
        <p class="small"><b>Evidence so far:</b> ${ev.summary}. ${ev.remaining ? `${ev.remaining} more call${ev.remaining === 1 ? '' : 's'} planned.` : ''}</p>
        ${h.criteriaLog.length ? html`<p class="small ${h.criteriaLog.some((l) => l.loosened) ? 'neg' : 'muted'}">${h.criteriaLog.length} change${h.criteriaLog.length === 1 ? '' : 's'} to the criteria${h.criteriaLog.some((l) => l.loosened) ? ', including loosening them after results (moved goalposts)' : ''}.</p>` : ''}
        <form class="inline" data-edit-form="${h.id}"><label>Describe <input type="number" min="1" name="minDescribing" value="${h.criteria.minDescribing}" style="width:70px" /></label> <label>of <input type="number" min="1" name="outOf" value="${h.criteria.outOf}" style="width:70px" /></label> <label>commit <input type="number" min="0" name="minCommits" value="${h.criteria.minCommits}" style="width:70px" /></label> <button class="sm">Change criteria</button></form>
        ${h.decision && h.decision.verdict !== 'continue' ? '' : html`<div class="inline" style="margin-top:6px"><button class="sm" data-decide="validated|${h.id}">Call it validated</button> <button class="sm" data-decide="continue|${h.id}">Keep testing</button> <button class="sm danger" data-decide="killed|${h.id}">Kill / pivot</button></div>`}
      </section>`; }) : html`<p class="empty">No hypotheses yet.</p>`}`;
}

export function bindHypotheses(root, ctx) {
  const s = ctx.state;
  on(root, 'input', '[data-hyp]', (e, el) => { hypDraft[el.dataset.hyp] = el.type === 'number' ? Number(el.value) : el.value; });
  on(root, 'change', '[data-hyp]', (e, el) => { hypDraft[el.dataset.hyp] = el.type === 'number' ? Number(el.value) : el.value; ctx.render(); });
  on(root, 'submit', '#hypForm', async (e) => {
    e.preventDefault();
    const d = { ...hypDraft, criteria: { minDescribing: hypDraft.minDescribing, outOf: hypDraft.outOf, withinDays: hypDraft.withinDays, minCommits: hypDraft.minCommits, commitLevel: hypDraft.commitLevel, minSpend: hypDraft.minSpend, strangersOnly: true } };
    const h = await ctx.act((st) => addHypothesis(st, d), { hours: HOURS.hyp, label: 'Write a hypothesis' });
    if (h) { hypDraft = { customer: '', problem: '', workaround: '', wtp: '', channel: hypDraft.channel, ...defaultCriteria() }; ctx.render(); }
  });
  on(root, 'submit', '[data-edit-form]', async (e, el) => {
    e.preventDefault();
    const f = new FormData(el);
    const out = await ctx.act((st) => editCriteria(st, el.dataset.editForm, { minDescribing: Number(f.get('minDescribing')), outOf: Number(f.get('outOf')), minCommits: Number(f.get('minCommits')) }), { hours: HOURS.edit, label: 'Change hypothesis criteria' });
    if (out?.movedGoalposts) toast('You loosened the bar after seeing results. That is moving the goalposts: if you build on a verdict it no longer tests, the market will show it.', 'warn');
  });
  on(root, 'click', '[data-decide]', (e, el) => { const [v, id] = el.dataset.decide.split('|'); ctx.act((st) => decideHypothesis(st, id, v), { hours: HOURS.decide, label: 'Hypothesis verdict' }); });
}

export const TABS = [['interviews', 'Interviews'], ['recruit', 'Recruit'], ['synthesis', 'Synthesis'], ['hypotheses', 'Hypotheses']];
