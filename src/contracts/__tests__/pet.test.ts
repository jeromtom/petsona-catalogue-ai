import { describe, expect, it } from "vitest";
import {
  PET_PROFILE_VERSION,
  PETSONA_PET_METAOBJECT,
  normalizePetProfile,
} from "../pet";

describe("Pet profile contract", () => {
  it("declares the merchant-owned profile definition", () => {
    expect(PETSONA_PET_METAOBJECT.type).toBe("petsona_pet");
    expect(PETSONA_PET_METAOBJECT.displayNameKey).toBe("name");
    expect(PETSONA_PET_METAOBJECT.access).not.toHaveProperty("admin");
    expect(PETSONA_PET_METAOBJECT.fields).toHaveLength(14);
    expect(
      PETSONA_PET_METAOBJECT.fields.find(({ key }) => key === "name"),
    ).toMatchObject({
      type: "single_line_text_field",
      required: true,
    });
    expect(
      PETSONA_PET_METAOBJECT.fields.find(({ key }) => key === "quiz_profile")
        ?.type,
    ).toBe("json");
  });

  it("normalizes a complete profile and removes duplicate list values", () => {
    const result = normalizePetProfile(
      {
        version: PET_PROFILE_VERSION,
        name: "  Rex  ",
        species: "Golden Retriever!!",
        breed: " Mixed Breed ",
        birthday: "2020-05",
        gender: " male ",
        notes: "  Prefers quiet spaces. ",
        photoFileGid: " gid://shopify/MediaImage/1 ",
        weightKg: "12.50",
        allergies: [" Chicken ", "chicken", "BEEF"],
        diet: " Grain Free ",
        activity: " High ",
        vetDiet: false,
        lifeStage: " Adult ",
        quizProfile: { version: 1, answers: { species: "dog" } },
      },
      new Date("2026-01-01T00:00:00Z"),
    );

    expect(result).toEqual({
      valid: true,
      errors: [],
      value: {
        version: 1,
        name: "Rex",
        species: "golden-retriever",
        breed: "mixed-breed",
        birthday: "2020-05-01",
        gender: "male",
        notes: "Prefers quiet spaces.",
        photoFileGid: "gid://shopify/MediaImage/1",
        weightKg: 12.5,
        allergies: ["chicken", "beef"],
        diet: "grain-free",
        activity: "high",
        vetDiet: false,
        lifeStage: "adult",
        quizProfile: { version: 1, answers: { species: "dog" } },
      },
    });
  });

  it("rejects unsafe or invalid profile values", () => {
    const result = normalizePetProfile(
      {
        version: 2,
        name: " ",
        birthday: "2025-02-30",
        weightKg: -2,
        allergies: ["x".repeat(65)],
        quizProfile: { unsupported: () => "not JSON" },
      },
      new Date("2026-01-01T00:00:00Z"),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "version must be 1",
        "name is required",
        "birthday is invalid",
        "weightKg must be between 0 and 500",
        "allergies values must be 64 characters or fewer",
        "quizProfile must be JSON serializable",
      ]),
    );
  });
});
