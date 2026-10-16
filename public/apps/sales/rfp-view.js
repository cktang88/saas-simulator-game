// CRM -> Bids: the formal RFP workflow (sales/rfp.js). A feed of open bids, the go/no-go checklist, written Q&A and
// addenda, the response (forms, compliance matrix, security questionnaire, price, references, summary), the
// compliance check, evaluation stages (demo, BAFO), award and the debrief / protest windows, plus the content
// library, credentials and cooperative contracts. Numbers marked [design] are game assumptions.
import { html, on, formData, badge, stat, toast } from '../../core/ui.js';
import { money, pct, fmtDate, words } from '../../core/util.js';
import { writingHours } from '../../core/calendar.js';
import { readOperator } from '../../core/operator.js';
import { adviceFor, reviewFor } from '../../core/advice.js';
import { getSegment } from './segments.js';
import * as R from './rfp.js';

const drafts = {}; // in-progress text survives the re-render after any other action
const draft = (bid, key, dflt = '') => drafts[`${bid.id}:${key}`] ?? dflt;
const TONE = { pass: 'good', warn: 'warn', fail: 'bad', unknown: '' };
const STATUS = {
  issued: ['Issued: decide', 'warn'], bidding: ['Building response', 'accent'], submitted: ['Submitted', 'accent'], shortlisted: ['Shortlisted', 'good'], bafo: ['BAFO requested', 'warn'], finalists: ['Finalists', 'accent'],
  notice_of_intent: ['Notice of intent', 'good'], negotiation: ['Contract negotiation', 'good'], board: ['Board approval', 'good'], awarded: ['Contract out', 'good'], won: ['Won', 'good'],
  lost: ['Lost', 'bad'], disqualified: ['Disqualified', 'bad'], no_bid: ['No-bid', ''], expired: ['Expired', ''], lapsed: ['Lapsed', 'bad'], superseded: ['Pilot path', ''],
};
const TRUTH = { full: ['live today', 'good'], partial: ['partly built', 'warn'], planned: ['planned', 'warn'], none: ['not built', 'bad'] };
const h = (n) => `${n < 1 ? Math.round(n * 60) + ' min' : (Math.round(n * 10) / 10) + ' h'}`;
const short = (s, n = 140) => (String(s).length > n ? `${String(s).slice(0, n)}…` : s);

export const bidsBadge = (s) => R.bidsOf(s).filter((b) => b.status === 'issued' || (['lost', 'disqualified'].includes(b.status) && !b.debrief && b.debriefBy != null && s.day <= b.debriefBy && b.submittedDay != null)).length;

function nextDate(s, b) {
  const d = { issued: b.dueDay, bidding: b.dueDay, submitted: b.evalDay, shortlisted: b.oralsDay, bafo: b.bafo?.dueDay, finalists: b.finalDay, notice_of_intent: b.nextDay, negotiation: b.nextDay, board: b.boardDay }[b.status];
  const label = { issued: 'due', bidding: 'due', submitted: 'evaluation ~', shortlisted: 'demo', bafo: 'BAFO due', finalists: 'decision ~', notice_of_intent: 'protest window ends', negotiation: 'contract ~', board: 'vote' }[b.status];
  return d != null ? `${label} ${fmtDate(s, d).replace(/, \d{4}$/, '')}` : '';
}

// ---- overview ----

export function bidsView(s, bidId) {
  const b = bidId ? R.bidById(s, bidId) : null;
  if (b) return bidDetail(s, b);
  const Rf = R.peekRfp(s);
  const st = R.rfpStats(s);
  const bids = Rf.bids;
  const open = bids.filter((x) => x.status === 'issued');
  const working = bids.filter((x) => !['issued', 'no_bid', 'expired', 'lapsed', 'superseded', 'won', 'lost', 'disqualified'].includes(x.status));
  const closed = bids.filter((x) => ['won', 'lost', 'disqualified', 'no_bid', 'expired', 'lapsed', 'superseded'].includes(x.status));
  const read = readOperator(s, 'rfp_bids');
  const rev = reviewFor(s, 'rfp_bids', read);
  return html`
    <section class="panel"><h2>Bids and RFPs</h2>
      <p>Public buyers and enterprises buy above a dollar threshold through a formal bid. Each bid response takes 20-40+ hours. Typical hours and timelines here follow the research notes in docs/research/rfp; items marked [design] are game assumptions, not statistics.</p>
      <div class="stats">
        ${stat('Open to decide', open.length, 'bid or no-bid', open.length ? 'warn' : '')}
        ${stat('In progress', working.length, 'building, evaluating, awarding')}
        ${stat('Win rate on bids taken', st.resolved ? pct(st.wins / st.resolved, 0) : '—', `${st.wins} of ${st.resolved} decided · industry average ~45% (survey, unverified)`)}
        ${stat('Hours on bids', `${Math.round(st.hours)} h`, st.wasted ? `${Math.round(st.wasted)} h on bids that were never winnable` : 'tracked per bid', st.wasted > 20 ? 'bad' : '')}
        ${stat('Content library', `${Rf.library.entries} answers`, `bids cost ×${R.libraryFactor(s).toFixed(2)} of the hours`)}
      </div>
      ${read.tier !== 'unknown' ? html`<div class="callout ${rev.tier ? (rev.tier === 'stellar' || rev.tier === 'good' ? 'good' : 'warn') : ''}"><b>${rev.tier ? `Bid discipline: ${rev.tier}.` : 'Bid record.'}</b> ${read.evidence.join(' · ')}${rev.items.length ? html`<ul class="small">${rev.items.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>` : ''}</div>` : ''}
      ${Rf.feedOn ? html`<p class="small">${badge('registered', 'good')} You are registered on state and local bid portals; new public bids appear below.</p>`
        : html`<div class="callout"><b>Find bids.</b> Register on state and local bid portals (vendor registration, free, ~${h(R.RFP.feedHours)}) to see open public RFPs. RFPs on your own deals arrive without registering. <button class="sm primary" data-rfp-register>Register (${h(R.RFP.feedHours)})</button></div>`}
    </section>
    <section class="panel"><h3>Open bids: decide</h3>
      ${open.length ? html`<div class="table-wrap"><table><thead><tr><th>Buyer</th><th>Scope</th><th>Questions due</th><th>Due</th><th>Budget</th><th>Est. hours</th><th></th></tr></thead><tbody>
        ${open.map((x) => html`<tr><td><b>${x.buyer}</b><div class="small muted">${x.source === 'deal' ? 'on your deal' : 'public bid'}</div></td><td class="small">${short(x.title, 70)}</td><td>${fmtDate(s, x.qDeadline).replace(/, \d{4}$/, '')}</td><td>${fmtDate(s, x.dueDay).replace(/, \d{4}$/, '')}</td><td class="small">${x.budgetKnown ? money(x.budget) : x.budgetHint ?? 'not stated'}</td><td>${Math.round(R.estimateHours(s, x))} h</td><td><a class="btn sm" href="#/crm/bids:${x.id}">Review</a></td></tr>`)}</tbody></table></div>`
        : html`<p class="empty">No open bids. ${Rf.feedOn ? 'New public bids arrive about once or twice a month once you have a product.' : 'Register on bid portals above.'}</p>`}
    </section>
    <section class="panel"><h3>Your bids</h3>
      ${working.length ? html`<div class="table-wrap"><table><thead><tr><th>Buyer</th><th>Status</th><th>Next</th><th>Hours</th><th></th></tr></thead><tbody>
        ${working.map((x) => html`<tr><td><b>${x.buyer}</b><div class="small muted">${short(x.title, 60)}</div></td><td>${badge(STATUS[x.status]?.[0] ?? x.status, STATUS[x.status]?.[1])}</td><td class="small">${nextDate(s, x)}</td><td>${x.hoursSpent.toFixed(1)} h</td><td><a class="btn sm" href="#/crm/bids:${x.id}">Open</a></td></tr>`)}</tbody></table></div>` : html`<p class="empty">Nothing in progress.</p>`}
    </section>
    ${closed.length ? html`<section class="panel"><h3>History</h3><div class="table-wrap"><table><thead><tr><th>Buyer</th><th>Result</th><th>Why</th><th>Hours</th><th>Debrief</th><th></th></tr></thead><tbody>
      ${closed.slice(0, 25).map((x) => html`<tr><td><b>${x.buyer}</b></td><td>${badge(STATUS[x.status]?.[0] ?? x.status, STATUS[x.status]?.[1])}</td><td class="small">${x.cause ? short(R.CAUSE_TEXT[x.cause] ?? x.cause, 80) : ''}</td><td>${x.hoursSpent.toFixed(1)} h</td>
        <td class="small">${x.debrief ? 'received' : ['lost', 'disqualified'].includes(x.status) && x.submittedDay != null ? (s.day <= x.debriefBy ? html`${badge(`ask by ${fmtDate(s, x.debriefBy).replace(/, \d{4}$/, '')}`, 'warn')}` : 'missed') : ''}</td><td><a class="btn sm" href="#/crm/bids:${x.id}">Open</a></td></tr>`)}</tbody></table></div></section>` : ''}
    ${credentialsPanel(s)}
    ${coopPanel(s)}`;
}

function credentialsPanel(s) {
  const Rf = R.peekRfp(s);
  const A = s.apps.crm.paperAssets ?? {};
  return html`<section class="panel"><h3>Credentials buyers ask for</h3>
    <p class="small muted">Buy or build them before the due date; SOC 2 and a DPA come from <a href="#/legal">Legal</a> and take months. Costs and hours are [design] estimates; the HECVAT workbook is a vendor estimate of 8-20 h.</p>
    <ul class="list small">${Object.entries(R.RFP.credentials).map(([id, c]) => {
      const st = Rf.creds[id];
      const have = A[c.asset] != null;
      const need = R.credentialHours(s, id);
      return html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span>${have ? '✅' : '⬜'} <b>${c.label}</b> ${have ? badge('have it', 'good') : st ? badge(`${st.progress}/${st.needed} h`, 'warn') : ''}<span class="muted"> ${c.usd ? `· ${money(c.usd)}` : ''} · ~${h(Array.isArray(c.hours) ? need : c.hours)}</span></span>
        ${have ? '' : html`<button class="sm" data-cred="${id}">Work ${h(Math.min(8, (st?.needed ?? need) - (st?.progress ?? 0)))}</button>`}</li>`;
    })}</ul></section>`;
}

function coopPanel(s) {
  const Rf = R.peekRfp(s);
  return html`<section class="panel"><h3>Cooperative contracts (Sourcewell, OMNIA, NASPO ValuePoint style)</h3>
    <p class="small">A lead agency runs one competitive solicitation; member agencies then buy off the contract <b>without their own RFP</b>. It is a listing, not a sale: expect ${R.COOP.hours[0]}-${R.COOP.hours[1]} h of proposal work, a ${Math.round(R.COOP.days[0] / 30)}-${Math.round(R.COOP.days[1] / 30)} month review, an administrative fee on every sale through it and a sales push afterwards. Hours, review time and odds are [design]; the NASPO fee is 0.25% on many state contracts (sourced), others are unverified.</p>
    ${Rf.coop.apps.length ? html`<ul class="list small">${Rf.coop.apps.map((a) => html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span><b>${a.name}</b> ${badge(a.status, a.status === 'awarded' ? 'good' : a.status === 'rejected' ? 'bad' : 'accent')} <span class="muted">${a.status === 'draft' ? `${a.progress}/${a.needed} h` : a.status === 'submitted' ? `decision ~${fmtDate(s, a.decisionDay).replace(/, \d{4}$/, '')}, odds ${Math.round(a.p * 100)}%` : ''} · fee ${(a.feePct * 100).toFixed(2)}%</span></span>
      ${a.status === 'draft' ? html`<span>${a.progress < a.needed ? html`<button class="sm" data-coop-work="${a.id}">Work ${h(Math.min(8, a.needed - a.progress))}</button>` : html`<button class="sm primary" data-coop-submit="${a.id}">Submit proposal (30 min)</button>`}</span>` : ''}</li>`)}</ul>` : ''}
    <div class="inline">${R.COOPS.map((c) => html`<button class="sm" data-coop-start="${c.id}" ${Rf.coop.apps.some((a) => a.coopId === c.id && a.status !== 'rejected') ? 'disabled' : ''} title="${c.feeNote}">Start ${c.name} (${(c.feePct * 100).toFixed(2)}% fee)</button>`)}</div></section>`;
}

// ---- one bid ----

function bidDetail(s, b) {
  const seg = getSegment(b.segmentId);
  const w = b.weightsStated || b.weightsKnown;
  return html`
    <p><a href="#/crm/bids">&larr; All bids</a></p>
    <section class="panel"><h2>${b.buyer}</h2>
      <p><b>${b.title}</b> ${badge(STATUS[b.status]?.[0] ?? b.status, STATUS[b.status]?.[1])} <span class="muted small">${seg?.label ?? ''} · ${b.source === 'deal' ? 'RFP required on your deal' : 'public bid'}</span></p>
      <p class="small">${b.scope}</p>
      <div class="stats">
        ${stat('Questions due', fmtDate(s, b.qDeadline).replace(/, \d{4}$/, ''), s.day <= b.qDeadline ? `${b.qDeadline - s.day} days left` : 'closed', s.day <= b.qDeadline && b.qDeadline - s.day <= 3 ? 'warn' : '')}
        ${stat('Response due', fmtDate(s, b.dueDay).replace(/, \d{4}$/, ''), 'by 4:30 pm; submit a day early', b.dueDay - s.day <= 3 && ['issued', 'bidding'].includes(b.status) ? 'bad' : '')}
        ${stat('Budget', b.budgetKnown ? money(b.budget) : b.budgetHint ?? 'not stated', b.budgetKnown ? 'confirmed in Q&A' : 'ask in the Q&A window')}
        ${stat('Your hours', `${b.hoursSpent.toFixed(1)} h`, `typical for this size: ${b.estHours[0]}-${b.estHours[1]} h [design]`)}
      </div>
      <p class="small">Evaluation: ${w ? Object.entries(b.weights).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ') : 'points are not stated in the RFP. Ask how it is weighted in the Q&A window.'}${b.localPct ? ` · local / small-business preference up to ${Math.round(b.localPct * 100)} points` : ''}. Pass/fail mandatory items are checked before scoring.</p>
      ${b.status === 'won' ? html`<div class="callout good">Won. ${b.overclaimsAtSubmit?.some((x) => x.severity >= 0.5) ? 'Your compliance matrix claimed more than the product did: expect the bill at implementation kickoff.' : ''}</div>` : ''}
    </section>
    ${['issued', 'bidding'].includes(b.status) ? goNoGoPanel(s, b) : ''}
    ${['issued', 'bidding'].includes(b.status) || b.questions.length ? qaPanel(s, b) : ''}
    ${b.status === 'bidding' ? responsePanel(s, b) : ''}
    ${['shortlisted'].includes(b.status) ? oralsPanel(s, b) : ''}
    ${b.status === 'bafo' ? bafoPanel(s, b) : ''}
    ${['submitted', 'finalists', 'notice_of_intent', 'negotiation', 'board', 'awarded'].includes(b.status) ? progressPanel(s, b) : ''}
    ${['lost', 'disqualified'].includes(b.status) ? lossPanel(s, b) : ''}
    ${b.submittedDay != null && !b.library ? html`<section class="panel"><h3>Content library</h3><p class="small">Save the vetted answers, forms and security answers from this response so the next bid costs less (answers that overclaimed are only half-saved).</p><button class="sm" data-rfp-lib="${b.id}">Save to library (${h(R.RFP.libraryHours)})</button></section>` : ''}
    ${b.hoursLog.length ? html`<section class="panel"><h3>Where the hours went</h3><p class="small">${b.hoursLog.map(([l, x]) => `${l} ${h(x)}`).join(' · ')}</p></section>` : ''}`;
}

function goNoGoPanel(s, b) {
  const g = R.goNoGo(s, b);
  const decided = b.status !== 'issued';
  return html`<section class="panel"><h3>Go / no-go</h3>
    <p class="small muted">Good bid teams check six things before spending 20-60 hours. 83% of teams run a go/no-go process (survey, unverified); the thresholds below are [design].</p>
    <ul class="list small">${g.items.map((i) => html`<li>${badge(i.status, TONE[i.status])} <b>${i.label}</b><div class="muted">${i.detail}</div></li>`)}</ul>
    <p>${badge(g.recommend === 'bid' ? 'Checklist says: bid' : 'Checklist says: no-bid', g.recommend === 'bid' ? 'good' : 'warn')} </p>${adviceFor(s, 'rfp_bids', [g.recommend === 'no_bid' ? 'No-bid this one, keep the 20-60 hours and write to the buyer to stay on the next one.' : 'The odds are still not guaranteed: even a strong response wins roughly half the time.']).map((a) => html`<p class="small muted">${a.text} (${a.from})</p>`)}
    ${decided ? '' : html`<div class="inline">${b.clue ? '' : html`<button class="sm" data-rfp-investigate="${b.id}">Call the buyer: is this a formality? (${h(R.RFP.investigateHours)})</button>`}
      <button class="sm primary" data-rfp-decide="${b.id}" data-d="bid">Bid (read the RFP, ${h(R.RFP.readHours)})</button>
      <button class="sm danger" data-rfp-decide="${b.id}" data-d="no_bid">No-bid (${h(R.RFP.noBidHours)})</button></div>`}</section>`;
}

function qaPanel(s, b) {
  const open = s.day <= b.qDeadline && ['issued', 'bidding'].includes(b.status);
  return html`<section class="panel"><h3>Written Q&A and addenda</h3>
    ${open ? html`<form data-rfp-ask="${b.id}"><label>Question to the buyer (${R.RFP.questionHours * 60} min) · deadline ${fmtDate(s, b.qDeadline).replace(/, \d{4}$/, '')}
      <textarea name="q" rows="2" placeholder="e.g. Requirement R-04 lists role-based access as mandatory; would two permission levels be acceptable?">${draft(b, 'q')}</textarea></label>
      <button class="sm">Submit question</button>
      <p class="hint">Answers go to every bidder. Specific questions about budget, evaluation weights, a numbered requirement or the incumbent get useful answers; "can you extend the deadline?" and pitches get "refer to the RFP".</p></form>` : html`<p class="small muted">The question deadline has passed.</p>`}
    ${b.questions.length ? html`<ul class="list small">${b.questions.map((q) => html`<li>${badge(q.kind, q.score >= 0.55 ? 'good' : 'warn')} ${q.text}${q.answered ? html`<div class="muted">Answer: ${q.answer}</div>` : html`<div class="muted">Answer expected ${fmtDate(s, b.answerDay).replace(/, \d{4}$/, '')} in an addendum. ${q.issues.length ? `Feedback: ${q.issues[0]}` : ''}</div>`}</li>`)}</ul>` : ''}
    ${b.addenda.map((a) => html`<div class="callout ${a.acked ? '' : 'warn'}"><b>Addendum ${a.no}</b> (${fmtDate(s, a.day).replace(/, \d{4}$/, '')}) <div class="small" style="white-space:pre-wrap">${a.text}</div>
      ${a.acked ? html`<span class="small muted">acknowledged</span>` : b.status === 'bidding' ? html`<button class="sm" data-rfp-ack="${b.id}" data-add="${a.id}">Sign acknowledgement (${h(R.RFP.addendumHours)})</button> <span class="small">An unsigned addendum can get the response thrown out.</span>` : html`<span class="small">Decide to bid before acknowledging.</span>`}</div>`)}
  </section>`;
}

function responsePanel(s, b) {
  const cands = R.referenceCandidates(s, b);
  const rs = b.response;
  const lacking = b.reqs.filter((r) => r.cert && R.reqTruth(s, r) === 'none' && R.RFP.credentials[r.cert]);
  const sec = rs.security;
  const priceRatio = (rs.price ?? b.listPrice) / b.budget;
  const mh = R.matrixHours(s, b);
  const over = R.overclaims(s, b).length;
  return html`
    <section class="panel"><h3>1. Mandatory forms</h3>
      <ul class="list small">${b.forms.map((f) => html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span>${f.done ? '✅' : '⬜'} <b>${f.label}</b> ${f.optional ? badge('optional points', 'accent') : badge('required', 'warn')}</span>
        ${f.done ? '' : html`<button class="sm" data-rfp-form="${b.id}" data-form="${f.id}">Complete (${h(R.formHours(s, b, f.id))})</button>`}</li>`)}
        <li>${R.unackedAddenda(b).length ? '⬜' : '✅'} <b>Signed addenda acknowledgements</b> ${badge('required', 'warn')} <span class="muted">${b.addenda.length} issued, ${R.unackedAddenda(b).length} unsigned</span></li></ul>
      ${lacking.length ? html`<p class="small warn">Missing credentials: ${lacking.map((r) => r.text).join('; ')}. Get them under Credentials on the Bids page.</p>` : ''}
      <p class="hint">Buyers waive a missing form as a minor informality only ~15% of the time [design]; the rest are non-responsive.</p></section>
    <section class="panel"><h3>2. Compliance matrix</h3>
      <p class="small muted">Answer every requirement: Comply (live today), Partial, Roadmap (dated and committed) or No. Buyers check these against the demo and the contract. A "No" or "Roadmap" on a mandatory item fails pass/fail screening. Answering Comply on something you have not built raises your score now, and the bill arrives at implementation kickoff: service credits, rework hours, a buyer that may terminate, sometimes a claim.</p>
      <form data-rfp-matrix="${b.id}"><div class="table-wrap"><table><thead><tr><th></th><th>Requirement</th><th>Weight</th><th>Your product today</th><th>Your answer</th></tr></thead><tbody>
        ${b.reqs.map((r) => { const t = R.reqTruth(s, r); const cur = rs.matrix[r.id] ?? ''; const sev = cur ? R.overclaimSeverity(cur, t) : 0; return html`<tr><td>${r.n}</td><td class="small">${r.text} ${r.mandatory ? badge('mandatory', 'warn') : ''} ${r.loosened ? badge('relaxed by addendum', 'good') : ''}</td><td>${r.weight}</td><td>${badge(TRUTH[t][0], TRUTH[t][1])}</td>
          <td><select name="${r.id}"><option value="">-</option>${Object.entries(R.ANSWERS).map(([k, l]) => html`<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`)}</select>${sev >= 0.5 ? html` ${badge('claims more than you have', 'bad')}` : ''}</td></tr>`; })}</tbody></table></div>
        <button class="sm">Save matrix (${h(rs.matrix && Object.keys(rs.matrix).length ? 0.25 : mh)})</button>${over ? html` <span class="small warn">${over} answer(s) claim more than the product does.</span>` : ''}</form></section>
    <section class="panel"><h3>3. Security questionnaire (${b.securityKind === 'hecvat' ? 'HECVAT' : b.securityKind === 'sig_lite' ? 'SIG Lite' : b.securityKind === 'caiq' ? 'CAIQ' : 'security form'})</h3>
      ${!b.securityRequired ? html`<p class="small">Not required.</p>` : sec?.done ? html`<p>✅ Complete.</p>` : html`<p class="small">About ${h(sec?.needed ?? R.securityHoursNeeded(s, b))} of work${s.apps.legal?.soc2 === 'type2' ? ' (your SOC 2 report answers most of it)' : R.peekRfp(s).library.entries >= R.RFP.libraryAt ? ' (your content library answers some of it)' : ' the first time: 20-40 h for SIG/CAIQ, 8-20 h for HECVAT (vendor estimates); SOC 2 or a library cuts it to 1-8 h'}. Progress ${sec?.progress ?? 0}/${sec?.needed ?? R.securityHoursNeeded(s, b)} h. Without it your technical score is cut by a fifth.</p>
        <button class="sm" data-rfp-sec="${b.id}">Work ${h(Math.min(8, (sec?.needed ?? R.securityHoursNeeded(s, b)) - (sec?.progress ?? 0)))}</button>`}</section>
    <section class="panel"><h3>4. Pricing form</h3>
      <form data-rfp-price="${b.id}" class="inline"><label>Annual price ($) <input type="number" name="price" min="1" value="${rs.price ?? Math.round(b.listPrice)}" /></label><button class="sm">${rs.pricingDone ? 'Update' : 'Fill the form'} (${h(rs.pricingDone ? R.RFP.repriceHours : R.RFP.pricingHours)})</button></form>
      <p class="small">List price ${money(b.listPrice)} · ${b.budgetKnown ? `their budget is ${money(b.budget)}` : b.budgetHint ? `they hint ${b.budgetHint}` : 'budget not stated'} · your cost floor ≈ ${money(b.floor)} a year (hosting, support, implementation) [design]. ${rs.pricingDone && (b.budgetKnown || b.budgetHint) ? `Priced at ${Math.round(priceRatio * 100)}% of their budget.` : ''} Price scores fall quickly above the budget; cutting below your floor loses money every year.</p></section>
    <section class="panel"><h3>5. References</h3>
      ${cands.length ? html`<form data-rfp-refs="${b.id}"><ul class="list small">${cands.map((c) => html`<li><label style="margin:0"><input type="checkbox" name="${c.id}" ${rs.refs.includes(c.id) ? 'checked' : ''} /> ${c.name} ${c.same ? badge('same segment', 'good') : c.group ? badge('similar segment', 'accent') : ''} <span class="muted">health ${c.health ?? '?'}/100${c.tickets ? ` · ${c.tickets} open ticket${c.tickets > 1 ? 's' : ''}` : ''}${c.referenceable ? ' · agreed to be a reference' : ''}</span></label></li>`)}</ul>
        <p class="hint">The evaluators will call them. An unhappy or at-risk account tells them so; check health, usage and open tickets, and brief each one first.</p>
        <button class="sm">List as references (${h(R.RFP.refHours)}, calls to ask permission)</button></form>${b.refCalls ? html`<p class="small">Reference calls: ${b.refCalls.calls.map((x) => `${x.name}: ${x.outcome}`).join(' · ') || 'none'} (${b.refCalls.points >= 0 ? '+' : ''}${b.refCalls.points} points)</p>` : ''}` : html`<p class="small warn">You have no paying customers to name. With no references the experience score is zero.</p>`}</section>
    <section class="panel"><h3>6. Executive summary and approach</h3>
      <form data-rfp-summary="${b.id}"><textarea name="text" rows="9" placeholder="Name ${b.buyer}, restate their problem in their words, give numbers, an implementation timeline and who runs it.">${draft(b, 'summary', rs.summary?.text ?? '')}</textarea>
        <div class="small muted" id="summaryMeta">${words(draft(b, 'summary', rs.summary?.text ?? ''))} words · limit ${b.pageLimit} pages (~${b.pageLimit * 450} words)</div>
        <button class="sm">Save and judge (${h(R.RFP.summaryHours)})</button></form>
      ${rs.summary ? html`<p class="small">${badge(rs.summary.boilerplate ? 'reads as boilerplate' : rs.summary.score >= 0.6 ? 'specific' : 'generic', rs.summary.boilerplate ? 'bad' : rs.summary.score >= 0.6 ? 'good' : 'warn')} ${rs.summary.issues.join(' ')} <span class="muted">(offline heuristic judge)</span></p>` : ''}</section>
    <section class="panel"><h3>7. Compliance check and submit</h3>
      <p class="small">An hour spent checking forms, addenda, page limits and mandatory items removes the most common reason bids are thrown out (about 4-15% of public responses are disqualified, dated figures). Submit at least a day early: uploads fail on the last day.</p>
      <div class="inline"><button class="sm" data-rfp-check="${b.id}">Run the compliance check (${h(R.RFP.checkHours)})</button>
        <button class="sm primary" data-rfp-submit="${b.id}">Submit the response (${h(R.RFP.submitHours)})</button></div>
      ${b.lastCheck ? (b.lastCheck.problems.length ? html`<div class="callout warn"><b>Found ${b.lastCheck.problems.length} problem(s) (${fmtDate(s, b.lastCheck.day).replace(/, \d{4}$/, '')}):</b><ul class="small">${b.lastCheck.problems.map((p) => html`<li>${p.text}</li>`)}</ul></div>` : html`<div class="callout good">The check found nothing to fix.</div>`) : html`<p class="hint">You have not run the check. Submitting now sends the response exactly as it stands.</p>`}
    </section>`;
}

function oralsPanel(s, b) {
  return html`<section class="panel"><h3>Demo / orals ${fmtDate(s, b.oralsDay).replace(/, \d{4}$/, '')}</h3>
    <p class="small">You are one of ${R.RFP.shortlist} on the shortlist [design]. They gave you scenarios to show; a scripted demo on their scenarios, in their order, with time for questions beats a product tour. Anything you answered "Comply" can be asked to be shown live.</p>
    <ol class="small">${b.scenarios.map((x) => html`<li>${x}</li>`)}</ol>
    ${b.orals ? html`<p class="small">${badge(`script covers ${Math.round(b.orals.cover * 100)}% of the scenarios`, b.orals.cover >= 0.66 ? 'good' : 'warn')} You can rewrite it before the day.</p>` : html`<p class="small warn">No script yet: an unprepared demo costs points.</p>`}
    <form data-rfp-orals="${b.id}"><textarea name="plan" rows="6" placeholder="One section per scenario with timing, who presents, and what you will not claim.">${draft(b, 'orals', b.orals?.plan ?? '')}</textarea><button class="sm">Save the demo script (${h(R.RFP.oralsPrepHours)})</button></form></section>`;
}

function bafoPanel(s, b) {
  const base = b.response.price ?? b.listPrice;
  return html`<section class="panel"><h3>Best and final offer (due ${fmtDate(s, b.bafo.dueDay).replace(/, \d{4}$/, '')})</h3>
    <p class="small">Finalists may sharpen price. Your price is ${money(base)}; your cost floor is ≈ ${money(b.floor)}. Trading term or prepayment for price protects margin; a cut below the floor loses money every year of the contract and is logged as a mistake. Skipping the BAFO gives ground to finalists who cut.</p>
    ${b.bafo.submittedDay != null ? html`<p>Sent: ${money(b.bafo.price)} (${Math.round(b.bafo.cutPct * 100)}% cut). Awaiting the decision.</p>` : html`<form data-rfp-bafo="${b.id}" class="inline"><label>Price cut % <input type="number" name="cut" min="0" max="60" value="5" /></label><label>What you ask in return <input name="term" placeholder="three-year term, annual prepay" /></label><button class="sm primary">Send BAFO (${h(R.RFP.bafoHours)})</button></form>`}</section>`;
}

function progressPanel(s, b) {
  const msg = {
    submitted: `Submitted ${fmtDate(s, b.submittedDay).replace(/, \d{4}$/, '')}. Mandatory items and forms are screened, then evaluators score it (about ${fmtDate(s, b.evalDay).replace(/, \d{4}$/, '')}). Nothing to do but be ready for a demo request.`,
    finalists: `You are in the final round. A decision is expected around ${fmtDate(s, b.finalDay).replace(/, \d{4}$/, '')}.`,
    notice_of_intent: `Notice of intent to award to you. ${b.public ? `Protest window until ${fmtDate(s, b.protestEnds).replace(/, \d{4}$/, '')}: a losing bidder could protest (about 14% of protests that are decided are sustained).` : 'Contract negotiation is next.'}`,
    negotiation: `Contract negotiation until about ${fmtDate(s, b.nextDay).replace(/, \d{4}$/, '')}. Legal may send redlines (Legal -> Contracts).`,
    board: `Council or board vote on ${fmtDate(s, b.boardDay).replace(/, \d{4}$/, '')}. Public buyers wait for the next meeting; an item can slip a month.`,
    awarded: `Contract out for signature at ${money(b.finalPrice ?? b.listPrice)} a year. Signing creates the customer in Payments.`,
  }[b.status];
  return html`<section class="panel"><h3>Where it stands</h3><p>${msg}</p>${b.eval?.parts ? html`<p class="small muted">Evaluators' scores are not shared until the award; a losing bidder can request a debrief.</p>` : ''}${b.demo?.caught?.length ? html`<p class="small warn">The panel asked to see ${b.demo.caught.join(', ')} live and the product could not do it as answered.</p>` : ''}</section>`;
}

function lossPanel(s, b) {
  const can = b.submittedDay != null || b.status === 'disqualified';
  const inWindow = b.debriefBy != null && s.day <= b.debriefBy;
  const d = b.debrief;
  return html`<section class="panel"><h3>${b.status === 'disqualified' ? 'Disqualified' : 'Lost'}</h3>
    ${b.cause ? html`<p><b>Reason:</b> ${R.CAUSE_TEXT[b.cause] ?? b.cause}</p>` : ''}
    ${d ? html`<div class="callout"><b>Debrief</b>
      ${d.scores ? html`<ul class="small">${d.lines.map((l) => html`<li>${l}</li>`)}</ul><p class="small">Total ${d.total != null ? d.total.toFixed(0) : '—'}/100${d.rank ? ` · ranked ${d.rank} of ${d.field ?? '?'}` : ''}${d.winnerScore ? ` · winner scored ${Math.round(d.winnerScore)}` : ''}.</p>` : html`<ul class="small">${d.lines.map((l) => html`<li>${l}</li>`)}</ul>`}
      ${(() => { const adv = adviceFor(s, 'rfp_bids', d.advice ?? []); return adv.length ? html`<p class="small"><b>Next steps your advisors suggest:</b></p><ul class="small">${adv.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>` : ''; })()}</div>`
      : can ? (inWindow ? html`<div class="callout warn"><b>Request the debrief by ${fmtDate(s, b.debriefBy).replace(/, \d{4}$/, '')}.</b> Buyers share real scores and the reason inside about ${R.RFP.debriefDays} days; after that it rarely happens and the next response repeats the mistake. <button class="sm primary" data-rfp-debrief="${b.id}">Request the debrief (${h(R.RFP.debriefHours)})</button></div>`
        : html`<p class="small warn">The debrief window closed on ${fmtDate(s, b.debriefBy).replace(/, \d{4}$/, '')}.</p>`) : ''}
    ${b.public && can && !b.protest && s.day <= (b.protestBy ?? -1) ? html`<p class="small">Protest window until ${fmtDate(s, b.protestBy).replace(/, \d{4}$/, '')}. <button class="sm danger" data-rfp-protest="${b.id}">File a protest (${h(R.RFP.protestHours)} + $${R.RFP.protestUsd[0].toLocaleString('en-US')}-${R.RFP.protestUsd[1].toLocaleString('en-US')} counsel)</button> It succeeds about 1 time in 7 and only when the evaluation broke its own rules.</p>` : ''}
    ${b.protest ? html`<p class="small">Protest filed: ${b.protest.sustained ? 'sustained' : 'denied'}.</p>` : ''}</section>`;
}

// ---- wiring ----

export function wireBids(root, ctx) {
  const bid = (el) => R.bidById(ctx.state, el.dataset.rfpDecide ?? el.dataset.rfpInvestigate ?? el.dataset.rfpAck ?? el.dataset.rfpForm ?? el.dataset.rfpSec ?? el.dataset.rfpCheck ?? el.dataset.rfpSubmit ?? el.dataset.rfpLib ?? el.dataset.rfpDebrief ?? el.dataset.rfpProtest);
  on(root, 'input', 'textarea', (e) => {
    const f = e.target.closest('form');
    const id = f?.dataset.rfpAsk ?? f?.dataset.rfpSummary ?? f?.dataset.rfpOrals;
    if (!id) return;
    drafts[`${id}:${f.dataset.rfpAsk ? 'q' : f.dataset.rfpSummary ? 'summary' : 'orals'}`] = e.target.value;
    const meta = root.querySelector('#summaryMeta');
    if (meta && f.dataset.rfpSummary) { const b = R.bidById(ctx.state, id); meta.textContent = `${words(e.target.value)} words · limit ${b.pageLimit} pages (~${b.pageLimit * 450} words)`; }
  });
  on(root, 'click', '[data-rfp-register]', () => ctx.act((st) => { R.registerFeed(st); toast('Registered. New public bids will appear in the feed.', 'good'); }, { hours: R.RFP.feedHours, label: 'Registering on bid portals' }));
  on(root, 'click', '[data-rfp-investigate]', (e, el) => ctx.act((st) => { const c = R.investigate(st, bid(el)); toast(c.text, c.likelyWired ? 'warn' : 'good'); }, { hours: R.RFP.investigateHours, label: 'Calling the buyer about an RFP' }));
  on(root, 'click', '[data-rfp-decide]', (e, el) => {
    const d = el.dataset.d;
    ctx.act((st) => { const b = bid(el); R.decideBid(st, b, d); toast(d === 'bid' ? 'You are bidding. Questions and addenda first, then the response.' : 'No-bid: you kept your hours.', d === 'bid' ? 'info' : 'good'); }, { hours: d === 'bid' ? R.RFP.readHours : R.RFP.noBidHours, label: d === 'bid' ? 'Reading an RFP' : 'RFP no-bid' });
  });
  on(root, 'submit', '[data-rfp-ask]', async (e) => {
    e.preventDefault();
    const text = e.target.q.value;
    const b = R.bidById(ctx.state, e.target.dataset.rfpAsk);
    await ctx.act(async (st) => {
      const bb = R.bidById(st, b.id);
      const judged = ctx.llm?.ask ? await R.judgeQuestionLlm(ctx.llm, st, bb, text) : null; // optional; falls back to the offline heuristic
      const q = R.askQuestion(st, bb, text, judged);
      drafts[`${bb.id}:q`] = '';
      toast(q.score >= 0.55 ? 'Specific question sent. Answers come in an addendum.' : (q.issues[0] ?? 'Sent.'), q.score >= 0.55 ? 'good' : 'warn');
    }, { hours: R.RFP.questionHours, label: 'RFP Q&A' });
  });
  on(root, 'click', '[data-rfp-ack]', (e, el) => ctx.act((st) => { R.ackAddendum(st, bid(el), el.dataset.add); }, { hours: R.RFP.addendumHours, label: 'Acknowledging an addendum' }));
  on(root, 'click', '[data-rfp-form]', (e, el) => { const b = bid(el); ctx.act((st) => { R.completeForm(st, R.bidById(st, b.id), el.dataset.form); }, { hours: R.formHours(ctx.state, b, el.dataset.form), label: 'RFP forms' }); });
  on(root, 'submit', '[data-rfp-matrix]', (e) => {
    e.preventDefault();
    const b = R.bidById(ctx.state, e.target.dataset.rfpMatrix);
    const f = formData(e.target);
    const answers = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    const first = !Object.keys(b.response.matrix).length;
    ctx.act((st) => { const r = R.answerMatrix(st, R.bidById(st, b.id), answers); if (r.overclaims) toast(`${r.overclaims} answer(s) claim more than you have built. That raises the score now and the bill comes at kickoff.`, 'warn'); }, { hours: first ? R.matrixHours(ctx.state, b) : 0.25, label: 'RFP compliance matrix' });
  });
  on(root, 'click', '[data-rfp-sec]', (e, el) => { const b = bid(el); const sec = b.response.security; const need = (sec?.needed ?? R.securityHoursNeeded(ctx.state, b)) - (sec?.progress ?? 0); const hrs = Math.min(8, need); ctx.act((st) => { const done = R.workSecurity(st, R.bidById(st, b.id), hrs); if (done) toast('Security questionnaire complete.', 'good'); }, { hours: hrs, label: 'RFP security questionnaire' }); });
  on(root, 'submit', '[data-rfp-price]', (e) => { e.preventDefault(); const b = R.bidById(ctx.state, e.target.dataset.rfpPrice); const price = formData(e.target).price; ctx.act((st) => { R.setPrice(st, R.bidById(st, b.id), price); }, { hours: b.response.pricingDone ? R.RFP.repriceHours : R.RFP.pricingHours, label: 'RFP pricing form' }); });
  on(root, 'submit', '[data-rfp-refs]', (e) => { e.preventDefault(); const b = R.bidById(ctx.state, e.target.dataset.rfpRefs); const ids = Object.entries(formData(e.target)).filter(([, v]) => v === true).map(([k]) => k); ctx.act((st) => { R.chooseReferences(st, R.bidById(st, b.id), ids); }, { hours: R.RFP.refHours, label: 'RFP references' }); });
  on(root, 'submit', '[data-rfp-summary]', (e) => {
    e.preventDefault();
    const b = R.bidById(ctx.state, e.target.dataset.rfpSummary);
    const text = e.target.text.value;
    ctx.act((st) => { const j = R.writeSummary(st, R.bidById(st, b.id), text); toast(j.boilerplate ? 'That reads as boilerplate.' : 'Summary saved.', j.boilerplate ? 'warn' : 'good'); }, { hours: writingHours(ctx.state, R.RFP.summaryHours), label: 'RFP executive summary' });
  });
  on(root, 'click', '[data-rfp-check]', (e, el) => ctx.act((st) => { const p = R.runComplianceCheck(st, bid(el)); toast(p.length ? `${p.length} problem(s) found.` : 'Clean: nothing found.', p.length ? 'warn' : 'good'); }, { hours: R.RFP.checkHours, label: 'RFP compliance check' }));
  on(root, 'click', '[data-rfp-submit]', (e, el) => ctx.act((st) => { const b = R.submitBid(st, bid(el)); toast(b.submission.problems.length ? 'Submitted with open problems. Evaluators will find them.' : 'Submitted.', b.submission.problems.length ? 'warn' : 'good'); }, { hours: R.RFP.submitHours, label: 'Submitting an RFP response' }));
  on(root, 'click', '[data-rfp-lib]', (e, el) => ctx.act((st) => { const r = R.addToLibrary(st, bid(el)); toast(`${r.added} answers saved; bids now cost ×${r.factor.toFixed(2)} of the hours.`, 'good'); }, { hours: R.RFP.libraryHours, label: 'RFP content library' }));
  on(root, 'submit', '[data-rfp-orals]', (e) => { e.preventDefault(); const b = R.bidById(ctx.state, e.target.dataset.rfpOrals); const plan = e.target.plan.value; ctx.act((st) => { R.prepareOrals(st, R.bidById(st, b.id), plan); }, { hours: R.RFP.oralsPrepHours, label: 'Preparing an RFP demo' }); });
  on(root, 'submit', '[data-rfp-bafo]', (e) => {
    e.preventDefault();
    const b = R.bidById(ctx.state, e.target.dataset.rfpBafo);
    const f = formData(e.target);
    ctx.act((st) => { const r = R.submitBafo(st, R.bidById(st, b.id), { cutPct: (f.cut ?? 0) / 100, term: f.term }); toast(r.belowCost ? 'That is below your cost floor: you lose money every year if you win.' : 'BAFO sent.', r.belowCost ? 'bad' : 'good'); }, { hours: R.RFP.bafoHours, label: 'RFP best and final offer' });
  });
  on(root, 'click', '[data-rfp-debrief]', (e, el) => ctx.act((st) => { const d = R.requestDebrief(st, bid(el)); toast(`Debrief: ${d.reason}`, 'info'); }, { hours: R.RFP.debriefHours, label: 'RFP debrief' }));
  on(root, 'click', '[data-rfp-protest]', (e, el) => ctx.act((st) => { const p = R.fileProtest(st, bid(el)); toast(p.sustained ? 'Protest sustained: re-evaluation.' : 'Protest denied.', p.sustained ? 'good' : 'bad'); }, { hours: R.RFP.protestHours, label: 'RFP protest' }));
  on(root, 'click', '[data-cred]', (e, el) => { const id = el.dataset.cred; const st0 = R.peekRfp(ctx.state).creds[id]; const need = (st0?.needed ?? R.credentialHours(ctx.state, id)) - (st0?.progress ?? 0); const hrs = Math.min(8, need); ctx.act((st) => { const done = R.workCredential(st, id, hrs); if (done) toast(`${R.RFP.credentials[id].label}: done.`, 'good'); }, { hours: hrs, label: 'RFP credentials' }); });
  on(root, 'click', '[data-coop-start]', (e, el) => ctx.act((st) => { R.startCoop(st, el.dataset.coopStart); }, { hours: 1, label: 'Cooperative contract application' }));
  on(root, 'click', '[data-coop-work]', (e, el) => { const a = R.peekRfp(ctx.state).coop.apps.find((x) => x.id === el.dataset.coopWork); const hrs = Math.min(8, a.needed - a.progress); ctx.act((st) => { R.workCoop(st, a.id, hrs); }, { hours: hrs, label: 'Cooperative contract proposal' }); });
  on(root, 'click', '[data-coop-submit]', (e, el) => ctx.act((st) => { const a = R.submitCoop(st, el.dataset.coopSubmit); toast(`Submitted. A decision takes months.`, 'info'); }, { hours: 0.5, label: 'Cooperative contract proposal' }));
}

/** Deal panel box for a deal in a formal bid. */
export function dealBidBox(s, deal) {
  const b = deal.rfpBidId ? R.bidById(s, deal.rfpBidId) : null;
  if (!b || b.status === 'superseded') return null;
  return html`<div class="callout ${b.status === 'issued' ? 'warn' : ''}"><b>Formal RFP.</b> ${badge(STATUS[b.status]?.[0] ?? b.status, STATUS[b.status]?.[1])} ${nextDate(s, b)} · ${b.hoursSpent.toFixed(1)} h so far. ${b.status === 'issued' ? 'Decide bid or no-bid first.' : ''} <a class="btn sm" href="#/crm/bids:${b.id}">Open the bid</a></div>`;
}
