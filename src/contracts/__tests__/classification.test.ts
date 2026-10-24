import { describe, it, expect } from "vitest";
import {
  normaliseClassification,
  classificationMatches,
  classificationTags,
  migrateLegacyPetFields,
} from "../classification";
const record = (values: Record<string, unknown> = {}) => ({
  version: 1,
  taxonomyVersion: "petsona-product-v1",
  sourceHash: "a".repeat(64),
  fields: {},
  variants: [],
  ...values,
});
const field = (value: unknown) => ({
  value,
  status: "supported",
  authority: "merchant",
  confidence: 1,
  evidenceIds: ["description:0"],
});
describe("classification contract", () => {
  it("retains selected probability separately from confidence and rejects invalid values", () => {
    expect(
      normaliseClassification(
        record({
          fields: {
            species: { ...field(["dog"]), confidence: 0.4, probability: 0.7 },
          },
        }),
      )?.fields.species,
    ).toMatchObject({ confidence: 0.4, probability: 0.7 });
    expect(
      normaliseClassification(
        record({
          fields: { species: { ...field(["dog"]), probability: 1.5 } },
        }),
      ),
    ).toBeNull();
  });
  it("does not require the optional dietary preference while preserving explicit diet matching", () => {
    const c = normaliseClassification(
      record({
        fields: {
          species: field(["dog"]),
          category: field("food"),
          diets: field(["grain-free"]),
        },
      }),
    )!;
    for (const diet of [null, "standard", "balanced", "grain-free"])
      expect(classificationMatches(c, { species: "dog", diet }).eligible).toBe(
        true,
      );
    expect(
      classificationMatches(c, { species: "dog", diet: "raw" }).eligible,
    ).toBe(false);
  });
  it("migrates legacy pet groups using declared animal names without inferring unnamed species", () => {
    const migrated = migrateLegacyPetFields({
      species: field(["small_pet"]),
      breeds: field(["rabbit", "guinea-pig"]),
    } as never);
    expect(migrated.species?.value).toEqual(["guinea-pig", "rabbit"]);
    expect(migrated.breeds?.value).toEqual([]);
    expect(
      normaliseClassification(record({ fields: migrated })),
    ).not.toBeNull();
    expect(
      migrateLegacyPetFields({ species: field(["small_pet"]) } as never).species
        ?.status,
    ).toBe("unknown");
    expect(
      migrateLegacyPetFields({
        species: field(["bird"]),
        breeds: field(["cockatiel"]),
      } as never).species?.value,
    ).toEqual(["cockatiel"]);
  });
  it("rejects groups and animal names in the wrong taxonomy dimension", () => {
    expect(
      normaliseClassification(
        record({ fields: { species: field(["small_pet"]) } }),
      ),
    ).toBeNull();
    expect(
      normaliseClassification(
        record({
          fields: { species: field(["rabbit"]), breeds: field(["rabbit"]) },
        }),
      ),
    ).toBeNull();
  });
  it("requires intended species, never treating unknown as all pets", () => {
    expect(
      classificationMatches(normaliseClassification(record())!, {
        species: "cat",
      }).eligible,
    ).toBe(false);
  });
  it("distinguishes pet weight from pack weight and requires restricted measurements", () => {
    const c = normaliseClassification(
      record({
        fields: {
          species: field(["dog"]),
          weightKg: field({ max: 10, basis: "current" }),
          category: field("wearable"),
        },
        variants: [
          {
            id: "gid://shopify/ProductVariant/1",
            fields: { chestCm: field({ min: 40, max: 50 }) },
          },
        ],
      }),
    )!;
    expect(
      classificationMatches(c, { species: "dog", weightKg: 11, chestCm: 45 })
        .eligible,
    ).toBe(false);
    expect(
      classificationMatches(c, { species: "dog", weightKg: 8 }).eligible,
    ).toBe(false);
    expect(
      classificationMatches(c, { species: "dog", weightKg: 8, chestCm: 45 })
        .variantIds,
    ).toEqual(["gid://shopify/ProductVariant/1"]);
  });
  it("does not apply dog size bands to birds and does not broaden named species", () => {
    const c = normaliseClassification(
      record({
        fields: { species: field(["cockatiel"]), category: field("food") },
      }),
    )!;
    expect(classificationMatches(c, { species: "bird" }).eligible).toBe(false);
    expect(classificationMatches(c, { species: "cockatiel" }).eligible).toBe(
      true,
    );
  });
  it("blocks prerequisites and conflicting fields", () => {
    expect(
      classificationMatches(
        normaliseClassification(
          record({
            fields: {
              species: field(["cat"]),
              restrictions: field(["veterinary"]),
            },
          }),
        )!,
        { species: "cat" },
      ).eligible,
    ).toBe(false);
  });
  it("rejects malformed values and only projects accepted fields into tags", () => {
    expect(
      normaliseClassification(
        record({
          fields: {
            species: field(["cat"]),
            weightKg: field({ min: 20, max: 2 }),
          },
        }),
      ),
    ).toBeNull();
    expect(
      classificationTags(
        normaliseClassification(
          record({
            fields: { species: field(["dog"]), category: field("food") },
          }),
        )!,
      ),
    ).toEqual(["petsona:category:food", "petsona:species:dog"]);
  });
});
