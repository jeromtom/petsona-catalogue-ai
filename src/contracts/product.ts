import { normalizeSlug, normalizeSlugList, parseStrictIsoDate } from "./common";

export interface ProductMetafieldDefinitionSpec {
  namespace: "petsona";
  key: string;
  name: string;
  description: string;
  ownerType: "PRODUCT";
  type: string;
  access: { storefront: "PUBLIC_READ" };
}

export const PRODUCT_METAFIELD_DEFINITIONS: readonly ProductMetafieldDefinitionSpec[] =
  [
    {
      namespace: "petsona",
      key: "species",
      name: "Eligible species",
      description: "Species slugs eligible for this product.",
      ownerType: "PRODUCT",
      type: "list.single_line_text_field",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "breeds",
      name: "Eligible breeds",
      description: "Breed slugs eligible for this product.",
      ownerType: "PRODUCT",
      type: "list.single_line_text_field",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "size_bands",
      name: "Eligible size bands",
      description: "Pet size bands eligible for this product.",
      ownerType: "PRODUCT",
      type: "list.single_line_text_field",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "life_stages",
      name: "Eligible life stages",
      description: "Pet life stages eligible for this product.",
      ownerType: "PRODUCT",
      type: "list.single_line_text_field",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "allergens",
      name: "Allergens",
      description: "Normalised allergens present in this product.",
      ownerType: "PRODUCT",
      type: "list.single_line_text_field",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "allergen_evidence",
      name: "Reviewed allergen absence evidence",
      description:
        "Merchant-reviewed absence claims for named allergens across all variants, with public source and review date. Not a safety guarantee.",
      ownerType: "PRODUCT",
      type: "json",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "diets",
      name: "Supported diets",
      description: "Diet slugs supported by this product.",
      ownerType: "PRODUCT",
      type: "list.single_line_text_field",
      access: { storefront: "PUBLIC_READ" },
    },
    {
      namespace: "petsona",
      key: "consumption_days",
      name: "Consumption days",
      description: "Expected supply duration in days.",
      ownerType: "PRODUCT",
      type: "number_integer",
      access: { storefront: "PUBLIC_READ" },
    },
  ] as const;

export interface ProductEligibilityInput {
  species?: unknown;
  breeds?: unknown;
  sizeBands?: unknown;
  lifeStages?: unknown;
  allergens?: unknown;
  allergenEvidence?: unknown;
  diets?: unknown;
  consumptionDays?: unknown;
}

export interface ProductEligibility {
  species: string[];
  breeds: string[];
  sizeBands: string[];
  lifeStages: string[];
  allergens: string[];
  allergenEvidence: AllergenEvidence | null;
  diets: string[];
  consumptionDays: number | null;
}

/** An optional standard diet does not impose a special dietary constraint. */
export function normaliseDietConstraint(value: unknown): string | null {
  const diet = normalizeSlug(value);
  return diet && !["standard", "balanced", "none", "other"].includes(diet)
    ? diet
    : null;
}

/** Merchant-owned attestation, never inferred from an empty allergen list.
 * Public provenance must contain no personal or confidential information. */
export interface AllergenEvidence {
  version: 1;
  confirmedAbsent: string[];
  source: string;
  reviewedAt: string;
  authority: "merchant";
  scope: "all_variants";
}

/** A review dated in the future cannot describe evidence already checked. */
function isPastOrPresentDate(value: string): boolean {
  const date = parseStrictIsoDate(value);
  return date !== null && date.getTime() <= Date.now();
}

export function normalizeAllergenEvidence(
  value: unknown,
): AllergenEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.authority !== "merchant" ||
    record.scope !== "all_variants" ||
    typeof record.source !== "string" ||
    !record.source.trim() ||
    record.source.length > 2000 ||
    typeof record.reviewedAt !== "string" ||
    !isPastOrPresentDate(record.reviewedAt) ||
    !Array.isArray(record.confirmedAbsent) ||
    !record.confirmedAbsent.length ||
    record.confirmedAbsent.length > 100 ||
    !record.confirmedAbsent.every(
      (item) =>
        typeof item === "string" &&
        item.length <= 100 &&
        /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(item),
    )
  )
    return null;
  return {
    version: 1,
    confirmedAbsent: [...new Set(record.confirmedAbsent as string[])],
    source: record.source.trim(),
    reviewedAt: record.reviewedAt,
    authority: "merchant",
    scope: "all_variants",
  };
}

export function unverifiedProductAllergies(
  product: ProductEligibility,
  pet: PetEligibilitySignals,
): string[] {
  const reviewed =
    normalizeAllergenEvidence(product.allergenEvidence)?.confirmedAbsent ?? [];
  // `none` is the owner-facing "None known" answer, not an ingredient.
  return normalizeSlugList(pet.allergies).filter(
    (allergen) =>
      allergen !== "none" &&
      !product.allergens.includes(allergen) &&
      !reviewed.includes(allergen),
  );
}

export function normalizeProductEligibility(
  input: ProductEligibilityInput,
): ProductEligibility {
  const rawDays =
    typeof input.consumptionDays === "number"
      ? input.consumptionDays
      : Number(input.consumptionDays);
  return {
    species: normalizeSlugList(input.species),
    breeds: normalizeSlugList(input.breeds),
    sizeBands: normalizeSlugList(input.sizeBands),
    lifeStages: normalizeSlugList(input.lifeStages),
    allergens: normalizeSlugList(input.allergens),
    allergenEvidence: normalizeAllergenEvidence(input.allergenEvidence),
    diets: normalizeSlugList(input.diets),
    consumptionDays:
      Number.isInteger(rawDays) && rawDays > 0 && rawDays <= 3650
        ? rawDays
        : null,
  };
}

export interface PetEligibilitySignals {
  species?: string | null;
  breed?: string | null;
  sizeBand?: string | null;
  lifeStage?: string | null;
  allergies?: string[];
  diet?: string | null;
}

export function isProductEligible(
  product: ProductEligibility,
  pet: PetEligibilitySignals,
) {
  // `none` is the existing owner-facing "None known" answer, not an ingredient.
  const allergies = new Set(
    normalizeSlugList(pet.allergies).filter((allergen) => allergen !== "none"),
  );
  if (product.allergens.some((allergen) => allergies.has(allergen)))
    return { eligible: false, reason: "allergen" as const };

  const checks: Array<[string[], string | null]> = [
    [product.species, normalizeSlug(pet.species)],
    [product.breeds, normalizeSlug(pet.breed)],
    [product.sizeBands, normalizeSlug(pet.sizeBand)],
    [product.lifeStages, normalizeSlug(pet.lifeStage)],
  ];
  const diet = normaliseDietConstraint(pet.diet);
  if (diet) checks.push([product.diets, diet]);
  if (
    checks.some(
      ([allowed, actual]) =>
        allowed.length > 0 && (!actual || !allowed.includes(actual)),
    )
  ) {
    return { eligible: false, reason: "constraint" as const };
  }
  if (unverifiedProductAllergies(product, pet).length)
    return { eligible: false, reason: "allergen_evidence_unknown" as const };
  return { eligible: true, reason: null };
}
