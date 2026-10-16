# Pivots and early iteration: sourced facts for the simulator

Status: research brief. Confidence tags: [verified] = primary or near-primary source read; [secondary] = summary or blog repost only; [unverified] = claimed in a source we could not check; [design] = our modelling assumption, not a statistic.

Key caveat: the strongest quantitative pivot evidence is old (Startup Genome 2011) or small-sample (Camuffo trials, Kirtley & O'Mahony's seven firms). Treat exact percentages as directional.

## 1. Pivot types

Eric Ries's taxonomy (from *The Lean Startup*, 2011, which he first sketched on his blog in 2009) lists ten types [secondary: Caycon https://www.caycon.com/blog/lean-startups-art-of-the-pivot; Applied Frameworks https://appliedframeworks.com/types-of-business-model-pivots-in-lean-startup/]:

| Type | What changes | Example pattern | Usually kept | Usually lost |
|---|---|---|---|---|
| Zoom-in | A former feature becomes the whole product | Instagram: Burbn's check-in and points features cut to photo sharing [secondary: DigitalOcean https://www.digitalocean.com/resources/articles/business-pivot] | Users, code for the feature, brand energy | Other features, some users |
| Zoom-out | The whole product becomes one feature of a bigger offer | Common in platform expansions [design] | Core product | Focus |
| Customer segment | Same product, different buyer | Customers arrive who were not the target | Product, most code | Positioning, some marketing |
| Customer need | Different problem for the same customer | Early feedback says the problem is not important enough or not paid for | Customer relationships, team | Roadmap, much code |
| Platform | App becomes platform or vice versa | Buyers usually want solutions, not platforms [secondary, Applied Frameworks] | Distribution, data | Partner ecosystem bets |
| Business architecture | B2B to B2C, high-touch to self-serve | Slack's origin is a rare case of a whole product switch | Some tech, learnings | Sales motion, pricing |
| Value capture | Pricing or revenue model | Seat to usage, subscription to take rate | Customers | Revenue predictability during switch |
| Engine of growth | Paid to viral, sales to PLG | Channel-level change | Product | Acquisition assumptions |
| Channel | Distribution route | Direct sales to marketplace | Product, pricing | Channel relationships |
| Technology | Stack or underlying approach | Rebuild on new model or infrastructure | Product, customers | Some code, time |

Slack is the standard example of a full restart: Tiny Speck's game Glitch did not find a large enough audience, and the team turned its internal messaging tool into Slack [secondary: StartupSavant https://startupsavant.com/startups-that-pivoted]. Other commonly cited cases include YouTube (began as a video dating site) [secondary, same source]. Use company names as examples only; do not attribute to individual founders.

**Same customers versus full restart.** A same-customer pivot (need, zoom-in, value capture) keeps the most learning and relationships. A full restart (new segment plus new need) keeps mainly the team and the skills, and resets most assumptions. [design] Simulator rule: segment-only pivots should keep existing customers; need pivots should churn some; full restarts should wipe most of the customer and channel state.

## 2. Frequency and outcomes

**Startup Genome (2011 first report, internet startups).** Startups that pivoted once or twice reported about 2.5x more funding, 3.6x better user growth, and roughly half the rate of premature scaling compared with those pivoting more than twice or never [secondary: Global Venturing https://globalventuring.com/lessons-learned-from-startup-genome-project; Steve Blank https://steveblank.com/2011/05/29/tune-in-turn-on-drop-out-the-startup-genome-project/]. Same report: solo founders were 2.3x less likely to pivot [secondary: Startup Genome https://startupgenome.com/insights/discover-the-patterns-of-successful-internet-startups-in-the-startup-genome-report]. Caveats: correlational, small sample, secondary sources only, and critics argue "premature scaling" conflates bad with failed. Do not present as causal.

**Y Combinator.** We could not find a verified share of YC companies that pivoted or a median pivot count [unverified]. A 2026 retrospective counts 5,422 companies funded since 2005, with 69.4% still operating [secondary: Leadgenius https://www.leadgenius.com/resources/winners-and-losers-a-two-decade-history-of-y-combinator]. Blog claims of ~70% success for pivoting startups and a 75% major-pivot rate attributed to an HBS study [unverified, single blog: https://tianpan.co/forum/t/70-of-pivoting-startups-succeed-but-pivot-more-than-twice-and-youre-toast/517] should not be used.

**Pivot timing.** Lenny Rachitsky's series covers 30+ pivots, including how long they took [paywalled; https://www.lennysnewsletter.com/p/the-art-of-the-pivot-part-1-the-definitive]. We have no verified median months-after-founding figure [unverified]. Anecdotal: Mintlify's CEO reported eight pivots in 14 months [secondary: https://skills.sh/refoundai/lenny-skills/startup-pivoting]. [design] Use 3-9 months post-founding as a common window for a first major pivot.

**Too often.** The Startup Genome "more than two pivots underperform" pattern is the main evidence [secondary]. [design] Model a diminishing return: first pivot resets learning; repeated pivots without retention improvement compound burn and churn.

**Runway cost.** No verified statistic [unverified]. [design] A full restart typically consumes 3-6 months of runway at small-team burn (rebuild, re-interview, new channel test). Same-customer zoom-in: 1-2 months.

**Scientific-approach RCTs.** Camuffo, Cordova, Gambardella and Spina ran a randomized trial with about 100 Italian startups. Treated entrepreneurs (taught a scientific, hypothesis-testing method) performed better, were more likely to pivot to a different idea, and did not drop out more [verified abstract summary: https://iris.unibocconi.it/handle/11565/4013977; news: https://www.unibocconi.it/en/news/entrepreneurs-who-think-scientists-get-better-results]. The 2024 Strategic Management Journal replication (759 firms, four RCTs, DOI 10.1002/smj.3580) confirms the method can be taught and increases idea termination, but the pivot effect is non-linear: treated firms made few or no pivots, or repeated ones, rather than constant change [verified: https://iris.polito.it/handle/11583/2995828]. Simulator implication: the best-performing pattern is a few deliberate shifts, not frequent ones.

**Kirtley & O'Mahony (2023, SMJ 44(1), DOI 10.1002/smj.3131).** Field study of seven early-stage energy and cleantech firms, 93 strategic decisions [secondary: Wharton https://knowledge.wharton.upenn.edu/article/pivot-entrepreneurship/]. Only three firms pivoted, and they did so through many decisions that cumulatively reoriented strategy. Pivot is better modelled as a series of choices shaped by customer information than as one abrupt event. Their pivot-type taxonomy was not verified [unverified].

## 3. Decision process

**Kill criteria set in advance.** Pre-committed, measurable stop conditions with a date: "If X does not happen by date Y, we stop or pivot" [secondary practice description; attribution to Bill Aulet or Steve Blank not verified]. Read Blank's *Startup Owner's Manual* and Aulet's *Disciplined Entrepreneurship* for primary framing.

**Signals to pivot:**
- Flat retention after several targeted attempts. Retention is the most-cited reliable signal [secondary: Mean CEO https://blog.mean.ceo/?p=2809].
- No pull after N customer conversations (the N is design-set; ~15-20 for a segment check [design]).
- Only friends or discounted users paying.
- Good retention with the wrong customers (supports a segment pivot) versus bad retention (questions the product) [secondary].

**Signals to persevere:** retention climbing; a clear list of specific experiments that move it; paying customers who explain the value unprompted; a pattern in interviews, not a single loud request.

**Pivot sprints.** Time-box exploration: weeks, not months, per direction [secondary: Mintlify CEO, Lenny]. [design] A standard sprint: 2-4 weeks, 15-20 new interviews, 2-3 smoke tests (landing page, concierge, pre-order), explicit go/no-go at the end.

**Founder traps.** Sunk cost and escalation of commitment; vanity metrics (signups, impressions) read as traction; zombie startups that cover costs but never grow. [design] These should map to simulator mechanics: unchanged metrics ignored over time, costs compound.

## 4. Iteration cadence

- Weekly ship and learn loop, with a written hypothesis and a metric per release [design; widely practised].
- Small samples: qualitative interviews dominate until roughly 20-30 active users; quantitative A/B only after weekly traffic supports it [design].
- Experiment sizing: decide the minimum detectable effect before the test; with 50 weekly signups, a 20% lift is not measurable reliably [design].
- Direction timing: give a new direction 4-8 weeks of real effort before judging, unless kill criteria trigger sooner [design, consistent with time-boxing sources].

## 5. Costs of pivots

- Churn of old users: segment and zoom-out pivots lose users who bought the old story [design]. Quantified numbers not verified.
- Brand confusion: changing names or positioning costs search equity and some referrals [design].
- Investor reaction: angels generally expect a pivot to be explained with evidence; surprise pivots damage trust [secondary, angel guides at https://www.hustlefund.vc/post/angel-squad-the-angel-investors-guide-to-startup-pivots-when-to-support-vs-when-to-walk-away].
- Team morale: repeated pivots without a clear reason burn trust and cause departures [design].
- Code: rewriting is cheaper with AI coding agents in 2026 [design; no verified benchmark]. What transfers: infrastructure, auth, billing, data models, interview notes, customer contacts. What does not: UI flows tied to the old job-to-be-done.
- Mental cost: the second and third pivots are harder to justify; investors and customers both notice.

## Gaps and next steps

- Verify Gans, Stern and Hannah pivot-share work (search did not surface it).
- Obtain primary Startup Genome report text for methodology.
- Open Lenny's pivot series for timing and cost examples (paywalled).
- Gartner's 76% pivot-for-PMF figure is paywalled and unclear; do not use yet [https://www.gartner.com/en/documents/5780015].
- Sala, Philbin and Barikzai (80 tech startups; customer segment and customer need were most common) is a usable secondary finding [secondary, conference paper; cite once primary access is confirmed].
