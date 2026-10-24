import {
  normalizeSlug,
  normalizeSlugList,
  normalizeText,
  type ValidationResult,
} from "./common";

export const FINDER_QUIZ_VERSION = 1 as const;
export const FINDER_ANSWER_VERSION = 1 as const;
export const RECOMMENDATION_VERSION = 1 as const;
export const FINDER_STEP_KEYS = [
  "species",
  "breed",
  "age",
  "weight",
  "allergies",
  "diet",
  "activity",
  "exactSpecies", "lifeStage", "adultWeightKg", "chestCm", "neckCm", "backCm", "habitat",
] as const;

export interface FinderAnswersInput {
  version?: number;
  species?: unknown;
  breed?: unknown;
  ageMonths?: unknown;
  weightKg?: unknown;
  allergies?: unknown;
  diet?: unknown;
  activity?: unknown;
  exactSpecies?: unknown; lifeStage?: unknown; adultWeightKg?: unknown; chestCm?: unknown; neckCm?: unknown; backCm?: unknown; habitat?: unknown;
}

export interface FinderAnswers {
  version: typeof FINDER_ANSWER_VERSION;
  species: string;
  breed: string | null;
  ageMonths: number | null;
  weightKg: number | null;
  allergies: string[];
  diet: string | null;
  activity: string | null;
  exactSpecies?: string | null; lifeStage?: string | null; adultWeightKg?: number | null; chestCm?: number | null; neckCm?: number | null; backCm?: number | null; habitat?: string | null;
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
  errors: string[],
) {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    errors.push(`${field} must be between ${minimum} and ${maximum}`);
    return null;
  }
  return number;
}

export function validateFinderAnswers(
  input: FinderAnswersInput,
): ValidationResult<FinderAnswers> {
  const errors: string[] = [];
  if ((input.version ?? FINDER_ANSWER_VERSION) !== FINDER_ANSWER_VERSION)
    errors.push("version must be 1");
  const species = normalizeSlug(input.species);
  if (!species) errors.push("species is required");

  const value: FinderAnswers = {
    version: FINDER_ANSWER_VERSION,
    species: species ?? "",
    breed: normalizeSlug(input.breed),
    ageMonths: optionalNumber(input.ageMonths, 0, 600, "ageMonths", errors),
    weightKg: optionalNumber(input.weightKg, 0, 500, "weightKg", errors),
    allergies: normalizeSlugList(input.allergies).filter((allergy) => allergy !== "none"),
    diet: normalizeSlug(input.diet),
    activity: normalizeSlug(input.activity),
  };
  for (const key of ["exactSpecies", "lifeStage", "habitat"] as const) if (input[key] !== undefined) value[key] = normalizeSlug(input[key]);
  for (const key of ["adultWeightKg", "chestCm", "neckCm", "backCm"] as const) if (input[key] !== undefined) value[key] = optionalNumber(input[key], 0, 500, key, errors);
  return errors.length
    ? { valid: false, errors, value: null }
    : { valid: true, errors: [], value };
}

export interface RecommendationItemInput {
  productId?: unknown;
  reason?: unknown;
  score?: unknown;
}

export interface RecommendationResultInput {
  version?: number;
  items?: unknown;
}

export interface RecommendationItem {
  productId: string;
  reason: string;
  score: number | null;
}

export interface RecommendationResult {
  version: typeof RECOMMENDATION_VERSION;
  items: RecommendationItem[];
}

export function validateRecommendationResult(
  input: RecommendationResultInput,
  allowedProductIds: ReadonlySet<string>,
): ValidationResult<RecommendationResult> {
  const errors: string[] = [];
  if (input.version !== RECOMMENDATION_VERSION)
    errors.push("version must be 1");
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > 20
  ) {
    errors.push("recommendations must contain 1 to 20 items");
  }

  const items: RecommendationItem[] = [];
  const seen = new Set<string>();
  for (const candidate of Array.isArray(input.items) ? input.items : []) {
    const source = candidate as RecommendationItemInput;
    const productId = normalizeText(source.productId) ?? "";
    const reason = normalizeText(source.reason) ?? "";
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId))
      errors.push("recommendation product ID is invalid");
    if (seen.has(productId))
      errors.push("recommendation product IDs must be unique");
    seen.add(productId);
    if (!allowedProductIds.has(productId))
      errors.push("recommendation contains a product outside the shortlist");
    if (!reason || reason.length > 240)
      errors.push("recommendation reason must contain 1 to 240 characters");
    const score =
      typeof source.score === "number" && Number.isFinite(source.score)
        ? source.score
        : null;
    items.push({ productId, reason, score });
  }

  return errors.length
    ? { valid: false, errors: [...new Set(errors)], value: null }
    : {
        valid: true,
        errors: [],
        value: { version: RECOMMENDATION_VERSION, items },
      };
}
