import {
  ALLERGEN_SLUGS,
  normalizeAllergenEvidence,
  parseStrictIsoDate,
  type AllergenEvidence,
  type ProductClassification,
} from "@petsona/contracts";
import type { CatalogueProposal } from "./extract.server";

/**
 * A merchant's explicit confirmation that named allergens are absent from the
 * reviewed ingredient list. Bound to the exact source and evidence it was made
 * against, so any change to the label withdraws it.
 */
export interface AllergenAbsenceAttestation {
  confirmedAbsent: string[];
  reviewedAt: string;
  sourceHash: string;
  evidenceHash: string;
}

export const ALLERGEN_EVIDENCE_SOURCE =
  "Ingredient list on the product page, reviewed by the merchant in Petsona.";

function listValue(field: { value: unknown; status: string } | undefined): string[] {
  return field?.status === "supported" && Array.isArray(field.value)
    ? field.value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Allergens a merchant may confirm as absent, or a reason none can be:
 * absence needs a supported ingredient list, the same list for every variant,
 * and no present or possible match for that allergen.
 */
export function absenceCandidates(
  proposal: CatalogueProposal,
  effective: ProductClassification,
):
  | { ok: true; allergens: string[] }
  | { ok: false; reason: "no_ingredient_list" | "variant_ingredients_differ" } {
  const ingredients = proposal.fields.ingredients;
  if (
    !ingredients ||
    ingredients.status !== "supported" ||
    !Array.isArray(ingredients.value) ||
    !ingredients.value.length
  )
    return { ok: false, reason: "no_ingredient_list" };
  const variantSpecific = proposal.variants.some((v) =>
    ["ingredients", "allergens", "allergensPossible"].some((key) =>
      Object.hasOwn(v.fields, key),
    ),
  );
  if (variantSpecific || effective.variants.some((v) =>
    ["ingredients", "allergens", "allergensPossible"].some((key) =>
      Object.hasOwn(v.fields, key),
    ),
  ))
    return { ok: false, reason: "variant_ingredients_differ" };
  const blocked = new Set([
    ...listValue(effective.fields.allergens),
    ...listValue(effective.fields.allergensPossible),
    ...listValue(proposal.fields.allergens),
    ...listValue(proposal.fields.allergensPossible),
  ]);
  return {
    ok: true,
    allergens: ALLERGEN_SLUGS.filter((slug) => !blocked.has(slug)),
  };
}

/** Validates a confirmation submitted from the review screen. */
export function attestAllergenAbsence(
  proposal: CatalogueProposal,
  effective: ProductClassification,
  confirmedAbsent: readonly string[],
  hashes: { sourceHash: string; evidenceHash: string },
  today: Date,
): AllergenAbsenceAttestation {
  const candidates = absenceCandidates(proposal, effective);
  if (!candidates.ok) throw new Error(candidates.reason);
  const chosen = [...new Set(confirmedAbsent)];
  if (!chosen.length || chosen.some((a) => !candidates.allergens.includes(a)))
    throw new Error("allergen_not_confirmable");
  return {
    confirmedAbsent: ALLERGEN_SLUGS.filter((slug) => chosen.includes(slug)),
    reviewedAt: today.toISOString().slice(0, 10),
    ...hashes,
  };
}

/**
 * The allergen_evidence value Petsona should publish, or null when the
 * confirmation is missing, stale, or contradicted by current evidence.
 */
export function publishedAllergenEvidence(
  attestation: AllergenAbsenceAttestation | undefined,
  proposal: CatalogueProposal,
  effective: ProductClassification,
  current: { sourceHash: string; evidenceHash: string },
): AllergenEvidence | null {
  if (
    !attestation ||
    attestation.sourceHash !== current.sourceHash ||
    attestation.evidenceHash !== current.evidenceHash ||
    !parseStrictIsoDate(attestation.reviewedAt)
  )
    return null;
  const candidates = absenceCandidates(proposal, effective);
  if (
    !candidates.ok ||
    attestation.confirmedAbsent.some((a) => !candidates.allergens.includes(a))
  )
    return null;
  return normalizeAllergenEvidence({
    version: 1,
    confirmedAbsent: attestation.confirmedAbsent,
    source: ALLERGEN_EVIDENCE_SOURCE,
    reviewedAt: attestation.reviewedAt,
    authority: "merchant",
    scope: "all_variants",
  });
}

/**
 * Whether Petsona may change the stored metafield: only when it is empty or
 * still holds the value Petsona last wrote. A merchant's own entry is never
 * overwritten or removed.
 */
export function ownsAllergenEvidence(
  stored: string | null | undefined,
  previouslyPublished: readonly (string | undefined)[],
): boolean {
  if (stored == null) return true;
  return previouslyPublished.some((value) => value !== undefined && value === stored);
}

export interface AllergenReview {
  present: string[];
  possible: string[];
  candidates: ReturnType<typeof absenceCandidates>;
  attestation: AllergenAbsenceAttestation | null;
  /** True while the confirmation still matches the current evidence. */
  current: boolean;
}

/** Everything the review screen needs to show and confirm allergen absence. */
export function allergenReview(
  proposal: CatalogueProposal,
  effective: ProductClassification,
  attestation: AllergenAbsenceAttestation | undefined,
  hashes: { sourceHash: string; evidenceHash: string },
): AllergenReview {
  return {
    present: listValue(effective.fields.allergens),
    possible: listValue(effective.fields.allergensPossible),
    candidates: absenceCandidates(proposal, effective),
    attestation: attestation ?? null,
    current: publishedAllergenEvidence(attestation, proposal, effective, hashes) !== null,
  };
}
