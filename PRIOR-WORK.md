# Prior work disclosure and hack-window timeline

AIBoomi Startup Weekend rules allow a continued prototype if it is declared and a surprise element is built during the window, and they ask teams to disclose prior work rather than hide it. This file does that.

## What existed before the event

Petsona is a Shopify app and theme by Rexin Dynamics (Kochi) for merchant-owned pet profiles and pet-aware shopping. Work began in July 2026 and the production app is live at `admin.petsona.xyz`. The catalogue decision layer this submission focuses on was researched on 28 September 2026 (evaluation plan comparing Jev and Laya) and first built and deployed in shadow mode on the development store on 3-4 October 2026. The main repository is private because it holds legal drafts and operating documents; read access can be granted to judges on request.

[Jerom to confirm: declared as a continued prototype at kickoff on 23 October 2026.]

## What was built on 23-24 October 2026

Timestamps are IST from the main repository's history. The event kickoff was 4:00 PM on 23 October; the first three items below were started earlier that day and are listed with their real times rather than claimed as hack-window work.

| Time (IST) | Change | Why it matters |
| --- | --- | --- |
| 23 Oct 12:34 | Versioned ingredient-to-allergen taxonomy (`ingredients-2026-10-23.1`), shared by text, manufacturer and OCR evidence | One rule set, one version string, so every evidence source maps allergens identically and results are reproducible |
| 23 Oct 13:25 | Merchant-confirmed allergen absence publishing (`allergen_evidence`), written only over empty or Petsona-owned values | Absence of an allergen becomes a deliberate merchant attestation, never an inference |
| 23 Oct 16:19 | Cloud Vision OCR of the merchant's own label images, off by default, budgeted and cached | Listings without an ingredient statement can still be classified from the label photo |
| 23 Oct 18:14 | Storefront widget retries a failed pet-list load and confirms before deleting | Reliability of the shopper-facing surface |
| 23 Oct 18:22 | Reorder agent addresses only the pet the purchase fits (uses catalogue species) | Multi-pet households get the right message |
| 23 Oct 18:32 | Theme honours the app's reviewed `allergen_evidence` | The storefront finally reads the merchant attestation end to end |
| 23 Oct 19:05 | Admin resolves a pet's owner from the customer `pets` metafield reference | Correct attribution in the merchant dashboard |
| 24 Oct morning | This repository: standalone, runnable slice of the decision layer with 115 passing tests, a dry-run and live demo CLI, OCR evidence demo, deck and documentation | A judge can run the exact classification code in under a minute |

Infrastructure changes on 23 October (self-hosted CI speed, flaky database test determinism) are not counted as product work.

## What is reused, with attribution

See `NOTICE.md`. The decision models (Laya, Jev), the OCR service (Google Cloud Vision) and the Shopify platform are third-party. All classification, evidence, review and publishing logic is Petsona's own code.
