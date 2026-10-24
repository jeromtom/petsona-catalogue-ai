import { describe, expect, it } from "vitest";
import { ageMonthsFromBirthday, explainProductCompatibility, lifeStageForAge, productEligibilityWithTags, profileEligibilitySignals, sizeBandForWeight } from "../compatibility";

describe("shared compatibility explanations", () => {
  it("reports unknown allergy evidence even when species matches and some allergens are listed", () => {
    expect(explainProductCompatibility({ species: ["dog"], allergens: ["fish"] }, { species: "dog", allergies: ["chicken"] }))
      .toMatchObject({ eligible: false, status: "unknown", unverifiedAllergies: ["chicken"] });
  });
  it("uses only Finder's established tag fallback and preserves canonical fields", () => {
    expect(productEligibilityWithTags({}, ["Species:Dog", "life-stage:adult", "species_cat"])).toMatchObject({ species: ["dog"], lifeStages: ["adult"] });
    expect(productEligibilityWithTags({ species: ["cat"], lifeStages: ["kitten"] }, ["petsona:dog", "life-stage:adult"])).toMatchObject({ species: ["cat"], lifeStages: ["kitten"] });
  });
  it("preserves unknown pet details rather than deriving a small or young pet", () => {
    expect(profileEligibilitySignals({ species: "dog" })).toMatchObject({ sizeBand: null, lifeStage: null });
    expect(sizeBandForWeight(0)).toBeNull();
    expect(sizeBandForWeight(NaN)).toBeNull();
    expect(lifeStageForAge(null, 10)).toBeNull();
    expect(lifeStageForAge("cat", null)).toBeNull();
  });
  it("uses Finder's size and life-stage boundaries", () => {
    expect([4.9, 5, 10, 25, 45].map(sizeBandForWeight)).toEqual(["xs", "s", "m", "l", "xl"]);
    expect([11, 12, 95, 96].map(months => lifeStageForAge("dog", months))).toEqual(["puppy", "adult", "adult", "senior"]);
    expect(lifeStageForAge("cat", 131)).toBe("adult");
    expect(lifeStageForAge("cat", 132)).toBe("senior");
  });
  it("uses completed UTC calendar months and rejects invalid/future birthdays", () => {
    const now = new Date("2026-09-13T12:00:00Z");
    expect(ageMonthsFromBirthday("2025-09-14", now)).toBe(11);
    expect(ageMonthsFromBirthday("2025-09-13", now)).toBe(12);
    for (const value of [null, "2025-09", "2025-02-30", "2027-01-01"]) expect(ageMonthsFromBirthday(value, now)).toBeNull();
  });
  it("exposes absent information without calling an unconstrained product suitable", () => {
    expect(explainProductCompatibility({}, { species: "dog" })).toMatchObject({ eligible: true, status: "unknown", allergensListed: false });
    expect(explainProductCompatibility({ sizeBands: ["m"] }, {})).toMatchObject({ eligible: false, status: "unknown", missing: ["size"] });
  });
  it("keeps exclusions ahead of matching characteristics", () => {
    expect(explainProductCompatibility({ species: ["dog"], allergens: ["chicken"] }, { species: "dog", allergies: ["Chicken"] })).toMatchObject({ eligible: false, status: "conflict", conflicts: ["chicken"] });
    expect(explainProductCompatibility({ species: ["cat"] }, { species: "dog" })).toMatchObject({ eligible: false, status: "mismatch", mismatches: ["species"] });
    expect(explainProductCompatibility({ species: ["dog"] }, { species: "dog" })).toMatchObject({ eligible: true, status: "listed_match", matches: ["species"], allergensListed: false });
  });
});
