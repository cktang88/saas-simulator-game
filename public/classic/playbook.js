// Real-world SaaS founder playbook.
// Educational content only. Benchmarks are typical ranges widely cited by SaaS
// operators and investors as of the mid-2020s; they vary a lot by segment,
// price point, geography and year. Legal, tax and financing content is general
// information, not legal, tax or financial advice: check with a lawyer or
// accountant in your jurisdiction.

export const PLAYBOOK = [
  {
    id: "pick-problem",
    title: "Pick a problem and market",
    summary: "Most startups fail because nobody needs what they built, not because the code was bad. Choosing a painful problem for a reachable market you understand is the highest-leverage decision you make.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "pick-founder-market-fit",
        text: "List problems you have unfair insight into",
        detail: `Write down industries you have worked in, communities you belong to, and workflows you have done by hand for years. Founder-market fit means you already know the vocabulary, the buyers and the hidden pain, so you can sell before you build. Aim for 10-20 candidate problems before judging any of them. Ideas from your own job are often stronger than ideas from trend lists.`
      },
      {
        id: "pick-score-pain",
        text: "Score each problem: painful, frequent, expensive",
        detail: `Rate each candidate 1-5 on how painful it is, how often it happens, and how much money or time it costs today. Good SaaS problems are usually recurring (weekly or daily), because a subscription has to be justified every month. Look for evidence people already spend money or hacks on it: spreadsheets, duct-taped tools, hired freelancers. A problem nobody currently pays to solve is a warning sign, not an open field.`
      },
      {
        id: "pick-b2b-vs-b2c",
        text: "Decide B2C vs B2B with eyes open",
        detail: `B2C needs very large audiences, low prices (often $5-$20 per month), cheap acquisition and tolerates high churn; it is closer to a media business. B2B selling to small and mid businesses (SMB) means higher prices, lower churn, and buyers who pay to save time or make money. Enterprise B2B has the highest contract values but long sales cycles, security reviews and procurement. First-time founders without an audience usually find B2B SMB the most forgiving place to reach their first revenue.`
      },
      {
        id: "pick-icp",
        text: "Write a narrow ideal customer profile (ICP)",
        detail: `Describe exactly who has the problem: role, company size, industry, tools they use, and the trigger event that makes them look for a solution. For B2C describe the person, their situation and where they hang out online. Narrow beats broad: 'independent physiotherapy clinics with 2-10 staff in the UK' is actionable, 'small businesses' is not. You can expand later; you cannot sell to everyone at once.`
      },
      {
        id: "pick-bottom-up-sizing",
        text: "Size the market bottom-up, not top-down",
        detail: `Multiply the number of reachable customers by a realistic annual price: for example 40,000 clinics x $1,200 per year = $48M addressable revenue. Count customers from real sources such as industry associations, government business registries, LinkedIn searches or app store category data. Ignore '1% of a $50B market' slides; they say nothing about whether you can reach anyone. A bootstrapped business can thrive in a $10-50M niche, while venture investors usually want a credible path to $100M+ ARR.`
      },
      {
        id: "pick-competition",
        text: "Map competitors and current workarounds",
        detail: `List direct competitors, adjacent tools, and the 'do nothing' option (spreadsheets, email, an intern). Read their reviews on G2, Capterra, app stores and Reddit and note repeated complaints; these are your wedge. Competition is usually a sign of a real market, so do not panic if you find some. Worry more if there is no competition and no workaround, which often means the pain is not real.`
      },
      {
        id: "pick-reach",
        text: "Confirm you can reach the buyers cheaply",
        detail: `Before committing, name the three channels where you could reach 100 potential customers in a month: a community you are in, a list you can build, an audience you have. If you cannot name them, the idea may be fine but the business will be hard for you specifically. Distribution is a core part of the idea, not an afterthought.`
      }
    ],
    benchmarks: [
      ["Typical price point", "$5-$20/month", "$50-$1,000/month", "$15k-$250k+/year"],
      ["Customers needed for $1M ARR", "~5,000-15,000", "~100-1,500", "~5-60"],
      ["Typical buyer", "Individual", "Owner or team lead", "Committee (economic buyer, user, IT, legal)"]
    ]
  },

  {
    id: "validate",
    title: "Validate the problem",
    summary: "Validation means collecting evidence of real behavior, ideally money, before you write much code. Compliments and 'I would use that' are not evidence.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "validate-hypotheses",
        text: "Write down your riskiest assumptions",
        detail: `List the beliefs that must be true for the business to work: who has the problem, how they solve it today, that they would pay, and how you will reach them. Rank them by risk and test the riskiest first. Write each as a falsifiable statement with a threshold, for example 'at least 8 of 20 clinic owners spend 3+ hours per week on scheduling'.`
      },
      {
        id: "validate-interviews",
        text: "Run 20-30 problem interviews",
        detail: `Talk to 20-30 people who match your ICP, in 20-30 minute calls, following Mom Test principles (The Mom Test, 2013): ask about their life and past behavior, not your idea. Do not pitch; you are learning, not selling. Take notes on exact phrases they use, because those become your marketing copy. Stop when you keep hearing the same things; if you never do, your ICP is too broad.`
      },
      {
        id: "validate-past-behavior",
        text: "Ask about past behavior, not future intent",
        detail: `Good questions: 'Tell me about the last time this happened', 'What did you do about it?', 'What have you tried?', 'How much did that cost?'. Bad questions: 'Would you use an app that...?' or 'How much would you pay?', which invite polite lies. Strong signals are people who have already spent money or built workarounds, and who ask when they can try it.`
      },
      {
        id: "validate-smoke-test",
        text: "Run a landing page smoke test",
        detail: `Build a one-page site (Carrd, Framer, Webflow or plain HTML) with a clear headline about the outcome, three benefits, a price, and a call to action such as 'Join the waitlist' or 'Pre-order'. Drive a few hundred targeted visitors from communities or a small ad budget ($100-$500) and measure sign-up rate. As a rough rule of thumb, well-targeted traffic converting under ~5% suggests the message or audience is off, and 10%+ is encouraging; treat these as directional, not definitive. Showing a price filters out casual interest.`
      },
      {
        id: "validate-waitlist",
        text: "B2C: build a waitlist and test a referral hook",
        detail: `Collect emails and ask one qualifying question (for example 'what do you use today?'). Add a simple 'move up the list by inviting friends' mechanic to see if the problem spreads by word of mouth. Email the list every week or two with progress so it does not go cold. A waitlist of people who never open your emails is not demand.`,
        models: ["b2c"]
      },
      {
        id: "validate-presales",
        text: "B2B: ask for pre-sales or letters of intent",
        detail: `After a good interview, describe the solution and ask for a commitment: a paid pilot, a discounted annual pre-payment, or at minimum a letter of intent (LOI) naming price and timeline. A common target is 3-10 paying or signed design partners before building much. Money is the strongest validation; an LOI is weaker but still useful for enterprise, where budgets are set yearly. If nobody will commit anything, revisit the problem or ICP.`,
        models: ["smb", "ent"]
      },
      {
        id: "validate-kill-criteria",
        text: "Set kill/continue criteria in advance",
        detail: `Before you start, decide what result means continue, pivot, or stop, and when you will decide (for example in 3-4 weeks). Example: continue if 8+ of 25 interviewees describe the pain unprompted and 3+ commit money; otherwise pivot the ICP or problem. Writing this down protects you from sunk-cost bias and from falling in love with your solution.`
      }
    ],
    templates: [
      {
        title: "Customer interview script (problem interview)",
        body: `Intro (1 min)
"Thanks for your time. I'm researching how [role]s handle [problem area]. I'm not selling anything; I just want to learn how you work. Mind if I take notes?"

Context (5 min)
- Tell me about your role. What does a typical week look like?
- Where does [problem area] fit into that?

The problem (10-15 min)
- Tell me about the last time you dealt with [problem]. What happened?
- What did you do about it? Walk me through the steps.
- What was hardest or most annoying about that?
- How often does this happen? How much time or money does it cost?
- What have you tried to fix it? Tools, people, workarounds?
- Why did those not work, or what is still missing?
- Who else is involved or affected? Who decides on tools for this?

Spend and priority (5 min)
- Do you pay for anything related to this today? How much?
- Where does fixing this rank against your other priorities right now?

Wrap-up (2 min)
- Is there anything I should have asked but didn't?
- Who else should I talk to about this?
- Can I follow up when I have something to show you?

Rules: do not pitch, do not ask hypotheticals, write down exact quotes, and listen far more than you talk.`
      },
      {
        title: "Cold outreach message for interviews",
        body: `Subject: Quick question about [problem area]

Hi [First name],

I'm [your name], [one line of relevant background, e.g. "a former clinic manager now building tools for physios"].

I'm researching how [role]s at [type of company] handle [specific problem], and I noticed [personal detail: their post, company, role].

Would you be open to a 20-minute call this week or next? I'm not selling anything; I just want to learn how you do it today. Happy to share a summary of what I learn from other [role]s.

Thanks,
[Name]

Tips: send 1:1, not mass mail. Personalize the first line. Follow up once after 3-5 days. Expect low reply rates (often single digits for true cold outreach, much higher via warm intros and communities you belong to).`
      }
    ]
  },

  {
    id: "legal-setup",
    title: "Legal and company setup",
    summary: "General information only, not legal or tax advice. A clean structure, clear IP ownership and correct tax handling prevent expensive problems later; check with a lawyer or accountant in your jurisdiction.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "legal-entity",
        text: "Choose an entity that fits your funding plan",
        detail: `In the US, founders planning to raise venture capital commonly form a Delaware C-corporation, because investors and standard documents (like SAFEs) expect it. Founders bootstrapping often choose an LLC for simplicity and pass-through taxation. Other countries have their own equivalents (for example a UK Ltd or a German GmbH), and non-US founders sometimes use a Delaware parent; tax consequences differ a lot. This is general information: confirm with a lawyer or accountant in your jurisdiction before filing.`
      },
      {
        id: "legal-founder-agreement",
        text: "Sign a founders agreement with vesting",
        detail: `If you have co-founders, agree on equity split, roles, decision-making and what happens if someone leaves, in writing, early. The standard in venture-backed startups is 4-year vesting with a 1-year cliff for founders too, so a co-founder who leaves after 3 months does not walk away with a quarter of the company. Avoid equal splits made by default without discussion; avoid tiny splits that demotivate a key partner.`
      },
      {
        id: "legal-83b",
        text: "US: file an 83(b) election within 30 days",
        detail: `If you receive founder stock subject to vesting in a US corporation, an 83(b) election lets you be taxed on its value at grant (usually near zero) instead of as it vests. It must reach the IRS within 30 days of the stock grant, with no extensions; missing it can create large tax bills later. Keep proof of filing. Confirm the details with a US tax professional.`
      },
      {
        id: "legal-ip-assignment",
        text: "Assign all IP to the company",
        detail: `Every founder, employee and contractor should sign an agreement assigning work product and inventions to the company, including code written before incorporation. Investors and acquirers check this in due diligence, and missing assignments can block a deal. Be careful with code written on a current employer's time or equipment, because many employment contracts claim it.`
      },
      {
        id: "legal-terms-privacy",
        text: "Publish Terms of Service and a Privacy Policy",
        detail: `You need terms covering acceptable use, payment, refunds, liability limits and termination, plus a privacy policy explaining what data you collect and why. Templates and generators are a reasonable start for an MVP, but have a lawyer review them once you have real revenue or enterprise customers. B2B customers will often ask for a Data Processing Agreement (DPA) as well.`
      },
      {
        id: "legal-privacy-laws",
        text: "Learn GDPR and CCPA basics",
        detail: `If you have users in the EU or UK, GDPR applies: have a lawful basis for processing, collect only what you need, honor access and deletion requests, and sign DPAs with your subprocessors. California's CCPA/CPRA gives similar rights to California residents once you meet its thresholds, and other US states have their own laws. Practical habits: minimize personal data, keep a list of vendors that touch it, and do not add tracking you cannot justify.`
      },
      {
        id: "legal-banking",
        text: "Open a separate business bank account",
        detail: `Never mix personal and company money; it complicates taxes and, for some entity types, can weaken liability protection. Use a business account and keep receipts from day one, ideally with simple bookkeeping software. Set aside money for taxes as revenue comes in.`
      },
      {
        id: "legal-payments-tax",
        text: "Handle sales tax and VAT via your payment setup",
        detail: `Selling software internationally can create sales tax, VAT or GST obligations in many places, sometimes from the first sale (for example EU VAT on digital services to consumers). A merchant of record (MoR) such as Paddle sells on your behalf and handles collecting and remitting these taxes, for a higher fee (roughly 5% plus a small per-transaction fee is typical). With a payment processor like Stripe (around 2.9% + 30 cents per US card transaction, varies by country), you remain the seller and are responsible for registration and filing, though tools like Stripe Tax help calculate it. Confirm your obligations with an accountant.`
      }
    ]
  },

  {
    id: "build-mvp",
    title: "Build the MVP",
    summary: "The MVP is the smallest thing that reliably solves the core job for your first customers. Speed of learning matters more than polish or scale.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "mvp-core-job",
        text: "Define the one core job to be done",
        detail: `Write one sentence: 'When [situation], [customer] wants to [job] so they can [outcome]'. Cut every feature that does not serve that job for your first 10 customers. Settings pages, admin dashboards, integrations and mobile apps can usually wait. If a feature list has more than 3-5 items, it is not an MVP.`
      },
      {
        id: "mvp-concierge",
        text: "Start concierge or wizard-of-oz where possible",
        detail: `Concierge MVP: do the job for customers manually (spreadsheets, email, your own time) and charge for it. Wizard-of-oz: give them a simple front end while you do the work behind the scenes. This proves people value the outcome before you automate it, and shows you exactly which steps are worth building. Be honest that it is early; do not claim automation you do not have.`
      },
      {
        id: "mvp-buy-dont-build",
        text: "Buy, don't build, everything that is not your product",
        detail: `Use existing services for authentication (Auth0, Clerk, Supabase Auth or your framework's auth), billing (Stripe, Paddle), transactional email (Postmark, Resend, SendGrid), hosting and databases (managed platforms). These are solved problems, and building them yourself burns weeks and adds security risk. Use a boring, familiar tech stack; your customers do not care what framework you used.`
      },
      {
        id: "mvp-timebox",
        text: "Ship to real users in weeks, not months",
        detail: `Timebox the first version to roughly 2-8 weeks and put it in front of design partners or waitlist users as soon as it works end to end. Release small updates weekly. If you are 3+ months in with no users, you are probably building in the dark; cut scope and ship.`
      },
      {
        id: "mvp-activation-event",
        text: "Define your activation event",
        detail: `Activation is the first moment a user gets real value, for example 'sent first invoice', 'imported data and saw first report' or 'invited a teammate'. Pick the action that best predicts retention and design onboarding to reach it as fast as possible. Track the share of sign-ups who activate and the time it takes; improving this is usually cheaper than buying more traffic.`
      },
      {
        id: "mvp-analytics",
        text: "Instrument analytics from day one",
        detail: `Track a small set of events: sign-up, activation, key feature use, upgrade, cancel. Product analytics tools (PostHog, Amplitude, Mixpanel) or even a simple events table are enough. Respect privacy laws and add a consent banner where required. Without events you cannot run cohort analysis later.`
      },
      {
        id: "mvp-enterprise-basics",
        text: "Enterprise: plan for SSO and audit needs early",
        detail: `Enterprise buyers commonly require single sign-on (SAML/OIDC), role-based access, audit logs and data export. You do not need them for the first pilot, but design your data model so adding them later is not a rewrite. Services like WorkOS can add SSO quickly.`,
        models: ["ent"]
      }
    ]
  },

  {
    id: "pricing",
    title: "Pricing and packaging",
    summary: "Pricing is one of the biggest growth levers and the one founders neglect most. Charge from day one, tie price to value, and revisit it regularly.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "pricing-value-metric",
        text: "Choose a value metric",
        detail: `The value metric is what you charge per: seats, contacts, projects, transactions, usage volume. It should grow as the customer gets more value, be easy to understand and be predictable for the buyer. Per-seat is common in collaboration tools; usage-based fits infrastructure and APIs; flat tiers suit B2C. A good value metric creates built-in expansion revenue.`
      },
      {
        id: "pricing-tiers",
        text: "Package as good / better / best",
        detail: `Offer 2-4 tiers aimed at distinct customer segments, with the middle tier designed as the default choice. Gate tiers on things that correlate with willingness to pay (team size, advanced features, SSO, support level) rather than crippling the core value. Enterprise tiers are often 'contact us' because deals are negotiated. Keep it simple enough to understand in 30 seconds.`
      },
      {
        id: "pricing-charge-day-one",
        text: "Charge from day one",
        detail: `Charging early is the strongest validation signal and filters for real customers who give useful feedback. Discount for early adopters if you want, but avoid 'free until it is good'. Most founders underprice; if nobody pushes back on price, you are probably too cheap.`
      },
      {
        id: "pricing-annual",
        text: "Offer annual plans at a ~15-20% discount",
        detail: `Annual prepayment improves cash flow and reduces churn because customers commit for a year. A discount of roughly 15-20% (often framed as '2 months free') is common. For enterprise, annual or multi-year contracts are standard and billing may be by invoice rather than card.`
      },
      {
        id: "pricing-trial-vs-freemium",
        text: "Pick free trial vs freemium deliberately",
        detail: `Free trials (often 7-30 days) create urgency; opt-in trials without a card commonly convert in the low teens to around 25% of trial starts, while card-required trials often convert 40-60% but get far fewer starts. Freemium can drive volume and word of mouth but typically converts only about 2-5% of free users, so it needs a large top of funnel and low cost to serve. These ranges vary widely by product and audience. Many B2B products start with a trial and add freemium later only if it clearly helps.`
      },
      {
        id: "pricing-test",
        text: "Test willingness to pay directly",
        detail: `In sales calls, state a price confidently and watch the reaction; a few no's on price are healthy. Try price variants on the landing page for new visitors only. Van Westendorp-style surveys (too cheap, cheap, expensive, too expensive) give a rough range but are weaker than real purchase behavior.`
      },
      {
        id: "pricing-raise",
        text: "Raise prices regularly and grandfather fairly",
        detail: `Revisit pricing at least yearly or after major product improvements; many SaaS companies raise prices as their product matures. Common practice is to grandfather existing customers at their old price for some period, or give generous notice (for example 30-90 days), to protect trust. Raising prices for new customers first is a low-risk test.`
      }
    ],
    benchmarks: [
      ["Freemium free-to-paid conversion", "~1-5%", "~2-5%", "Rare; usually sales-led"],
      ["Opt-in trial (no card) to paid", "~5-15%", "~10-25%", "Pilots/POCs instead"],
      ["Card-required trial to paid", "~30-60%", "~40-60%", "—"],
      ["Annual plan discount", "~15-20%", "~15-20%", "Negotiated; multi-year discounts common"]
    ]
  },

  {
    id: "first-customers",
    title: "Get the first 10-100 customers",
    summary: "Your first customers come from doing things that don't scale: personal outreach, communities and hand-holding. You are looking for repeatable patterns, not efficient channels yet.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "first-unscalable",
        text: "Do things that don't scale",
        detail: `Recruit users one by one, onboard them personally, and fix their problems the same day. The essay 'Do Things That Don't Scale' (2013) is the classic reference. Your first 10 customers should feel like they have a direct line to the founder, because they do.`
      },
      {
        id: "first-founder-sales",
        text: "Founders sell first; don't hire sales yet",
        detail: `Founders should close the first 10-50 B2B customers themselves, because you need to hear objections firsthand and adjust the product and pitch. Hiring a salesperson before you have a repeatable process usually fails. Track every conversation in a simple CRM (a spreadsheet, HubSpot free, Attio, Pipedrive).`,
        models: ["smb", "ent"]
      },
      {
        id: "first-outbound",
        text: "B2B: run targeted outbound",
        detail: `Build a list of 100-300 accounts that match your ICP using LinkedIn, industry directories or data tools, and find the right person at each. Send short, personal emails or LinkedIn messages about a specific problem; follow up 2-3 times over 2 weeks. Expect low reply rates for true cold outreach (often low single digits), so personalization and list quality matter more than volume. Follow email laws such as CAN-SPAM and GDPR, and do not spam.`,
        models: ["smb", "ent"]
      },
      {
        id: "first-communities",
        text: "Show up in communities where your users are",
        detail: `Find the subreddits, Slack and Discord groups, forums, Facebook groups and industry associations your ICP uses. Contribute useful answers for weeks before mentioning your product, and follow each community's self-promotion rules. Founders who are known as helpful members get far better results than those who drop links.`
      },
      {
        id: "first-launches",
        text: "Launch on Product Hunt, Hacker News and niche sites",
        detail: `Launches give a short spike of traffic and early adopters, mainly useful for developer, productivity and prosumer tools. Prepare a clear post, a demo video or GIF, and be available all day to answer comments. On Hacker News, a 'Show HN' post should be humble and technical. Treat launches as one-off boosts, not a growth strategy.`
      },
      {
        id: "first-b2c-content",
        text: "B2C: content, social and creators",
        detail: `Short-form video (TikTok, Reels, Shorts) and SEO content can reach consumers cheaply if you post consistently, often daily for months. Partner with small creators in your niche via affiliate deals or flat fees; micro-creators often have better engagement per dollar than large ones. Test many hooks quickly and double down on formats that work.`,
        models: ["b2c"]
      },
      {
        id: "first-referral-loops",
        text: "Build referral and sharing loops",
        detail: `Give users a reason to invite others: two-sided rewards (both get a month free), collaborative features, or shareable outputs with your brand on them. Measure invites sent per user and conversion of invites. Referral loops work best once users already love the product; they amplify retention, they do not replace it.`,
        models: ["b2c", "smb"]
      },
      {
        id: "first-design-partners",
        text: "Enterprise: land 3-5 design partners",
        detail: `Use your network, investors and advisors to get warm introductions to target companies. Offer a paid or discounted pilot with clear success criteria, timeline and a path to a full contract. Design partners shape the roadmap and become reference customers that later enterprise buyers will want to call.`,
        models: ["ent"]
      }
    ],
    templates: [
      {
        title: "B2B cold email (sales)",
        body: `Subject: [Specific pain] at [Company]?

Hi [First name],

[Personal first line: something specific about them or their company.]

Most [role]s I talk to at [type of company] spend [specific time/cost] on [problem], usually with [current workaround].

We built [product] to [outcome in one line]. [Similar customer] went from [before] to [after] in [time].

Worth a 15-minute call next week to see if it fits [Company]?

[Name]
[Title, company, one-line credibility]

Follow-up 1 (3-4 days later): "Bumping this in case it got buried. Is [problem] a priority this quarter?"
Follow-up 2 (1 week later): share one useful resource or result, then ask once more.
Break-up (1 week later): "I'll assume the timing is off. Should I check back in a few months?"

Rules: one person per email, under ~120 words, one clear ask, no attachments in the first email, honor opt-outs.`
      }
    ]
  },

  {
    id: "find-pmf",
    title: "Find product-market fit",
    summary: "Product-market fit is when a specific market pulls the product from you: users retain, refer others and would be upset to lose it. Retention data, not revenue alone, tells you whether you have it.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "pmf-sean-ellis",
        text: "Run the Sean Ellis 40% survey",
        detail: `Ask active users: 'How would you feel if you could no longer use [product]?' with answers Very disappointed / Somewhat disappointed / Not disappointed. Sean Ellis's rule of thumb is that 40% or more answering 'very disappointed' indicates strong product-market fit. Survey only people who have used the product recently and meaningfully (at least 30-40 responses for a rough signal). Ask the 'very disappointed' group what the main benefit is and who it is for; that tells you your true ICP.`
      },
      {
        id: "pmf-retention-curve",
        text: "Check that retention curves flatten",
        detail: `Plot the percentage of each sign-up cohort still active (or paying) at month 1, 2, 3 and so on. If the curve keeps sliding toward zero, you do not have product-market fit with that group. If it flattens at a stable level, a core group has found lasting value. Where it flattens matters: a B2B tool flattening at 70-80%+ revenue retention is strong, while consumer apps often flatten much lower.`
      },
      {
        id: "pmf-cohorts",
        text: "Analyze cohorts, not averages",
        detail: `Group customers by sign-up month, acquisition channel, plan and segment, and compare retention and expansion. Averages hide the truth; often one segment retains well and others churn. Double down on the segment that retains and stop acquiring the segments that do not. A spreadsheet is enough at this stage.`
      },
      {
        id: "pmf-churn-interviews",
        text: "Talk to every churned customer you can",
        detail: `Ask for a short call or survey when people cancel: why they signed up, what they expected, what went wrong, and what they use instead. Classify reasons (wrong fit, missing feature, didn't activate, price, went out of business). Many 'price' complaints are really 'not enough value'. Fix the top reason within your ICP before anything else.`
      },
      {
        id: "pmf-onboarding",
        text: "Improve onboarding and time-to-value",
        detail: `Watch new users' first session and remove every step between sign-up and the activation event. Use templates, sample data, checklists and short emails triggered by what users have or have not done. Small gains in activation compound across every future cohort.`
      },
      {
        id: "pmf-signals",
        text: "Recognize the qualitative signals",
        detail: `Real fit tends to look like: customers referring others unprompted, usage growing without your pushing, sales cycles getting shorter, and users complaining loudly when something breaks. Without fit, every sale feels like pushing a boulder. Be honest with yourself; many companies scale too early and burn cash on a leaky product.`
      },
      {
        id: "pmf-pivot",
        text: "Know when to pivot",
        detail: `If after several months of real effort retention will not flatten and nobody would be very disappointed, change something significant: the ICP, the problem, or the solution. Pivot toward the strongest signal you already have (the one segment that loves it, or the feature everyone uses). Keep pivots grounded in customer evidence, not new hunches.`
      }
    ],
    benchmarks: [
      ["Sean Ellis 'very disappointed'", "40%+", "40%+", "40%+"],
      ["Logo churn (monthly, rough)", "~5-10%+ (often higher for apps)", "~3-7%", "<1% (~5-10% annually)"],
      ["Net revenue retention (annual)", "Often <100%; rarely tracked", "~90-110%", "~110-130% for strong companies"]
    ]
  },

  {
    id: "unit-economics",
    title: "Unit economics and metrics",
    summary: "Unit economics tell you whether each customer makes or loses money and how efficiently you grow. Know the formulas, track them monthly, and compare against benchmarks for your model.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "metrics-mrr",
        text: "Track MRR and ARR correctly",
        detail: `MRR (monthly recurring revenue) is the sum of normalized monthly subscription revenue; annual plans count as 1/12 per month. ARR = MRR x 12. Exclude one-time setup fees and services. Break MRR changes into new, expansion, contraction, churned and reactivated so you see what is driving growth.`
      },
      {
        id: "metrics-churn",
        text: "Measure logo churn and revenue churn separately",
        detail: `Logo churn = customers lost in a period / customers at the start. Revenue (gross) churn = MRR lost from cancellations and downgrades / starting MRR. Net revenue retention (NRR) = (starting MRR + expansion - contraction - churn) / starting MRR, usually measured over 12 months. NRR above 100% means your existing customers grow revenue even with no new sales, which is the hallmark of strong B2B SaaS.`
      },
      {
        id: "metrics-cac",
        text: "Calculate CAC by channel",
        detail: `CAC (customer acquisition cost) = total sales and marketing spend in a period (including salaries, tools and ad spend) / new customers acquired. Blended CAC hides problems, so also compute it per channel. Early on, include the value of your own time spent selling, or you will fool yourself that founder-led sales are free.`
      },
      {
        id: "metrics-ltv",
        text: "Estimate LTV and LTV:CAC",
        detail: `A simple LTV (lifetime value) = average revenue per account per month x gross margin % / monthly churn rate. Example: $100/month x 80% / 3% = about $2,667. A widely used target is LTV:CAC of 3:1 or better; much higher may mean you are underinvesting in growth. LTV estimates from a few months of data are very uncertain, so cap assumed lifetimes (for example 3-5 years) and pair this with payback.`
      },
      {
        id: "metrics-payback",
        text: "Track CAC payback period",
        detail: `CAC payback (months) = CAC / (monthly revenue per customer x gross margin %). It shows how long your cash is tied up in each new customer. Shorter payback means you can grow faster on less capital; for bootstrapped companies it is often the most important single number.`
      },
      {
        id: "metrics-gross-margin",
        text: "Keep gross margin around 70-85%",
        detail: `Gross margin = (revenue - cost of goods sold) / revenue. For SaaS, COGS includes hosting, third-party APIs, payment fees and customer support or onboarding staff. Typical software gross margins are around 70-85%; AI products with heavy model inference costs often run lower and must watch this closely. Low margins shrink LTV and make every other metric worse.`
      },
      {
        id: "metrics-burn-multiple",
        text: "Watch burn multiple and the Rule of 40",
        detail: `Burn multiple = net cash burned / net new ARR in the same period; the popular burn-multiple guide treats under 1 as excellent, 1-1.5 good, 1.5-2 suspect and over 2 bad. The Rule of 40 says revenue growth rate % + profit margin % should be at least 40, mostly applied to companies at scale (roughly $10M+ ARR). Early-stage companies are judged more on growth and retention, but burn efficiency matters more since the 2022 funding reset.`
      },
      {
        id: "metrics-dunning",
        text: "Reduce involuntary churn with dunning",
        detail: `A meaningful share of churn in card-billed SaaS is involuntary: failed payments from expired or declined cards. Turn on automatic card updater and smart retries in your billing tool, send pre-expiry and failed-payment emails, and add an in-app banner. This is often the cheapest churn reduction available.`
      }
    ],
    benchmarks: [
      ["Gross margin", "~60-85% (app store fees reduce it)", "~70-85%", "~70-85%"],
      ["LTV:CAC", ">= 3:1", ">= 3:1", ">= 3:1"],
      ["CAC payback", "Ideally < 6-12 months", "~6-18 months (<12 good)", "~12-24 months"],
      ["Monthly revenue churn", "~5-10%+", "~2-5%", "< 1%"],
      ["Net revenue retention (annual)", "~70-100%", "~90-110%", "~110-130%+"],
      ["Burn multiple", "< 1 excellent, > 2 bad", "< 1 excellent, > 2 bad", "< 1 excellent, > 2 bad"],
      ["Rule of 40 (at scale)", "Growth % + margin % >= 40", "Growth % + margin % >= 40", "Growth % + margin % >= 40"]
    ]
  },

  {
    id: "scale-gtm",
    title: "Scale go-to-market",
    summary: "Once retention is solid, scale the channels that worked for your first customers. The right motion depends mostly on your average contract value (ACV) and buyer.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "scale-acv-motion",
        text: "Match sales motion to ACV",
        detail: `A common rule of thumb: under about $1k per year, customers must self-serve because you cannot afford human sales; roughly $1k-$15k supports product-led growth with inside sales assist; above about $15k-$25k, dedicated account executives and longer sales cycles become viable. Mismatches are a classic failure mode, such as field sales for a $50/month product or pure self-serve for complex enterprise software.`
      },
      {
        id: "scale-b2c-paid",
        text: "B2C: scale paid acquisition carefully",
        detail: `Paid social and search can scale B2C quickly, but CAC usually rises as you exhaust the most responsive audiences (channel saturation). Track CAC and payback by campaign weekly, refresh creatives often, and cap spend where marginal CAC exceeds your payback target. Diversify into organic, referral and partnerships so one platform's price or policy change cannot kill you.`,
        models: ["b2c"]
      },
      {
        id: "scale-b2c-virality",
        text: "B2C: measure virality (k-factor)",
        detail: `K-factor = invites sent per user x conversion rate of invites. Above 1 means each user brings more than one new user, which is rare and usually temporary; even 0.2-0.5 meaningfully lowers blended CAC. Cycle time (how fast invites happen) matters as much as k.`,
        models: ["b2c"]
      },
      {
        id: "scale-app-stores",
        text: "B2C: account for app store fees and rules",
        detail: `Apple and Google have historically charged 30% on in-app digital purchases, with 15% for smaller developers enrolled in their small business programs and for many subscriptions after the first year. Rules about linking to web checkout have been changing in several jurisdictions in the mid-2020s, so check current policies for your markets. Build these fees into your gross margin and pricing.`,
        models: ["b2c"]
      },
      {
        id: "scale-smb-plg",
        text: "SMB: combine PLG with inside sales",
        detail: `Let users sign up and get value on their own, then use product usage data to flag accounts worth a sales touch (product-qualified leads, for example teams that invite 5+ users or hit plan limits). Inside sales reps work these leads by video call. Keep the self-serve path working for customers who never want to talk to anyone.`,
        models: ["smb"]
      },
      {
        id: "scale-hire-aes",
        text: "SMB/Ent: hire account executives with realistic ramps",
        detail: `Hire your first two salespeople together so you can tell whether failure is the person or the process. New account executives (AEs) typically need about 3 months to ramp in SMB, and often 6+ months in enterprise. A common rule of thumb is annual quota of about 4-6x on-target earnings (OTE), with OTE often split around 50/50 base and commission. Write down the sales playbook you used as a founder before they start.`,
        models: ["smb", "ent"]
      },
      {
        id: "scale-ent-cycle",
        text: "Enterprise: plan for long cycles and security reviews",
        detail: `Enterprise sales cycles commonly run 3-12 months and involve champions, economic buyers, IT, security, legal and procurement. Expect security questionnaires; a SOC 2 report (Type I first, then Type II) or ISO 27001 is often required, and compliance automation tools like Vanta or Drata can shorten the work to a few months. Budget for it before your first big deal stalls on it.`,
        models: ["ent"]
      },
      {
        id: "scale-ent-meddicc",
        text: "Enterprise: qualify with MEDDICC and run structured pilots",
        detail: `MEDDICC stands for Metrics, Economic buyer, Decision criteria, Decision process, Identify pain, Champion and Competition; use it to decide which deals are real and what is missing. Run pilots with written success criteria, a fixed timeline (often 30-90 days) and an agreed price for conversion. Unstructured free pilots tend to drag on and rarely convert.`,
        models: ["ent"]
      }
    ],
    benchmarks: [
      ["Typical motion", "Self-serve, paid + organic", "PLG + inside sales", "Field / enterprise sales"],
      ["Typical sales cycle", "Minutes", "Days to ~1-2 months", "~3-12 months"],
      ["AE ramp time", "—", "~3 months", "~6+ months"],
      ["AE annual quota vs OTE", "—", "~4-6x OTE", "~4-6x OTE"]
    ]
  },

  {
    id: "funding",
    title: "Funding paths",
    summary: "Venture capital is one option, not the default. Pick the funding path that matches your market size, growth ambitions and how much control you want to keep. General information, not financial advice.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "funding-bootstrap",
        text: "Consider bootstrapping and stay default-alive",
        detail: `Bootstrapping means funding growth from revenue and savings; you keep control and ownership, and a $1-10M ARR business can be life-changing for its founders. the essay 'default alive' test asks: at current growth and expenses, will you reach profitability before the money runs out? Know your runway (cash / monthly net burn) at all times. Many successful SaaS companies are bootstrapped or raised very little.`
      },
      {
        id: "funding-rbf",
        text: "Know revenue-based financing",
        detail: `Revenue-based financing (RBF) gives you cash now in exchange for a share of future monthly revenue until a fixed total (a multiple of the advance) is repaid. It is non-dilutive and suits companies with steady recurring revenue and clear uses such as marketing with known payback. Compare the effective annual cost to other options carefully; it can be expensive.`
      },
      {
        id: "funding-safes",
        text: "Pre-seed: understand SAFEs and valuation caps",
        detail: `Pre-seed and angel money in the US is commonly raised on SAFEs (simple agreements for future equity), most often the Y Combinator post-money SAFE. A post-money valuation cap makes dilution easy to calculate: an investor putting $500k on a $5M post-money cap owns about 10% when the SAFE converts. Stacking many SAFEs adds up quickly, so model your total dilution before signing each one. Have a lawyer review terms.`
      },
      {
        id: "funding-seed",
        text: "Seed: raise to reach clear milestones",
        detail: `A seed round funds the search for repeatable growth, typically 18-24 months of runway. Investors in the mid-2020s usually want to see real traction (paying customers, strong retention or fast early growth) more than in the 2021 era. Raise enough to hit the milestones the next round requires, plus a buffer.`
      },
      {
        id: "funding-series-a",
        text: "Know the Series A bar",
        detail: `In the mid-2020s, a common Series A bar for B2B SaaS has been roughly $1-3M ARR with strong growth (often 2-3x year over year or better), good retention and evidence of a repeatable go-to-market motion. The bar moves with market conditions and varies by sector, and AI companies have sometimes been held to different standards. Do not plan around a round you might not get.`
      },
      {
        id: "funding-terms",
        text: "Read the terms that matter, not just valuation",
        detail: `A 1x non-participating liquidation preference is standard in priced rounds: investors get their money back first or convert to common, whichever is higher. Watch out for participating preferences, multiples above 1x, full-ratchet anti-dilution, and unusual control or veto rights. Board composition and option pool size (often expanded before the round, diluting only existing holders) matter as much as headline valuation.`
      },
      {
        id: "funding-dilution",
        text: "Model dilution across rounds",
        detail: `Each priced round commonly dilutes existing holders by roughly 15-25%, plus any option pool increase. After seed, Series A and B, founders together often own well under half the company. Build a simple cap table and model several scenarios so you understand what an exit at different prices means for you and your team.`
      }
    ],
    benchmarks: [
      ["Dilution per priced round", "~15-25%", "~15-25%", "~15-25%"],
      ["Series A traction bar (mid-2020s)", "Strong usage and revenue growth; varies", "~$1-3M ARR, 2-3x YoY growth", "~$1-3M ARR, strong logos and pipeline"],
      ["Typical liquidation preference", "1x non-participating", "1x non-participating", "1x non-participating"]
    ]
  },

  {
    id: "hiring",
    title: "Hiring and running the company",
    summary: "Your first hires shape the culture and the product for years. Hire slowly, budget for the full cost of people, and protect the founders' energy.",
    appliesTo: ["b2c", "smb", "ent"],
    steps: [
      {
        id: "hiring-first-hires",
        text: "Hire for the bottleneck, not the org chart",
        detail: `Your first hires should remove the biggest constraint on growth: usually engineering if you cannot ship fast enough, or customer success/support if founders are drowning in tickets. Prefer generalists who are comfortable with ambiguity. Do not hire senior executives to 'build a team' before there is a working process to manage.`
      },
      {
        id: "hiring-contractors",
        text: "Use contractors and freelancers deliberately",
        detail: `Contractors are flexible for well-defined work such as design, content, or specific features, and avoid long-term commitments. Make sure they sign IP assignment and confidentiality agreements. Misclassifying someone who works like an employee as a contractor can create legal and tax liability in many countries; check local rules.`
      },
      {
        id: "hiring-loaded-cost",
        text: "Budget the fully-loaded cost",
        detail: `An employee typically costs about 1.2-1.4x their base salary in the US once you add payroll taxes, benefits, equipment and software; the multiplier differs by country and can be higher where employer social charges are large. Use the loaded number in your runway model. Hiring is the main driver of burn at most startups.`
      },
      {
        id: "hiring-equity",
        text: "Grant early employees meaningful equity",
        detail: `Early employees take risk and are often paid below market, so offer stock options with standard 4-year vesting and a 1-year cliff. Grant sizes vary widely by role, stage and location; use current benchmark data from your lawyer, investors or equity management platforms rather than guesses. Explain the options clearly, including strike price and exercise window.`
      },
      {
        id: "hiring-operating-cadence",
        text: "Set a simple operating cadence",
        detail: `Hold a weekly metrics review (MRR, new customers, churn, activation, pipeline), write down a few goals per quarter, and send a short monthly update to investors or advisors. Keep a 13-week cash forecast. Simple rhythms help a small team focus without bureaucracy.`
      },
      {
        id: "hiring-burnout",
        text: "Protect founder health and avoid burnout",
        detail: `Startups are a multi-year effort; chronic overwork degrades judgment exactly when decisions matter most. Protect sleep, exercise and time off, and have peers (founder groups, mentors) you can talk to honestly. Co-founder conflict is a leading cause of startup failure, so address tensions early and directly.`
      }
    ]
  }
];
