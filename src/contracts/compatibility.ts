import { normalizeSlug, normalizeSlugList } from "./common";
import { isProductEligible, normalizeProductEligibility, unverifiedProductAllergies, type PetEligibilitySignals, type ProductEligibilityInput } from "./product";

/** Shared with Finder: missing/invalid values remain unknown. */
export function sizeBandForWeight(weightKg: number | null | undefined): string | null {
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (weightKg < 5) return "xs";
  if (weightKg < 10) return "s";
  if (weightKg < 25) return "m";
  if (weightKg < 45) return "l";
  return "xl";
}

export function lifeStageForAge(species: string | null | undefined, ageMonths: number | null | undefined): string | null {
  if (ageMonths == null || !Number.isFinite(ageMonths) || ageMonths < 0) return null;
  const animal = normalizeSlug(species);
  if (!animal) return null;
  if (ageMonths < 12) return animal === "cat" ? "kitten" : animal === "dog" ? "puppy" : "young";
  if (ageMonths >= (animal === "cat" ? 132 : 96)) return "senior";
  return "adult";
}

/** Full UTC calendar months, matching Finder's stored age-month unit. */
export function ageMonthsFromBirthday(birthday: unknown, now = new Date()): number | null {
  if (typeof birthday !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const birth = new Date(`${birthday}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(now.getTime()) || birth.toISOString().slice(0, 10) !== birthday || birth > now) return null;
  let months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();
  if (now.getUTCDate() < birth.getUTCDate()) months--;
  return months;
}

export interface ProfileCompatibilityInput {
  species?: string | null; breed?: string | null; birthday?: unknown;
  weightKg?: number | null; allergies?: string[]; diet?: string | null;
}

export function profileEligibilitySignals(pet: ProfileCompatibilityInput, now = new Date()): PetEligibilitySignals {
  return {
    species: normalizeSlug(pet.species), breed: normalizeSlug(pet.breed),
    lifeStage: lifeStageForAge(pet.species, ageMonthsFromBirthday(pet.birthday, now)),
    sizeBand: sizeBandForWeight(pet.weightKg),
    allergies: normalizeSlugList(pet.allergies), diet: normalizeSlug(pet.diet),
  };
}

export type CompatibilityField = "species" | "breed" | "size" | "life_stage" | "diet";

/** Existing Finder tag fallback, shared by every matching surface. */
export function productEligibilityWithTags(input: ProductEligibilityInput, tags: string[] = []) {
  const product = normalizeProductEligibility(input);
  function values(prefixes: string[]) {
    return normalizeSlugList(tags.flatMap(tag => {
      const value = tag.trim().toLowerCase();
      const prefix = prefixes.find(candidate => value.startsWith(candidate));
      return prefix ? [value.slice(prefix.length)] : [];
    }));
  }
  return {
    ...product,
    species: product.species.length ? product.species : values(["petsona:species:", "species:"]).concat(tags.filter(t => /^petsona:(dog|cat|bird|fish|reptile|amphibian|small_pet)$/.test(t)).map(t => t.slice(8))),
    lifeStages: product.lifeStages.length ? product.lifeStages : values(["petsona:life-stage:", "life-stage:"]),
  };
}

/** Explanations use the canonical hard filter; this is not a safety score. */
export function explainProductCompatibility(input: ProductEligibilityInput, pet: PetEligibilitySignals) {
  const product = normalizeProductEligibility(input);
  const eligibility = isProductEligible(product, pet);
  const allergies = normalizeSlugList(pet.allergies);
  const conflicts = product.allergens.filter(value => allergies.includes(value));
  const matches: CompatibilityField[] = [];
  const mismatches: CompatibilityField[] = [];
  const missing: CompatibilityField[] = [];
  const fields: Array<[CompatibilityField, string[], unknown]> = [
    ["species", product.species, pet.species], ["breed", product.breeds, pet.breed],
    ["size", product.sizeBands, pet.sizeBand], ["life_stage", product.lifeStages, pet.lifeStage],
    ["diet", product.diets, pet.diet],
  ];
  for (const [field, allowed, raw] of fields) {
    if (!allowed.length) continue;
    const actual = normalizeSlug(raw);
    if (!actual) missing.push(field);
    else if (allowed.includes(actual)) matches.push(field);
    else mismatches.push(field);
  }
  const unverifiedAllergies = unverifiedProductAllergies(product, pet);
  const status = conflicts.length ? "conflict" : mismatches.length ? "mismatch" : unverifiedAllergies.length || missing.length || !matches.length ? "unknown" : "listed_match";
  return { ...eligibility, status, matches, mismatches, missing, conflicts, unverifiedAllergies, allergyEvidenceReviewed: allergies.length > 0 && !conflicts.length && !unverifiedAllergies.length, allergensListed: product.allergens.length > 0 };
}
