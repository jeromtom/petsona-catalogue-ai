import { describe, expect, it } from "vitest";
import {
  PRODUCT_METAFIELD_DEFINITIONS,
  isProductEligible,
  normalizeProductEligibility,
} from "../product";

describe("Product eligibility contract", () => {
  const evidence = {
    version: 1, confirmedAbsent: ["chicken"], source: "Manufacturer statement, revision 2",
    reviewedAt: "2026-09-28", authority: "merchant", scope: "all_variants",
  };
  it.each([undefined, [], ["fish"]])("withholds unverified products for a recorded allergy (%j)", allergens => {
    expect(isProductEligible(normalizeProductEligibility({ allergens }), { allergies: ["chicken"] }))
      .toEqual({ eligible: false, reason: "allergen_evidence_unknown" });
  });
  it("uses reviewed absence only for the named allergens and retains its provenance", () => {
    const product = normalizeProductEligibility({ allergenEvidence: evidence });
    expect(product.allergenEvidence).toEqual(evidence);
    expect(isProductEligible(product, { allergies: ["Chicken"] })).toEqual({ eligible: true, reason: null });
    expect(isProductEligible(product, { allergies: ["chicken", "dairy"] })).toEqual({ eligible: false, reason: "allergen_evidence_unknown" });
    expect(evidence.confirmedAbsent).toEqual(["chicken"]);
  });
  it.each([
    null, {}, { ...evidence, source: "" }, { ...evidence, reviewedAt: "2026-02-30" },
    { ...evidence, authority: "model" }, { ...evidence, scope: "one_variant" },
    { ...evidence, confirmedAbsent: ["chicken", null] }, { ...evidence, version: 2 },
    { ...evidence, reviewedAt: "2999-01-01" },
  ])("does not accept incomplete or unsupported evidence %j", allergenEvidence => {
    expect(isProductEligible(normalizeProductEligibility({ allergenEvidence }), { allergies: ["chicken"] }))
      .toEqual({ eligible: false, reason: "allergen_evidence_unknown" });
  });
  it("never lets reviewed absence override a listed conflict or another deterministic constraint", () => {
    expect(isProductEligible(normalizeProductEligibility({ allergens: ["chicken"], allergenEvidence: evidence }), { allergies: ["chicken"] }))
      .toEqual({ eligible: false, reason: "allergen" });
    expect(isProductEligible(normalizeProductEligibility({ species: ["cat"], allergenEvidence: evidence }), { species: "dog", allergies: ["chicken"] }))
      .toEqual({ eligible: false, reason: "constraint" });
  });
  it("declares all merchant-owned product definitions", () => {
    expect(PRODUCT_METAFIELD_DEFINITIONS.map(({ key }) => key)).toEqual([
      "species",
      "breeds",
      "size_bands",
      "life_stages",
      "allergens",
      "allergen_evidence",
      "diets",
      "consumption_days",
    ]);
    expect(
      PRODUCT_METAFIELD_DEFINITIONS.every(
        ({ namespace }) => namespace === "petsona",
      ),
    ).toBe(true);
  });

  it("excludes allergens before matching positive eligibility signals", () => {
    const product = normalizeProductEligibility({
      species: ["dog"],
      breeds: ["golden-retriever"],
      allergens: ["chicken"],
      diets: ["high-protein"],
    });

    expect(
      isProductEligible(product, {
        species: "dog",
        breed: "golden-retriever",
        allergies: ["chicken"],
        diet: "high-protein",
      }),
    ).toEqual({ eligible: false, reason: "allergen" });
  });

  it("treats absent eligibility fields as unconstrained", () => {
    expect(
      isProductEligible(normalizeProductEligibility({}), { species: "cat" }),
    ).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it("excludes missing or empty allergen evidence only when ingredients are restricted", () => {
    for (const allergens of [undefined, null, [], "chicken"]) {
      expect(
        isProductEligible(normalizeProductEligibility({ allergens }), {
          allergies: ["Chicken"],
        }),
      ).toEqual({ eligible: false, reason: "allergen_evidence_unknown" });
    }
  });

  it("preserves None known discovery but cannot use it to override an exclusion", () => {
    expect(
      isProductEligible(normalizeProductEligibility({}), {
        allergies: ["none"],
      }),
    ).toEqual({ eligible: true, reason: null });
    expect(
      isProductEligible(
        normalizeProductEligibility({ allergens: ["chicken"] }),
        {
          allergies: ["none", "chicken"],
        },
      ),
    ).toEqual({ eligible: false, reason: "allergen" });
  });
});
