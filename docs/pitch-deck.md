# Petsona Catalogue AI, pitch deck (6 slides)

## 1. Problem and who cares

**Your store knows the shopper. It knows nothing about the pet.**

- Pet-store product pages are free text. "Chicken-free" is a claim, "animal fat" hides its source, a fish-shaped toy is not fish food.
- Merchants hand-tag thousands of SKUs or skip it. Parents of allergic pets read every label themselves.
- Who cares: Shopify pet retailers and their shoppers, and the pets whose allergies and life stages a store must never guess.

## 2. Insight and why now

**Classification is a closed question, not a writing task.**

- Typed decision models (TypeSafe Jev, open-weight Laya) answer "does this evidence support X?" with a calibrated probability in one forward pass. They never generate text, so nothing can be invented.
- Cost and control: Jev at US$0.042 per million input tokens; Laya is Apache 2.0 with a self-hosting path.
- Why now: Shopify's agentic commerce (Global Catalog, agent profiles) makes structured, evidence-backed attributes the currency. Why us: Petsona already owns the pet profile inside the merchant's store.

## 3. Solution demo

Product -> evidence spans -> deterministic proposals -> typed verdicts -> merchant approves -> tags -> Pet Picks.

- Screenshot: merchant review table with Supported / Unknown / Conflicting and the source sentence.
- `npm run demo:all` reproduces the pipeline in under a minute; set a key for live verdicts.

## 4. Technical approach

- TypeScript monorepo: Shopify app (React Router) on Cloud Run asia-southeast1, Neon Postgres, Cloud Tasks queue, daily reconciliation.
- Evidence: product text, verified manufacturer pages (robots.txt, GTIN/SKU match), Cloud Vision OCR of the merchant's own label photos.
- Decisions: one atomic four-way question per value, up to 20 per request; Jev 1.13.0 or Laya via Vercel AI Gateway; token windows with the pinned Laya tokenizer.
- Guardrails: strict response validation, spend ledger, rate-limit admission, idempotent hashes, merchant locks, allergen absence only by attestation.
- Pet Picks: deterministic eligibility first; a Groq-hosted LLM may only re-order eligible IDs.

## 5. Value and go-to-market

- Who pays: merchants, through Petsona's recurring plans (Free, Growth US$29, Scale US$79 per month). Catalogue intelligence sits in the paid tiers.
- Unit economics: a 10,000-product catalogue at 20,000 input tokens each costs about US$8.40 on Jev per full pass; OCR US$1.50 per 1,000 images after the free tier.
- Reach: Shopify App Store listing, outbound to pet retailers (cold-email campaign live since October 2026), theme plus app bundle, partner case studies.

## 6. Roadmap and risks

- Next 4 weeks: labelled benchmark (400 product families, 120 pet-preference cases, two annotators), per-field acceptance thresholds, self-hosted Laya on Cloud Run before the free alias ends on 31 October, OCR on for pilot stores.
- Then: multilingual labels, variant-level sizing tables, more verified manufacturer profiles.
- Risks: accuracy unmeasured today; provider promotion ending; evidence status is not medical advice; manufacturer pages vary; one development store so far.
