// Website customer panel: concrete, different people. Each panelist is built from the company's customer type
// (core/customer-type.js), a buyer segment (data/buyer-segments.js committees, or a consumer persona for B2C) and a
// hidden person drawn from the market truth (core/truth.js drawPerson), so a visitor from a hair-on-fire segment reads
// the page differently from one who barely has the problem.
//
// A panel always mixes four seats: a hands-on USER, a CHAMPION who would push for it, the ECONOMIC BUYER who pays,
// and a SKEPTIC who can block (security, IT, bookkeeper, Shopify developer, procurement, a privacy-minded consumer).
// Each seat has its own job-to-be-done, current tools, past bad vendor experiences, reading style, price sensitivity,
// jargon tolerance and role biases. These feed (a) a per-panelist LLM system prompt and (b) per-panelist weights in the
// deterministic offline judge (apps/website.js heuristicJudge).
//
// Hidden truth never reaches the player directly: `persona.hidden` (pain, incident, workaround) goes only into the
// prompt and the offline judge; the UI renders `publicPersona(p)`.
//
// Attitudes, weights and voice lines are [design] archetypes built from the committee roles and concerns in
// docs/research/buyer-segments.md and docs/research/customer-types/*.md; they are not statistics.

import { hash } from '../../core/util.js';
import { customerTypeOf, profileOf } from '../../core/customer-type.js';
import { truthOf, icpFocus, drawPerson } from '../../core/truth.js';
import { getSegment } from '../../data/buyer-segments.js';
import { B2C_PERSONAS } from '../../data/market-truth.js';

// ---------------------------------------------------------------------------------------------- signals
// What a visitor can look for on the page. The offline judge checks these; each persona weighs them differently.
export const SIGNAL_LABELS = {
  proof: 'customers like me',
  price: 'pricing',
  numbers: 'numbers I could check',
  security: 'security (SOC 2, SSO, where the data lives)',
  integrations: 'the tools it connects to',
  docs: 'docs or an API reference',
  setup: 'setup and who does it',
  human: 'a phone number or a real person',
  roi: 'what it saves or earns, in numbers',
  cancel: 'cancelling and contract terms',
  mobile: 'using it on a phone',
  privacy: 'what happens to my data',
  speed: 'what it does to store speed',
};

// ---------------------------------------------------------------------------------------------- voices
// Comment lines per voice family, in the visitor's own words: opinions and facts about what they saw or could not
// find. Never coaching ("a stellar operator would..."). {uses} {need} {company} are filled per persona.
const VOICES = {
  builder: {
    buzz: 'Marketing fog. I scrolled twice and still can\'t tell what it actually does.',
    unclear: 'I can\'t work out what this does from the top of the page.',
    notForMe: 'Doesn\'t look like it solves anything I deal with.',
    meh: 'Plausible, but nothing here makes me drop {uses}.',
    good: 'Clear about what it does, and I could try it without talking to anyone. Good sign.',
    pain: 'We hit exactly this {ago}, so I read further than I usually would.',
    noPain: 'Honestly, what we have covers this well enough.',
    need: 'Nothing on {need}. I don\'t sign up for things I can\'t inspect first.',
    noPrice: 'No pricing. That usually means "talk to sales".',
    noProof: 'Nobody I recognise uses it, and nothing shows how it works.',
    noCta: 'I couldn\'t find where to just try it.',
    buzzConf: 'What does "AI-powered" mean here, concretely?',
    jargon: '',
    long: '',
  },
  doer: {
    buzz: 'Lots of buzzwords. I just want to know if it takes the boring part off my day.',
    unclear: 'I don\'t get what I\'d actually do with it.',
    notForMe: 'Doesn\'t touch the part of my job that hurts.',
    meh: 'Could save me some time, but I\'m the one who\'d have to learn it.',
    good: 'I can see exactly what I\'d do with it on day one. I\'d try it.',
    pain: 'This happened to me {ago} and I fixed it by hand. I\'d love that gone.',
    noPain: 'My current way is clunky, but it works.',
    need: 'Couldn\'t find anything on {need}. Without that it\'s no use to me.',
    noPrice: 'No price, so I\'d have to ask someone with a budget.',
    noProof: 'Nobody who does my job says it helped.',
    noCta: 'Where do I try it?',
    buzzConf: 'What does it actually do, step by step?',
    jargon: 'Half the words here I\'d have to look up.',
    long: 'I gave up halfway down the page.',
  },
  operator: {
    buzz: 'Lots of big words. I still don\'t know what changes for my team on Monday.',
    unclear: 'I\'m not sure what it does or who on my team would use it.',
    notForMe: 'This isn\'t a problem my team has right now.',
    meh: 'Could be useful. I\'d need to see it next to {uses} before I push for it.',
    good: 'I can picture my team using this. I\'d want to show it to my boss.',
    pain: 'This is the thing that blew up on us {ago}. Got my attention.',
    noPain: 'Nice to have. It\'s not what keeps me up at night.',
    need: 'I couldn\'t find anything on {need}. That\'s the first thing my boss will ask.',
    noPrice: 'No price, so I can\'t tell if it fits our budget without a sales call.',
    noProof: 'No teams like mine saying it worked. I\'d be the guinea pig.',
    noCta: 'Not obvious what the next step is.',
    buzzConf: 'Too many generic claims. What exactly does it replace?',
    jargon: 'Some of this reads like it was written for engineers.',
    long: 'Long page. I skimmed the headings and lost the thread.',
  },
  owner: {
    buzz: 'Sounds like every other ad I get. What does it actually do for my business?',
    unclear: 'I read the top twice and I still don\'t know what it does.',
    notForMe: 'Not for a business like mine, as far as I can tell.',
    meh: 'Maybe. I\'d have to see it really beats {uses} before I pay for another thing.',
    good: 'Plain English, a price and a way to reach someone. I\'d try it.',
    pain: 'This bit us {ago}. If it fixes that, I\'m interested.',
    noPain: 'We get by fine the way we do it now.',
    need: 'I looked for {need} and didn\'t see it. I won\'t sign up without that.',
    noPrice: 'No price anywhere. If I have to call to find out, it costs too much.',
    noProof: 'No other owners like me vouching for it.',
    noCta: 'I don\'t see a button to get started.',
    buzzConf: 'What do all these words mean for my business?',
    jargon: 'Too techy. API, integrations, workflows... I just want it to work.',
    long: 'Too much to read on my phone after closing.',
  },
  founder: {
    buzz: 'Buzzword soup. Every AI tool says this.',
    unclear: 'Couldn\'t tell what it is in the time I gave it.',
    notForMe: 'Not a priority for us right now.',
    meh: 'Interesting, but it has to replace a cost or a hire, and I don\'t see which.',
    good: 'I get it in five seconds and the price is right there. Worth a look.',
    pain: 'We lost real time to this {ago}. I\'d pay to not do that again.',
    noPain: 'Not something we\'re losing money on.',
    need: 'Nothing on {need}, and I\'m not booking a call to find out.',
    noPrice: 'No pricing. Hidden price means a sales cycle; I don\'t have time for one.',
    noProof: 'No numbers from anyone like us.',
    noCta: 'No obvious way to start.',
    buzzConf: 'What does it actually do, in one sentence?',
    jargon: '',
    long: 'Too long for a phone between meetings.',
  },
  money: {
    buzz: 'Claims without numbers. I can\'t put this in a business case.',
    unclear: 'I can\'t tell what we\'d be paying for.',
    notForMe: 'I don\'t see a budget line this would come out of.',
    meh: 'Fine, but I\'d need the cost next to what we pay for {uses} today.',
    good: 'Pricing, terms and a result in numbers. I can work with that.',
    pain: 'We have been paying for this problem since {ago}. Show me the math.',
    noPain: 'Not a cost we are worried about.',
    need: 'Nothing on {need}. That makes it hard to approve.',
    noPrice: 'No price and no terms. I can\'t compare it to anything.',
    noProof: 'No case study with a measured result.',
    noCta: 'No clear way to get a quote or start.',
    buzzConf: 'What exactly is the return, and over what period?',
    jargon: 'Hard to tell what it costs to run, under the jargon.',
    long: 'Plenty of words, no numbers.',
  },
  gatekeeper: {
    buzz: 'Hype, and nothing I could put in a vendor review.',
    unclear: 'I can\'t tell what it touches in our systems.',
    notForMe: 'Not something I\'d have to approve, from what I can see.',
    meh: 'No red flags yet, but nothing that gets it past {uses} either.',
    good: 'They answer the questions I would ask. Unusual for a small vendor.',
    pain: 'We had a mess like this {ago}. Doesn\'t mean I\'ll skip the review.',
    noPain: 'One more vendor to review, for a problem we have handled.',
    need: 'Nothing on {need}. That\'s an automatic no from me until I see it.',
    noPrice: 'No pricing, so this ends up in a sales process I\'ll have to review anyway.',
    noProof: 'No references I could call.',
    noCta: 'No path to a trial I could test in a sandbox.',
    buzzConf: '"Bank-grade", "secure"... based on what?',
    jargon: 'They use the words without saying what they actually mean.',
    long: '',
  },
  consumer: {
    buzz: 'Sounds like an ad. What does the app actually do?',
    unclear: 'Not sure what this is from the first screen.',
    notForMe: 'Not for me.',
    meh: 'Might try it, but {uses} is free and fine.',
    good: 'Gets it fast, shows the price, looks easy. I\'d give it a go.',
    pain: 'I was annoyed by exactly this {ago}. Tempting.',
    noPain: 'I don\'t really need this.',
    need: 'Couldn\'t find anything about {need}.',
    noPrice: 'No price shown. I assume it\'s a sneaky subscription.',
    noProof: 'No ratings or reviews from real people.',
    noCta: 'Where do I download it or sign up?',
    buzzConf: 'What does it do, in plain words?',
    jargon: 'Too much tech talk.',
    long: 'Way too much text on a phone.',
  },
};

// ---------------------------------------------------------------------------------------------- archetypes
// seat: user | champion | economic_buyer | skeptic. segRole: the committee role whose titles to borrow from the
// segment (owner-run verticals: a restaurant's buyer is the Owner or GM). cares: signal weights for credibility.
// needs: signals whose absence is a deal-breaker for this person. hype: buzzword penalty multiplier. tech: tolerance
// for technical jargon 0..1. priceSens 0..1. act: propensity to take the next step (start a trial / let it proceed).
const P = (o) => ({ hype: 1.2, tech: 0.5, priceSens: 0.5, act: 1, needs: [], biases: [], segRole: null, say: {}, ...o });

const ARCHETYPES = {
  startups: [
    P({ key: 'startup_engineer', seat: 'user', voice: 'builder', titles: ['Senior software engineer', 'Staff engineer', 'Product engineer'],
      jtbd: 'get this job done without writing and maintaining glue code myself',
      uses: 'a script I wrote plus an open-source tool', burnedBy: 'a "developer-friendly" tool whose API was an afterthought and whose docs sat behind a sales form',
      skeptical: 'marketing pages with no docs, "book a demo" walls, vague AI claims', reading: 'reads', device: 'desktop',
      priceSens: 0.3, hype: 1.6, tech: 1, act: 1.25, biases: ['You suspect you could build a rough version in a weekend.', 'You trust docs, a changelog and GitHub more than testimonials.'],
      cares: { docs: 1.3, integrations: 1, numbers: 0.6, proof: 0.4, price: 0.7, security: 0.3 }, needs: ['docs'] }),
    P({ key: 'startup_lead', say: { meh: 'Might fix what my team keeps complaining about, but I\'d want to see it running before I stake my name on it.' }, seat: 'champion', voice: 'operator', titles: ['Engineering manager', 'Head of operations', 'Head of product'],
      jtbd: 'fix something my team complains about without a long rollout',
      uses: 'a spreadsheet and a Notion page the team keeps outgrowing', burnedBy: 'a tool I pushed for that the team abandoned after a month',
      skeptical: 'setup claims, per-seat pricing that balloons as we hire', reading: 'skims, then reads pricing', device: 'desktop',
      priceSens: 0.5, hype: 1.2, tech: 0.7, act: 1.05, biases: ['Your reputation is on the line if the team hates it.', 'You want proof that teams like yours kept using it.'],
      cares: { proof: 1, integrations: 1, setup: 1, price: 0.8, numbers: 0.6 }, needs: ['integrations'] }),
    P({ key: 'startup_ceo', seat: 'economic_buyer', voice: 'founder', titles: ['Co-founder and CEO', 'Founder', 'CEO'],
      jtbd: 'keep the team shipping while stretching the runway',
      uses: 'whatever the team already pays for; every new tool has to replace a cost or a hire', burnedBy: 'annual contracts for tools we abandoned in month three',
      skeptical: 'another seat-based subscription, anything that needs a sales call', reading: 'skims', device: 'phone, between meetings',
      priceSens: 0.8, hype: 1.3, tech: 0.6, act: 0.95, biases: ['You measure every purchase against burn and headcount.', 'If the headline does not land in five seconds, you are gone.'],
      cares: { price: 1.3, roi: 1.2, numbers: 0.8, proof: 0.8, cancel: 0.6 }, needs: ['price'] }),
    P({ key: 'startup_security', say: { meh: 'No red flags yet. Also nothing I could hand to an auditor.' }, seat: 'skeptic', voice: 'gatekeeper', titles: ['Head of engineering', 'Security and compliance lead', 'VP Engineering'],
      jtbd: 'keep the stack small and pass the next SOC 2 audit',
      uses: 'our existing stack; every new vendor is another subprocessor to document', burnedBy: 'a vendor that had a breach and no incident process',
      skeptical: 'vendors with no security page, no SSO, unclear data handling, AI features that train on customer data', reading: 'reads every word', device: 'desktop',
      priceSens: 0.4, hype: 1.5, tech: 1, act: 0.7, biases: ['Your default answer is no until shown otherwise.', 'You assume the team could build it in-house.'],
      cares: { security: 1.5, docs: 0.8, privacy: 0.8, integrations: 0.5, proof: 0.4 }, needs: ['security'] }),
  ],
  local_smb: [
    P({ key: 'smb_staff', seat: 'user', voice: 'doer', segRole: 'user', titles: ['Front desk lead', 'Shift manager', 'Office coordinator'],
      jtbd: 'get through a busy day without entering everything twice',
      uses: 'paper, a whiteboard and the system we already have', burnedBy: 'a system the owner bought that took a week to learn and nobody used',
      skeptical: 'anything that looks complicated or only works on a computer', reading: 'skims', device: 'phone',
      priceSens: 0.3, hype: 1, tech: 0.2, act: 1.15, biases: ['You will be the one stuck learning it.', 'If it is not easy on a phone, it does not get used.'],
      cares: { mobile: 1.2, setup: 1.2, human: 0.6, proof: 0.5, price: 0.4 }, needs: ['mobile'] }),
    P({ key: 'smb_manager', say: { meh: 'Could work. I\'d have to show the owner it\'s less hassle than texts and the spreadsheet.' }, seat: 'champion', voice: 'operator', segRole: 'champion', titles: ['Store manager', 'Office manager', 'General manager'],
      jtbd: 'stop chasing things by phone and text',
      uses: 'texts, a shared spreadsheet and the owner\'s memory', burnedBy: 'a "free" app that started charging per location',
      skeptical: 'long setups and contracts', reading: 'skims', device: 'phone and the back-office PC',
      priceSens: 0.6, hype: 1.1, tech: 0.35, act: 1, biases: ['You trust what other businesses like yours say more than the vendor.', 'You have to sell it to the owner.'],
      cares: { setup: 1.2, human: 1, proof: 0.9, price: 0.8, integrations: 0.6 }, needs: ['setup'] }),
    P({ key: 'smb_owner', seat: 'economic_buyer', voice: 'owner', segRole: 'economic_buyer', titles: ['Owner', 'Owner-operator'],
      jtbd: 'save time and money without another headache',
      uses: 'the till we have plus a notebook', burnedBy: 'a 12-month contract with a cancellation fee, and a sales rep who vanished after I signed',
      skeptical: 'contracts, hidden fees, anything without a phone number', reading: 'skims', device: 'phone, late at night after closing',
      priceSens: 0.95, hype: 1.3, tech: 0.15, act: 0.9, biases: ['Every dollar is your own dollar.', 'You trust other owners\' word over any website.'],
      cares: { price: 1.4, cancel: 1, human: 1.1, proof: 0.9, setup: 0.6 }, needs: ['price', 'human'] }),
    P({ key: 'smb_bookkeeper', say: { meh: 'Fine, but I need to know what it does to the books before I say yes.' }, seat: 'skeptic', voice: 'money', segRole: 'finance', titles: ['Outside bookkeeper', 'Co-owner', 'Business partner'],
      jtbd: 'keep the books clean and the subscriptions under control',
      uses: 'QuickBooks and a list of every subscription the business pays', burnedBy: 'apps whose exports broke reconciliation, and subscriptions nobody remembered signing up for',
      skeptical: 'monthly fees that add up, no accounting export', reading: 'reads every word', device: 'desktop',
      priceSens: 0.85, hype: 1.2, tech: 0.4, act: 0.7, biases: ['Every new subscription is a line you will have to justify later.', 'You check what it does to the books before anything else.'],
      cares: { price: 1.2, integrations: 1.2, cancel: 0.9, proof: 0.5 }, needs: ['integrations'] }),
  ],
  ecommerce: [
    P({ key: 'ecom_growth', say: { meh: 'Maybe. Show me a holdout test, not attributed revenue.' }, seat: 'user', voice: 'doer', titles: ['Head of Growth', 'Retention marketing manager', 'E-commerce manager'],
      jtbd: 'grow repeat revenue without hurting conversion',
      uses: 'Klaviyo, two Shopify apps and an attribution dashboard', burnedBy: 'an app that slowed the store and quietly cut conversion',
      skeptical: 'attributed-revenue claims with no method, app bloat', reading: 'reads', device: 'desktop',
      priceSens: 0.5, hype: 1.3, tech: 0.6, act: 1.2, biases: ['You believe numbers, not adjectives.', 'You assume every app takes credit for the same sale.'],
      cares: { roi: 1.3, numbers: 1, integrations: 1.2, proof: 0.9, speed: 0.6 }, needs: ['integrations'] }),
    P({ key: 'ecom_ops', say: { meh: 'Might help at peak, but every app says that in September.' }, seat: 'champion', voice: 'operator', titles: ['Ops lead', 'Head of operations', 'Customer experience lead'],
      jtbd: 'keep orders, inventory and support from falling over at peak',
      uses: 'the Shopify admin, spreadsheets and a 3PL portal', burnedBy: 'an app whose support vanished during Black Friday',
      skeptical: 'support promises, setup that needs a developer', reading: 'skims', device: 'desktop',
      priceSens: 0.55, hype: 1.1, tech: 0.5, act: 1, biases: ['You judge vendors by how they behave in November.', 'You read the app-store reviews before the website.'],
      cares: { human: 1, setup: 1, integrations: 1, proof: 0.8, price: 0.7 }, needs: ['human'] }),
    P({ key: 'ecom_founder', say: { meh: 'Could work, if it pays for itself inside a month.' }, seat: 'economic_buyer', voice: 'founder', titles: ['Founder', 'Co-founder', 'Owner'],
      jtbd: 'grow revenue while protecting margin and cash',
      uses: 'the apps we already pay for; app spend is a line I review every month', burnedBy: 'stacking apps that each claimed credit for the same sale',
      skeptical: 'percent-of-revenue pricing, ROI you cannot verify', reading: 'skims', device: 'phone',
      priceSens: 0.8, hype: 1.3, tech: 0.4, act: 0.95, biases: ['Margin is everything; every app is a cost against it.', 'You trust reviews from other brands more than claims.'],
      cares: { price: 1.3, roi: 1.3, proof: 1, cancel: 0.7 }, needs: ['price'] }),
    P({ key: 'ecom_dev', say: { meh: 'Nothing alarming, but I still don\'t know what it injects into the theme.' }, seat: 'skeptic', voice: 'gatekeeper', titles: ['Shopify Plus developer', 'Agency partner', 'Theme developer'],
      jtbd: 'keep the client\'s store fast and stable',
      uses: 'the theme we built and a short list of apps we trust', burnedBy: 'apps that injected scripts into the theme and broke checkout',
      skeptical: 'anything that touches the theme or adds page weight, apps with no reviews', reading: 'reads every word', device: 'desktop',
      priceSens: 0.4, hype: 1.5, tech: 0.9, act: 0.75, biases: ['You get the angry call when an app breaks the store.', 'You would rather say no than clean up later.'],
      cares: { speed: 1.3, docs: 1, integrations: 1, proof: 0.7 }, needs: ['docs'] }),
  ],
  mid_market: [
    P({ key: 'mm_manager', seat: 'user', voice: 'doer', segRole: 'user', titles: ['Department manager', 'Operations manager', 'Finance analyst'],
      jtbd: 'get my team\'s weekly work out of spreadsheets',
      uses: 'Excel, email and an ERP module nobody likes', burnedBy: 'a rollout with three weeks of training that the team worked around',
      skeptical: 'change management, importing our data', reading: 'skims', device: 'desktop',
      priceSens: 0.3, hype: 1.1, tech: 0.4, act: 1.2, biases: ['You will live with the tool every day, the buyer will not.', 'You worry about training your team.'],
      cares: { setup: 1.2, integrations: 1, proof: 0.8, human: 0.6 }, needs: ['setup'] }),
    P({ key: 'mm_director', say: { meh: 'Promising, but I can\'t take this to my VP without a case study from a company our size.' }, seat: 'champion', voice: 'operator', segRole: 'champion', titles: ['Director', 'Department head'],
      jtbd: 'show leadership a measurable improvement this year',
      uses: 'an older tool we renew out of habit', burnedBy: 'championing a vendor that failed security review after two months of work',
      skeptical: 'anything I cannot defend in front of the CFO and IT', reading: 'reads', device: 'desktop',
      priceSens: 0.5, hype: 1.2, tech: 0.5, act: 1, biases: ['You only champion what you can defend internally.', 'You want case studies from companies your size.'],
      cares: { proof: 1.2, roi: 1.1, security: 0.8, price: 0.6 }, needs: ['proof'] }),
    P({ key: 'mm_cfo', seat: 'economic_buyer', voice: 'money', titles: ['CFO', 'VP Finance', 'COO'],
      jtbd: 'spend only where there is a clear return',
      uses: 'the current vendor contract', burnedBy: 'shelfware: licenses bought for 50 people and used by 12',
      skeptical: 'ROI claims without a method, per-seat creep', reading: 'skims', device: 'desktop and phone',
      priceSens: 0.7, hype: 1.4, tech: 0.3, act: 0.9, biases: ['You assume vendor ROI numbers are inflated.', 'You compare everything to doing nothing.'],
      cares: { roi: 1.4, price: 1.1, proof: 1, numbers: 0.8, security: 0.4 }, needs: ['roi'] }),
    P({ key: 'mm_it', seat: 'skeptic', voice: 'gatekeeper', segRole: 'technical', titles: ['IT manager', 'Security and compliance lead', 'Systems administrator'],
      jtbd: 'keep identity, data and vendors under control',
      uses: 'our identity provider and a vendor-review checklist', burnedBy: 'shadow IT with shared passwords and no offboarding',
      skeptical: 'no SSO, no SOC 2, unknown data location', reading: 'reads every word', device: 'desktop',
      priceSens: 0.3, hype: 1.4, tech: 0.9, act: 0.7, biases: ['Every new vendor is risk you own.', 'Your default is no until the paperwork exists.'],
      cares: { security: 1.6, integrations: 0.9, docs: 0.7, privacy: 0.7 }, needs: ['security'] }),
  ],
  enterprise: [
    P({ key: 'ent_analyst', say: { meh: 'Would save me a few Fridays, if IT ever lets it on my laptop.' }, seat: 'user', voice: 'doer', titles: ['Senior analyst', 'Operations specialist', 'Program manager'],
      jtbd: 'stop building the same report by hand every week',
      uses: 'Excel macros and an internal tool IT built years ago', burnedBy: 'an enterprise rollout that added steps instead of removing them',
      skeptical: 'whether it works on our locked-down laptops and approved tools', reading: 'skims', device: 'desktop',
      priceSens: 0.15, hype: 1, tech: 0.4, act: 1.25, biases: ['You do not choose tools; you live with them.', 'You care whether it connects to what you already use.'],
      cares: { setup: 0.9, integrations: 1.1, proof: 0.7, numbers: 0.5 }, needs: ['integrations'] }),
    P({ key: 'ent_director', say: { meh: 'Interesting, but I\'d be the one explaining it if a vendor this small disappears.' }, seat: 'champion', voice: 'operator', segRole: 'champion', titles: ['Director', 'VP'],
      jtbd: 'deliver a visible win on this year\'s priority',
      uses: 'an incumbent platform plus consultants', burnedBy: 'a startup vendor that was acquired and sunset the product',
      skeptical: 'vendor viability, references from companies our size', reading: 'reads', device: 'desktop',
      priceSens: 0.35, hype: 1.3, tech: 0.5, act: 1, biases: ['Backing a tiny vendor that fails is career risk.', 'You need logos and a reference before you stick your neck out.'],
      cares: { proof: 1.4, security: 0.9, roi: 1, human: 0.6 }, needs: ['proof'] }),
    P({ key: 'ent_exec', say: { meh: 'Another point tool. What does it let us consolidate?' }, seat: 'economic_buyer', voice: 'money', titles: ['SVP', 'CIO', 'Chief Operating Officer'],
      jtbd: 'consolidate vendors and hit this year\'s efficiency target',
      uses: 'a platform contract we are consolidating onto', burnedBy: 'point tools that multiplied integration and audit costs',
      skeptical: 'another point solution', reading: 'skims', device: 'phone, from a forwarded link',
      priceSens: 0.4, hype: 1.5, tech: 0.4, act: 0.85, biases: ['You prefer fewer vendors.', 'You read the headline and the logos, nothing else.'],
      cares: { roi: 1.4, proof: 1.2, security: 0.8, numbers: 0.8 }, needs: ['roi'] }),
    P({ key: 'ent_infosec', say: { meh: 'Nothing disqualifying on the page, which also means nothing qualifying.' }, seat: 'skeptic', voice: 'gatekeeper', segRole: 'security', titles: ['Third-party risk analyst', 'InfoSec architect'],
      jtbd: 'clear vendors through third-party risk review without letting anything slip',
      uses: 'SIG questionnaires, a GRC tool and our approved-vendor list', burnedBy: 'vendors who claimed "bank-grade security" and had no SOC 2 Type II',
      skeptical: 'security claims without reports, AI that trains on customer data, unknown subprocessors', reading: 'reads every word', device: 'desktop',
      priceSens: 0.2, hype: 1.7, tech: 1, act: 0.65, biases: ['A missing control is a finding, and findings stop deals.', 'You trust reports, not adjectives.'],
      cares: { security: 1.8, privacy: 1, docs: 0.6 }, needs: ['security'] }),
    P({ key: 'ent_procurement', say: { meh: 'Fine. Whatever the list price is, it\'s the start of a negotiation.' }, seat: 'skeptic', voice: 'money', segRole: 'procurement', titles: ['Category manager, procurement', 'Strategic sourcing lead'],
      jtbd: 'get the best price and terms and keep the supplier list short',
      uses: 'our preferred-vendor list', burnedBy: 'auto-renewing contracts with 10% uplifts',
      skeptical: 'no published pricing, vendors not on the preferred list', reading: 'reads every word', device: 'desktop',
      priceSens: 0.9, hype: 1.4, tech: 0.2, act: 0.7, biases: ['Every list price is an opening bid.', 'A new supplier needs a reason the incumbent cannot match.'],
      cares: { price: 1.4, cancel: 0.8, security: 0.8, proof: 0.8 }, needs: ['price'] }),
  ],
  consumers: [
    P({ key: 'b2c_scroller', say: { meh: 'Maybe later. I already have a free app for this on my phone.' }, seat: 'user', voice: 'consumer', titles: null,
      jtbd: 'sort this out today in a couple of taps',
      uses: 'a free app and notes on my phone', burnedBy: 'apps that asked for a card before showing anything',
      skeptical: 'subscriptions, long sign-up flows', reading: 'skims', device: 'phone, from an ad',
      priceSens: 0.6, hype: 1.2, tech: 0.2, act: 1.2, biases: ['You give a page about five seconds.', 'You leave at the first form field.'],
      cares: { mobile: 1.2, cancel: 0.8, proof: 0.8, price: 0.8 }, needs: ['mobile'] }),
    P({ key: 'b2c_enthusiast', say: { meh: 'Looks like the three others I tried. What\'s different?' }, seat: 'champion', voice: 'consumer', titles: null,
      jtbd: 'find the one that actually works and stick with it',
      uses: 'two or three apps in this category; I deleted most of the others', burnedBy: 'apps that got worse after an update or moved features behind a new paywall',
      skeptical: 'copycat features, fake reviews', reading: 'reads', device: 'phone and laptop',
      priceSens: 0.4, hype: 1.4, tech: 0.6, act: 1.05, biases: ['You compare everything to the best app you have used.', 'Friends ask you what to install.'],
      cares: { numbers: 0.9, proof: 1, price: 0.8, privacy: 0.5 } }),
    P({ key: 'b2c_frugal', say: { meh: 'Might try it, but the free app I use does most of this.', good: 'Price is right there and I can cancel any time. Fine, I\'ll try it.' }, seat: 'economic_buyer', voice: 'consumer', titles: null,
      jtbd: 'not pay for something a free app already does',
      uses: 'the free version of a competitor', burnedBy: 'a free trial that quietly converted to an annual charge',
      skeptical: 'hidden pricing, auto-renew', reading: 'skims', device: 'phone',
      priceSens: 1, hype: 1.2, tech: 0.2, act: 0.85, biases: ['Every subscription is one more line on the card statement.', 'You check how to cancel before you sign up.'],
      cares: { price: 1.5, cancel: 1.3, proof: 0.7 }, needs: ['price'] }),
    P({ key: 'b2c_privacy', say: { meh: 'Might be useful. I\'d want to know who sees my data first.', good: 'Clear, priced, and they say what happens to my data. Rare.' }, seat: 'skeptic', voice: 'consumer', titles: null,
      jtbd: 'use an app without handing over my data',
      uses: 'privacy-friendly apps, or nothing', burnedBy: 'an app that leaked my email and sold my data',
      skeptical: 'vague privacy policies, sign-in with everything', reading: 'reads every word', device: 'laptop',
      priceSens: 0.5, hype: 1.3, tech: 0.5, act: 0.8, biases: ['You assume a free app sells your data.', 'You read the privacy section first.'],
      cares: { privacy: 1.6, cancel: 0.7, proof: 0.6 }, needs: ['privacy'] }),
  ],
};
const DEFAULT_TYPE = { b2c: 'consumers', smb: 'local_smb', ent: 'enterprise' };
export const SEATS = ['user', 'champion', 'economic_buyer', 'skeptic'];
export const SEAT_LABEL = { user: 'User', champion: 'Champion', economic_buyer: 'Economic buyer', skeptic: 'Skeptic / can block' };
export const ARCHETYPE_KEYS = Object.fromEntries(Object.values(ARCHETYPES).flat().map((a) => [a.key, a]));
export const archetypeOf = (persona) => ARCHETYPE_KEYS[persona?.key] ?? null;

const B2C_TITLES = {
  students: ['Grad student', 'College junior', 'Nursing student'],
  professionals: ['Product marketer', 'Nurse on rotating shifts', 'Accountant', 'Remote project manager'],
  parents: ['Parent of two', 'Single dad of a 7-year-old', 'Mom of a toddler'],
  creators: ['Freelance designer', 'Wedding photographer', 'Part-time YouTuber'],
  seniors: ['Retired teacher', 'Semi-retired contractor'],
  hobbyists: ['Weekend cyclist', 'Home cook', 'Board-game collector'],
};
const FIRST = ['Maya', 'Daniel', 'Priya', 'Marcus', 'Elena', 'Tom', 'Aisha', 'Kenji', 'Rosa', 'Ben', 'Fatima', 'Luis', 'Hannah', 'Omar', 'Grace', 'Tyler', 'Mei', 'Jamal', 'Sofia', 'Erik', 'Nadia', 'Carlos', 'Leah', 'Dev'];
const LAST = ['Okafor', 'Lindqvist', 'Patel', 'Brennan', 'Nakamura', 'Alvarez', 'Cohen', 'Mensah', 'Novak', 'Reyes', 'Fischer', 'Haddad', 'Kowalski', 'Osei', 'Park', 'Dubois', 'Shah', 'Murphy', 'Rossi', 'Ivanova'];

// Deterministic 0..1 from a string (FNV hash), so the panel never touches rng(state).
const h01 = (s) => (parseInt(hash(s), 36) % 1e6 + 0.5) / 1e6;
const pickBy = (arr, key) => arr[Math.floor(h01(key) * arr.length) % arr.length];
const article = (s) => (/^([aeiou]|8|11-|11 |18)/i.test(s) || /^[AEFHILMNORSX][A-Z]/.test(s) ? 'an' : 'a');

/** The customer type whose panel this company gets (the model default for old saves or "mixed"). */
export function panelTypeOf(state) {
  const t = customerTypeOf(state);
  return t && ARCHETYPES[t] ? t : DEFAULT_TYPE[state.company.model] ?? 'local_smb';
}

// Candidate base segments for panelists: the segments the player's ICP targets (from their own text), else the
// customer type's public segment list. Never weighted by hidden shares or pain.
function segmentPool(state, type) {
  const t = truthOf(state);
  const f = icpFocus(state);
  const prof = profileOf(state, type);
  if (!f.diffuse && !f.outsider && f.segmentIds.length) {
    const bases = [...new Set(f.segmentIds.map((id) => t.segments.find((s) => s.id === id)?.baseId).filter(Boolean))];
    if (bases.length) return { bases, outsider: false };
  }
  if (type === 'consumers') return { bases: B2C_PERSONAS.map((p) => p.id), outsider: f.outsider };
  const pub = prof?.segmentIds?.length ? prof.segmentIds : [];
  const home = prof?.defaultSegment;
  return { bases: [...new Set([home, ...pub.slice(0, 4)].filter(Boolean))], outsider: f.outsider };
}

function companyFor(type, base, key) {
  if (type === 'consumers') return null;
  const seg = getSegment(base);
  if (!seg) return 'a small business';
  const ex = pickBy(seg.examples ?? [seg.label], `${key}:ex`);
  if (/\d|\b(small|solo|single|national|global|regional)\b/i.test(ex)) return `${article(ex)} ${ex}`;
  const band = { startups: [5, 200], local_smb: [1, 40], ecommerce: [2, 50], mid_market: [100, 1000], enterprise: [1000, 60000] }[type] ?? [1, 500];
  let lo = Math.max(band[0], seg.employees[0]), hi = Math.min(band[1], seg.employees[1]);
  if (hi < lo) [lo, hi] = seg.employees; // a segment outside the type's usual size band keeps its own band
  const n = Math.round(lo * Math.pow(hi / lo, h01(`${key}:n`)));
  const size = n >= 1000 ? `${Math.round(n / 1000).toLocaleString('en-US')},000 people` : `${n} ${n === 1 ? 'person' : 'people'}`;
  return `${article(ex)} ${ex} (${size})`;
}

function titleFor(type, arch, base, key) {
  if (type === 'consumers') return pickBy(B2C_TITLES[base] ?? ['Consumer'], `${key}:t`);
  const role = arch.segRole && getSegment(base)?.committee?.find((r) => r.role === arch.segRole);
  const titles = role?.titles?.length ? role.titles : arch.titles;
  return pickBy(titles, `${key}:t`);
}

// The hidden person behind a panelist: does this visitor actually have the problem, how badly, what they do today.
function hiddenFor(state, type, base, outsider, key) {
  const t = truthOf(state);
  const id = type === 'consumers' ? `p:${base}` : base;
  const candidates = t.segments.filter((s) => s.id === id || s.baseId === base);
  const seg = !outsider && candidates.length ? pickBy(candidates, `${key}:seg`) : null;
  const p = drawPerson(state, { segmentId: seg ? seg.id : 'outsider', channel: 'panel', seedKey: `site-panel:${key}` });
  const ago = p.lastIncidentDays == null ? null : p.lastIncidentDays <= 1 ? 'yesterday' : p.lastIncidentDays < 14 ? `${p.lastIncidentDays} days ago` : p.lastIncidentDays < 60 ? `about ${Math.round(p.lastIncidentDays / 7)} weeks ago` : `about ${Math.round(p.lastIncidentDays / 30)} months ago`;
  return { hasPain: p.hasPain, painIntensity: p.painIntensity, ago, lastIncident: p.lastIncident, workaround: p.workaround, workaroundCostMonthly: p.workaroundCostMonthly, priorities: p.competingPriorities, segmentLabel: seg?.label ?? null };
}

/**
 * Build the panel: one panelist per seat (user, champion, economic buyer, skeptic), deterministic for the market seed
 * and the page version (`siteKey`, a hash of the page text). Each persona: { id, key, seat, name, title, company,
 * segmentId, voice, jtbd, uses, burnedBy, skeptical, reading, device, priceSens, hype, tech, act, cares, needs,
 * biases, icp, hidden }. `hidden` is internal: prompt and offline judge only, never rendered.
 */
export function buildPanel(state, siteKey = '') {
  const type = panelTypeOf(state);
  const list = ARCHETYPES[type];
  const seed = `${state.market?.demandSeed ?? state.seed ?? 0}:${type}:${siteKey}`;
  const { bases, outsider } = segmentPool(state, type);
  const icp = state.company.icp || state.company.oneLiner || 'the target customer described on the page';
  const used = new Set();
  return SEATS.map((seat, i) => {
    const opts = list.filter((a) => a.seat === seat);
    const arch = pickBy(opts, `${seed}:arch:${seat}`);
    const key = `${seed}:${seat}`;
    const base = bases.length ? pickBy(bases, `${key}:base`) : null;
    let name, k = 0;
    do { name = `${pickBy(FIRST, `${key}:f${k}`)} ${pickBy(LAST, `${key}:l${k}`)}`; k++; } while ((used.has(name.split(' ')[0]) || used.has(name.split(' ')[1])) && k < 12);
    for (const part of name.split(' ')) used.add(part);
    return {
      id: `p${i}`, key: arch.key, seat, type, name,
      title: titleFor(type, arch, base, key), company: companyFor(type, base, key), segmentId: base,
      voice: arch.voice, jtbd: arch.jtbd, uses: arch.uses, burnedBy: arch.burnedBy, skeptical: arch.skeptical,
      reading: arch.reading, device: arch.device, priceSens: arch.priceSens, hype: arch.hype, tech: arch.tech, act: arch.act,
      cares: arch.cares, needs: arch.needs, biases: arch.biases, say: arch.say, icp,
      role: `${SEAT_LABEL[seat].toLowerCase()}: ${arch.titles?.[0] ?? 'consumer'}`, // legacy field (older renders)
      hidden: base ? hiddenFor(state, type, base, outsider, key) : null,
    };
  });
}

/** What the player may see about a panelist (no hidden pain or segment truth). */
export function publicPersona(p) {
  return { name: p.name ?? null, title: p.title ?? p.role ?? 'Visitor', company: p.company ?? null, seat: p.seat ? SEAT_LABEL[p.seat] : null, uses: p.uses ?? null, device: p.device ?? null };
}

const SENS = (x) => (x >= 0.8 ? 'very price sensitive: every subscription is scrutinised' : x >= 0.55 ? 'price conscious' : x >= 0.3 ? 'price matters but value matters more' : 'not paying out of your own pocket; price barely matters to you');
const JARGON = (x) => (x >= 0.8 ? 'fluent in technical jargon, allergic to marketing hype' : x >= 0.45 ? 'fine with some technical terms' : 'technical jargon loses you quickly');

/** The panelist's own system prompt: who they are, what they need, their biases, and (privately) their pain. */
export function personaSystemPrompt(p, { realism = '', rubric = '', brief = '' } = {}) {
  const who = p.company ? `${p.name}, ${p.title} at ${p.company}` : `${p.name}, ${p.title}`;
  const h = p.hidden;
  const pain = !h ? 'You are a visitor from outside the market the company targets; you probably do not have the problem it solves.'
    : h.hasPain ? `You genuinely have the problem this kind of product addresses (how much it hurts, 0-1: ${h.painIntensity}). ${h.lastIncident ? `Last time: ${h.lastIncident}.` : ''} ${h.workaround ? `Today you cope with ${h.workaround}${h.workaroundCostMonthly ? `, which costs you roughly $${Math.round(h.workaroundCostMonthly)} a month in time and money` : ''}.` : ''} A page that clearly fixes this gets real attention from you; a vague one is still a waste of your time.`
      : `You do not really have this problem right now. Your priorities are ${h.priorities?.join(', ') || 'elsewhere'}. Only something obviously better than what you do today would get your attention.`;
  return `${realism}
You are ${who}. The year is 2026. The company is going after: ${p.icp}.
Your seat in a buying decision: ${SEAT_LABEL[p.seat] ?? 'visitor'}.
Your job-to-be-done: ${p.jtbd}.
What you use today: ${p.uses}.
A bad experience you have not forgotten: ${p.burnedBy}.
You are skeptical of: ${p.skeptical}.
How you read websites: you ${p.reading}, on ${p.device}.
Money: you are ${SENS(p.priceSens)}.
Jargon: you are ${JARGON(p.tech)}.
Your biases: ${p.biases.join(' ')}
Before you trust anything you look for: ${(p.needs.length ? p.needs : Object.keys(p.cares).slice(0, 2)).map((k) => SIGNAL_LABELS[k]).join('; ')}.
PRIVATE (never mention numbers from this, just let it shape you): ${pain}
Score only what you can see. Buzzwords, superlatives and page length earn nothing. Unverifiable claims (anonymous "trusted by 10,000+", "guaranteed", "#1") make you trust the page less than a plain page that says little.
Write firstImpression, confusions and missing in your own voice, in the first person, as this person would say them out loud: what you saw, what you could not find, what bothers you. React like your role and your history, not like a marketing consultant: do not coach the founder or describe what a good marketer would do.
${rubric}${brief ? `\nWhat you use or know today: ${brief} Compare this site against that, honestly: switching costs, missing parity features, price.` : ''}`;
}

/** Voice lines for a persona (offline comments). */
export const voiceOf = (p) => ({ ...(VOICES[p?.voice] ?? VOICES.operator), ...(p?.say ?? {}) });
export const fill = (line, p, extra = {}) => String(line ?? '').replace(/\{(\w+)\}/g, (_, k) => extra[k] ?? (k === 'uses' ? String(p.uses ?? 'what I use now').split(';')[0] : k === 'company' ? p.company ?? 'us' : k === 'ago' ? p.hidden?.ago ?? 'recently' : '')).trim();
