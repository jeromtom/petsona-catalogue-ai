import { describe, it, expect } from "vitest";
import { classificationTags } from "@petsona/contracts";
import {
  extractProposals,
  sourceHash,
  acceptedClassification,
  RULE_VERSION,
} from "../extract.server";
const product = {
  id: "gid://shopify/Product/1",
  title: "Mini Adult",
  description:
    "Complete food for dogs up to 10 kg. Dogs over 10 months old. Ingredients: chicken, rice.",
  vendor: "Royal Canin",
  productType: "Dog food",
  tags: ["sale"],
  region: "IN",
  variants: [],
};
describe("catalogue extraction", () => {
  it("extracts exact bounds with source evidence", () => {
    const p = extractProposals(product);
    expect(p.fields.weightKg?.value).toEqual({ max: 10, basis: "current" });
    expect(p.fields.ageMonths?.value).toEqual({ min: 10, minExclusive: true });
    expect(p.fields.allergens?.value).toContain("chicken");
    expect(p.fields.species?.evidenceIds.length).toBeGreaterThan(0);
  });
  it("does not infer animal species or ingredient from toy shape", () => {
    const p = extractProposals({
      ...product,
      title: "Fish toy",
      description: "A plush fish toy",
      productType: "Toy",
    });
    expect(p.fields.species).toBeUndefined();
    expect(p.fields.allergens).toBeUndefined();
  });
  it("never accepts unvalidated proposals, including high model scores", () => {
    const p = extractProposals(product);
    expect(acceptedClassification(p, {}, {}).fields).toEqual({});
  });
  it("ignores generated tags in input hash but detects merchant source edits", () => {
    expect(sourceHash(product)).toBe(
      sourceHash({ ...product, tags: ["sale", "petsona:species:dog"] }),
    );
    expect(sourceHash(product)).not.toBe(
      sourceHash({ ...product, description: "Cat food" }),
    );
  });
});

describe("conflicting evidence and overrides", () => {
  it("retains source conflicts even when a third span repeats the last value", () => {
    const p = extractProposals({
      ...product,
      description:
        "Food for dogs up to 10 kg. Food for dogs up to 20 kg. Food for dogs up to 20 kg.",
    });
    expect(p.fields.weightKg?.status).toBe("conflicting");
  });
  it("does not treat an incidental exclusion as intended species evidence", () => {
    const p = extractProposals({
      ...product,
      productType: "Toy",
      description: "Suitable for cats. Not suitable for dogs.",
    });
    expect(p.fields.species?.status).toBe("conflicting");
  });
});

it("does not apply dog validation to unvalidated animal groups or categories", () => {
  const p = extractProposals({
    ...product,
    description: "Complete food for rabbits.",
    productType: "Rabbit food",
  });
  const policy = {
    species: {
      method: "rule" as const,
      version: "explicit-spans-v3",
      threshold: 0.95,
      precision: 1,
      samples: 100,
      criticalErrors: 0,
      groups: ["dog"],
      categories: ["food"],
    },
  };
  expect(acceptedClassification(p, {}, policy).fields).toEqual({});
});

it("retains explicit intended life stages rather than treating adult food as suitable for puppies", () => {
  const p = extractProposals({
    ...product,
    title: "Adult Dog Food",
    description: "Complete food for adult dogs.",
    productType: "Dog food",
  });
  expect(p.fields.lifeStages?.value).toEqual(["adult"]);
});
it("does not infer a puppy restriction from a comparison with puppy food", () => {
  const p = extractProposals({
    ...product,
    title: "Adult Dog Food",
    description:
      "Complete food for adult dogs. Unlike puppy food, this has different energy levels.",
    productType: "Dog food",
  });
  expect(p.fields.lifeStages?.value).toEqual(["adult"]);
});

it("does not classify recipe fish as the intended animal for cat food", () => {
  const p = extractProposals({
    ...product,
    title: "Ocean fish adult cat food",
    productType: "Cat food",
    description: "Complete ocean fish food for adult cats with fish protein.",
  });
  expect(p.fields.species?.value).toEqual(["cat"]);
});
it("retains multiple intended animals without treating a recipe ingredient as another animal", () => {
  const p = extractProposals({
    ...product,
    productType: "Pet food",
    description: "Complete food for dogs and cats with fish protein.",
  });
  expect(p.fields.species?.value).toEqual(["dog", "cat"]);
});

it("shortlists breed, dietary and format claims without accepting them as rules", () => {
  const p = extractProposals({
    ...product,
    title: "Labrador Retriever food",
    description:
      "Complete and balanced dry food for Labrador Retrievers. Grain-free and high protein. Net weight: 500 g.",
  });
  const candidate = (key: string) =>
    p.candidates?.filter((c) => c.key === key).map((c) => c.field.value);
  expect(candidate("breeds")).toContainEqual(["labrador-retriever"]);
  expect(candidate("diets")).toContainEqual(["grain-free"]);
  expect(candidate("foodFormat")).toContain("dry");
  expect(candidate("nutritionClaim")).toContain("complete");
  expect(candidate("packWeightKg")).toContainEqual({ min: 0.5, max: 0.5 });
  expect(p.fields.breeds).toBeUndefined();
  expect(p.fields.packWeightKg).toBeUndefined();
  expect(p.candidates?.every((c) => c.field.status === "unknown")).toBe(true);
});
it("keeps pack weights, body weight and variant fit units separate", () => {
  const p = extractProposals({
    ...product,
    title: "Dog harness",
    productType: "Harness",
    description: "A harness for dogs weighing 10-20 lb. Shipping weight: 2 kg.",
    variants: [
      {
        id: "gid://shopify/ProductVariant/11",
        title: "Small",
        sku: null,
        barcode: null,
        selectedOptions: [{ name: "Chest", value: "16-20 inches" }],
      },
      {
        id: "gid://shopify/ProductVariant/12",
        title: "Large",
        sku: null,
        barcode: null,
        selectedOptions: [{ name: "Chest", value: "24-28 inches" }],
      },
    ],
  });
  expect(p.fields.weightKg?.value).toEqual({
    min: 4.535924,
    max: 9.071847,
    basis: "current",
  });
  expect(p.variants[0].fields.chestCm?.value).toEqual({
    min: 40.64,
    max: 50.8,
  });
  expect(p.variants[1].fields.chestCm?.value).toEqual({
    min: 60.96,
    max: 71.12,
  });
  expect(p.candidates?.some((c) => c.key === "packWeightKg")).toBe(false);
});
it("shortlists explicit pack weight on its own variant without treating it as pet weight", () => {
  const p = extractProposals({
    ...product,
    description: "Food for adult cats.",
    productType: "Cat food",
    variants: [
      {
        id: "gid://shopify/ProductVariant/11",
        title: "2 kg",
        sku: null,
        barcode: null,
        selectedOptions: [{ name: "Pack weight", value: "2 kg" }],
      },
    ],
  });
  expect(p.fields.weightKg).toBeUndefined();
  expect(p.candidates?.find((c) => c.key === "packWeightKg")).toMatchObject({
    variantId: "gid://shopify/ProductVariant/11",
    field: { value: { min: 2, max: 2 }, status: "unknown" },
  });
});

describe("ingredient normalisation in extraction", () => {
  it("normalises ingredients without publishing possible allergens", () => {
    const p = extractProposals({
      ...product,
      description:
        "Complete food for dogs. Ingredients: meat meal (20%), brown rice, dried whey, grain-free gravy (water, salt).",
    });
    expect(p.fields.allergens?.value).toEqual(["dairy", "grain"]);
    expect(p.fields.allergensPossible?.value).toEqual(["chicken", "beef"]);
    expect(p.fields.ingredients?.value).toContain("meat meal (20%)");
    expect(p.fields.allergensPossible?.ruleVersion).toBe(RULE_VERSION);
    expect(RULE_VERSION).toContain("ingredients-");
    const accepted = acceptedClassification(p, {}, {});
    if (accepted) {
      const tags = classificationTags(accepted);
      expect(tags).not.toContain("petsona:allergen:chicken");
      expect(tags.some((tag) => tag.includes("allergensPossible"))).toBe(false);
    }
  });
  it("does not read grain-free as containing grain", () => {
    const p = extractProposals({
      ...product,
      description: "Complete food for dogs. Ingredients: salmon, potato, peas. Grain-free.",
    });
    expect(p.fields.allergens?.value).toEqual(["fish"]);
  });
});
