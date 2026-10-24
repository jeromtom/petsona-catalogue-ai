import {
  CLASSIFICATION_FIELDS,
  CATALOGUE_CATEGORIES,
  normaliseClassification,
  type ClassifiedField,
  type ClassificationFieldKey,
} from "@petsona/contracts";
export const FIELD_LABELS: Record<ClassificationFieldKey, string> = {
  species: "Pet species",
  breeds: "Breeds",
  category: "Product category",
  lifeStages: "Life stages",
  weightKg: "Pet weight (kg)",
  ageMonths: "Age (months)",
  chestCm: "Chest (cm)",
  neckCm: "Neck (cm)",
  backCm: "Back length (cm)",
  habitats: "Habitats",
  diets: "Diets",
  allergens: "Allergens",
  allergensPossible: "Possible allergens (source not named)",
  ingredients: "Ingredients",
  restrictions: "Restrictions",
  foodFormat: "Food format",
  nutritionClaim: "Nutrition claim",
  packWeightKg: "Pack weight (kg)",
};
export const RANGE_FIELDS = new Set([
  "weightKg",
  "ageMonths",
  "chestCm",
  "neckCm",
  "backCm",
  "packWeightKg",
]);
export function readable(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
export function displayField(value: ClassifiedField["value"]): string {
  if (typeof value === "string") return readable(value);
  if (Array.isArray(value))
    return value.map(readable).join(", ") || "Not specified";
  const lower =
    value.min === undefined
      ? ""
      : `${value.minExclusive ? "More than" : "At least"} ${value.min}`;
  const upper =
    value.max === undefined
      ? ""
      : `${value.maxExclusive ? "Less than" : "Up to"} ${value.max}`;
  return [lower, upper, value.basis ? `(${value.basis} weight)` : ""]
    .filter(Boolean)
    .join("; ");
}
export function correctedField(
  key: ClassificationFieldKey,
  status: ClassifiedField["status"],
  draft: {
    value: string;
    min: string;
    max: string;
    basis: string;
    minExclusive: boolean;
    maxExclusive: boolean;
  },
): ClassifiedField {
  let value: ClassifiedField["value"];
  if (RANGE_FIELDS.has(key)) {
    const bound = (s: string) => {
      if (!s.trim()) return undefined;
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0)
        throw new Error("Enter a non-negative number for each bound.");
      return n;
    };
    value = {
      ...(draft.min.trim()
        ? { min: bound(draft.min), minExclusive: draft.minExclusive }
        : {}),
      ...(draft.max.trim()
        ? { max: bound(draft.max), maxExclusive: draft.maxExclusive }
        : {}),
      ...(draft.basis ? { basis: draft.basis as "current" | "adult" } : {}),
    };
  } else if (["category", "foodFormat", "nutritionClaim"].includes(key))
    value = draft.value.trim();
  else
    value = draft.value
      .split(",")
      .map((s) =>
        key === "ingredients"
          ? s.trim()
          : s
              .trim()
              .toLowerCase()
              .replace(/[\s_]+/g, "-"),
      )
      .filter(Boolean);
  const field: ClassifiedField = {
    value,
    status,
    authority: "merchant",
    confidence: 1,
    evidenceIds: ["merchant:confirmed"],
  };
  if (
    !CLASSIFICATION_FIELDS.includes(key) ||
    !normaliseClassification({
      version: 1,
      taxonomyVersion: "petsona-product-v1",
      sourceHash: "0".repeat(64),
      fields: { [key]: field },
      variants: [],
    })
  )
    throw new Error(
      RANGE_FIELDS.has(key)
        ? "Enter at least one bound. The minimum must not exceed the maximum."
        : key === "category"
          ? `Choose a category: ${CATALOGUE_CATEGORIES.join(", ")}.`
          : key === "species"
            ? "Enter exact pet species, such as dog, cat, rabbit or guinea-pig."
            : key === "breeds"
              ? "Enter breeds here. Add animal species, such as rabbit, under Pet species."
              : "Enter a value using the format shown below.",
    );
  return field;
}

export function sourceLabel(source: string): string {
  if (source.startsWith("shopify:"))
    return (
      (
        {
          title: "Product title",
          description: "Product description",
          productType: "Shopify product type",
          options: "Variant options",
        } as Record<string, string>
      )[source.split(":").pop() ?? ""] ?? "Shopify product data"
    );
  if (source.startsWith("vision-document-text-"))
    return "Text read from a product image";
  return readable(source);
}
export function issueLabel(issue: string): string {
  return (
    (
      {
        category_conflict:
          "The product data suggests more than one category. Confirm the correct category.",
        manufacturer_domain_or_region_unverified:
          "Manufacturer evidence is not verified for this market. Check the current product source.",
        manufacturer_identity_unresolved:
          "This product could not be matched to an official manufacturer source.",
        manufacturer_description_missing:
          "The manufacturer source has no usable product description.",
        manufacturer_retrieval_unavailable:
          "The manufacturer source could not be retrieved. Review product data or try again later.",
        decision_unavailable:
          "Model evaluation was unavailable. Review the suggestions from product data.",
        inference_budget_exhausted:
          "Model evaluation has reached its configured limit. You can still review the product data.",
        ocr_unavailable:
          "The ingredient list on the product images could not be read. Add the ingredients to the product description, or try again later.",
        ocr_budget_exhausted:
          "Reading product images has reached its configured limit. Add the ingredients to the product description to review them now.",
      } as Record<string, string>
    )[issue] ?? "Some product information needs manual review."
  );
}
