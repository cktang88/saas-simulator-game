// Offline (no API key) inbound messages, one template family per inbound archetype (data/inbound-archetypes.js), so a
// fake investor does not read like a lead-gen agency and each kind carries the tells its archetype lists in
// `redFlags`. Wording is [design]; variants are picked by a hash of the inbound id (never rng(state)). Pure.
import { hash } from '../../core/util.js';

const h01 = (s) => (parseInt(hash(String(s)), 36) % 1e6 + 0.5) / 1e6;
const pickH = (arr, key) => arr[Math.floor(h01(key) * arr.length) % arr.length];
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mail';

// Each entry: org names (one is picked), how the sender's address looks (a tell for spam), subject and body variants.
// v: { f: founder first name, c: company name, w: what it does, cat: category label, first, last, org }
const T = {
  offshore_dev_shop: { orgs: ['DevNest Solutions', 'Codeforge Labs', 'BrightStack Technologies'], mail: 'lookalike',
    subj: ['Dedicated developers for {c}', 'Quick question about {c}\'s roadmap'],
    body: ['Hi {f}, love what you are building at {c}! I noticed you are on React and Firebase (correct me if wrong). We have helped 120+ startups ship MVPs with dedicated developers from $25/hour. Worth a 15-minute call? calendly.com/{orgslug}/intro', 'Hey {f}, congrats on the launch of {c}. Our team builds apps like yours for a fraction of US rates (from $25/hr, 2-week sprints). Here is our portfolio: fitness apps, crypto wallets, a food delivery clone. Free this week?'] },
  leadgen_agency: { orgs: ['PipelineIQ', 'MeetingFlow Partners', 'Outbound Rocket'], mail: 'lookalike',
    subj: ['15-30 qualified meetings for {c}', '{c} x booked demos'],
    body: ['Hi {f}, we booked 47 demos for a {cat} tool last quarter. For {c} ({w}) we would target your ICP and put 15-30 qualified meetings on your calendar in 30 days, or you do not pay. Open to seeing how?', '{f}, quick one: is {c} still relying on inbound? We run done-for-you outbound for {cat} founders and charge per meeting. Happy to send a few case studies.'] },
  seo_link_seller: { orgs: ['RankLift SEO', 'freelance SEO consultant'], mail: 'gmail',
    subj: ['3 critical SEO errors on {c}', 'Guest post opportunity'],
    body: ['Hello {f}, I audited your website and found 3 critical errors hurting your Google ranking on /pricing and /blog/getting-started. I can also place guest posts on DA 70+ sites. Shall I send the report?', 'Hi, I am a SEO expert. Your site {c} has big potential but critical technical issues. I offer high DA backlinks and guest post packages at very good price. Please reply for the list.'] },
  fractional_exec: { orgs: ['Independent', 'Northpoint Fractional'], mail: 'normal',
    subj: ['Loved your post', 'Free growth audit for {c}'],
    body: ['Hi {f}, loved your recent post about {c}. I have helped 50+ SaaS companies scale as a fractional CMO. I would be happy to do a free growth audit and share a 90-day plan. Coffee next week?', 'Hey {f}, connecting after your post on {w}. As a fractional CFO for early SaaS I usually see the same 3 gaps at your stage. Happy to walk you through them, no strings.'] },
  launch_upvote_seller: { orgs: ['LaunchBoost', 'Hunt Masters'], mail: 'gmail',
    subj: ['Your Product Hunt launch', 'Top 5 guaranteed'],
    body: ['Hey {f}! Saw {c} is launching soon. We have a network of 3,000 active hunters and can get you Top 5 of the day. Packages from $299. Want the details?', 'Hi {f}, your launch could easily hit #1 with the right support. We have helped 200+ makers. DM me for our launch-day package.'] },
  directory_submission: { orgs: ['ListMyStartup', 'Directory Blast'], mail: 'gmail',
    subj: ['Submit {c} to 200+ directories', 'Backlinks for {c}'],
    body: ['Hi {f}, we will submit {c} to 200+ startup directories and AI tool lists for a one-time $49. More backlinks, more traffic, done in 48h.', 'Hello! Get {c} listed on 250 directories (AI tools, SaaS, startups) for $79. Huge SEO boost. Reply YES to start.'] },
  saas_tool_vendor: { orgs: ['Relaydesk', 'Signalbase', 'Fluxly'], mail: 'normal',
    subj: ['{c} + {org}', 'Idea for {c}'],
    body: ['Hi {f}, I noticed {c} helps with {w}. Teams like yours use {org} to cut support tickets by 38% with AI. Worth a quick look? Here is a 2-minute video I made for you.', 'Hey {f}, as a fellow builder in {cat} I thought {org} could help {c} automate onboarding. We are offering founding-customer pricing this month. Open to a 15-min demo?'] },
  finance_vendor: { orgs: ['Arcpoint Capital', 'Brex-style card startup', 'FlowRev'], mail: 'normal',
    subj: ['Non-dilutive capital for {c}', 'Your banking setup'],
    body: ['Hi {f}, {org} funds SaaS companies like {c} against recurring revenue, no equity and a decision in 48 hours. Would it help to see what you could qualify for?', 'Hi {f}, founders switch to us for 4% cash back on SaaS spend and higher limits than the big banks. Takes 10 minutes to apply. Want a link?'] },
  pay_to_speak_or_award: { orgs: ['SaaS Leaders Summit', 'Global Innovation Awards', 'Future of Tech Forum'], mail: 'normal',
    subj: ['Speaking invitation: {org}', '{c} shortlisted for an award'],
    body: ['Hi {f}, our committee has selected {c} as a featured speaker at {org}. Speaker packages (stage slot, booth, gala dinner) start at $1,500. Seats are limited; can we confirm by Friday?', 'Congratulations {f}! {c} has been shortlisted for "Most Innovative {cat} of 2026" at {org}. To accept the award and the winners\' feature, please complete your nomination package.'] },
  pay_to_play_podcast: { orgs: ['Founder Stories Podcast', 'The SaaS Spotlight Show'], mail: 'normal',
    subj: ['Guest invite: {org}', 'We would love to feature {c}'],
    body: ['Hi {f}, our producers loved {c} and would like you as a guest on {org} (top 1% podcast, featured on 15 networks). There is a small production fee to cover editing and promotion. Interested?', 'Hey {f}, we feature inspiring founders. Your story with {c} fits perfectly. Our "featured guest" package includes the episode, clips and an article. Can I send the details?'] },
  scam_misc: { orgs: ['Domain Registry Services Asia', 'Global Trademark Office', 'Capital Access Brokers'], mail: 'lookalike',
    subj: ['URGENT: {c} domain registration', 'Trademark filing notice for {c}'],
    body: ['Dear CEO, a company is applying to register "{c}" as domain names in .asia and .cn. As the registrar we need your confirmation within 7 days before we approve, or the names go to them. Please reply urgently.', 'NOTICE: your trademark listing for {c} is due for publication in the Global Trademark Register. To keep it active, remit the annual fee shown on the attached invoice within 10 days.'] },
  agency_recruiter: { orgs: ['TalentBridge', 'Apex Tech Recruiting', 'HireLoop'], mail: 'normal',
    subj: ['Engineers for {c}', 'Hiring at {c}?'],
    body: ['Hi {f}, I work with fast-growing startups like {c} on engineering hires. We have 5 senior full-stack engineers available now; our fee is 20% of first-year salary. Worth a chat?', 'Hey {f}, saw {c} might be hiring. I place founding engineers and AEs at seed companies. Can I send a couple of profiles?'] },
  recruiter_poaching_founder: { orgs: ['Executive search firm', 'Stealth AI company'], mail: 'normal',
    subj: ['An opportunity', 'Head of Product role'],
    body: ['Hi {f}, your work on {c} caught my eye. I am hiring a Head of Product for a well-funded AI company: $260k + equity, remote. Open to a confidential chat?', 'Hi {f}, not sure if you are open to it, but a client of mine is looking for exactly your background. Happy to share details.'] },
  cold_job_seeker: { orgs: ['Freelance', 'job seeker'], mail: 'gmail',
    subj: ['Application: any role at {c}', 'Passionate about {c}'],
    body: ['Dear Hiring Manager, I am writing to express my strong interest in joining {c}. I am a passionate, results-driven professional with a proven track record of driving impact. I would welcome the opportunity to discuss how I can contribute.', 'Hi {f}! Big fan of {c}. Are you hiring? I can do frontend, marketing or ops, whatever you need. Portfolio attached.'] },
  student_researcher: { orgs: ['State University', 'Business School'], mail: 'edu',
    subj: ['Research interview request', '15-minute survey for my thesis'],
    body: ['Hi {f}, I am an MBA student researching how early-stage founders in {cat} pick their first channels. Would you have 20 minutes for an interview? Happy to share the findings.', 'Hello, I am writing my thesis on startup pricing. Could you fill in a 15-minute survey about {c}? It would help a lot.'] },
  vc_associate_checkin: { orgs: ['Northbeam Ventures', 'Foundry Lane Capital', 'Sequel Partners'], mail: 'normal',
    subj: ['{c}', 'Would love to learn more about {c}'],
    body: ['Hi {f}, I am an associate at {org}. We are spending a lot of time on {cat} and came across {c}. Would love to learn more about what you are building. Free for a quick chat next week?', 'Hey {f}, {org} here. Big fan of the space. Could you share your deck and a few metrics (MRR, growth)? Happy to set up a call after.'] },
  angel_or_scout: { orgs: ['angel investor', 'scout for a seed fund'], mail: 'normal',
    subj: ['hey', 'saw {c}'],
    body: ['hey {f}, a friend mentioned {c}. I write small checks into {cat} founders. if you ever raise, happy to chat', '{f}! saw your post about {c}. curious how it is going, coffee sometime?'] },
  indie_fund: { orgs: ['Calm Capital', 'Tinyseed-style fund', 'Bootstrap Fund'], mail: 'normal',
    subj: ['{c} and {org}', 'Revenue-share funding'],
    body: ['Hi {f}, {org} backs profitable-leaning SaaS like {c} with revenue-share or small SAFE checks, no pressure to raise a Series A. Would you share your current MRR trend if a conversation makes sense?', 'Hey {f}, we invest in founders who want to build durable software businesses. {c} looks like a fit. Happy to explain our terms.'] },
  fake_investor: { orgs: ['Meridian Global Capital', 'Atlas Equity Partners'], mail: 'gmail',
    subj: ['Investment interest: {c}', 'Funding approval for {c}'],
    body: ['Dear {f}, our fund has reviewed {c} and is prepared to issue a term sheet for up to $2,000,000. Before our committee meets we require a standard due-diligence processing fee. Please confirm your interest.', 'Hello, we represent a family office looking to deploy $5M into {cat} companies. {c} meets our criteria. We can move very fast; kindly send your company documents and we will advise next steps.'] },
  inbound_demo_qualified: { orgs: null, mail: 'company',
    subj: ['Demo request', 'Question about {c}'],
    body: ['Hi, we are a team of 12 and right now we do this with spreadsheets and a lot of manual checking. Found {c} through a search. Can we see how it works this week? Also, what does it cost for a team our size?', 'Hello, our ops lead pointed me to {c}. We tried another tool last year and nobody used it. Does yours work with what we already have? Would like a demo.'] },
  tire_kicker: { orgs: null, mail: 'company',
    subj: ['Custom requirements', 'Quick question'],
    body: ['Hi, interesting product. We would need it to integrate with our in-house system, support white-labeling and a custom approval workflow. Can you build that? Budget is tight but we could be a big logo.', 'Hey, before we look further: can you do a free pilot for 3 months, plus a few custom features? If it works we could talk about paying.'] },
  b2c_user_feedback: { orgs: null, mail: 'gmail',
    subj: ['Feedback', 'small issue'],
    body: ['hi, using {c} daily and mostly love it but the reminder came 2 hours late twice this week. is that a bug?', 'Hey, quick feedback on {c}: I tried to cancel my trial and could not find where. Also the widget would be great. Thanks!'] },
  competitor_posing_as_customer: { orgs: null, mail: 'gmail',
    subj: ['Evaluating {c}', 'Questions about your platform'],
    body: ['Hi, we are evaluating tools like {c}. Can you walk me through your pricing model, your roadmap for the next two quarters and which integrations you plan to build? Also how many customers do you have?', 'Hello, I am researching options in {cat}. Could you share your full feature list, pricing tiers and how you handle data under the hood? A detailed answer by email is easiest.'] },
  integration_partner: { orgs: ['Stackwise', 'Linkbase', 'Hookstream'], mail: 'normal',
    subj: ['Integration between {org} and {c}', 'Partnership idea'],
    body: ['Hey {f}, our customers keep asking about {w}. Worth exploring an integration between {org} and {c}? We have a public API and a partner directory.', 'Hi {f}, I run partnerships at {org}. A few of our users already use {c} alongside us. Would a listing in our marketplace and a joint webinar make sense?'] },
  reseller_affiliate: { orgs: ['Digital agency', 'Growth consultancy'], mail: 'normal',
    subj: ['Reselling {c}', 'White-label?'],
    body: ['Hi {f}, we run an agency with 40 clients who could use {c}. Do you offer a white-label version or a reseller margin? We would want 40% and our own branding.', 'Hey {f}, we would love to recommend {c} to our clients. Do you have an affiliate program? What commission do you pay?'] },
  co_marketing_swap: { orgs: ['a newsletter with 6,000 readers', 'a webinar series'], mail: 'normal',
    subj: ['Swap?', 'Co-marketing idea'],
    body: ['Hey {f}, I run a newsletter for {cat} founders (about 6k subs). Want to swap a mention? I feature {c}, you feature us.', 'Hi {f}, we host a monthly webinar for operators. Would you co-host one on {w}? We would promote it to both lists.'] },
  journalist: { orgs: ['a trade publication', 'a tech newsletter'], mail: 'normal',
    subj: ['Press inquiry', 'Question for a story'],
    body: ['Hi {f}, I am writing a piece on new tools in {cat} and would like to include {c}. Do you have 15 minutes this week for a few questions? My deadline is Thursday.', 'Hello {f}, I cover small-business software. Could you comment on how {c} differs from the incumbents? A couple of sentences by email is fine.'] },
  legit_podcast_or_newsletter: { orgs: ['a niche podcast for operators', 'a newsletter for practitioners'], mail: 'normal',
    subj: ['Would you come on the show?', 'Feature in our newsletter'],
    body: ['Hi {f}, I host a small podcast for people who do {w} for a living. No fee, we just like practical stories. Would you join for 40 minutes?', 'Hey {f}, our newsletter readers are exactly your users. Would you write a short practical piece for us? No charge, we link back.'] },
  event_invite: { orgs: ['a local founder meetup', 'an accelerator demo night'], mail: 'normal',
    subj: ['Invite: founder meetup', 'Demo night next month'],
    body: ['Hi {f}, we run a monthly founder meetup nearby (about 40 people, free). Would you like to come or give a 5-minute demo of {c}?', 'Hey {f}, we are hosting a demo night for early-stage {cat} companies. Want a slot? Free to attend; investors will be there.'] },
  advisor_for_equity: { orgs: ['Self-employed'], mail: 'normal',
    subj: ['Helping {c}', 'Advisor?'],
    body: ['Saw what you are doing with {c}. I have scaled two SaaS companies and could help as an advisor for a bit of equity (1-2%). Coffee?', 'Hi {f}, I have a big network in {cat} and could open doors for {c}. Usually I join as an advisor for equity. Open to talking?'] },
  pick_your_brain: { orgs: ['a stealth startup', 'early-stage founder'], mail: 'normal',
    subj: ['Pick your brain?', 'Fellow founder'],
    body: ['Hey! Fellow founder here building nearby. Would love to swap notes and pick your brain on what is working for {c}.', 'Hi {f}, I am just starting out in {cat}. Could I buy you a virtual coffee and ask a few questions about how you got your first customers?'] },
  peer_founder_ally: { orgs: ['a startup at your stage'], mail: 'normal',
    subj: ['hey', 'swap notes?'],
    body: ['hey {f}, we are about the same stage. want to do a monthly 30 min where we trade numbers and what is not working? no fluff', '{f}! saw your update on {c}. we hit the same wall with churn last month, happy to share what we tried'] },
  micro_acquirer_broker: { orgs: ['a micro-PE firm', 'a SaaS M&A broker'], mail: 'normal',
    subj: ['Would you consider selling {c}?', 'Acquisition interest'],
    body: ['Hi {f}, we acquire small SaaS businesses and keep them running. Would you consider selling {c}? If so, a few numbers (MRR, churn, margin) would help us give you an indicative range.', 'Hello {f}, I represent buyers looking for {cat} businesses like {c}. No pressure; happy to explain what multiples look like right now.'] },
  corp_dev: { orgs: ['Corp Dev, Atlas Software', 'Corporate development at a larger platform'], mail: 'normal',
    subj: ['Exploratory chat', '{c}'],
    body: ['Hi {f}, I lead corp dev at a larger software company. We are keeping tabs on {w}. Open to an exploratory chat about your roadmap?', 'Hi {f}, our product team admires what {c} is doing. Would you be open to a casual call to compare notes on the space?'] },
  friend_family_checkin: { orgs: [''], mail: 'none',
    subj: [''], body: ['hey!! how is the startup going?? we should catch up', 'how is {c} going?? mom says you quit your job, call me', 'saw your post! proud of you. drinks soon?'] },
  former_colleague: { orgs: ['your old company'], mail: 'normal',
    subj: ['long time!', 'congrats on {c}'],
    body: ['Hey {f}! Long time. Saw you started {c}, congrats. My team might actually need something like that. Catch up soon?', 'Hi {f}, just saw your news about {c}. I left the old place too. Would love to hear how it is going.'] },
};
// Fallback by category for archetypes missing above (future additions).
const BY_CATEGORY = { spam: 'leadgen_agency', vendor: 'saas_tool_vendor', recruiter: 'agency_recruiter', investor: 'vc_associate_checkin', customer: 'inbound_demo_qualified', partner: 'integration_partner', press: 'journalist', event: 'event_invite', advisor: 'advisor_for_equity', founder_peer: 'pick_your_brain', acquirer: 'corp_dev', candidate: 'cold_job_seeker', friend: 'friend_family_checkin', competitor: 'competitor_posing_as_customer' };
const CAT_LABEL = { b2c: 'consumer app', smb: 'small-business software', ent: 'B2B software' };

/** Offline inbound message for archetype `a` (from data/inbound-archetypes.js). first/last are the sender's names. */
export function offlineInbound(s, a, inb, { first, last }) {
  const t = T[a.id] ?? T[BY_CATEGORY[a.category]] ?? T.saas_tool_vendor;
  const k = `${inb.id ?? ''}:${a.id}`;
  const org = t.orgs ? pickH(t.orgs, `${k}:org`) : `${last} & Co`;
  const v = { f: String(s.founder.name ?? '').split(' ')[0] || 'there', c: s.company.name, w: s.company.oneLiner || s.company.name, cat: CAT_LABEL[s.company.model] ?? 'SaaS', org, orgslug: slug(org), first, last };
  const fill = (x) => x.replace(/\{(\w+)\}/g, (_, key) => v[key] ?? '');
  const domain = { gmail: 'gmail.com', edu: `${slug(org).slice(0, 10)}.edu`, lookalike: `${slug(org)}-mail.co`, company: `${slug(last)}co.com`, none: '', normal: `${slug(org) || 'mail'}.com` }[t.mail] ?? 'gmail.com';
  return {
    senderName: `${first} ${last}`, senderRole: a.label, senderCompany: a.category === 'friend' ? '' : org,
    senderEmail: domain ? `${first.toLowerCase()}@${domain}` : '',
    subject: fill(pickH(t.subj, `${k}:s`)), message: fill(pickH(t.body, `${k}:b`)),
    hiddenAgenda: `${a.label}; true outcome: ${inb.outcome}`,
  };
}

// The ask a scam moves to, per archetype (the invoice itself is posted separately by the caller).
const SCAM_ASK = {
  pay_to_speak_or_award: 'Great! To confirm your speaker slot we just need the package fee by Friday. I can send the invoice now.',
  pay_to_play_podcast: 'Wonderful. Once the production fee is settled we will book your recording date.',
  fake_investor: 'Excellent. Our committee meets Monday; the due-diligence processing fee must be received before then so we can issue the term sheet.',
  scam_misc: 'Thank you for confirming. Please remit the fee on the attached invoice so the registration stays in your name.',
  launch_upvote_seller: 'Perfect. Pay the package upfront and we schedule the hunters for your launch day.',
  directory_submission: 'Great, payment first and we start submitting today.',
  seo_link_seller: 'Okay, I send the list after payment. Most clients take the 10-link package.',
  leadgen_agency: 'Great. We just need the setup fee to start the campaign this week.',
};
export const offlineScamReply = (archetypeId) => SCAM_ASK[archetypeId] ?? 'Great! To move forward we just need the fee by Friday. I can send the invoice now.';
