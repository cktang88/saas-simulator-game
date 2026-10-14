// Bot D: enterprise founder (VC path). Incorporates (Atlas), raises a $500k pre-seed SAFE, sells to warm design
// partners + light outbound at $18k ACV, pays self $6k/mo after the raise.
import * as L from './lib.mjs';
import * as S from './sales.mjs';
import { run } from './runner.mjs';
const R = (process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '/apps';
const LS = await import(R + '/legal/sim.js');
const FS = await import(R + '/fundraising/sim.js');
const FI = await import(R + '/fundraising/investors.js');
const FE = await import(R + '/fundraising/view-eval.js');
const M = await import(R + '/sales/model.js');
const { rng, uid } = L.util;
const [seeds = 20, days = 1095, acv = 18000, target = 500000, cap = 6000000] = process.argv.slice(2);

const OUTREACH = (inv) => `Hi ${inv.name.split(' ')[0]}, I'm raising a $500k pre-seed SAFE for Botco: automated SOC 2 evidence collection for mid-market fintech security teams. I ran compliance at a 900-person fintech for 6 years and spent 40% of each audit cycle screenshotting evidence. We have 3 design partners in pilots and 2 signed LOIs. ${inv.firm ? `Given ${inv.firm}'s focus on ${String(inv.thesis ?? 'B2B software').split(/[,.;]/)[0]}, ` : ''}would you take a 30-minute call? Deck attached.`;
const PITCH = [
  'We automate SOC 2 evidence collection for mid-market fintechs: 200-2000 employees, 2-4 audits a year.',
  'I ran compliance at a 900-person fintech for 6 years; evidence collection ate 40% of every audit cycle, about 600 hours a year.',
  'Why now: auditors accept API-sourced evidence since 2025, and fintech partner banks now require SOC 2 Type II from every vendor.',
  'Numbers: 3 design partners in paid pilots at $18,000 ACV, 2 more in procurement, $0 burn beyond my own time until this round.',
  'The moat is the integration graph and the audit history: each customer’s workflow data and evidence trail make switching costly, and distribution through audit firms.',
  'First hire is a senior engineer in month 2; an advisor from a Big Four audit practice is already helping.',
  'We are raising $500k on a post-money SAFE at a $6M cap to reach 15 customers and $250k ARR in 15 months.',
];

const res = await run({
  name: `D-ent-vc-${acv}`, seeds: +seeds, days: +days, game: { model: 'ent', path: 'vc', network: { friends: 50, linkedin: 900, x: 300, newsletter: 0 } },
  init: async (g) => {
    const s = g.state;
    s.plans[0].price = +acv; s.plans[0].interval = 'year'; s.plans[0].trialDays = 0;
    await L.setupWebsite(g);
    L.tryHours(g, 2, 'Legal: incorporation');
    LS.incorporate(s, { provider: 'atlas', operatingState: 'CA' });
    s.founder.linkedinText = '6 years Head of Compliance at a 900-person fintech; led 8 SOC 2 audits; previously Big Four IT audit.';
    s.founder.bio = 'Ex-compliance lead, built internal evidence tooling used by 40 engineers.';
    const fr = FS.ensureFr(s);
    fr.deck.text = 'Problem: SOC 2 evidence collection takes 600 hours a year at mid-market fintechs. Solution: API-based evidence collection and continuous control monitoring. Market: 9,000 US fintechs, $18k ACV. Traction: 3 design partners. Team: 6 years compliance. Ask: $500k pre-seed SAFE.';
    S.setupOutbound(g, { inboxes: 2 });
    // 3 design partners from the founder's network: warm intros.
    g.partners = [];
    for (let i = 0; i < 3; i++) { const c = S.addProspect(g, { icpRate: 1, warm: true, title: 'VP Security' }); if (c) { c.warm = true; g.partners.push(c); } }
  },
  policy: async (g, dow) => {
    const s = g.state;
    if (dow === 0) return;
    const fr = FS.ensureFr(s);
    if (L.market.hasProduct(s) && !g.paneled) { await L.customerPanel(g); g.paneled = true; }
    // Legal follow-through.
    const Lg = s.apps.legal;
    if (s.company.entity === 'ccorp' && !Lg.founderStock && L.tryHours(g, 1, 'Legal: founder docs')) { LS.signFounderDocs(s); try { LS.file83b(s, 'service'); } catch {} }
    if (s.company.entity === 'ccorp' && !Lg.dpaReady && L.tryHours(g, 1.5, 'Legal: DPA')) LS.setupDpa(s, 'template');
    // Design partners: book discovery calls directly (warm intro → meeting).
    for (const c of g.partners ?? []) {
      if (c._booked) continue;
      const slot = M.nextSlot(s, { minLead: 2, duration: 45 });
      if (slot) { M.createMeeting(s, { contactId: c.id, slot, kind: 'discovery', source: 'network', duration: 45 }); c._booked = true; }
    }
    // Fundraise once incorporated and MVP is shipped.
    if (s.company.entity === 'ccorp' && L.market.shippedFeatures(s).length >= 3 && !fr.raise && !g.raised && !g.raiseTried) {
      if (L.tryHours(g, 2, 'Fundraising: evaluation')) {
        await FE.runEvaluation(g.ctx, 'pre-seed');
        fr.raise = { id: uid('raise'), stage: 'pre-seed', instrument: 'safe', target: +target, cap: +cap, discount: 0, mfn: false, proRataMin: Infinity, startDay: s.day, deadlineDay: s.day + 122, raised: 0, status: 'active' };
        g.raiseTried = true; g.raiseStart = s.day;
        for (let k = 0; k < 4; k++) if (L.tryHours(g, 2, 'Fundraising: investor list') || true) for (const inv of FI.generateInvestors(s, { count: 10, stage: 'pre-seed', rand: () => rng(s) })) fr.investors.push({ id: uid('inv'), addedDay: s.day, status: 'researching', log: [], ...inv });
      }
    }
    if (fr.raise?.status === 'active') {
      // Outreach: up to 8 investors a day.
      let n = 0;
      for (const inv of fr.investors) {
        if (inv.status !== 'researching' || n >= 8) continue;
        const warm = Boolean(inv.warmPath);
        if (!L.tryHours(g, warm ? FS.HOURS?.introBlurb ?? 0.3 : 0.15, 'Fundraising: outreach')) break;
        const text = OUTREACH(inv);
        const judge = FI.heuristicOutreach(text, inv, { warm });
        inv.raiseId = fr.raise.id; inv.ghosted = false;
        inv.outreach = { channel: warm ? 'warm' : 'cold', day: s.day, text, quality: judge.quality, judge, followUps: 0 };
        if (warm) { inv.status = 'intro_requested'; inv.introOdds ??= 0.6; inv.pending = { type: 'intro', day: s.day + 2 + Math.floor(rng(s) * 5) }; }
        else { inv.status = 'contacted'; inv.pending = { type: 'reply', day: s.day + 2 + Math.floor(rng(s) * 8) }; }
        n++;
      }
      // Pitch meetings scheduled for today.
      for (const mtg of fr.meetings) {
        if (mtg.status !== 'scheduled' || mtg.day !== s.day) continue;
        const ev = (s.calendar?.events ?? []).find((e) => e.id === mtg.eventId);
        if (ev && ev.status !== 'scheduled') continue;
        mtg.transcript = [];
        for (const t of PITCH) { mtg.transcript.push({ from: 'them', text: '…' }); mtg.transcript.push({ from: 'me', text: t }); }
        const d = FI.heuristicMeeting(mtg.transcript);
        FS.meetingDone(s, mtg, Math.round(d.performance * 2) / 2, 'bot');
        g.pitches = (g.pitches ?? 0) + 1;
      }
      // Accept any SAFE on the table.
      for (const inv of fr.investors) if (inv.status === 'term_sheet' && L.tryHours(g, 1.5, 'Fundraising: term sheets')) { const err = FS.acceptTerms(s, inv); if (err) g.err = err; }
      const raised = fr.rounds.reduce((a, r) => a + r.amount, 0);
      if (raised >= +target || s.day >= fr.raise.deadlineDay) { FS.endRaise(s, raised > 0 ? 'closed' : 'abandoned'); }
    }
    const raisedTotal = fr.rounds.reduce((a, r) => a + r.amount, 0);
    if (raisedTotal > 0 && !g.raised) { g.raised = raisedTotal; g.raisedDay = s.day; }
    if (raisedTotal >= 150000 && !s.founder.salary) s.founder.salary = 6000;
    if (raisedTotal > (g.raised ?? 0)) g.raised = raisedTotal;
    // Sales: calls, inbox, proposals, 3 outbound prospects a day.
    if (dow !== 6) {
      S.runCalls(g, 'good'); S.workInbox(g); S.proposals(g);
      const added = [];
      for (let i = 0; i < 3; i++) { const c = S.addProspect(g, { icpRate: 0.6, title: 'Head of Security' }); if (c) added.push(c); }
      S.enroll(g, added);
    }
    const tgt = s.founder.hoursPerWeek / 6, start = L.hoursLeft(s);
    let guard = 0;
    while (start - L.hoursLeft(s) < tgt - 0.5 && L.hoursLeft(s) > 0.5 && guard++ < 6) { if (!(await L.productWork(g, tgt - (start - L.hoursLeft(s))))) break; }
  },
  extra: (g) => {
    const fr = g.state.apps.fundraising ?? {};
    const st = (fr.investors ?? []).reduce((a, i) => { a[i.status] = (a[i.status] ?? 0) + 1; return a; }, {});
    return { raised: g.raised ?? 0, raisedDay: g.raisedDay ?? null, raiseStart: g.raiseStart ?? null, pitches: g.pitches ?? 0, invStatus: st, evalS: fr.evaluations?.at(-1)?.S, funnel: S.funnel(g), partnersWon: (g.partners ?? []).filter((c) => c.status === "customer").length, partnerDeals: (g.partners ?? []).map((c) => { const d = g.state.apps.crm.deals.find((x) => x.contactId === c.id); const m = g.state.apps.calls.meetings.filter((x) => x.contactId === c.id).map((x) => x.status + (x.qualified ? "+Q" : "")); return (d?.stage ?? "-") + ":" + (d?.lostReason ?? "") + ":" + m.join(","); }), acceptErr: g.err ?? null };
  },
});
console.log(JSON.stringify(res));
