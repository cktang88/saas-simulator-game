# G1 buyer segments: mom-and-pop retail, independent restaurants, salons/spas/boutique fitness

Research note: web coverage for these verticals in 2024–2026 is thin. Most sales-cycle, procurement and committee figures are not published by any independent source I could reach, so they are marked [design] and should be treated as priors to calibrate in the simulator. Sourced numbers are dated; several come from vendor blogs or secondary aggregators and are flagged as such. Dollar and day ranges are my estimates unless marked otherwise.

---

## Segment 1: Mom-and-pop independent retail shops

### 1. Size & examples
- Scale: owner-operated, usually 1–10 employees, often with 0–3 part-timers. Examples: boutique apparel, gift and home-decor shops, florists, bike and hardware shops, pet stores, bookstores, specialty food.
- Macro context: SBA reports 36.2 million small businesses in the U.S., accounting for almost 46% of private-sector employment (SBA Office of Advocacy, 2025 State profiles, https://advocacy.sba.gov/?p=30239, 2025). The large nonemployer population (sole proprietors with no payroll) is the relevant tail. Census published 2022 nonemployer statistics on Dec 12, 2024 (https://www.census.gov/newsroom/press-releases/2024/2022-nonemployer-statistics.html). I could not retrieve a current count of independent retail shops by employee band; check Census NES/ABS on data.census.gov (NAICS 44–45).

### 2. Buying committee
- Owner / signer (economic buyer and usually the user): typically 1. Influence 0.9. Concerns: cash flow, time to set up, whether it replaces something they already do. Can block: yes, absolutely. Present: high.
- Champion: usually the owner themself, sometimes a store manager or a long-tenured employee [design: 1 in 4 shops with staff]. Influence 0.5. Can block: a manager can veto if they are the only person who uses it.
- Spouse / business partner: [design] present in ~30–40% of owner-operated shops. Influence 0.5–0.7 on any spend above ~$100/month. Can block: yes, informally.
- Bookkeeper / outside CPA: [design] used by most shops. Influence 0.3–0.5. Concerns: data export, reconciliation, sales-tax reports. Can block: they can stop a tool that breaks the books.
- IT / technical: almost never. Influence 0.1. Owner is the IT department.
- Security / legal / procurement / board: not present. Influence ~0.
- Landlord / franchisor: only if a franchise or mall lease requires approved vendors (rare for software, common for POS in franchises).
- Buyer is not the user: [design] in ~40% of cases when staff will live in the tool (POS, scheduling, inventory). For owner-only tools (bookkeeping, email marketing) the buyer and user are almost always the same person.

### 3. Cycle & deal size
- Typical small-vendor ACV: $200–$1,500/yr [design]; POS or payments-attached tools can reach $1,000–$3,000/yr with processing.
- Sales cycle, [design] (no published source found):
  - <$5k: same day to 14 days
  - $5–25k (rare here): 14–45 days
  - $25–100k: 45–120 days (multi-location retailers)
  - >$100k: not realistic for this segment
- Win rate on qualified opportunities: not published; [design] 20–35% for a warm in-person demo with a fixed-price offer.

### 4. Procurement
- Card-first. Shops pay with a debit card or a personal/business credit card. Nearly half of SMBs in an i2c/PYMNTS survey of 583 businesses (fielded Apr 4–22, 2025) said credit limit influences which card sits at the top of their wallet (https://www.i2cinc.com/smbs-rely-on-business-and-personal-credit-cards-for-growth/, 2025). An older Hello Alice survey (2022) found ~45% of owners had a personal card application denied in the prior five years (https://helloalice.com/?p=3732, 2022). Practical implication: keep the entry price under ~$50/month so no card limit is tested.
- Quotes, RFPs, board approval, cooperative contracts: none apply [design].
- Fiscal year: calendar year for most; budgets are informal, set in Q4 or January.
- Payment terms: monthly card billing; annual prepay only accepted with a discount.
- Paperwork: W-9 only if a vendor is paid by the shop (rare). No SOC 2, VPAT, DPA or insurance certificates. Card payments mean PCI scope sits with the processor.

### 5. Channels
- Works: in-person visits during quiet hours (mornings before opening, mid-afternoon); local chamber of commerce events; Main Street and downtown merchant associations; peer referral from neighbouring shops; Shopify App Store or Square App Marketplace listings for owners already on those platforms; Facebook groups for local merchants.
- Fails: cold email (low reply, often assumed spam); enterprise-style webinars; paid search on generic terms (expensive, low intent); phone calls during open hours (owner is on the floor).
- Best times: Tuesday–Thursday, 9:30–11:00 or 2:00–4:00, outside peak retail traffic. Avoid Saturdays and the Nov–Dec holiday rush.
- Tech-savviness: low to medium. Owners use phones; they will not set up integrations. Sell "it works out of the box."

### 6. Methodology
- Best fit: value selling with a simple before/after (hours saved per week, one sales-tax or inventory pain point), kept to three questions. BANT is too heavy for a $30/month decision. Sandler-style pain funnel works for owners who need to talk through the problem.
- Critical elements: the pain in the owner's own words; the price expressed as one coffee per day or less; a free trial or a 30-day money-back guarantee; a clear "stop" move if they say no.

### 7. Scenarios
1. Buyer is not the user (staff must use it). Probability ~35%. Handle: run a 15-minute demo for the employee on the floor; ask the owner to commit to a 14-day trial with the staff member.
2. Spouse or partner vetoes the spend. Probability ~20%. Handle: ask for a joint 15-minute call; send a one-page cost summary the partner can read.
3. Bookkeeper says the export will break reconciliation. Probability ~15%. Handle: get a sample export from the bookkeeper's preferred tool before the trial; if it fails, do not argue. Offer a CSV or QuickBooks-compatible export.
4. Owner says "I'll think about it" and goes silent. Probability ~40%. Handle: one follow-up in 7 days with a specific ask ("start Monday or not?"); after 21 days, mark closed-lost and check back at the next season.
5. Bottom-up adoption: an employee starts using a free tier and the owner later needs to pay for an upgrade. Probability ~10%. Handle: this is a conversion, not a new sale; show the usage they already have and price the upgrade against the saved time.

### 8. Common objections
- "We already do this on paper / in Square." Reply: "Which part still takes you the most time each week?"
- "Is this going to lock me in?" Reply: "No contract. Cancel from the same screen you signed up on."
- "I can't afford another subscription." Reply: "Which one would you cancel to pay for it? If none, let's look at what it saves in hours."
- "My nephew can set it up." Reply: "Great, here's the one-page setup guide you can hand him."

### 9. Churn & seasonality
- Annual churn: SMB SaaS benchmarks are widely cited at ~10–14% annual logo churn (secondary aggregator of ChartMogul 2025, https://www.gtm8020.com/blog/saas-churn-rate-statistics, 2025); other sources give 30%+ for very small self-serve tools. [design] For mom-and-pop retail with a card-billed tool, plan for 25–35% annual churn, mostly from business closures.
- Renewal dynamics: low, because most subscriptions renew silently. Churn spikes after the January tax-season cash crunch.
- Busy months for sales: September–October (before holiday inventory) and early January (new-year resolutions). Slow months: late November–December (owner is busy with holiday traffic), July–August in tourist-dependent towns.

### 10. Solo-founder fit
- Score: 0.6. Works well for a single founder who can walk a Main Street route, but it is hard to scale past a few cities without field staff. Realistic model: one city, one vertical (say, boutiques), 60–100 in-person demos a month.

### 11. Sources
- https://advocacy.sba.gov/?p=30239 (SBA 2025 State profiles, 2025)
- https://www.census.gov/newsroom/press-releases/2024/2022-nonemployer-statistics.html (Census, Dec 12, 2024)
- https://www.i2cinc.com/smbs-rely-on-business-and-personal-credit-cards-for-growth/ (i2c/PYMNTS, Apr 2025 fieldwork, published 2025)
- https://helloalice.com/?p=3732 (Hello Alice, 2022)
- https://www.gtm8020.com/blog/saas-churn-rate-statistics (secondary aggregator, 2025; secondary)

---

## Segment 2: Independent restaurants and small restaurant groups

### 1. Size & examples
- Independents: single-unit full-service and limited-service restaurants, typically 10–60 employees, $0.5–5M revenue. Examples: neighbourhood bistros, taquerias, pizza shops, coffee and bakery cafes.
- Small groups: 2–15 units under one owner or a partnership; typically 100–400 employees. Examples: a local burger chain with 4 units, a three-restaurant hospitality group.
- Industry count: Technomic preliminary data reports 412,498 independent restaurant locations at year-end 2025, down from 422,001 in 2024 (-2.3%); full-service down 2.6%, limited-service down 1.8% (Nation's Restaurant News, Feb 24, 2026, https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025). The shrinking base matters for churn and for the willingness to buy.
- Industry employment: 15.9 million per the NRA 2025 State of the Industry (press release Feb 6, 2025, https://restaurant.org/research-and-media/media/press-releases/restaurant-industry-poised-for-growth-in-2025-industry-expected-to-employ-15-9-million-people-and-r/).

### 2. Buying committee
- Owner / GM (economic buyer and user for POS, scheduling): 1 per unit. Influence 0.9. Concerns: downtime during service, cost of hardware, reliability. Can block: yes. Present: high, but often at the restaurant only in off-hours.
- Chef / kitchen lead (KDS, inventory, recipe costing): 1. Influence 0.4. Can block: they can refuse to use it.
- Front-of-house manager (scheduling, tips, reservations): 1. Influence 0.4.
- Bookkeeper / CPA (payroll, tip reporting, sales tax): 1. Influence 0.5. Can block: yes, when integration with accounting fails.
- Franchisor (only for franchised brands): brand approval list; influence 0.8 where it applies.
- Group level (for small groups): VP Operations or CFO, influence 0.7–0.9. Director of IT, influence 0.5 for POS and payments.
- Buyer is not the user: [design] ~40% for POS and scheduling; BlueStar's 2023 survey of 72 operators found at least 12 said the POS decision was not theirs, citing corporate or upper management (https://nation.bluestarinc.com/articles/we-asked-72-restaurant-owners-about-their-point-of-sale-system, Feb 15, 2023). That is consistent with the 1-in-6 figure for groups.

### 3. Cycle & deal size
- Typical ACV for a small vendor: $1,000–$6,000/yr [design]; POS with payments can run $1,000–$3,000 a year in software plus processing fees.
- Sales cycle, [design]:
  - <$5k: 1–14 days
  - $5–25k: 14–45 days (single unit with add-ons)
  - $25–100k: 45–120 days (small groups)
  - >$100k: 120–240 days (multi-unit, with a franchisor or group IT review)
- Win rate: no published figure. [design] 15–30% on a qualified demo with a trial.

### 4. Procurement
- P-card: most independents use a business card; [design] limits $2k–$10k. Groups use AP with purchase orders above ~$5k.
- Quotes: 2–3 quotes for groups above ~$10k [design].
- Board approval: not needed for independents; groups may require an owner or partner sign-off.
- Fiscal year: calendar year; budgets set in Q4 for groups.
- Payment terms: monthly card; POS contracts typically 12–36 months (Toast's pay-as-you-go option is reportedly tied to a 2-year agreement per the Katalystos pricing page, https://www.katalystos.com/blog/restaurant-pos-pricing-in-2026-real-costs-from-every-major-vendor, 2026; verify).
- Paperwork: W-9 for payouts; PCI DSS attestation via processor; insurance certificate for hardware or installation; no SOC 2 or VPAT for independents. Groups ask for SOC 2 Type II and a DPA.

### 5. Channels
- Works: in-person visits between 2:00 and 4:00 pm (after lunch service, before dinner prep); state restaurant associations; regional trade shows; peer referral from other owners; POS app marketplaces (Toast, Square); integration partnerships with accounting and payroll tools; local restaurant Facebook groups.
- Fails: cold email to owners; LinkedIn for independents; webinars; generic paid search.
- Best times: Monday and Tuesday mornings are quiet for owners after weekend service; avoid Friday and Saturday evenings.
- Tech-savviness: medium overall, low for the owner in person, high for the GM at a group. Owners are tired of "rip and replace": BlueStar found over 50% had used their POS for more than five years and "nearly half" would not consider changing (BlueStar, Feb 2023).
- Vendor context: Toast's own survey (fielded Nov 2025, 652 U.S. SMB decision-makers) found 40% consider Toast when switching; treat as vendor-sourced (https://www.restaurantdive.com/spons/choosing-a-pos-system-what-restaurant-operators-prioritize-in-2026/815164/).

### 6. Methodology
- Best fit: value selling anchored on food cost or labour percentage for independents; MEDDPICC for groups (Economic buyer and the Decision process are critical because the owner or group IT often differs from the user).
- Critical elements: find the economic buyer before the demo; ask who else must approve; never demo to the GM and assume the owner agreed.

### 7. Scenarios
1. Buyer is not the user (GM or chef will live in the tool). Probability ~40%. Handle: demo to both the owner and the user; get the user to run a live scenario; ask the owner to set the trial.
2. Group corporate says "no new vendor" after the unit owner says yes. Probability ~15%. Handle: ask for the group IT or VP Ops contact early; offer a single-unit pilot framed as a 60-day test.
3. Hidden blocker: the POS integration is not supported by the existing POS. Probability ~20%. Handle: check the integration list before the first call; if missing, drop the deal early rather than spend weeks on it.
4. Franchisor approval required. Probability ~5% for this segment overall, ~30% for franchisees. Handle: check the franchise agreement first; if approval is needed, start with the franchisor's vendor-approval process (often 60+ days).
5. Restaurant closes or changes hands during the trial. Probability ~8%. Handle: have a written "closure clause" in the order; reconvert the sale to the new owner if they keep the concept.

### 8. Common objections
- "Toast/Square already does this." Reply: "Which part of the nightly close still takes you the longest?"
- "I can't be down during service." Reply: "We run the install between 2 and 4 pm, with a rollback plan; here is the checklist."
- "Our POS vendor locked us in." Reply: "Then we start with the add-on that works with your current POS, and you move later."
- "The corporate office decides." Reply: "Who there reviews vendors? I can send a one-page security summary for them."

### 9. Churn & seasonality
- Annual churn: restaurants have high business-closure churn. Independent locations fell 2.3% in 2025 (Technomic via NRN, Feb 2026). [design] Plan for 15–25% annual logo churn for independents; groups 8–12%.
- Renewal dynamics: renewals are cheap to lose when the owner sells or closes. Retention depends on the GM's commitment.
- Busy sales months: September–October (budgets for next year); late January–February (after holiday revenue is known). Slow: December (holiday service), June–August in some cities (patio season is busy but owners are fully occupied).

### 10. Solo-founder fit
- Score: 0.5. Possible if the founder can visit neighbourhoods and handle installs or training. Groups need a sales team or a reseller. Restaurants need hands-on onboarding, which limits how many accounts a single founder can take on.

### 11. Sources
- https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025 (Technomic via NRN, Feb 24, 2026)
- https://restaurant.org/research-and-media/media/press-releases/restaurant-industry-poised-for-growth-in-2025-industry-expected-to-employ-15-9-million-people-and-r/ (NRA, Feb 6, 2025)
- https://nation.bluestarinc.com/articles/we-asked-72-restaurant-owners-about-their-point-of-sale-system (BlueStar, Feb 15, 2023)
- https://www.restaurantdive.com/spons/choosing-a-pos-system-what-restaurant-operators-prioritize-in-2026/815164/ (Toast-sponsored, 2026; vendor-sourced)
- https://www.katalystos.com/blog/restaurant-pos-pricing-in-2026-real-costs-from-every-major-vendor (pricing blog, 2026; secondary)
- https://pos.toasttab.com/vi-us/news/toast-releases-fy2025-corp-responsibility-and-impact-report (Toast, FY2025 report)

---

## Segment 3: Salons, spas and boutique fitness studios

### 1. Size & examples
- Salons and spas: owner-operated shops of 2–20 staff; booth-rental salons where stylists are solo tenants; day spas of 5–30 staff; nail salons (large share of booth renters).
- Boutique fitness: yoga, pilates, indoor cycling, HIIT and barre studios; typically 1–3 locations, 3–20 instructors, 100–1,500 members.
- Counts: most recent federal compilation found (third-party site citing Census, startbusinessbystate.com, undated): 84,176 employer salon establishments with 391,064 employees in 2023, plus 838,264 nonemployer businesses (booth renters and solo stylists) (https://startbusinessbystate.com/salon-industry-statistics/). The PBA's last full-profile figure I could reach is from 2014 (about 1.1 million establishments, $46 billion sales, 2012 data): https://www.finance.senate.gov/imo/media/doc/Professional%20Beauty%20Association-%202014%20Economic%20Snapshot%20of%20the%20Salon%20Industry.pdf.
- Booth renters: California's AB 5 ended independent booth-renter status for nail technicians from Jan 1, 2025 (Salon Today, https://www.salontoday.com/news/california-nail-techs-may-no-longer-be-independent-renters, 2025). That changes who the "owner" is in some shops.
- Boutique fitness: vendor-cited estimate that boutique fitness is 42% of gym memberships (IHRSA 2023 per secondary coverage, https://athletechnews.com/?p=99814, 2023). Studio counts: no reliable figure found.

### 2. Buying committee
- Owner / studio owner (economic buyer, signer and usually the user): 1 per business. Influence 0.9. Concerns: payments, cost per booking, client retention, switching risk. Can block: yes. Present: high.
- Front-desk or receptionist manager: 1–2. Influence 0.5. Concerns: booking UX, check-in, reports. Can block: yes, in practice.
- Lead stylist, lead trainer or studio manager (chairs/classes): 1. Influence 0.4. Can block: when they run the schedule.
- Booth renters (salon): 5–20 per salon, users not buyers, influence 0.2 each collectively. Can block: by leaving with their client lists.
- Bookkeeper or accountant: [design] used by most owners with 5+ staff. Influence 0.4. Can block: on payroll and commission exports.
- Franchise corporate: where the business is franchised (some fitness brands, national salon brands): influence 0.8 with brand-approved lists.
- Buyer is not the user: [design] 30–50% for booking, POS and membership software (a front desk or manager uses it all day). A 2019 DaySmart/Researchscape survey of 590+ owners found scheduling, automated communication and POS the top priorities, with budget and expertise the top barriers (https://www.americanspa.com/business/study-shows-56-salons-spas-use-business-management-software, 2019, dated).

### 3. Cycle & deal size
- Typical ACV for a small vendor: $300–$2,500/yr for solo tools; $1,500–$8,000/yr for multi-staff booking, memberships and payments. Mindbody-class tools are quoted at $99–$699 per location per month by a data vendor (https://withorbital.com/data/software/mindbody/, undated; unverified).
- Cycle, [design]:
  - <$5k: 1–14 days
  - $5–25k: 14–45 days
  - $25–100k: 45–120 days (multi-location studios or groups)
  - >$100k: 120–240 days (franchise networks)
- Context: a 2017 SaaS AE report gave a $25K median ACV and a 60-day median cycle for SaaS in general (https://forentrepreneurs.com/2017-saas-ae-metrics-report, 2017, dated). A HockeyStack analysis of 54 B2B SaaS companies found deal size explains only ~27% of the variance in cycle length (https://hockeystack.com/blog/acv-sales-cycles-and-sales-reps/, undated).
- Win rate: no published figure for this segment. [design] 20–30% on a qualified trial.

### 4. Procurement
- Card-first for solo and small businesses; annual invoicing for multi-location studios; POs rare.
- Quotes, RFPs, board approval, cooperative contracts: none. Franchise networks require brand approval.
- Fiscal year: calendar. Budgets set in Q4 or at January renewals. Studios often buy around the January "new year" membership surge.
- Payment terms: monthly card; 12–24 month contracts are common in the Mindbody class (vendor-stated 24-month standard term, Orbital data page, undated). Cancelling early is often the main objection.
- Paperwork: payment processing agreements (the processor's PCI attestation is the main compliance item); W-9 for payouts; state sales tax on services varies; no SOC 2 or VPAT at this size. Groups and franchises ask for a security questionnaire and a DPA covering client data.

### 5. Channels
- Works: Instagram and TikTok (salons and studios sell to each other through visible content); referrals from regional owner networks and Facebook groups; in-person visits to neighbourhoods; trade shows (regional beauty expos, fitness conventions); integration listings in booking marketplaces; SMS and email from the owner's own customer list; partnerships with product suppliers.
- Fails: cold email (low response, owners rarely read it); LinkedIn; generic paid search for "salon software" (crowded with large vendors); phone calls during appointment hours.
- Best times: Monday and Tuesday mornings, 9:30–11:00 am; Sunday evenings for boutique studios (after class schedule set). Avoid 10 am–7 pm for salons and 6–9 am for fitness studios.
- Tech-savviness: medium. Owners use Instagram, Google Business and booking apps daily, but they run the front desk on phones. Switching resistance is high: the 2019 survey listed lack of budget and expertise as the top barriers.
- Competitive note: Fresha's paid tier is reportedly $9.95 per team member per month, with a 20% commission on new clients from its marketplace (https://www.nimbleappgenie.com/blogs/?p=13940, 2025, secondary). That sets a price anchor for solo businesses.

### 6. Methodology
- Best fit: value selling, with a revenue-per-chair or revenue-per-class calculation; SPIN works for the owner conversation about bookings, cancellations and no-shows.
- Critical elements: the number of no-shows or cancellations per month, the card-processing fee the owner pays now, and the staff member who runs the front desk (their buy-in is a must).

### 7. Scenarios
1. Front-desk manager loves it, owner worries about cost. Probability ~35%. Handle: quantify no-show savings; offer a 30-day trial with the manager as the reporting owner; come back with a single number.
2. Booth renters refuse to move their clients. Probability ~25% in booth-rental salons. Handle: offer a per-renter plan or a shared calendar for renters; do not sell to the salon owner until the renters agree.
3. Mindbody or Vagaro contract lock-in. Probability ~30%. Handle: ask for the contract end date; plan the switch for the renewal month; offer data-import help.
4. Franchise brand sets a vendor list. Probability ~10%. Handle: check the franchise manual first; go to the franchisor's vendor approval (often 60+ days) or sell to independents in that network only.
5. Seasonal freeze: the owner pauses spend in summer (fitness) or after wedding season (salon). Probability ~20%. Handle: time the trial for January or September; offer a seasonal pause option on the plan rather than cancellation.

### 8. Common objections
- "We're on Mindbody/Vagaro and it's fine." Reply: "What do you wish it did better in a typical week?"
- "Clients won't book online." Reply: "Which share of your bookings already come from Instagram or Google? Let's check that first."
- "I can't afford another subscription." Reply: "What do you lose each month in no-shows? Let's compare that to the price."
- "Switching will confuse my staff." Reply: "We import your client list and run a one-hour training. Here is the schedule."

### 9. Churn & seasonality
- Annual churn: SMB SaaS benchmarks run ~10–14% logo churn annually (ChartMogul 2025 via secondary aggregator, https://www.gtm8020.com/blog/saas-churn-rate-statistics). Salon and studio closures and owner turnover push this higher: [design] 15–25% for booking tools, 25–35% for solo-stylist tools.
- Renewal dynamics: contracts often auto-renew; the cancellation moment is the renewal month. Booth-rental churn is driven by stylist turnover, not by the salon owner.
- Busy sales months: late December–January (fitness resolutions); late August–September (back-to-school and autumn bookings); February–March (wedding season planning for salons). Slow: July–August for fitness; late November–early December (holiday rush for salons, so owners are busy).

### 10. Solo-founder fit
- Score: 0.6. Possible via Instagram and in-person demos in one metro, plus a self-serve trial. Studios with 5+ staff need onboarding help, and franchise chains need a sales team.

### 11. Sources
- https://startbusinessbystate.com/salon-industry-statistics/ (Census compilation, undated; third-party)
- https://www.finance.senate.gov/imo/media/doc/Professional%20Beauty%20Association-%202014%20Economic%20Snapshot%20of%20the%20Salon%20Industry.pdf (PBA, 2014)
- https://www.probeauty.org/wp-content/uploads/2026/04/2025_PBA_Annual_Report.pdf (PBA 2025 annual report, 2026 upload; no market-size figures found in the indexed text)
- https://www.salontoday.com/news/california-nail-techs-may-no-longer-be-independent-renters (Salon Today, 2025)
- https://www.americanspa.com/business/study-shows-56-salons-spas-use-business-management-software (DaySmart/Researchscape, 2019)
- https://withorbital.com/data/software/mindbody/ (Orbital data, undated; secondary)
- https://www.nimbleappgenie.com/blogs/?p=13940 (2025; secondary)
- https://athletechnews.com/?p=99814 (IHRSA 2023 coverage, secondary)
- https://forentrepreneurs.com/2017-saas-ae-metrics-report (2017 SaaS AE metrics, dated)
- https://hockeystack.com/blog/acv-sales-cycles-and-sales-reps/ (HockeyStack, undated)
- https://www.gtm8020.com/blog/saas-churn-rate-statistics (ChartMogul 2025 via secondary, 2025)
