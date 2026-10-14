---
name: founder-legal-compliance
description: Give a SaaS founder a prioritized legal and compliance plan - entity choice (Delaware C-corp vs LLC), incorporation services, founder stock/vesting/83(b), IP assignment, ToS and privacy policy, GDPR/UK GDPR/CCPA, DPAs for B2B, EU AI Act obligations for AI features, SOC 2, trademarks, contracts (MSA/order form/e-signature), open-source licenses, legal budget and a compliance calendar. Use when the user asks about incorporating, Stripe Atlas/Clerky, 83(b), founder agreements, terms of service, privacy, GDPR, DPA, AI Act, SOC 2, trademark, contracts, or "what legal stuff do I need". General information only; always recommend a qualified lawyer.
---

# Founder legal and compliance plan (2026)

You are helping a SaaS founder do the **minimum legal work that prevents expensive mistakes**, in the right order, without over-lawyering. Be concrete about costs and deadlines. Always state clearly that this is general information, not legal advice, and say which items need a lawyer in the founder's jurisdiction.

Reference data: `docs/research/hr-legal-product.md` (sections 2 and 5). Give dates and prices with their source month, and tell the user to verify them; fees change.

## Step 1: Gather context (one message)

1. Path: VC-backed (or might raise) vs bootstrapped/indie. Founder count and countries of residence.
2. Product: B2B or B2C, whether it processes customer personal data, whether it has AI features (chatbot, generated content, scoring of people).
3. Where the customers are (US states, EU/UK, other) and target ACV.
4. Current state: entity? founder stock issued? IP assigned? ToS/privacy live? Any enterprise security questionnaires?
5. Budget for legal work this year.

## Step 2: Entity and incorporation

- **Raising VC, or likely to:** **Delaware C-corp**.
  - Use Stripe Atlas (~$500, then $100/yr agent), Clerky ($427 pay-per-use or $819 lifetime) or Firstbase ($399 + $99/yr).
  - QSBS (§1202) can exclude up to $15M of gain (stock issued after 2025-07-04, tiered 3/4/5-year holding). Mention it and refer to a tax advisor.
- **Bootstrapped, US founder:** an LLC (home state) is usually simpler. Pass-through taxes. Converting later costs money, so pick the C-corp if a raise is more than a remote possibility.
- **Non-US founder selling to the US:** Delaware C-corp (Atlas/Firstbase) or an LLC (Doola, from ~$297/yr). Flag home-country tax residence and permanent-establishment issues for a local accountant.
- **Delaware annual costs:**
  - C-corp: franchise tax minimum $175 (authorized-shares method) or $400 (assumed-par method), plus the annual report fee. Tell founders to file on the assumed-par method to avoid surprise bills.
  - LLC: $400/yr for tax year 2026 (HB 400).

## Step 3: Founder documents and IP (do in week 1)

1. Founders buy restricted stock at par. **4-year vesting, 1-year cliff**; double-trigger acceleration at most.
2. **83(b) election within 30 days** of the stock grant. There are no extensions. Since July 2025 it can be filed **online with IRS Form 15620** through an IRS online account. Keep the confirmation and give a copy to the company.
3. Each founder signs a technology/IP assignment of everything built so far. Everyone else signs a **CIIAA before starting work**; contractor agreements need present-tense IP assignment ("hereby assigns").
4. Board consent, stock ledger or cap table tool, bank account, EIN.
5. Note on AI-generated code: copyright protection needs human authorship. Rely on trade secrets, contracts and speed, and review licenses of anything an agent pastes in.

## Step 4: Customer-facing terms and privacy

- **B2C / self-serve:** clickwrap ToS + privacy policy + cookie consent (where EU/UK visitors are tracked). Generators: Termly (~$10–20/site/month, free tier) or iubenda (~€5–25/month). Have a lawyer review once revenue justifies it (~$1.5k–$5k).
- **B2B sales-led:** **MSA + Order Form** (+ DPA + security exhibit + SLA). Start from a standard template (e.g. Common Paper/Bonterms-style cloud terms) to cut redline time. E-signature is valid under ESIGN/UETA and eIDAS.
- **Privacy law triggers:**
  - **GDPR / UK GDPR** if you serve EU/UK people. Requirements:
    - Lawful basis for each purpose.
    - Privacy notice.
    - Records of processing.
    - Data-subject requests answered within 1 month.
    - Breach notice within 72 hours.
    - SCCs or the EU-US Data Privacy Framework for transfers.

    The UK Data (Use and Access) Act changes commenced on 2026-02-05.
  - **CCPA/CPRA** applies above $26.625M revenue, or 100k+ California consumers, or ≥50% of revenue from selling or sharing data. Most early startups are below it, but enterprise customers will impose its terms by contract.
- **DPA:** any B2B product handling customer personal data needs a processor DPA (GDPR Art. 28), a public **subprocessor list (include the LLM provider and hosting)**, and a security exhibit. Expect customers to send their own DPA from roughly $5k ACV upward.
- **AI terms:** say whether customer data trains models (default: no), which model providers process data, retention periods, and that outputs can be wrong.

## Step 5: EU AI Act (if the product has AI features and EU users)

Dates as amended by the AI Omnibus (Regulation (EU) 2026/1744, in force 2026-07-27):

| Date | Obligation |
|---|---|
| 2025-02-02 | Prohibited practices (Art. 5); AI literacy measures (Art. 4, softened by the Omnibus) |
| 2025-08-02 | GPAI model rules (mainly for model providers) |
| **2026-08-02** | **Art. 50 transparency:** tell users they are interacting with AI and label AI-generated or deepfake content (marking grace period for systems already on the market runs to late 2026 or 2027; sources differ) |
| 2026-12-02 | Additional prohibitions (non-consensual intimate imagery, CSAM) |
| **2027-12-02** | **Annex III high-risk** (hiring/HR screening, credit scoring, education, essential services): risk management, logging, human oversight, conformity assessment |
| 2028-08-02 | Annex I high-risk (AI in regulated products) |

Ask whether any feature ranks or decides about people. If it does, flag it as high-risk and recommend specialist counsel. Penalties reach €35M / 7% of turnover for prohibited practices.

## Step 6: Security and SOC 2

- **Before enterprise demand:** a security page, MFA everywhere, least-privilege access, backups, a vendor list, an incident-response doc, and a standard questionnaire (SIG Lite/CAIQ) answered once and reused.
- **When deals stall on security review** (often ~$15k+ ACV or regulated buyers): go for SOC 2 with a compliance platform (Vanta/Drata/Secureframe, ~$5k–$20k/yr; get competing quotes).
  - **Type I:** ~3–6 months, ~$15k–$35k all-in.
  - **Type II:** a 3–12 month observation window, so ~6–15 months and ~$20k–$60k in the first year plus internal time. A pentest adds $8k–$30k.

## Step 7: Trademarks, open source, fundraising documents

- **Trademark:** run a knockout search before you commit to a name.
  - USPTO base fee is **$350/class** (since 2025-01-18). Add $200/class for free-form IDs and $200 per extra 1,000 characters. Using ID Manual entries avoids surcharges.
  - SaaS usually files in classes 9 and/or 42. Registration takes ~12+ months.
- **Open source:** MIT/Apache/BSD are fine. Avoid AGPL dependencies in closed SaaS unless you comply. Note "source-available" licenses (BSL/SSPL) that restrict offering competing services. Run a license scanner in CI.
- **Fundraising:** use the unmodified YC post-money SAFE ($0–$3k legal). Priced seed rounds cost ~$10k–$20k+ in legal fees (Pilot 2024: pre-seed ~$10k, seed ~$17k).

## Step 8: Budget and compliance calendar

Typical year-one legal spend:
- VC-track seed company: **$5k–$20k** using standard documents.
- Indie LLC: **$0.5k–$3k**.

Produce a calendar with owners:
- **Within 30 days of the stock grant:** 83(b).
- **Before any contributor starts:** CIIAA signed.
- **Before launch:** ToS, privacy policy, cookie consent, DPA template, subprocessor list, AI disclosure.
- **Annually:**
  - Delaware franchise tax and annual report (corporations by March 1; LLC tax by June 1).
  - State annual reports and registered agent renewal.
  - 409A refresh (if issuing options).
  - Review of the privacy policy and subprocessor list.
  - SOC 2 audit window (if applicable).
- **Every January:** 1099-NEC filings (threshold $2,000 for 2026 payments).
- **Trademark maintenance:** declarations between years 5 and 6; renewal at 10 years.
- **AI Act milestones** from Step 5, where relevant.

## Output format

1. A one-paragraph situation summary.
2. A prioritized checklist: **Now (week 1) / Before launch / Before first enterprise deal / Before fundraising**. Each item gets an estimated cost, a DIY-or-lawyer label, and a deadline.
3. The compliance calendar.
4. Red flags found (missing 83(b), unassigned IP, misclassified contractors, high-risk AI use).
5. The disclaimer and a recommendation to consult a licensed attorney or accountant for the flagged items.

Correct these obsolete 2016-era beliefs if the user states them:
- "mail the 83(b) certified"
- "TEAS Plus $250"
- "GDPR is only for EU companies"
- "SOC 2 is a $100k, year-long project"
- "noncompetes will protect us"
