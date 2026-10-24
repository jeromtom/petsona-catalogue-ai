import { createHash } from "node:crypto";
import type { CatalogueDecisionProgress } from "./decision-plan";
import {
  discoverSourceAttributes,
  lengthCm,
  massKg,
} from "./attribute-discovery";
import {
  CATALOGUE_TAXONOMY_VERSION,
  INGREDIENT_TAXONOMY_VERSION,
  PET_GROUPS,
  normaliseClassification,
  normaliseIngredients,
  splitIngredientList,
  type ClassifiedField,
  type ClassificationFieldKey,
  type ProductClassification,
} from "@petsona/contracts";
export interface EvidenceSpan {
  id: string;
  text: string;
  source: string;
  capturedAt: string;
}
export interface CatalogueVariant {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  selectedOptions: Array<{ name: string; value: string }>;
  description?: string;
}
export interface CatalogueProduct {
  id: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  region: string | null;
  variants: CatalogueVariant[];
  manufacturerUrl?: string | null;
  /** The merchant's own Shopify product images, for OCR evidence. */
  imageUrls?: string[];
}
export type ProposalField = ClassifiedField & {
  method: "rule" | "model";
  ruleVersion: string;
};
export interface CatalogueProposal {
  version: 1;
  sourceHash: string;
  fields: Partial<Record<ClassificationFieldKey, ProposalField>>;
  variants: Array<{ id: string; fields: CatalogueProposal["fields"] }>;
  evidence: EvidenceSpan[];
  issues: string[];
  processingVersion?: string;
  decisionProgress?: CatalogueDecisionProgress;
  /** Source-shortlisted values require a semantic decision before acceptance. */
  candidates?: Array<{
    key: ClassificationFieldKey;
    variantId?: string;
    field: ProposalField;
  }>;
}
export interface AcceptancePolicy {
  [field: string]: {
    method: "rule" | "model";
    version: string;
    threshold: number;
    precision: number;
    samples: number;
    criticalErrors: number;
    groups: string[];
    categories: string[];
  };
}
// The ingredient taxonomy version is part of the rule version, so changing
// the taxonomy re-evaluates every product.
export const RULE_VERSION = `explicit-spans-v5+${INGREDIENT_TAXONOMY_VERSION}`;
export function sourceHash(product: CatalogueProduct): string {
  const { tags, ...rest } = product;
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...rest,
        tags: tags.filter((t) => !t.startsWith("petsona:")).sort(),
        taxonomyVersion: CATALOGUE_TAXONOMY_VERSION,
      }),
    )
    .digest("hex");
}
export function extractProposals(
  product: CatalogueProduct,
  extra: EvidenceSpan[] = [],
  now = new Date(),
): CatalogueProposal {
  const evidence: EvidenceSpan[] = [];
  for (const [field, text] of [
    ["title", product.title],
    ["description", product.description],
    ["productType", product.productType],
  ] as const) {
    const chunks = text.split(/(?<=[.!?;\n])\s+/).filter(Boolean);
    chunks.forEach((text, index) =>
      evidence.push({
        id: `${field}:${index}`,
        text,
        source: `shopify:${product.id}:${field}`,
        capturedAt: now.toISOString(),
      }),
    );
  }
  evidence.push(...extra);
  const fields: CatalogueProposal["fields"] = {};
  const proposal: CatalogueProposal = {
    version: 1,
    sourceHash: sourceHash(product),
    fields,
    variants: [],
    evidence,
    issues: [],
  };
  function set(
    key: ClassificationFieldKey,
    value: ClassifiedField["value"],
    spans: EvidenceSpan[],
  ) {
    if (!spans.length) return;
    const next: ProposalField = {
      value,
      status: "supported",
      authority: "validated-rule",
      confidence: 1,
      evidenceIds: spans.map((s) => s.id),
      method: "rule",
      ruleVersion: RULE_VERSION,
    };
    if (
      fields[key] &&
      (fields[key]!.status === "conflicting" ||
        JSON.stringify(fields[key]!.value) !== JSON.stringify(value))
    )
      next.status = "conflicting";
    next.evidenceIds = [
      ...new Set([...(fields[key]?.evidenceIds ?? []), ...next.evidenceIds]),
    ];
    fields[key] = next;
  }
  const animalPatterns: Record<string, RegExp> = {
    dog: /\b(?:dogs?|pupp(?:y|ies))\b/i,
    cat: /\b(?:cats?|kittens?)\b/i,
    rabbit: /\brabbits?\b/i,
    "guinea-pig": /\bguinea pigs?\b/i,
    hamster: /\bhamsters?\b/i,
    gerbil: /\bgerbils?\b/i,
    rat: /\brats?\b/i,
    mouse: /\b(?:mice|mouse)\b/i,
    chinchilla: /\bchinchillas?\b/i,
    ferret: /\bferrets?\b/i,
    bird: /\bbirds?\b/i,
    fish: /\bfish\b/i,
    reptile: /\breptiles?\b/i,
    amphibian: /\bamphibians?\b/i,
  };
  for (const species of Object.keys(PET_GROUPS))
    if (!animalPatterns[species])
      animalPatterns[species] = new RegExp(
        `\\b${species.replace(/-/g, "[ -]")}s?\\b`,
        "i",
      );
  // Match the intended-animal clause, not recipe ingredients elsewhere in
  // the same sentence (for example, fish food for adult cats).
  function intendedAnimalTexts(span: EvidenceSpan): string[] {
    if (span.source.endsWith(":productType")) return [span.text];
    return [...span.text.matchAll(/\bfor\s+([^.!?;\n]+)/gi)].map(
      (match) =>
        match[1].split(
          /\b(?:with|containing|contains|made|ingredients|using|featuring|because|provides)\b/i,
        )[0],
    );
  }
  const speciesEvidence = evidence.filter(
    (span) => intendedAnimalTexts(span).length > 0,
  );
  const spanSupportsAnimal = (span: EvidenceSpan, pattern: RegExp) =>
    intendedAnimalTexts(span).some((text) => pattern.test(text));
  const species = Object.entries(animalPatterns)
    .filter(([, pattern]) =>
      speciesEvidence.some((s) => spanSupportsAnimal(s, pattern)),
    )
    .map(([key]) => key);
  if (species.length) {
    set(
      "species",
      species,
      speciesEvidence.filter((s) =>
        species.some((k) => spanSupportsAnimal(s, animalPatterns[k])),
      ),
    );
    if (
      speciesEvidence.some(
        (s) =>
          /\b(?:not suitable|not intended|do not use|not for|never use|unsuitable)\b/i.test(
            s.text,
          ) && species.some((k) => spanSupportsAnimal(s, animalPatterns[k])),
      )
    )
      fields.species!.status = "conflicting";
  }
  const categories: Record<string, RegExp> = {
    food: /\b(?:food|complete feed|kibble|pellets)\b/i,
    treat: /\btreats?\b/i,
    supplement: /\b(?:supplement|calcium|vitamin)\b/i,
    toy: /\btoys?\b/i,
    grooming: /\b(?:shampoo|grooming|brush)\b/i,
    wearable: /\b(?:harness|collar|coat|jacket|leash)\b/i,
    bedding: /\b(?:bedding|bed)\b/i,
    habitat: /\b(?:cage|terrarium|aquarium)\b/i,
    equipment: /\b(?:filter|heater|pump|lamp|lighting)\b/i,
  };
  const categorySpans = evidence.filter(
    (s) => s.id.startsWith("title:") || s.id.startsWith("productType:"),
  );
  const cats = Object.entries(categories)
    .filter(([, r]) => categorySpans.some((s) => r.test(s.text)))
    .map(([k]) => k);
  if (cats.length === 1)
    set(
      "category",
      cats[0],
      categorySpans.filter((s) => categories[cats[0]].test(s.text)),
    );
  else if (cats.length > 1) proposal.issues.push("category_conflict");
  // Intended life-stage statements are constraints. Comparison paragraphs
  // and incidental mentions are not evidence that the product is for that age.
  for (const span of evidence) {
    const intended =
      span.id.startsWith("title:") ||
      span.id.startsWith("productType:") ||
      /\b(?:for|intended for|formulated for|suitable for)\b/i.test(span.text);
    if (!intended || !species.length) continue;
    const stageNames: Record<string, RegExp> = {
      adult: /\badults?\b/i,
      senior: /\bseniors?\b/i,
    };
    if (species.includes("dog")) stageNames.puppy = /\bpupp(?:y|ies)\b/i;
    if (species.includes("cat")) stageNames.kitten = /\bkittens?\b/i;
    if (species.some((s) => !["dog", "cat"].includes(s)))
      stageNames.young = /\b(?:young|juvenile)\b/i;
    const stages = Object.entries(stageNames)
      .filter(([, pattern]) => pattern.test(span.text))
      .map(([stage]) => stage)
      .sort();
    if (stages.length) {
      set("lifeStages", stages, [span]);
      if (
        /\b(?:not for|not suitable|not intended|unsuitable)\b/i.test(span.text)
      )
        fields.lifeStages!.status = "conflicting";
    }
  }
  for (const span of evidence) {
    const text = span.text;
    const weight =
      /\b(?:dogs?|cats?|pets?|animals?)\b[^.!;]{0,70}?\b(?:weigh(?:ing)?|weight|up to|between|over|under)\b[^.!;]{0,30}?\b(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)\b/i.exec(
        text,
      );
    const max =
      /\b(?:dogs?|cats?|pets?|animals?)\b[^.!;]{0,70}?\b(up to|under)\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|pounds?)\b/i.exec(
        text,
      );
    if (weight)
      set(
        "weightKg",
        {
          min: massKg(Number(weight[1]), weight[3]),
          max: massKg(Number(weight[2]), weight[3]),
          basis: /adult weight/i.test(text) ? "adult" : "current",
        },
        [span],
      );
    else if (max)
      set(
        "weightKg",
        {
          max: massKg(Number(max[2]), max[3]),
          ...(max[1].toLowerCase() === "under" ? { maxExclusive: true } : {}),
          basis: /adult weight/i.test(text) ? "adult" : "current",
        },
        [span],
      );
    const age =
      /\b(over|from|at least|under|up to)\s*(\d+(?:\.\d+)?)\s*(months?|years?)\s*(?:old|of age)?\b/i.exec(
        text,
      );
    if (age) {
      const n = Number(age[2]) * (age[3].startsWith("year") ? 12 : 1);
      set(
        "ageMonths",
        /under|up to/i.test(age[1])
          ? {
              max: n,
              ...(/^under$/i.test(age[1]) ? { maxExclusive: true } : {}),
            }
          : {
              min: n,
              ...(/^over$/i.test(age[1]) ? { minExclusive: true } : {}),
            },
        [span],
      );
    }
    if (/\bingredients\s*:/i.test(text)) {
      const ingredients = splitIngredientList(
        text.split(/ingredients\s*:/i)[1],
      );
      set("ingredients", ingredients, [span]);
      // Presence only. Not finding a term never establishes absence.
      const { present, possible } = normaliseIngredients(ingredients);
      if (present.length) set("allergens", present, [span]);
      if (possible.length) set("allergensPossible", possible, [span]);
    }
    const habitats = ["freshwater", "marine", "pond"].filter((h) =>
      new RegExp(`\\b${h}\\b`, "i").test(text),
    );
    if (
      habitats.length &&
      /\b(?:for|suitable|aquarium|fish|pond)\b/i.test(text)
    )
      set("habitats", habitats, [span]);
    if (
      /\b(?:prescription|veterinary diet|veterinar(?:y|ian).{0,25}(?:supervision|consult)|non-breeding|non-molting|conversion program|uvb|vitamin d3)\b/i.test(
        text,
      )
    )
      set("restrictions", ["manufacturer-prerequisite"], [span]);
  }
  for (const v of product.variants) {
    const variantFields: CatalogueProposal["fields"] = {};
    for (const [key, re] of [
      [
        "chestCm",
        /\bchest\b[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(cm|inches?|in\.?)\b/i,
      ],
      [
        "neckCm",
        /\bneck\b[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(cm|inches?|in\.?)\b/i,
      ],
      [
        "backCm",
        /\bback\b[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(cm|inches?|in\.?)\b/i,
      ],
    ] as const) {
      const text = [
        v.description ?? "",
        ...v.selectedOptions.map((o) => `${o.name}: ${o.value}`),
      ].join("\n");
      const m = re.exec(text);
      if (m) {
        const span = {
          id: `variant:${v.id}:${key}`,
          text: m[0],
          source: `shopify:${v.id}:options`,
          capturedAt: now.toISOString(),
        };
        evidence.push(span);
        variantFields[key] = {
          value: {
            min: lengthCm(Number(m[1]), m[3]),
            max: lengthCm(Number(m[2]), m[3]),
          },
          status: "supported",
          authority: "validated-rule",
          confidence: 1,
          evidenceIds: [span.id],
          method: "rule",
          ruleVersion: RULE_VERSION,
        };
      }
    }
    proposal.variants.push({ id: v.id, fields: variantFields });
  }
  discoverSourceAttributes(
    product,
    proposal,
    animalPatterns,
    categories,
    RULE_VERSION,
  );
  return proposal;
}
export function acceptedClassification(
  p: CatalogueProposal,
  overrides: ProductClassification["fields"],
  policy: AcceptancePolicy,
  variantOverrides: Record<string, ProductClassification["fields"]> = {},
): ProductClassification {
  function accepted(
    fields: CatalogueProposal["fields"],
    locked: ProductClassification["fields"],
  ) {
    const result: ProductClassification["fields"] = {};
    for (const [key, f] of Object.entries(fields)) {
      const rule = policy[key];
      const animals = p.fields.species?.value;
      const category = p.fields.category?.value;
      const covered =
        Array.isArray(animals) &&
        animals.length > 0 &&
        animals.every(
          (a) =>
            Array.isArray(rule?.groups) &&
            rule.groups.includes(PET_GROUPS[a as keyof typeof PET_GROUPS]),
        ) &&
        typeof category === "string" &&
        Array.isArray(rule?.categories) &&
        rule.categories.includes(category);
      if (
        covered &&
        rule &&
        rule.method === f.method &&
        rule.version === f.ruleVersion &&
        rule.precision >= 0.98 &&
        rule.samples >= 100 &&
        rule.criticalErrors === 0 &&
        rule.threshold >= 0.95 &&
        f.confidence >= rule.threshold &&
        f.status === "supported" &&
        f.evidenceIds.length &&
        f.evidenceIds.every((id) => p.evidence.some((s) => s.id === id))
      )
        result[key as ClassificationFieldKey] = f;
    }
    return { ...result, ...locked };
  }
  const result = {
    version: 1 as const,
    taxonomyVersion: CATALOGUE_TAXONOMY_VERSION,
    sourceHash: p.sourceHash,
    fields: accepted(p.fields, overrides),
    variants: p.variants.map((v) => ({
      id: v.id,
      fields: accepted(v.fields, variantOverrides[v.id] ?? {}),
    })),
  };
  const validated = normaliseClassification(result);
  if (!validated) throw new Error("Invalid accepted catalogue classification");
  return validated;
}

/** Catalogue acceptance is automatic; publication validation remains separate. */
export function defaultClassification(
  proposal: CatalogueProposal,
  overrides: ProductClassification["fields"] = {},
  variantOverrides: Record<string, ProductClassification["fields"]> = {},
): ProductClassification {
  const supported = (fields: CatalogueProposal["fields"]) =>
    Object.fromEntries(
      Object.entries(fields).filter(
        ([, field]) =>
          field.status === "supported" &&
          field.evidenceIds.length > 0 &&
          field.evidenceIds.every((id) =>
            proposal.evidence.some((source) => source.id === id),
          ),
      ),
    );
  const result = normaliseClassification({
    version: 1,
    taxonomyVersion: CATALOGUE_TAXONOMY_VERSION,
    sourceHash: proposal.sourceHash,
    fields: { ...supported(proposal.fields), ...overrides },
    variants: proposal.variants.map((variant) => ({
      id: variant.id,
      fields: { ...supported(variant.fields), ...variantOverrides[variant.id] },
    })),
  });
  if (!result) throw new Error("Invalid automatic catalogue classification");
  return result;
}
