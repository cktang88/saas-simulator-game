// Scenario cards: real situations founders face, each with a debrief ("lesson").
// `when` decides eligibility; `manual` cards are only queued by the engine itself.
// Effects receive (state, api) and return a short outcome sentence.

const launchedWith = (n) => (s) => s.phase === 'launched' && s.customers >= n;

export const DECISIONS = [
  {
    id: 'incorporate',
    manual: true,
    title: 'Setting up the company',
    lessonTitle: 'Incorporation, vesting and the 83(b)',
    text: 'Before you write a line of code, you need a legal entity, a cap table, and an agreement between co-founders. How do you set it up?',
    choices: [
      {
        label: 'Delaware C-corp, 4-year vesting with 1-year cliff, file 83(b) elections (~$2k)',
        effect: (s) => { s.cash -= 2000; s.vesting = true; return 'Clean, investor-ready structure. Both founders vest over 4 years.'; },
        lesson: 'If you might raise venture money, a Delaware C-corp is the default in the US. Founder shares should vest (typically 4 years, 1-year cliff) so a co-founder who leaves early does not walk away with half the company. US founders file an 83(b) election within 30 days of receiving restricted stock to avoid a large future tax bill. Assign all IP to the company. (General info: check with a lawyer in your jurisdiction.)',
      },
      {
        label: 'Simple LLC, no vesting (~$500)',
        effect: (s) => { s.cash -= 500; s.llc = true; s.vesting = false; return 'Cheap and simple. You can convert later if you raise.'; },
        lesson: 'An LLC is cheap and tax-efficient for a bootstrapped business, but most VCs require a C-corp, so converting later costs money and time. Skipping vesting is the bigger risk: if a co-founder leaves in month 6, they keep all their equity.',
      },
      {
        label: 'Skip it for now, we trust each other',
        effect: (s) => { s.vesting = false; s.llc = true; s.flags.noEntity = true; return 'Saved a little money and created a lot of risk.'; },
        lesson: 'Handshake deals are how co-founder disputes destroy companies. Without an entity you also have personal liability, no clean IP ownership, and no way to take investment or sign enterprise contracts. Incorporating costs a few hundred dollars and a few days.',
      },
    ],
  },
  {
    id: 'launch',
    manual: true,
    title: 'Your MVP is ready',
    lessonTitle: 'How to launch',
    text: (s, api) => `You've built the smallest version that does the core job. Product quality is ${Math.round(api.quality(s))}/100 and your customer insight is ${Math.round(s.insight)}/100. You have ${Math.round(s.waitlist)} ${s.model === 'ent' ? 'interested design partners' : 'people on the waitlist'}. How do you launch?`,
    choices: [
      {
        label: 'Soft launch to the waitlist / design partners first',
        effect: (s, api) => {
          s.phase = 'launched';
          s.insight = Math.min(100, s.insight + 10);
          const rate = { b2c: 0.06, smb: 0.2, ent: 0.4 }[s.model] * (0.4 + api.pmf(s) / 100);
          s.pipeline[0] = (s.pipeline[0] ?? 0) + s.waitlist * rate;
          s.waitlist = 0;
          return 'Your earliest users are giving brutally useful feedback.';
        },
        lesson: 'Launch first to people who already asked for it. A soft launch gives you real usage data and testimonials before you spend your one shot at a big public launch. Then launch publicly (Product Hunt, Hacker News, communities) once onboarding works.',
      },
      {
        label: 'Big public launch now (Product Hunt, Hacker News, social)',
        effect: (s, api) => {
          s.phase = 'launched';
          const good = api.pmf(s) > 45;
          api.addEffect(s, 'signups', good ? 2.5 : 1.2, 1, 'Launch day');
          if (!good) api.addEffect(s, 'conv', -0.3, 2, 'Rough first impression');
          const rate = { b2c: 0.05, smb: 0.15, ent: 0.3 }[s.model] * (0.4 + api.pmf(s) / 100);
          s.pipeline[0] = (s.pipeline[0] ?? 0) + s.waitlist * rate;
          s.waitlist = 0;
          return good ? 'Strong launch: the product resonated.' : 'Lots of traffic, but many people bounced. First impressions are hard to undo.';
        },
        lesson: 'A big launch is a traffic spike, not a growth strategy. It works when the product already converts. If onboarding is rough, you burn your best audience on a bad first impression.',
      },
      {
        label: 'Polish for two more months first',
        effect: (s, api) => { api.addEffect(s, 'dev', 0.3, 2, 'Polishing'); s.flags.launchOffered = false; s.rawFeatures -= 3; return 'More polish. Still zero revenue.'; },
        lesson: 'If you are not embarrassed by the first version of your product, you launched too late (Reid Hoffman). Polishing without users means optimizing guesses. Real feedback beats more features.',
      },
    ],
  },
  {
    id: 'custom-feature',
    models: ['smb', 'ent'],
    when: launchedWith(3),
    title: 'A big prospect wants a custom feature',
    lessonTitle: 'Custom work and focus',
    text: (s, api) => `A company 5× bigger than your typical customer will sign at 3× your price ($${api.fmtM(s.price * 3)}/mo), but only if you build a custom integration with their internal system. It would take most of your engineering for 2 months.`,
    choices: [
      {
        label: 'Build it: a big logo is worth it',
        effect: (s, api) => { s.customers += 1; s.monthlyMrr += s.price * 3; s.techDebt = Math.min(100, s.techDebt + 12); api.addEffect(s, 'dev', -0.6, 2, 'Custom project'); return 'Signed the logo. Your roadmap is on hold.'; },
        lesson: 'One-off features for a single customer turn a product company into a dev shop: they add maintenance forever and delay what your ICP needs. Big logos are valuable, but only if the work generalizes.',
      },
      {
        label: 'Offer a paid pilot, and build only the parts that generalize',
        effect: (s, api) => { s.customers += 1; s.monthlyMrr += s.price * 2; s.techDebt = Math.min(100, s.techDebt + 4); s.insight = Math.min(100, s.insight + 4); api.addEffect(s, 'dev', -0.2, 1, 'Pilot work'); return 'They accepted a paid pilot at 2× price. The general version is on your roadmap anyway.'; },
        lesson: 'The best answer is often "yes, if": a paid pilot with clear success criteria, building only what other customers also need. Charge for custom work: it tests how serious they are.',
      },
      {
        label: 'Politely decline',
        effect: () => 'They went with a competitor. Your roadmap stays focused.',
        lesson: 'Saying no protects focus. It is the right call when the request is far from your ideal customer profile, though you should still learn why they wanted it.',
      },
    ],
  },
  {
    id: 'trial-model',
    models: ['b2c', 'smb'],
    when: launchedWith(15),
    title: 'Free trial, card-required trial, or freemium?',
    lessonTitle: 'Trials vs freemium',
    text: 'Your growth advisor says your signup flow is the biggest lever you have. Right now you run a 14-day free trial with no credit card. What do you test?',
    choices: [
      {
        label: 'Require a credit card for the trial',
        effect: (s) => { s.trialMode = 'card'; return 'Fewer signups, much higher trial-to-paid conversion.'; },
        lesson: 'Typical ranges: opt-in (no card) trials convert ~15–25% to paid, card-required (opt-out) trials ~40–60%, but get far fewer signups. Card-required works when intent is high and the value is obvious fast.',
      },
      {
        label: 'Launch a free-forever plan (freemium)',
        effect: (s) => { s.trialMode = 'freemium'; return 'Signups exploded. Most free users will never pay, and they cost money to serve.'; },
        lesson: 'Freemium free-to-paid conversion is usually 2–5%. It works when free users drive virality or network effects and serving them is cheap. Otherwise it is an expensive marketing channel.',
      },
      {
        label: 'Keep the opt-in free trial',
        effect: (s) => { s.trialMode = 'optin'; return 'No change.'; },
        lesson: 'Opt-in trials are a sensible default early: more signups mean more conversations and data. Revisit once you know your activation rate.',
      },
    ],
  },
  {
    id: 'dunning',
    models: ['b2c', 'smb'],
    when: (s) => s.customers >= 40 && !s.dunning,
    title: 'Customers are churning because their cards fail',
    lessonTitle: 'Involuntary churn',
    text: 'Your billing logs show that a big chunk of churn is not people cancelling: their cards expired or were declined, and nobody followed up.',
    choices: [
      {
        label: 'Set up dunning: retries, card updater, reminder emails ($300/mo)',
        effect: (s) => { s.dunning = true; return 'Recovered failed payments start showing up immediately.'; },
        lesson: 'Involuntary churn (failed payments) is often 20–40% of total churn for card-based subscriptions. Smart retries, automatic card updaters, and pre-expiry emails recover a large share. It is usually the cheapest churn reduction you will ever buy.',
      },
      {
        label: 'Ignore it: it is just a few cards',
        effect: () => 'The leak continues.',
        lesson: 'Small monthly leaks compound. 1.5% a month of avoidable churn is roughly 17% of your customers a year.',
      },
    ],
  },
  {
    id: 'annual-plans',
    models: ['b2c', 'smb'],
    when: (s) => s.customers >= 20 && !s.annualPlans,
    title: 'Offer annual plans?',
    lessonTitle: 'Annual plans and cash flow',
    text: 'Your accountant notices that every customer pays monthly. Offering an annual plan at "2 months free" (~17% off) would bring cash in upfront.',
    choices: [
      {
        label: 'Yes, offer annual plans at 2 months free',
        effect: (s) => { s.annualPlans = true; return 'Annual plans are live. Cash comes in upfront, and annual customers churn less.'; },
        lesson: 'Annual prepayment funds growth with customer money instead of investor money, and annual customers churn less since they decide once a year. The 15–20% discount is usually worth it. Revenue is still recognized monthly; only the cash arrives early.',
      },
      {
        label: 'No, keep it simple',
        effect: () => 'Monthly only.',
        lesson: 'Monthly-only maximizes flexibility, but leaves free financing on the table.',
      },
    ],
  },
  {
    id: 'too-cheap',
    when: (s, api) => launchedWith(20)(s) && s.price < api.model(s).price.ref * 0.8,
    title: 'Nobody complains about the price',
    lessonTitle: 'Pricing too low',
    text: 'In sales calls, nobody pushes back on price. One customer said, "Honestly, I expected this to cost more."',
    choices: [
      {
        label: 'Raise the price for new customers by 40%',
        effect: (s, api) => { const p = api.model(s).price; s.price = Math.min(p.max, Math.round((s.price * 1.4) / p.step) * p.step); return `New price: $${s.price}/mo. Existing customers stay grandfathered.`; },
        lesson: 'If nobody objects to your price, it is too low. Most early founders underprice. Raising prices for new customers is low-risk, and you can grandfather existing ones. Some objections (roughly 1 in 5 prospects) is a healthy sign.',
      },
      {
        label: 'Keep it low to grow faster',
        effect: () => 'Price unchanged.',
        lesson: 'Low prices can speed adoption, but they also cap what you can spend to acquire customers and attract more price-sensitive buyers, who churn more.',
      },
    ],
  },
  {
    id: 'vp-sales',
    models: ['smb', 'ent'],
    when: (s, api) => api.mrr(s) > 8000 && api.mrr(s) < 80000 && s.cash > 300000,
    title: 'Hire a VP of Sales?',
    lessonTitle: 'Hiring sales leadership too early',
    text: 'An investor introduces a VP of Sales from a public SaaS company. They want $25k/month and promise to "build a sales machine."',
    choices: [
      {
        label: 'Hire the VP of Sales',
        effect: (s, api) => {
          const works = api.rng(s) < 0.3;
          api.addEffect(s, 'cost', 25000, 9, 'VP Sales salary');
          if (works) { api.addEffect(s, 'conv', 0.3, 9, 'VP Sales playbook'); return 'Their playbook works. Win rates are up.'; }
          api.addEffect(s, 'morale', -1, 6, 'VP Sales mismatch');
          return 'Months later it is clear they need a mature team and a proven playbook. They leave after 9 months.';
        },
        lesson: 'Founders should sell until they have a repeatable playbook (often around $1M ARR). Big-company sales leaders are great at scaling a machine and often struggle to build one from scratch. Hire 1–2 AEs first, then a sales leader once AEs hit quota.',
      },
      {
        label: 'Keep founder-led sales; hire two AEs once the playbook repeats',
        effect: (s) => { s.insight = Math.min(100, s.insight + 3); return 'You keep closing deals yourself and write down what works.'; },
        lesson: 'Founder-led sales teaches you objections, pricing, and positioning, which no hire can learn for you. Document the process, then hire AEs who can run it.',
      },
    ],
  },
  {
    id: 'rewrite',
    when: (s, api) => s.techDebt > 35 && api.teamCount(s, 'eng') >= 2,
    title: 'Your engineers want a rewrite',
    lessonTitle: 'Rewrites',
    text: 'Your lead engineer says the codebase is a mess and proposes rewriting it from scratch in a modern stack. "Three months, tops."',
    choices: [
      {
        label: 'Approve the full rewrite',
        effect: (s, api) => { api.addEffect(s, 'dev', -0.85, 5, 'Rewrite'); s.techDebt = 5; return 'Feature work is frozen while the rewrite runs (it took 5 months, not 3).'; },
        lesson: 'Full rewrites almost always take longer than planned, freeze product progress, and reintroduce bugs the old code had fixed (see Joel Spolsky, "Things You Should Never Do"). Competitors keep shipping meanwhile.',
      },
      {
        label: 'Incremental refactoring: 40% of eng time to debt until it is under control',
        effect: (s) => { s.featureFocus = 60; return 'Feature focus set to 60% while you pay down debt.'; },
        lesson: 'Refactor incrementally: rebuild the worst parts while you keep shipping. Many teams dedicate a fixed 20–40% of engineering time to tech debt.',
      },
      {
        label: 'No, keep shipping features',
        effect: (s, api) => { api.addEffect(s, 'attrition', 0.02, 6, 'Frustrated engineers'); return 'The engineers are frustrated.'; },
        lesson: 'Ignoring tech debt slows every future feature and causes outages. Engineers also leave codebases they hate.',
      },
    ],
  },
  {
    id: 'security-review',
    models: ['ent'],
    when: (s) => s.phase === 'launched' && s.customers >= 2 && s.soc2 === 'none',
    title: 'A 300-question security questionnaire',
    lessonTitle: 'Security reviews and SOC 2',
    text: 'Your biggest prospect sends a 300-question security questionnaire and asks for your SOC 2 report.',
    choices: [
      {
        label: 'Start SOC 2 now (~$35k, ~6 months)',
        effect: (s, api) => { if (s.cash < 35000) return 'You cannot afford it yet.'; s.cash -= 35000; s.soc2 = 'inprogress'; s.soc2Ready = s.month + 6; return 'SOC 2 started. You send the prospect a letter saying the audit is underway.'; },
        lesson: 'Most mid-market and enterprise buyers require SOC 2 (or ISO 27001) before they buy. Compliance-automation tools plus an auditor typically cost $20k–$60k for the first year, and Type II needs a 3–12-month observation window. Start before deals depend on it.',
      },
      {
        label: 'Fill in the questionnaire by hand',
        effect: (s, api) => { api.addEffect(s, 'dev', -0.15, 1, 'Security questionnaire'); return 'You spent two weeks on it. You will have to do it again for every big deal.'; },
        lesson: 'Answering questionnaires by hand works for a few early deals. Keep a reusable answer library, but plan for SOC 2 if enterprise is your market.',
      },
    ],
  },
  {
    id: 'burnout',
    when: (s) => s.morale < 40,
    title: 'Your co-founder is burning out',
    lessonTitle: 'Founder burnout',
    text: 'Your co-founder snapped in a meeting, hasn\'t slept properly in weeks, and says they "can\'t keep doing this."',
    choices: [
      {
        label: 'Take two weeks off together',
        effect: (s, api) => { api.addEffect(s, 'dev', -0.4, 1, 'Time off'); s.morale = Math.min(100, s.morale + 25); return 'You both came back sharper.'; },
        lesson: 'Startups are a marathon. Founder burnout is a leading cause of company failure, and rest is a productivity tool, not a luxury.',
      },
      {
        label: 'Start paying yourselves a modest salary ($6k/mo each)',
        effect: (s) => { s.founderSalary = Math.max(s.founderSalary, 6000); s.morale = Math.min(100, s.morale + 15); return 'Financial stress eased. Burn went up.'; },
        lesson: 'Paying founders a modest salary once you have revenue or funding reduces the financial stress that drives bad decisions. Investors expect it after a seed round.',
      },
      {
        label: 'Push through',
        effect: (s, api) => {
          if (api.rng(s) < 0.4 && s.founders > 1) {
            s.founders = 1;
            if (!s.vesting) { s.deadEquity += s.founderEquity / 2; s.founderEquity /= 2; return 'Your co-founder quit. With no vesting, they keep half the company.'; }
            const vested = Math.min(1, s.month / 48) * (s.month >= 12 ? 1 : 0);
            s.deadEquity += (s.founderEquity / 2) * vested;
            s.founderEquity -= (s.founderEquity / 2) * vested;
            return `Your co-founder quit. Thanks to vesting they keep only their vested ${Math.round(vested * 100)}% of their shares.`;
          }
          s.morale = Math.max(0, s.morale - 5);
          return 'You both kept grinding. It is getting worse.';
        },
        lesson: 'Pushing through burnout often ends with a founder leaving. That is exactly when vesting matters: without it, a departed co-founder keeps their full stake ("dead equity"), which scares off investors.',
      },
    ],
  },
  {
    id: 'competitor',
    when: (s) => s.phase === 'launched' && s.month > 10,
    title: 'A competitor raised $40M',
    lessonTitle: 'Reacting to competitors',
    text: 'A competitor just announced a $40M round and is copying your features. Your team is anxious.',
    choices: [
      {
        label: 'Match their feature list as fast as possible',
        effect: (s) => { s.techDebt = Math.min(100, s.techDebt + 10); s.insight = Math.max(0, s.insight - 8); return 'You are now building their roadmap instead of your customers\'.'; },
        lesson: 'Chasing a competitor\'s roadmap means you stop listening to your customers. More startups die from suicide (losing focus) than homicide (competition).',
      },
      {
        label: 'Cut your price 30%',
        effect: (s, api) => { const p = api.model(s).price; s.price = Math.max(p.min, Math.round((s.price * 0.7) / p.step) * p.step); return `New price: $${s.price}/mo.`; },
        lesson: 'Price wars against a better-funded competitor are hard to win and train customers to buy on price. Compete on a specific customer and a better experience instead.',
      },
      {
        label: 'Double down on your niche and talk to customers',
        effect: (s, api) => { s.insight = Math.min(100, s.insight + 6); api.addEffect(s, 'signups', -0.1, 2, 'Competitor noise'); return 'Short-term noise, but your customers love that you get them.'; },
        lesson: 'Competition validates the market. A narrowly defined customer you serve better than anyone is a durable advantage. Funding is not a moat.',
      },
    ],
  },
  {
    id: 'churn-interviews',
    when: (s) => s.phase === 'launched' && s.customers >= 15 && s.history.length > 3 && s.history.slice(-3).every((h) => h.startCustomers && h.churned / h.startCustomers > 0.05),
    title: 'The bucket is leaking',
    lessonTitle: 'Fix retention before acquisition',
    text: 'You are losing customers almost as fast as you add them. Your marketer wants to double the ad budget to "outgrow" churn.',
    choices: [
      {
        label: 'Spend a month calling every churned customer',
        effect: (s, api) => { s.insight = Math.min(100, s.insight + 15); api.addEffect(s, 'churn', -0.015, 120, 'Onboarding fixes'); api.addEffect(s, 'dev', -0.1, 1, 'Interviews'); return 'You found a broken onboarding step that most churned users hit. Fixed.'; },
        lesson: 'Acquisition on top of a leaky bucket is wasted money. Churned customers will tell you exactly what is wrong if you ask. Look at retention cohorts: you want curves that flatten, not trend to zero.',
      },
      {
        label: 'Double the ad budget',
        effect: (s) => { s.paidBudget = Math.max(2000, s.paidBudget * 2); return `Paid budget is now $${s.paidBudget.toLocaleString()}/mo.`; },
        lesson: 'Growth hides churn for a while, but CAC rises with spend while churn compounds. At some point you are paying to refill a bucket that drains faster.',
      },
    ],
  },
  {
    id: 'app-store',
    models: ['b2c'],
    when: launchedWith(50),
    title: 'Launch native mobile apps?',
    lessonTitle: 'App store economics',
    text: 'Users keep asking for an iOS/Android app. The app stores would boost discovery, but they take a cut of subscriptions bought in-app.',
    choices: [
      {
        label: 'Launch the apps',
        effect: (s, api) => { s.flags.appStore = true; api.addEffect(s, 'signups', 0.35, 600, 'App store presence'); api.addEffect(s, 'dev', -0.3, 3, 'Building apps'); return 'Apps are live. ~40% of new subscriptions now go through the stores.'; },
        lesson: 'App stores typically take 15–30% of in-app subscription revenue (15% for small developers and after a subscriber\'s first year, under current programs). Many apps steer users to web checkout where allowed. Mobile can still win on discovery and engagement.',
      },
      {
        label: 'Stay web-only for now',
        effect: () => 'Web only.',
        lesson: 'Staying web-first keeps margins and iteration speed high. A mobile-responsive web app is often enough until engagement data says otherwise.',
      },
    ],
  },
  {
    id: 'partnership',
    models: ['smb'],
    when: launchedWith(25),
    title: 'Integration partnership offer',
    lessonTitle: 'Partnerships and marketplaces',
    text: 'A popular platform your customers already use offers to list you in their integration marketplace if you build a deep integration (about 6 weeks of eng).',
    choices: [
      {
        label: 'Build the integration',
        effect: (s, api) => { api.addEffect(s, 'dev', -0.4, 2, 'Integration build'); api.addEffect(s, 'signups', 0.25, 600, 'Marketplace listing'); api.addEffect(s, 'churn', -0.003, 600, 'Sticky integration'); return 'Listed in the marketplace. A steady trickle of high-intent signups begins.'; },
        lesson: 'Integrations make your product stickier (more switching cost) and marketplaces can be a cheap, high-intent channel. Choose platforms your ICP already lives in.',
      },
      {
        label: 'Not now',
        effect: () => 'Maybe later.',
        lesson: 'Partnerships take time to pay off. Saying no is fine if you have a better channel to focus on.',
      },
    ],
  },
  {
    id: 'whale',
    models: ['smb', 'ent'],
    when: (s, api) => s.customers >= 5 && s.customers <= 40 && api.mrr(s) > 5000,
    title: 'Your biggest customer wants a discount',
    lessonTitle: 'Customer concentration',
    text: (s, api) => `Your largest customer (~${Math.round(100 / Math.max(3, s.customers / 2))}% of revenue) says a competitor offered them 40% off. They want you to match or they'll leave at renewal.`,
    choices: [
      {
        label: 'Match the 40% discount',
        effect: (s) => { const lost = (s.monthlyMrr + s.annualSlots.reduce((a, b) => a + b, 0)) * 0.4 / Math.max(3, s.customers / 2); s.monthlyMrr -= lost; return 'They stayed. Others may hear about it.'; },
        lesson: 'Big discounts under pressure set a precedent and anchor your value low. If one customer is a big share of revenue, you are exposed: diversify.',
      },
      {
        label: 'Offer 15% off for a 2-year prepaid contract',
        effect: (s) => { const per = (s.monthlyMrr + s.annualSlots.reduce((a, b) => a + b, 0)) / Math.max(3, s.customers / 2); s.monthlyMrr -= per * 0.15; s.cash += per * 0.85 * 24; return 'They signed a 2-year deal and prepaid. Cash in the bank.'; },
        lesson: 'Trade discount for something you value: longer commitment, prepayment, a case study, or a referral. Never give a discount without getting something back.',
      },
      {
        label: 'Hold firm',
        effect: (s, api) => { if (api.rng(s) < 0.5) { const per = (s.monthlyMrr + s.annualSlots.reduce((a, b) => a + b, 0)) / Math.max(3, s.customers / 2); s.monthlyMrr -= per; s.customers -= 1; return 'They left. It hurt.'; } return 'They stayed: switching cost more than they thought.'; },
        lesson: 'Holding firm works when switching is costly and your product is clearly better. Know your walk-away point and your BATNA before the call.',
      },
    ],
  },
  {
    id: 'cofounder-leaves',
    when: (s) => s.founders > 1 && s.month >= 9 && s.month <= 30 && s.morale < 60,
    title: 'Your co-founder wants to leave',
    lessonTitle: 'Co-founder departures',
    text: 'Your co-founder got an offer they can\'t refuse and wants to leave the company.',
    choices: [
      {
        label: 'Let them go amicably',
        effect: (s) => {
          s.founders = 1;
          if (!s.vesting) { s.deadEquity += s.founderEquity / 2; s.founderEquity /= 2; return 'They left with half the company. That will be an issue with investors.'; }
          const vested = s.month >= 12 ? Math.min(1, s.month / 48) : 0;
          s.deadEquity += (s.founderEquity / 2) * vested;
          s.founderEquity -= (s.founderEquity / 2) * vested;
          return `They left. Vesting means they keep ${Math.round(vested * 100)}% of their shares; the rest returns to the company.`;
        },
        lesson: 'Co-founder breakups are common. Vesting (typically 4 years with a 1-year cliff) makes them survivable: a departing founder keeps only what they have earned.',
      },
      {
        label: 'Convince them to stay with a raise and more responsibility',
        effect: (s) => { s.founderSalary = Math.max(s.founderSalary, 7000); s.morale = Math.min(100, s.morale + 10); return 'They stayed, but burn went up.'; },
        lesson: 'Sometimes a reluctant co-founder can be re-energized with a clearer role and fair pay. But a co-founder who wants out usually leaves eventually. Have the hard conversation early.',
      },
    ],
  },
];
