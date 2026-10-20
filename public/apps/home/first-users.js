// "Get your first users": the early-customer workflow as one ordered checklist on Home. Each step says where the work
// happens (deep link), how the tool works, what moves the odds in the simulation, what it costs in founder hours and
// money, and what happens next and when. Steps tick themselves from real game state; a step whose tool is still
// closed gets an "Open" button (the founder's request, same as Todos → Open). It describes the workflow and the
// levers; it does not say what to write or decide (ARCHITECTURE principle 7: that stays the player's job).
// Numbers are the ones the tools already use: intro odds from data/inbound-archetypes.js (INTRO_FUNNEL), recruiting
// costs from apps/product/interview.js (RECRUIT, calibration.md R7), outbound from apps/sales/params.js.

import { html } from '../../core/ui.js';
import { isAppUnlocked, isTabUnlocked, appOfKey, requestNode, expandKey, NODE_BY_ID } from '../../core/unlocks.js';

const A = (s, k) => s.apps?.[k] ?? {};
const len = (x) => (Array.isArray(x) ? x.length : 0);
const realIv = (s) => (A(s, 'research').interviews ?? []).filter((i) => i.real && i.status === 'done').length;
const contacts = (s) => (A(s, 'crm').contacts ?? []).filter((c) => !c.hidden).length;
const customerIntros = (s) => (s.network?.intros ?? []).filter((i) => i.kind === 'customer').length;
const introAsks = (s) => (s.network?.people ?? []).reduce((a, p) => a + len(p.asks), 0);
const shipped = (s) => (A(s, 'product').features ?? []).some((f) => f.status === 'shipped') || A(s, 'outcomes').firstShipDay != null;
const charged = (s) => A(s, 'outcomes').firstChargeDay != null || (s.stripe?.charges ?? []).some((c) => c.status === 'succeeded' || c.paid);
const emailsSent = (s) => (A(s, 'outreach').enrollments ?? []).filter((e) => len(e.sent) > 0).length;
const liTouches = (s) => len(A(s, 'outreach').linkedin?.requests) + len(A(s, 'outreach').linkedin?.messages);
const inboundAccepted = (s) => (A(s, 'crm').inboundQueue ?? []).filter((q) => q.status === 'accepted').length;
const callsHeld = (s) => (A(s, 'calls').meetings ?? []).filter((m) => ['held', 'done'].includes(m.status)).length;
const deals = (s) => A(s, 'crm').deals ?? [];
const commitments = (s) => {
  const asks = (A(s, 'crm').presell?.asks ?? []).filter((a) => a.level !== 'verbal' && a.outcome === 'committed').length;
  const pilots = deals(s).filter((d) => d.pilot).length;
  // Interview commitments live on the grade (research/read.js), like every other reader of them.
  const iv = (A(s, 'research').interviews ?? []).filter((i) => i.real && (i.grade?.commitments ?? i.commitments ?? []).some((c) => ['pilot', 'loi', 'preorder'].includes(c))).length;
  return asks + pilots + iv;
};

const WHO = {
  id: 'who', title: 'Write down who it is for', go: 'settings', where: 'Settings', node: 'idea',
  done: (s) => Boolean(s.company?.oneLiner?.trim() && s.company?.icp?.trim()),
  progress: (s) => (s.company?.oneLiner?.trim() ? (s.company?.icp?.trim() ? '' : 'One-liner done; ideal customer profile missing') : 'No one-liner yet'),
  how: 'Settings → Company: a one-liner (what you sell to whom) and an ideal customer profile (role, company type and size, the trigger that makes them look for a fix).',
  levers: 'Every judge reads these: interviewees, prospects, the landing-page panel and investors. A vague profile makes every later step noisier.',
  cost: 'About 30 minutes. Free.',
  next: 'Nothing visible happens; it changes how every later conversation is judged.',
};
const DISCOVERY = (b2c) => ({
  id: 'discovery', title: 'Have 5 real conversations about the problem', go: 'research', where: 'Interviews', node: 'discovery',
  done: (s) => realIv(s) >= 5, progress: (s) => `${realIv(s)}/5 real conversations done`,
  how: `Interviews → Recruit: write who you want to talk to and a short screener, pick a channel (${b2c ? 'communities are the usual source for consumer products' : 'warm network, LinkedIn, communities, cold email, a paid panel'}) and send a batch. People who agree appear as scheduled calls under Interviews; on the day open the call and interview them by typing. Conversations you have with real people outside the game can be logged there too. AI-persona rehearsals are practice and never count as evidence.`,
  levers: 'Questions about the last time the problem happened, what they use today and what it costs them; asking for a next step (intro, pilot, deposit) at the end. Pitching and hypotheticals produce compliments.',
  cost: 'About 2–3.5 h of your time per completed interview all-in (outreach, scheduling, a 45-minute call, notes). Paid panels add a platform fee and an incentive per call.',
  next: 'Warm contacts reply within 1–4 days, cold ones 3–10. Some do not show up. Calls appear in Interviews and on your Calendar.',
});
const PAGE = (optional) => ({
  id: 'page', title: 'Put up a simple landing page', go: 'website', where: 'Website', node: 'website', optional,
  done: (s) => Boolean(s.company?.website), progress: (s) => (s.company?.website ? '' : 'No page yet'),
  how: 'Website: point it at your real URL, upload HTML or paste the copy, then run the customer panel to see how buyers read it.',
  levers: 'Whether a visitor from your ICP understands in seconds who it is for, what changes for them and what to do next.',
  cost: 'A few hours to write; the panel read takes 1 h.',
  next: `The panel verdict is immediate. ${optional ? 'Prospects you contact look you up; ' : ''}every channel later converts on this page.`,
});

const B2B = [
  WHO,
  { id: 'network', title: 'Ask your network for intros to people with the problem', go: 'messages/contacts', where: 'Messages → Your network', node: 'network',
    done: (s) => customerIntros(s) > 0, progress: (s) => `${introAsks(s)} intro asks · ${customerIntros(s)} customer intros made`,
    how: 'Messages → Your network → Text. Say who you want to meet and include a 2–3 sentence blurb they can forward as-is.',
    levers: 'Tie strength: close ties make the intro about 75–90% of the time, people you worked with 45–65%, weak ties 15–30%. A forwardable blurb helps; asking the same person again within 90 days lowers the odds.',
    cost: '5–25 minutes per text. Free.',
    next: 'Replies come within a day. An intro arrives as an email in Mail and as a lead in CRM → Inbound; accepting it creates the deal and you reply in Mail. Warm intros go cold within days.' },
  DISCOVERY(false),
  { id: 'list', title: 'Build a list of 10+ prospects who match your profile', go: 'crm/prospects', where: 'CRM → Prospects', node: 'crm',
    done: (s) => contacts(s) >= 10, progress: (s) => `${contacts(s)}/10 prospects in the CRM`,
    how: 'CRM → Prospects: search the database (filters for industry, size, title, tech used, hiring), add people by hand, or import a CSV. Open a company to research its real site and write a first line about them.',
    levers: 'Fit: the right industry, size and the person who signs, plus a reason to talk now. Broad lists look like pipeline and burn accounts you will want later.',
    cost: 'About 6 minutes per prospect by hand, 15 minutes to research a site. Database plans run free to $185/month.',
    next: 'Nothing moves until you reach out. Prospects sit in Companies and Contacts.' },
  PAGE(true),
  { id: 'reach', title: 'Reach out yourself: intros, LinkedIn, cold email', go: 'outreach', where: 'Outreach', node: 'outbound',
    done: (s) => emailsSent(s) + liTouches(s) + inboundAccepted(s) > 0,
    progress: (s) => `${inboundAccepted(s)} intros accepted · ${liTouches(s)} LinkedIn touches · ${emailsSent(s)} prospects emailed`,
    how: 'Fastest first: accept intros in CRM → Inbound and reply in Mail. LinkedIn (Outreach → LinkedIn) needs a LinkedIn URL on the contact. Cold email (Outreach) needs a sequencer, a secondary domain with SPF/DKIM/DMARC and warmed inboxes, then a sequence and enrolled prospects.',
    levers: 'A researched first line gets roughly 5–10% replies over a sequence, a generic blast 0.5–1.5%, a warm 1:1 note 10–20%+. Bounces over 2% and spam complaints hurt the domain.',
    cost: 'Sequencer $47/month, domain ~$12/year, ~$7/month per inbox; about 15 minutes per sequence step written. Inboxes warm for ~4 weeks: about 5 cold sends a day in week 1, 25–30 after.',
    next: 'Replies trickle in over days to weeks (Outreach → Replies and Mail). A positive reply you answer can turn into a booked call.' },
  { id: 'calls', title: 'Hold your first sales or discovery call', go: 'calls', where: 'Calls', node: 'calls',
    done: (s) => callsHeld(s) > 0, progress: (s) => `${callsHeld(s)} calls held · ${len(A(s, 'calls').meetings)} booked`,
    how: 'Calls are booked when a prospect agrees in Mail or Outreach → Replies, or from an accepted inbound lead. On the day, Join from Calls or Calendar; you type the conversation and get a scorecard.',
    levers: 'Discovery before pitch: their current process, what it costs, who decides and when. 20–30% of booked calls no-show; founder-run calls qualify about 50–60% of the time.',
    cost: 'About 45 minutes including prep, charged on the call day.',
    next: 'A qualified call becomes an open deal in CRM → Pipeline with a next step you set.' },
  { id: 'commit', title: 'Ask for a real commitment (design partner, pilot, LOI, deposit)', go: 'crm/presell', where: 'CRM → Pre-sell', node: 'presell',
    done: (s) => commitments(s) > 0 || charged(s), progress: (s) => `${commitments(s)} commitments`,
    how: 'CRM → Pre-sell: write a specific offer (what, price, start date) and ask a prospect for a signed LOI, a deposit or a pre-order. On a deal you can also offer a design partnership or a paid pilot.',
    levers: 'Only something that costs them counts: a signature, money or their time. "Sounds great, keep me posted" is the default polite answer and is not demand.',
    cost: '30 minutes to write an offer, 30 minutes to present it.',
    next: 'Deposits and pre-orders are charged in Stripe right away. Missing the promised date leads to refunds.' },
  { id: 'ship', title: 'Ship a first version they can use', go: 'product/build', where: 'Product → Build', node: 'spec',
    done: shipped, progress: (s) => (shipped(s) ? '' : `${len(A(s, 'product').features)} features specced, none shipped`),
    how: 'Product: spec a feature (problem, user, evidence, acceptance criteria), then build and ship it.',
    levers: 'Specs backed by real interviews; scope small enough to ship in weeks.',
    cost: 'Spec 30–60 minutes; building takes days of founder or AI-agent time.',
    next: 'Shipping opens Releases and lets deals and trials convert at full odds.' },
  { id: 'paid', title: 'Close your first paying customer', go: 'crm/pipeline', where: 'CRM → Pipeline', node: 'deal',
    done: charged, progress: (s) => `${deals(s).filter((d) => !['won', 'lost'].includes(d.stage)).length} open deals`,
    how: 'CRM → Pipeline: move qualified deals to a proposal (needs a price in Pricing), then contract. Only the buyer can close-win; won deals become customers in Stripe.',
    levers: 'Qualified opportunities under $15k a year close about 25–35% of the time. Deals close far less often with nothing shipped, and every open deal needs a dated next step.',
    cost: 'A proposal takes about 1 h (SMB) to 3 h (enterprise).',
    next: 'SMB contracts sign in 2–5 days, mid-market 10–20, enterprise 30–60. The first charge shows in Stripe.' },
];

const B2C = [
  WHO,
  DISCOVERY(true),
  PAGE(false),
  { id: 'waitlist', title: 'Collect a waitlist', go: 'audience', where: 'Owned audience', node: 'audience', optional: true,
    done: (s) => Boolean(A(s, 'audience').platform), progress: () => '',
    how: 'Owned audience → Setup: pick a newsletter platform and set up the waitlist (a question to ask and an optional founding-member offer).',
    levers: 'Consent and one clear promise. List size is not demand; clicks, replies and deposits are.',
    cost: 'Platform costs scale with list size; setting up the waitlist takes about 3 h.',
    next: 'Signups arrive from your page and launches; you email them when there is something to try.' },
  { id: 'ship', title: 'Ship something people can use', go: 'product/build', where: 'Product → Build', node: 'spec',
    done: shipped, progress: (s) => (shipped(s) ? '' : `${len(A(s, 'product').features)} features specced, none shipped`),
    how: 'Product: spec a feature, then build and ship it. A launch with nothing to try wastes the one first impression.',
    levers: 'Specs backed by real conversations; a small scope you can ship in weeks.',
    cost: 'Spec 30–60 minutes; building takes days.',
    next: 'Shipping lets launches and trials convert.' },
  { id: 'launch', title: 'Launch to your network', go: 'organic/network', where: 'Organic → Network launch', node: 'launch_network',
    done: (s) => Boolean(A(s, 'organic').launch), progress: () => '',
    how: 'Organic → Network launch: write one announcement; it goes out as personal messages to friends and family and as LinkedIn and X posts.',
    levers: 'Who it is for and the problem in their words, plus a clear ask (try it, feedback, an intro). A typical network gives a first handful of users and feedback, and 0–3 paying customers unless your friends are the ICP.',
    cost: 'About 2 h for personal messages, 45 minutes for LinkedIn, 30 minutes for X.',
    next: 'Clicks and signups arrive over the next days. Repeating it without real change reaches fewer people and annoys them.' },
  { id: 'community', title: 'Show up in communities where your users talk', go: 'organic/community', where: 'Organic → Communities', node: 'community',
    done: (s) => len(A(s, 'organic').community?.posts) > 0, progress: (s) => `${len(A(s, 'organic').community?.posts)} posts`,
    how: 'Organic → Communities: pick a subreddit, Discord or forum and post.',
    levers: 'Value-first posts get upvotes and a long tail; self-promotion with links gets removed and repeat offenders get banned.',
    cost: 'About 1–2 h per useful post plus replying to comments.',
    next: 'Reactions come within days; good threads keep sending visitors from search and AI answers.' },
  { id: 'paid', title: 'Get your first paying user', go: 'pricing', where: 'Pricing', node: 'pricing',
    done: charged, progress: () => '',
    how: 'Set a price and trial in Pricing; visitors from your launches start trials and some convert in Stripe.',
    levers: 'Landing-page fit, product fit and price. Card-required trials get fewer signups; typically 40–60% of them pay, against 15–25% of no-card trials (vendor benchmarks).',
    cost: 'Pricing changes are quick; the work is in the steps above.',
    next: 'Trials end after their trial length; the first successful charge shows in Stripe.' },
];

export function firstUsersSteps(state) {
  const list = state.company?.model === 'b2c' ? B2C : B2B;
  return list.map((st) => {
    let done = false;
    try { done = Boolean(st.done(state)); } catch { done = false; }
    const app = appOfKey(st.go);
    const locked = !isAppUnlocked(state, app) || (st.go.includes('/') && !isTabUnlocked(state, st.go));
    let progress = '';
    try { progress = st.progress?.(state) ?? ''; } catch { progress = ''; }
    return { ...st, done, locked, progress };
  });
}

export function firstUsersPlan(state) {
  const steps = firstUsersSteps(state);
  const required = steps.filter((x) => !x.optional);
  const next = steps.find((x) => !x.done && !x.optional) ?? null;
  return { steps, next, doneCount: required.filter((x) => x.done).length, total: required.length, complete: required.every((x) => x.done) };
}

// The founder asks to open the tool behind a step (same as "Open" on a to-do). Returns the route to go to.
export function openStepTool(state, stepId) {
  const st = firstUsersSteps(state).find((x) => x.id === stepId);
  if (!st) throw new Error('Unknown step');
  if (st.node && NODE_BY_ID[st.node]) requestNode(state, st.node);
  expandKey(state, st.go);
  return st.go;
}

export function firstUsersPanel(state) {
  const p = firstUsersPlan(state);
  const body = html`<ol class="fu-steps">${p.steps.map((st, i) => html`<li class="fu-step ${st.done ? 'done' : ''} ${p.next?.id === st.id ? 'next' : ''}">
      <details ${p.next?.id === st.id ? 'open' : ''}>
        <summary><span class="fu-n">${st.done ? '✓' : i + 1}</span> <b>${st.title}</b>${st.optional ? html` <span class="muted small">(optional)</span>` : ''}${p.next?.id === st.id ? html` <span class="badge accent">Next</span>` : ''}${st.progress ? html` <span class="small muted">· ${st.progress}</span>` : ''}</summary>
        <div class="fu-body">
          <p>${st.how}</p>
          <dl><dt>What moves the odds</dt><dd>${st.levers}</dd><dt>What it costs</dt><dd>${st.cost}</dd><dt>What happens next</dt><dd>${st.next}</dd></dl>
          <div class="inline">${st.locked
            ? html`<button class="sm primary" data-fu-open="${st.id}">Open ${st.where} →</button> <span class="small muted">Not in your sidebar yet: this opens it (costs nothing).</span>`
            : html`<a class="btn sm ${st.done ? '' : 'primary'}" href="#/${st.go}">Go to ${st.where} →</a>`}</div>
        </div>
      </details></li>`)}</ol>`;
  return html`<section class="panel first-users" id="first-users">
    <h2>Get your first users <span class="todo-count">${p.doneCount}/${p.total}</span></h2>
    <p class="muted small">The usual order for ${state.company?.model === 'b2c' ? 'a consumer product' : 'a B2B product'} in 2026: people you know, real conversations, then founder-led outreach before any paid channel. Steps tick themselves when you do the work; you can do them in any order. Hours and money below are what the tools charge.</p>
    ${p.complete ? html`<details><summary>✓ All done. Show the steps</summary>${body}</details>` : body}
  </section>`;
}

export function wireFirstUsers(root, ctx, on) {
  on(root, 'click', '[data-fu-open]', async (e, el) => {
    let go = null;
    await ctx.act((st) => { go = openStepTool(st, el.dataset.fuOpen); });
    if (go) { const [app, ...rest] = go.split('/'); ctx.navigate(app, rest.join('/')); }
  });
}
