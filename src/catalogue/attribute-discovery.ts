import type {
  ClassifiedField,
  ClassificationFieldKey,
} from "@petsona/contracts";
import { DEFAULT_TAXONOMY_SEED } from "../constants";
import type {
  CatalogueProduct,
  CatalogueProposal,
  EvidenceSpan,
} from "./extract.server";

export const massKg = (value: number, unit: string) =>
  Number(
    (
      value *
      (/^(?:lb|pound)/i.test(unit) ? 0.45359237 : /^g$/i.test(unit) ? 0.001 : 1)
    ).toFixed(6),
  );
export const lengthCm = (value: number, unit: string) =>
  Number((value * (/^(?:in|inch|")/i.test(unit) ? 2.54 : 1)).toFixed(6));

/** Shortlist verbatim source values. They are not automatically supported:
 * the decision model must distinguish suitability from incidental mentions. */
export function discoverSourceAttributes(
  product: CatalogueProduct,
  proposal: CatalogueProposal,
  animals: Record<string, RegExp>,
  categories: Record<string, RegExp>,
  ruleVersion: string,
) {
  const candidates: NonNullable<CatalogueProposal["candidates"]> = [];
  function add(
    key: ClassificationFieldKey,
    value: ClassifiedField["value"],
    evidence: EvidenceSpan[],
    variantId?: string,
  ) {
    if (!evidence.length) return;
    const existing = variantId
      ? proposal.variants.find((v) => v.id === variantId)?.fields[key]
      : proposal.fields[key];
    const existingValue = existing?.value;
    if (
      existing &&
      (JSON.stringify(existing.value) === JSON.stringify(value) ||
        (Array.isArray(existingValue) &&
          Array.isArray(value) &&
          value.every((v) => existingValue.includes(v))))
    )
      return;
    candidates.push({
      key,
      ...(variantId ? { variantId } : {}),
      field: {
        value,
        status: "unknown",
        authority: "validated-rule",
        confidence: 0,
        evidenceIds: evidence.map((span) => span.id),
        method: "rule",
        ruleVersion,
      },
    });
  }
  const prose = proposal.evidence.filter(
    (span) =>
      !span.id.startsWith("variant:") && !/\bingredients\s*:/i.test(span.text),
  );
  for (const [species, pattern] of Object.entries(animals))
    add(
      "species",
      [species],
      prose.filter((span) => pattern.test(span.text)),
    );
  for (const [category, pattern] of Object.entries(categories))
    add(
      "category",
      category,
      prose.filter((span) => pattern.test(span.text)),
    );

  const breeds = new Map(
    DEFAULT_TAXONOMY_SEED.flatMap((species) =>
      species.breeds.map((breed) => [breed.slug, breed.label]),
    ),
  );
  for (const [breed, label] of breeds) {
    if (breed === "mixed-breed") continue;
    const name = label
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/ /g, "[ -]");
    const aliases =
      breed === "labrador-retriever"
        ? "|labradors?"
        : breed === "siberian-husky"
          ? "|husk(?:y|ies)"
          : "";
    const pattern = new RegExp(`\\b(?:${name}s?${aliases})\\b`, "i");
    add(
      "breeds",
      [breed],
      prose.filter((span) => pattern.test(span.text)),
    );
  }
  const diets = {
    "grain-free": /\bgrain[ -]free\b/i,
    raw: /\braw(?:\s+(?:food|diet|feeding)|[ -]fed)\b/i,
    "high-protein": /\bhigh[ -]protein\b/i,
    "high-fibre": /\bhigh[ -]fib(?:re|er)\b/i,
    "low-fat": /\blow[ -]fat\b/i,
    "limited-ingredient": /\blimited[ -]ingredient\b/i,
    vegetarian: /\bvegetarian\b/i,
    vegan: /\bvegan\b/i,
    prescription: /\b(?:prescription|veterinary)\s+diet\b/i,
  };
  for (const [diet, pattern] of Object.entries(diets))
    add(
      "diets",
      [diet],
      prose.filter((span) => pattern.test(span.text)),
    );
  const formats = {
    dry: /\b(?:kibble|dry\s+(?:(?:dog|cat|pet)\s+)?food)\b/i,
    wet: /\b(?:canned|wet)\s+(?:(?:dog|cat|pet)\s+)?food\b/i,
    "freeze-dried": /\bfreeze[ -]dried\b/i,
    dehydrated: /\bdehydrated\b/i,
    frozen: /\bfrozen\s+(?:(?:raw|dog|cat|pet)\s+)?food\b/i,
    pellets: /\bpellets?\b/i,
    flakes: /\bflakes?\b/i,
  };
  for (const [format, pattern] of Object.entries(formats))
    add(
      "foodFormat",
      format,
      prose.filter((span) => pattern.test(span.text)),
    );
  for (const span of prose) {
    if (
      /\b(?:complete\s+(?:and\s+balanced\s+)?(?:food|feed|diet|nutrition)|nutritionally\s+complete|complete\s+and\s+balanced)\b/i.test(
        span.text,
      )
    )
      add("nutritionClaim", "complete", [span]);
    if (
      /\b(?:complementary|supplemental|supplementary)\s+(?:food|feed|diet)\b/i.test(
        span.text,
      )
    )
      add("nutritionClaim", "complementary", [span]);
    const weight =
      /\b(?:net\s*(?:weight|wt\.?)|(?:pack|bag|pouch)\s*(?:weight|size))\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)\b/i.exec(
        span.text,
      );
    if (weight) {
      const kg = massKg(Number(weight[1]), weight[2]);
      add("packWeightKg", { min: kg, max: kg }, [span]);
    }
  }
  // An explicit food pack option is tied to its exact variant, never copied to all sizes.
  for (const variant of product.variants) {
    for (const option of variant.selectedOptions) {
      if (
        !/^(?:(?:pack|bag|pouch)(?:\s+(?:size|weight))?|net\s+weight)$/i.test(
          option.name,
        )
      )
        continue;
      const weight = /^(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)$/i.exec(
        option.value.trim(),
      );
      if (!weight) continue;
      const kg = massKg(Number(weight[1]), weight[2]);
      const span: EvidenceSpan = {
        id: `variant:${variant.id}:packWeightKg`,
        text: `${option.name}: ${option.value}`,
        source: `shopify:${variant.id}:options`,
        capturedAt:
          proposal.evidence[0]?.capturedAt ?? new Date().toISOString(),
      };
      proposal.evidence.push(span);
      add("packWeightKg", { min: kg, max: kg }, [span], variant.id);
    }
  }
  proposal.candidates = candidates;
}
