// The mentor: reads the company's state and gives the advice a good advisor would,
// grounded in common SaaS benchmarks. Pure function of state.

import * as E from './engine.js';

export function coach(s) {
  const tips = [];
  const add = (level, text) => tips.push({ level, text });
  const cfg = E.model(s);
  const m = E.metrics(s);
  const f = E.founderFTE(s);
  const mrr = E.mrr(s);
  const costs = E.monthlyCosts(s).total;
  const net = mrr - costs;
  const runway = net < 0 ? s.cash / -net : Infinity;
  const pmf = E.pmf(s);
  const bench = E.BENCH;

  if (runway < 1) add('bad', 'You run out of cash next month. Cut marketing and hiring immediately, or take financing now.');
  else if (runway < 4) add('bad', `Under ${Math.ceil(runway)} months of runway. Cut costs now (marketing first, then hiring), or raise bridge money. Rounds take 3–6 months to close, so you are already late.`);
  else if (runway < 9 && !s.raise && !s.flags.defaultAlive) add('warn', `${runway.toFixed(0)} months of runway. Rule of thumb: start fundraising with 9–12 months left, or get to profitability.`);

  if (s.phase === 'idea') {
    if (s.insight < 45 && f.research < 0.4) add('warn', 'Talk to customers before you build. Put real founder time into "Customer discovery": 20–30 problem interviews is a common target. Features built without insight mostly miss.');
    if (s.insight >= 60) add('good', 'Strong customer insight. Your interviews are converging on the same pain. Keep building the smallest version that solves it.');
    if (f.sell < 0.15) add('info', s.model === 'ent' ? 'Line up design partners now: 3–5 companies that agree to pilot your MVP. Their letters of intent also help you raise.' : 'Build a waitlist while you build: a landing page plus a post in the communities where your users hang out.');
    if (s.roundsRaised === 0 && s.insight > 55 && s.model === 'ent') add('info', 'Enterprise sales cycles are long. A pre-seed round now can fund you through the first 6–12 months of selling.');
    if (!tips.length) add('info', 'Build the smallest product that solves the core problem, and keep talking to the people who have it. Ship in weeks, not months.');
    return tips.slice(0, 4);
  }

  if (pmf < 40 && s.paidBudget > 0) add('bad', `Product–market fit is weak (${Math.round(E.ellisScore(s))}% would be "very disappointed" without you; the bar is 40%). Paid acquisition into a weak product is pouring water into a leaky bucket.`);
  if (pmf < 50 && f.research < 0.2) add('warn', 'Spend more founder time on customer discovery: talk to active and churned customers every week until retention flattens.');

  if (m.logoChurn != null && s.customers >= 10) {
    const [good, ok] = bench.logoChurn[s.model];
    if (m.logoChurn > ok) add('bad', `Monthly churn is ${(m.logoChurn * 100).toFixed(1)}% (healthy for ${cfg.short} is under ${(good * 100).toFixed(1)}%). Fix retention before scaling acquisition: onboarding, support coverage${cfg.invol && !s.dunning ? ', failed-payment recovery' : ''}, and price vs value.`);
  }
  if (s.lastMonth?.strain > 0) add('warn', 'Support is overloaded and it is driving churn. Hire support/customer success.');
  if (s.lastMonth?.unworked > 0.5) add('warn', 'Opportunities are going unworked. You need more selling capacity (founder sales time or account execs).');

  if (m.ltvCac != null && s.customers >= 10 && (s.paidBudget > 0 || E.teamCount(s, 'ae') > 0)) {
    if (m.ltvCac < 1) add('bad', `LTV:CAC is ${m.ltvCac.toFixed(1)}: every customer you acquire loses money. Raise prices, cut the least efficient channel, or improve conversion.`);
    else if (m.ltvCac < 3) add('warn', `LTV:CAC is ${m.ltvCac.toFixed(1)} (target 3+). Growth is expensive. Check which channel has the worst CAC.`);
    else if (m.ltvCac > 6 && runway > 12) add('good', `LTV:CAC is ${m.ltvCac.toFixed(1)}: you are probably under-investing in growth. You can afford to spend more to acquire customers.`);
  }
  if (m.payback != null && s.customers >= 10 && m.payback > bench.payback[s.model][1]) add('warn', `CAC payback is ${m.payback.toFixed(0)} months, above the ~${bench.payback[s.model][1]} months typical for ${cfg.short}. Long paybacks need lots of capital.`);

  if (s.price < cfg.price.ref * 0.6 && s.customers >= 10) add('info', `Your price ($${s.price}) is well below what similar ${cfg.short} products charge. Most founders underprice: test a higher price on new customers.`);
  if (!s.annualPlans && s.model !== 'ent' && s.customers >= 20) add('info', 'Offer annual plans (about 2 months free). Upfront cash extends runway and annual customers churn less.');
  if (cfg.invol && !s.dunning && s.customers >= 40) add('info', `Turn on dunning (failed-payment recovery). Involuntary churn is often 20–40% of churn for card-based subscriptions.`);
  if (s.model === 'ent' && s.soc2 === 'none' && s.customers >= 3) add('warn', 'Enterprise buyers increasingly require SOC 2. Without it, your win rate drops sharply after the first few design partners.');

  if (s.techDebt > 45) add('bad', `Tech debt is ${Math.round(s.techDebt)}: outages are likely and engineering is slowing down. Shift engineering focus toward refactoring.`);
  if (f.sell < 0.3 && mrr < 80000 && s.model !== 'b2c') add('warn', 'Founders should keep selling until there is a repeatable playbook (often ~$1M ARR). Don\'t delegate sales too early.');
  if (s.morale < 45) add('warn', 'Team morale is low. Expect resignations. Look at runway stress, founder pay, and wins to celebrate.');
  if (s.founderSalary === 0 && s.month > 18) add('info', 'You have been unpaid for over 18 months. Founder burnout is a real risk: pay yourselves a modest salary once revenue or funding allows.');
  if (s.raise && f.fundraise < 0.5) add('warn', 'You are raising, but founders spend little time on it. Fundraising is close to a full-time job for one founder.');

  if (m.burnMultiple != null && isFinite(m.burnMultiple) && m.burnMultiple > 2.5 && mrr > 20000) add('warn', `Burn multiple is ${m.burnMultiple.toFixed(1)} (you burn $${m.burnMultiple.toFixed(1)} for each $1 of new ARR). Investors like under 1.5.`);
  if (m.nrr != null && s.model !== 'b2c' && m.nrr > 1.1) add('good', `Net revenue retention is ${Math.round(m.nrr * 100)}%: your existing customers grow faster than they churn. That compounds powerfully.`);
  if (s.flags.defaultAlive && net > 0) add('good', 'You are profitable: "default alive". Raise only if extra capital clearly accelerates growth.');
  if (!tips.length) add('good', 'Fundamentals look healthy. Keep talking to customers and watch your churn and CAC every month.');

  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return tips.sort((a, b) => order[a.level] - order[b.level]).slice(0, 4);
}
