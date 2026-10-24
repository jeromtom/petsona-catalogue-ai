import { describe, expect, it } from "vitest";
import { isProductEligible, normalizeProductEligibility } from "@petsona/contracts";
import { defaultClassification, extractProposals } from "../extract.server";
import {
  absenceCandidates,
  attestAllergenAbsence,
  ownsAllergenEvidence,
  publishedAllergenEvidence,
} from "../allergen-evidence";

const product = (description: string) => ({
  id: "gid://shopify/Product/1",
  title: "Adult dry food",
  description,
  vendor: "Fixture",
  productType: "Dog food",
  tags: [],
  region: "IN",
  variants: [],
});
const setup = (description: string) => {
  const proposal = extractProposals(product(description));
  return { proposal, effective: defaultClassification(proposal) };
};
const hashes = { sourceHash: "a".repeat(64), evidenceHash: "b".repeat(64) };
const today = new Date("2026-10-23T09:00:00Z");

describe("allergen absence candidates", () => {
  it("offers only allergens that are neither present nor possible", () => {
    const { proposal, effective } = setup("Complete food for dogs. Ingredients: lamb, potato, peas, meat meal.");
    const result = absenceCandidates(proposal, effective);
    expect(result).toEqual({ ok: true, allergens: ["dairy", "grain", "egg", "fish", "soy", "peanut"] });
  });

  it("offers nothing without a supported ingredient list", () => {
    const { proposal, effective } = setup("A plush toy for dogs.");
    expect(absenceCandidates(proposal, effective)).toEqual({ ok: false, reason: "no_ingredient_list" });
  });

  it("refuses when a variant carries its own ingredient evidence", () => {
    const { proposal, effective } = setup("Complete food for dogs. Ingredients: lamb, potato.");
    proposal.variants.push({ id: "gid://shopify/ProductVariant/2", fields: { ingredients: proposal.fields.ingredients! } });
    expect(absenceCandidates(proposal, effective)).toEqual({ ok: false, reason: "variant_ingredients_differ" });
  });
});

describe("merchant attestation", () => {
  it("records only confirmable allergens with the review date and hashes", () => {
    const { proposal, effective } = setup("Complete food for dogs. Ingredients: lamb, potato.");
    expect(attestAllergenAbsence(proposal, effective, ["fish", "chicken", "fish"], hashes, today)).toEqual({
      confirmedAbsent: ["chicken", "fish"],
      reviewedAt: "2026-10-23",
      ...hashes,
    });
  });

  it("rejects an allergen the label contains or may contain", () => {
    const { proposal, effective } = setup("Complete food for dogs. Ingredients: chicken, animal fat.");
    expect(() => attestAllergenAbsence(proposal, effective, ["chicken"], hashes, today)).toThrow("allergen_not_confirmable");
    expect(() => attestAllergenAbsence(proposal, effective, ["beef"], hashes, today)).toThrow("allergen_not_confirmable");
    expect(() => attestAllergenAbsence(proposal, effective, [], hashes, today)).toThrow("allergen_not_confirmable");
  });
});

describe("published allergen evidence", () => {
  const { proposal, effective } = setup("Complete food for dogs. Ingredients: lamb, potato.");
  const attestation = attestAllergenAbsence(proposal, effective, ["chicken"], hashes, today);

  it("publishes merchant-authority evidence that unlocks only the confirmed allergen", () => {
    const evidence = publishedAllergenEvidence(attestation, proposal, effective, hashes);
    expect(evidence).toMatchObject({ version: 1, confirmedAbsent: ["chicken"], authority: "merchant", scope: "all_variants", reviewedAt: "2026-10-23" });
    const eligibility = normalizeProductEligibility({ allergens: [], allergenEvidence: evidence });
    expect(isProductEligible(eligibility, { allergies: ["chicken"] })).toEqual({ eligible: true, reason: null });
    expect(isProductEligible(eligibility, { allergies: ["chicken", "fish"] })).toEqual({ eligible: false, reason: "allergen_evidence_unknown" });
  });

  it("withdraws when the source or evidence changes", () => {
    expect(publishedAllergenEvidence(attestation, proposal, effective, { ...hashes, sourceHash: "c".repeat(64) })).toBeNull();
    expect(publishedAllergenEvidence(attestation, proposal, effective, { ...hashes, evidenceHash: "c".repeat(64) })).toBeNull();
    expect(publishedAllergenEvidence(undefined, proposal, effective, hashes)).toBeNull();
  });

  it("withdraws when current evidence now names the confirmed allergen", () => {
    const changed = setup("Complete food for dogs. Ingredients: lamb, potato, chicken fat.");
    expect(publishedAllergenEvidence(attestation, changed.proposal, changed.effective, hashes)).toBeNull();
  });
});

describe("ownership of the stored metafield", () => {
  it("lets Petsona write an empty field or replace only its own earlier value", () => {
    expect(ownsAllergenEvidence(null, [])).toBe(true);
    expect(ownsAllergenEvidence('{"a":1}', ['{"a":1}', undefined])).toBe(true);
    expect(ownsAllergenEvidence('{"a":1}', [undefined, '{"a":1}'])).toBe(true);
  });

  it("never touches a merchant's own entry", () => {
    expect(ownsAllergenEvidence('{"merchant":true}', ['{"a":1}', undefined])).toBe(false);
    expect(ownsAllergenEvidence('{"merchant":true}', [])).toBe(false);
  });
});
