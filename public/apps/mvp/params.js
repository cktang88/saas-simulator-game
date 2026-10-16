// MVP lab parameters. Sources: docs/research/early-stage/mvp-first-customers.md (email opt-in pages 5-20%, waitlists
// 2-5% weak and 10-15% top [unverified], cold traffic to a waitlist ~3-10% [design], Unbounce all-industry median
// 6.6%), pmf-process.md, discovery-by-segment.md. Everything tagged [design] is a simulation assumption, not a
// statistic, and is never shown to the player as one.

export const MVP = {
  // ---- Smoke test / fake door ----
  smoke: {
    days: 7, // a test runs a week
    pageHours: 2, // build the one-page site
    maxVisits: 1200,
    sources: {
      network: { label: 'Your own network (friends, past colleagues)', hours: 2, visits: [40, 140], base: 0.2, pay: 0.1, targeted: 0.3, outsiderRest: 0.7, politeness: 0.35 }, // [design] base: email opt-in 5-20%
      community: { label: 'A post in a community where the audience gathers', hours: 3, visits: [120, 450], base: 0.075, pay: 0.35, targeted: 0.75, outsiderRest: 0.25, politeness: 0 }, // [design]
      paid: { label: 'A small paid test (ads to a targeted audience)', hours: 1.5, base: 0.045, pay: 0.35, targeted: 0.7, outsiderRest: 0.1, politeness: 0, minBudget: 50, cpc: { b2c: 0.9, smb: 2.8, ent: 7.5 } }, // [design] cold 3-10%
    },
    friendShareOfNetwork: 0.35,
    depositEmailDrag: 0.85, // a pay button next to the email box costs some email signups
    apologyHours: 0.4, apologyDays: 3, apologyRep: 10, // fake-door ethics: tell clickers it was a test within days
  },
  // ---- Concierge and Wizard of Oz ----
  cohort: {
    minCustomers: 3, maxCustomers: 15, maxWeeklyHours: 20,
    recruitHoursPerAsk: { network: 0.12, outreach: 0.25, community: 0.18 }, // [design]
    attempts: 8, // asks per customer wanted before you give up
    askWeek: 3, // the price is asked from the third week
    tooLongWeeks: 8, // staying manual past ~2 months is a mistake [design]
    tooLongDays: 14, tooLongHours: 20,
    charm: 0.8, // [design] hazard multiplier: the founder's presence keeps people around (concierge only)
    wizardUiHours: [8, 60], wizardBackendHours: [0.2, 2.5],
  },
  // ---- Design partners ----
  partners: { min: 3, max: 10, sessionHours: 0.75, sessionMinutes: 45, convertAfterSessions: 3, overfitHours: 6, overfitDays: 10 },
  // ---- Calling results ----
  tinyN: { smoke: 150, concierge: 8, wizard: 8, design_partners: 5 }, // below this a verdict is noise [design]
  overbuilt: { agentHours: 40 }, // build hours before ANY experiment, real interview or pre-sale ask [design]
  z: 1.645, // 90% intervals
};

export const METRICS = {
  smoke: { signupRate: 'Email signup rate (of visits)', paidRate: 'Paid-intent rate (of visits, deposit page only)' },
  concierge: { retention: 'Still active after 3+ weeks', payRate: 'Pay at your price (of those asked)' },
  wizard: { retention: 'Still active after 3+ weeks', activation: 'Used it in week 1', payRate: 'Pay at your price (of those asked)' },
  design_partners: { payRate: 'Convert to paid at the end', attendRate: 'Attend the sessions' },
};
export const TYPE_LABEL = { smoke: 'Smoke test / fake door', concierge: 'Concierge MVP', wizard: 'Wizard of Oz', design_partners: 'Design partners' };
