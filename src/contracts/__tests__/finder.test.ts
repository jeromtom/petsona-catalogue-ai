import { describe, expect, it } from "vitest";
import {
  FINDER_ANSWER_VERSION,
  RECOMMENDATION_VERSION,
  validateFinderAnswers,
  validateRecommendationResult,
} from "../finder";

describe("Finder contracts", () => {
  it("treats the explicit None choice as no allergy without removing actual allergies", () => {
    expect(validateFinderAnswers({ species: "dog", allergies: ["none"] }).value?.allergies).toEqual([]);
    expect(validateFinderAnswers({ species: "dog", allergies: ["none", "chicken"] }).value?.allergies).toEqual(["chicken"]);
  });
  it("requires a supported species and normalizes fixed answer keys", () => {
    expect(
      validateFinderAnswers({ version: FINDER_ANSWER_VERSION, species: "" }),
    ).toMatchObject({
      valid: false,
      errors: ["species is required"],
    });

    expect(
      validateFinderAnswers({
        version: 1,
        species: " Dog ",
        breed: "Golden Retriever",
        ageMonths: 18,
        weightKg: 28.2,
        allergies: ["Chicken", " chicken ", "beef"],
        diet: "High Protein",
        activity: "High",
      }),
    ).toEqual({
      valid: true,
      errors: [],
      value: {
        version: 1,
        species: "dog",
        breed: "golden-retriever",
        ageMonths: 18,
        weightKg: 28.2,
        allergies: ["chicken", "beef"],
        diet: "high-protein",
        activity: "high",
      },
    });
  });

  it("validates recommendation IDs against the server shortlist", () => {
    const result = validateRecommendationResult(
      {
        version: RECOMMENDATION_VERSION,
        items: [
          {
            productId: "gid://shopify/Product/2",
            reason: "Matches an active dog.",
          },
          { productId: "gid://shopify/Product/2", reason: "Duplicate." },
          { productId: "gid://shopify/Product/9", reason: "Invented." },
        ],
      },
      new Set(["gid://shopify/Product/1", "gid://shopify/Product/2"]),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "recommendation product IDs must be unique",
        "recommendation contains a product outside the shortlist",
      ]),
    );
  });
});
