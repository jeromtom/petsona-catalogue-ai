# AI Impact Statement

Petsona classifies pet-store products into evidence-backed attributes (species, life stage, allergens, sizing) so shoppers only see products suitable for their pet and merchants stop hand-tagging SKUs.

**What the AI does.** Deterministic rules extract candidate values and the exact source sentences. A typed decision model, TypeSafe Jev (`jev-1.13.0`) or the open-weight Apache 2.0 Laya (`convaiinnovations/laya`), answers one closed question per attribute: supported, contradicted, unknown or conflicting, with a calibrated probability. These models never generate text, so no invented ingredient can appear. Google Cloud Vision reads ingredient lists from the merchant's own label photos when the listing lacks one.

**Data.** The merchant's own Shopify product text and images, verified manufacturer pages fetched under robots.txt, and a 410-product research corpus from 12 official brand feeds. No pet or customer data reaches the classifier.

**Guardrails.** Missing text is never evidence of absence. Allergen absence is published only from a merchant's explicit attestation. Unknown and conflicting verdicts block publication. Responses are strictly validated, model versions pinned, spend capped monthly, and merchant overrides survive refreshes.

**Outcome and limits.** Fewer unsafe picks, less manual tagging. Accuracy is not yet measured: zero independently reviewed labels exist, so we report evidence status, not safety.
