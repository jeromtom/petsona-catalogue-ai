import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateFinderAnswers, validateRecommendationResult } from "../finder";
import { normalizePetProfile } from "../pet";
import { isProductEligible, normalizeProductEligibility } from "../product";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  );
}

describe("Versioned compatibility fixtures", () => {
  it("keeps the v1 pet profile readable", () => {
    const result = normalizePetProfile(
      fixture("pet-profile.v1.json") as Parameters<
        typeof normalizePetProfile
      >[0],
      new Date("2026-09-04T00:00:00Z"),
    );

    expect(result.valid).toBe(true);
    expect(result.value).toMatchObject({
      version: 1,
      name: "Milo",
      species: "dog",
      breed: "golden-retriever",
    });
  });

  it("keeps v1 Finder inputs and outputs readable", () => {
    expect(
      validateFinderAnswers(
        fixture("finder-answers.v1.json") as Parameters<
          typeof validateFinderAnswers
        >[0],
      ).valid,
    ).toBe(true);

    const allowed = new Set([
      "gid://shopify/Product/1001",
      "gid://shopify/Product/1002",
    ]);
    expect(
      validateRecommendationResult(
        fixture("recommendations.v1.json") as Parameters<
          typeof validateRecommendationResult
        >[0],
        allowed,
      ).valid,
    ).toBe(true);
  });

  it("reads v1 products without inventing absence evidence for recorded allergies", () => {
    const product = normalizeProductEligibility(
      fixture("product-eligibility.v1.json") as Parameters<
        typeof normalizeProductEligibility
      >[0],
    );

    expect(
      isProductEligible(product, {
        species: "dog",
        breed: "golden-retriever",
        sizeBand: "large",
        lifeStage: "adult",
        allergies: ["chicken"],
        diet: "grain-free",
      }),
    ).toEqual({ eligible: false, reason: "allergen_evidence_unknown" });
    expect(
      isProductEligible(product, {
        species: "dog",
        breed: "golden-retriever",
        sizeBand: "large",
        lifeStage: "adult",
        allergies: ["none"],
        diet: "grain-free",
      }),
    ).toEqual({ eligible: true, reason: null });
  });
});
