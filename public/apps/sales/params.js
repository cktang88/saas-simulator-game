// Sales & outbound parameters. Every number cites docs/research/sales-and-research.md (section 6 table
// unless noted). Values tagged [design] are game choices derived from cited ranges, not measured stats.

export const SALES = {
  // ---- List quality & verification ----
  verify: {
    costPerEmail: 0.008, // ZeroBounce/NeverBounce-style pay-as-you-go ≈ $0.008/address [design: list price range]
    // Share of verifier outcomes on a hand-built B2B list. [design] B2B lists have many catch-all domains.
    shares: { valid: 0.68, catch_all: 0.17, invalid: 0.09, unknown: 0.06 },
  },
  // Bounce probability by true address status. Saleshandy (Oct 2026): verified 1.21%, risky 2.2%, "bad" 10.58%;
  // a raw unverified list averages ≈2.1% with the shares above.
  bounce: { valid: 0.012, catch_all: 0.022, unknown: 0.021, invalid: 0.106 },
  roleAddressPenalty: { bounce: 1.3, reply: 0.5, complaint: 2 }, // [design] info@/sales@ reach a shared inbox

  // ---- Reply gate (per prospect over a full sequence; human replies, auto-replies excluded) ----
  // generic AI/merge blast 0.5–1.5% · segment-relevant basic 2–4% · researched first line 5–10% · warm 1:1 10–20%+
  replyTier: { generic: 0.01, basic: 0.03, researched: 0.065, warm: 0.13 },
  // Share of a sequence's replies by step: step 1 brings ~40–60% (Instantly 58%); 4–7 steps capture most.
  stepWeights: [0.5, 0.2, 0.12, 0.08, 0.06, 0.04, 0.03],
  saasBuyerPenalty: 0.7, // SaaS/software ICP: multiply reply rate by 0.6–0.8 (Cleverly via lemlist)
  linkedinConnectedLift: 1.6, // email + LinkedIn ≈ 2x positive replies (Saleshandy channel mix)
  // Positive share of replies 25–50% (default 35%); generic blasts 15–25%.
  positiveShare: { generic: 0.2, basic: 0.32, researched: 0.4, warm: 0.45 },
  positiveSplit: { interested: 0.55, curious: 0.45 }, // [design] split of "positive" replies
  negativeSplit: { not_now: 0.35, objection: 0.3, unsubscribe: 0.35 }, // [design]
  oooRate: 0.006, // [design] out-of-office auto-replies per inboxed step-1 email (vendors count these as replies)

  // ---- Deliverability ----
  complaintBase: 0.0006, // [design] per inboxed cold email; target <0.1%, Google ceiling 0.3%
  complaintTarget: 0.001,
  complaintCeiling: 0.003,
  bounceHealthy: 0.02, // healthy <2%; warning 2–5%; auto-pause ≥5% after 200 sends (Instantly)
  bouncePause: 0.05,
  bouncePauseMinSends: 200,
  safeCapPerInbox: 30, // 25–30 cold sends/inbox/day warmed (LeadHaste 2026; Instantly cap 30)
  hardCapPerInbox: 50, // >50 is high risk
  warmupDays: 28, // 3–6 weeks, default 4 (Topo/Unify/Instantly)
  warmupRamp: [[7, 5], [14, 10], [21, 15], [28, 25]], // [days since start, recommended cold sends] then 30
  inboxesPerDomainSafe: 3, // 2–3 safe, 4–5 aggressive (Instantly help center)
  domainCostYear: 12, // $10–15/domain/year
  inboxMonthly: 7, // Google Workspace Business Starter seat ≈ $6–8/month
  sequencerMonthly: 47, // $40–100/month sequencer (Instantly Growth list price)
  mppOpenInflation: 0.2, // Apple MPP + scanners inflate opens by 15–30 points (BounceZero/Prospeo 2026)
  humanOpenRate: 0.3, // [design]

  // ---- AI SDR (LeadGen Economy Apr 2026; TechCrunch on 11x Mar 2025 — mostly estimates) ----
  aiSdr: {
    monthly: 3000, // managed AI SDR $2–5k/month
    dailySends: 150, // volume ×3–5 a founder's sends [design within range]
    replyStart: 0.015, // reply rate degrades from ~1.5% to ~0.5% within 4–8 weeks
    replyFloor: 0.005,
    decayWeeks: 8,
    positiveShare: 0.25, // generic blasts 15–25% positive
    hallucination: 0.15, // factual errors in 12–20% of emails
    meetingToOpp: 0.4, // AI-SDR-booked meetings ≈35–45% → opportunity (vs 50–60% founder)
    autoBook: 0.85, // [design] it books most interested replies itself → ~$250–400 per meeting (Laxis State of AI SDR 2026)
  },

  // ---- LinkedIn (vendor guides 2026; LinkedIn publishes no official number) ----
  linkedin: {
    weeklyLimit: 100, // ≈100 requests per rolling 7 days
    reducedLimit: 50, // [design] after acceptance <30% the limit drops
    lowAcceptance: 0.3,
    acceptBase: 0.3, // [design] cold, in-ICP connection request acceptance
    dmReplyCold: 0.114, // 11.4% cold vs 36.4% engaged (8,423-message practitioner dataset, anecdotal)
    freeNotesPerMonth: 10, // Free accounts: ~5–10 personalized notes/month (La Growth Machine, Salesforge help 2025–26)
    salesNavMonthly: 99, // Sales Navigator Core ≈ $99/month: unlimited notes
  },

  // ---- Meetings ----
  // About 15–40% of positive replies become meetings (Cleverly/Instantly); founder must ask well.
  meetingFromReply: { interested: 0.55, curious: 0.3, objection: 0.08, not_now: 0.04, unsubscribe: 0, inbound: 0.75, ai_sdr: 0.5 },
  // No-shows 20–30% baseline; 12–15% when booked 1–3 days out; ~24.5% 7+ days; SMB +10–15 pts; enterprise 15–20%.
  noShow: { short: 0.13, mid: 0.2, long: 0.25, smbAdd: 0.1, entAdd: -0.06, coldLongAdd: 0.08, aiSdrAdd: 0.08, reminderFactor: 0.85 },
  rebookAfterNoShow: 0.5, // [design]
  meetingToOpp: 0.55, // held → qualified 50–60% founder-run (Bridge Group implied, TOPO 58%)
  // Opportunity → close by ACV: <$15k 25–35%, $15–100k 18–28%, $100k+ 12–22% (Landbase/Optifai Apr 2026; Gong ≈25%)
  winRates: [[15000, 0.3], [100000, 0.23], [Infinity, 0.17]],
  // Sales cycle days by ACV (Prospeo 2026, Landbase Apr 2026, SaaStr on Gong): ranges [min, max]
  cycles: [[1000, 5, 25], [10000, 15, 45], [50000, 60, 90], [100000, 90, 120], [500000, 90, 180], [Infinity, 180, 540]],
  responseBonus: { win: 1.14, cycle: 0.89 }, // replying within 24h: +14% win, −11% cycle (Gong Labs 2022)
  // P(security review) by ACV: questionnaires are the practical trigger; SOC 2 pays off at $50–100k+ (causo.ai 2026).
  // Without SOC 2, a passive review costs ≈30% of deals once (20–40% at mid-market+, world-ops-support-life.md §7).
  securityReview: { byAcv: [[5000, 0.05], [15000, 0.25], [50000, 0.6], [Infinity, 0.85]], delay: [30, 90], killNoSoc2: 0.3, questionnairePass: 0.55 },
  dpaRequest: { byAcv: [[5000, 0.03], [15000, 0.1], [Infinity, 0.5]], stallDays: 21 },
  // Negotiation → signature: SMB 2–5 days, mid-market 10–20, enterprise 30–60 (Prospeo SaaS sales cycle 2026).
  contractDays: [[15000, 2, 5], [50000, 10, 20], [Infinity, 30, 60]],
  redlineChance: 0.5, // [A] Legal's rate for enterprise/large deals
  // Meeting asks: each repeated unanswered ask halves the odds; from the 3rd, 15% unsubscribe (pushiness → opt-outs).
  repeatAsk: { decay: 0.5, unsubFrom: 3, unsubChance: 0.15, ghostDays: 14 },
  oversizedShare: 0.6, // initial deals are usually 20–60% of eligible seats [design]
  reenroll: { coolDownDays: 60, replyMult: 0.4, complaintMult: 2 },
  prospectReschedule: { smb: 0.15, ent: 0.25 }, // demo reschedule 10–20% SMB, 20–35% ent (CALENDAR_NORMS [design])
  prospectCancel: 0.05, // [design] day-before cancellation
};

// Founder-hour costs (ARCHITECTURE principle 4). Realistic durations for a solo founder.
export const HOURS = {
  addProspect: 0.1, // find + enter a real prospect ≈ 6 min
  importBase: 0.25, importPerRow: 0.01,
  verify: 0.05,
  research: 0.25, // read their site and write hypotheses ≈ 15 min
  personalize: 0.12, // write a researched first line ≈ 6–10 min
  aiDraftReview: 0.05, // review an AI-drafted line ≈ 3 min
  writeStep: 0.25, // write one sequence email ≈ 15 min
  enrollBase: 0.1, enrollPer: 0.005,
  buyDomain: 0.15, addInbox: 0.1, dnsRecord: 0.25,
  linkedinNote: 0.05, linkedinPlain: 0.02, linkedinDm: 0.1,
  note: 0.05, task: 0.02, stage: 0.02,
  triage: 0.1,
  callPrep: 0.25, callBase: 0.5, // + 0.25h when the call runs long
  reschedule: 0.1, reminder: 0.05,
  proposalSmb: 1, proposalEnt: 3,
  securityQuestionnaire: 8,
  followUp: 0.15,
};

export const ROLE_PREFIXES = ['info', 'sales', 'hello', 'contact', 'support', 'admin', 'team', 'office', 'hr', 'jobs', 'careers', 'billing', 'marketing', 'press', 'noreply', 'no-reply', 'enquiries', 'inquiries', 'help', 'accounts', 'service', 'mail', 'webmaster'];
export const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de', 'yandex.com', 'mail.com'];
