import { normaliseDietConstraint } from "./product";
/** Versioned, evidence-backed catalogue contract. Unaccepted proposals never
 * enter this contract. Allergen absence remains the separate merchant attestation. */
export const CATALOGUE_TAXONOMY_VERSION = "petsona-product-v1" as const;
export const PET_GROUPS: Readonly<Record<string, string>> = {
  dog: "dog",
  cat: "cat",
  rabbit: "small-mammal",
  "guinea-pig": "small-mammal",
  hamster: "small-mammal",
  gerbil: "small-mammal",
  rat: "small-mammal",
  mouse: "small-mammal",
  chinchilla: "small-mammal",
  ferret: "small-mammal",
  bird: "bird",
  cockatiel: "bird",
  budgerigar: "bird",
  lovebird: "bird",
  conure: "bird",
  quaker: "bird",
  dove: "bird",
  pigeon: "bird",
  "african-grey": "bird",
  macaw: "bird",
  cockatoo: "bird",
  fish: "fish",
  goldfish: "fish",
  betta: "fish",
  guppy: "fish",
  koi: "fish",
  reptile: "reptile",
  turtle: "reptile",
  tortoise: "reptile",
  "bearded-dragon": "reptile",
  "leopard-gecko": "reptile",
  "crested-gecko": "reptile",
  snake: "reptile",
  amphibian: "amphibian",
  frog: "amphibian",
  axolotl: "amphibian",
};
export const CATALOGUE_CATEGORIES = [
  "food",
  "treat",
  "supplement",
  "toy",
  "grooming",
  "wearable",
  "bedding",
  "habitat",
  "equipment",
  "other",
] as const;
export type EvidenceStatus =
  "supported" | "contradicted" | "unknown" | "conflicting";
export interface ClassifiedField {
  value: string | string[] | NumericRange;
  status: EvidenceStatus;
  authority: "merchant" | "validated-model" | "validated-rule";
  confidence: number;
  /** Probability of the selected evidence status, distinct from confidence. */
  probability?: number;
  evidenceIds: string[];
}
export interface NumericRange {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
  basis?: "current" | "adult";
}
export const CLASSIFICATION_FIELDS = [
  "species",
  "breeds",
  "category",
  "lifeStages",
  "weightKg",
  "ageMonths",
  "chestCm",
  "neckCm",
  "backCm",
  "habitats",
  "diets",
  "allergens",
  /** Unnamed sources that may contain an allergen. Internal review evidence only. */
  "allergensPossible",
  "ingredients",
  "restrictions",
  "foodFormat",
  "nutritionClaim",
  "packWeightKg",
] as const;
export type ClassificationFieldKey = (typeof CLASSIFICATION_FIELDS)[number];
export interface ProductClassification {
  version: 1;
  taxonomyVersion: typeof CATALOGUE_TAXONOMY_VERSION;
  sourceHash: string;
  fields: Partial<Record<ClassificationFieldKey, ClassifiedField>>;
  variants: Array<{
    id: string;
    fields: Partial<Record<ClassificationFieldKey, ClassifiedField>>;
  }>;
}
/** Translate earlier pet-group metadata where animal species occupied breeds. */
export function migrateLegacyPetFields(
  fields: ProductClassification["fields"],
): ProductClassification["fields"] {
  const species = fields.species;
  const breeds = fields.breeds;
  if (!species || !Array.isArray(species.value)) return { ...fields };
  const group = (value: string) =>
    ["small_pet", "small-pet", "small-mammal"].includes(value)
      ? "small-mammal"
      : ["bird", "fish", "reptile", "amphibian"].includes(value)
        ? value
        : null;
  const groups = species.value.map(group).filter(Boolean);
  const names = Array.isArray(breeds?.value)
    ? breeds.value.filter((name) => groups.includes(PET_GROUPS[name]))
    : [];
  const values = [
    ...new Set([
      ...species.value.filter(
        (name) =>
          Object.hasOwn(PET_GROUPS, name) &&
          !names.some((n) => PET_GROUPS[n] === group(name)),
      ),
      ...names,
    ]),
  ].sort();
  const result = { ...fields };
  if (JSON.stringify(values) !== JSON.stringify([...species.value].sort()))
    result.species = {
      ...species,
      value: values,
      status: values.length ? species.status : "unknown",
      evidenceIds: [
        ...new Set([
          ...species.evidenceIds,
          ...(names.length ? breeds!.evidenceIds : []),
          "merchant:legacy-pet-taxonomy-v1",
        ]),
      ],
    };
  if (names.length)
    result.breeds = {
      ...breeds!,
      value: (breeds!.value as string[]).filter((v) => !names.includes(v)),
    };
  return result;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const list = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 100 &&
  v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 500);
export function normaliseClassification(
  value: unknown,
): ProductClassification | null {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.taxonomyVersion !== CATALOGUE_TAXONOMY_VERSION ||
    typeof value.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
    !object(value.fields) ||
    !Array.isArray(value.variants) ||
    value.variants.length > 2048
  )
    return null;
  function fields(raw: unknown): raw is ProductClassification["fields"] {
    if (!object(raw)) return false;
    return Object.entries(raw).every(([key, f]) => {
      if (
        !CLASSIFICATION_FIELDS.includes(key as ClassificationFieldKey) ||
        !object(f) ||
        !["supported", "contradicted", "unknown", "conflicting"].includes(
          String(f.status),
        ) ||
        !["merchant", "validated-model", "validated-rule"].includes(
          String(f.authority),
        ) ||
        typeof f.confidence !== "number" ||
        !Number.isFinite(f.confidence) ||
        f.confidence < 0 ||
        f.confidence > 1 ||
        (f.probability !== undefined &&
          (typeof f.probability !== "number" ||
            !Number.isFinite(f.probability) ||
            f.probability < 0 ||
            f.probability > 1)) ||
        !list(f.evidenceIds)
      )
        return false;
      if (
        [
          "weightKg",
          "ageMonths",
          "chestCm",
          "neckCm",
          "backCm",
          "packWeightKg",
        ].includes(key)
      ) {
        if (!object(f.value)) return false;
        const r = f.value;
        if (r.min === undefined && r.max === undefined) return false;
        if (
          [r.min, r.max].some(
            (x) =>
              x !== undefined &&
              (typeof x !== "number" ||
                !Number.isFinite(x) ||
                x < 0 ||
                x > 100000),
          )
        )
          return false;
        return (
          !(
            typeof r.min === "number" &&
            typeof r.max === "number" &&
            r.min > r.max
          ) &&
          (r.basis === undefined ||
            ["current", "adult"].includes(String(r.basis))) &&
          [r.minExclusive, r.maxExclusive].every(
            (x) => x === undefined || typeof x === "boolean",
          )
        );
      }
      if (["category", "foodFormat", "nutritionClaim"].includes(key))
        return (
          typeof f.value === "string" &&
          f.value.length > 0 &&
          f.value.length <= 200 &&
          (key !== "category" ||
            CATALOGUE_CATEGORIES.includes(
              f.value as (typeof CATALOGUE_CATEGORIES)[number],
            ))
        );
      return (
        list(f.value) &&
        (key !== "species" ||
          f.value.every((v) => Object.hasOwn(PET_GROUPS, v))) &&
        (key !== "breeds" ||
          f.value.every((v) => !Object.hasOwn(PET_GROUPS, v)))
      );
    });
  }
  if (
    !fields(value.fields) ||
    !value.variants.every(
      (v) =>
        object(v) &&
        typeof v.id === "string" &&
        /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(v.id) &&
        fields(v.fields),
    ) ||
    new Set(value.variants.map((v) => (v as { id: string }).id)).size !==
      value.variants.length
  )
    return null;
  return value as unknown as ProductClassification;
}
export interface CataloguePetSignals {
  species: string;
  breed?: string | null;
  weightKg?: number | null;
  adultWeightKg?: number | null;
  ageMonths?: number | null;
  chestCm?: number | null;
  neckCm?: number | null;
  backCm?: number | null;
  habitat?: string | null;
  lifeStage?: string | null;
  diet?: string | null;
}
export function classificationMatches(
  c: ProductClassification,
  pet: CataloguePetSignals,
): { eligible: boolean; variantIds: string[]; reason: string | null } {
  function matches(fields: ProductClassification["fields"]): string | null {
    const s = fields.species;
    if (
      !s ||
      s.status !== "supported" ||
      !Array.isArray(s.value) ||
      !s.value.includes(pet.species)
    )
      return "species_unknown_or_mismatch";
    for (const [key, f] of Object.entries(fields)) {
      if (
        f.status === "unknown" ||
        f.status === "conflicting" ||
        f.status === "contradicted"
      )
        return "unresolved_classification";
      if (key === "restrictions" && Array.isArray(f.value) && f.value.length)
        return "restricted_product";
      if (
        ["weightKg", "ageMonths", "chestCm", "neckCm", "backCm"].includes(key)
      ) {
        const r = f.value as NumericRange;
        const actual =
          key === "weightKg" && r.basis === "adult"
            ? pet.adultWeightKg
            : pet[
                key as
                  "weightKg" | "ageMonths" | "chestCm" | "neckCm" | "backCm"
              ];
        if (actual == null || !Number.isFinite(actual))
          return "measurement_required";
        if (
          (r.min !== undefined &&
            (r.minExclusive ? actual <= r.min : actual < r.min)) ||
          (r.max !== undefined &&
            (r.maxExclusive ? actual >= r.max : actual > r.max))
        )
          return "measurement_mismatch";
      }
      const signal =
        key === "breeds"
          ? pet.breed
          : key === "habitats"
            ? pet.habitat
            : key === "lifeStages"
              ? pet.lifeStage
              : key === "diets"
                ? normaliseDietConstraint(pet.diet)
                : undefined;
      // Explicit numeric age supersedes generic derived life-stage bands.
      if (key === "lifeStages" && fields.ageMonths) continue;
      if (key === "diets" && !signal) continue;
      if (
        ["breeds", "habitats", "lifeStages", "diets"].includes(key) &&
        Array.isArray(f.value) &&
        f.value.length &&
        (!signal || !f.value.includes(signal))
      )
        return "constraint";
    }
    const category = fields.category?.value;
    if (
      category === "wearable" &&
      !["chestCm", "neckCm", "backCm"].some(
        (k) => fields[k as ClassificationFieldKey],
      )
    )
      return "fit_unknown";
    if (category === "supplement") return "restricted_product";
    if (category === "equipment") return "equipment_compatibility_review";
    return null;
  }
  if (!c.variants.length) {
    const reason = matches(c.fields);
    return { eligible: !reason, variantIds: [], reason };
  }
  const variantIds = c.variants
    .filter((v) => !matches({ ...c.fields, ...v.fields }))
    .map((v) => v.id);
  return {
    eligible: variantIds.length > 0,
    variantIds,
    reason: variantIds.length ? null : "no_matching_variant",
  };
}
export function classificationTags(c: ProductClassification): string[] {
  return (
    [
      "species",
      "category",
      "lifeStages",
      "diets",
      "breeds",
      "habitats",
      "foodFormat",
      "nutritionClaim",
      "allergens",
      "restrictions",
    ] as const
  )
    .flatMap((key) => {
      const f = c.fields[key];
      if (!f || f.status !== "supported") return [];
      const prefix =
        key === "lifeStages"
          ? "life-stage"
          : key === "diets"
            ? "diet"
            : key === "breeds"
              ? "breed"
              : key === "habitats"
                ? "habitat"
                : key === "foodFormat"
                  ? "food-format"
                  : key === "nutritionClaim"
                    ? "nutrition-claim"
                    : key === "allergens"
                      ? "allergen"
                      : key === "restrictions"
                        ? "restriction"
                        : key;
      return (Array.isArray(f.value) ? f.value : [f.value])
        .filter(
          (v): v is string =>
            typeof v === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
        )
        .map((v) => `petsona:${prefix}:${v}`);
    })
    .sort();
}
