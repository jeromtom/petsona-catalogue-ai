import { describe, expect, it } from "vitest";
import {
  ALLERGEN_SLUGS,
  INGREDIENT_TAXONOMY_VERSION,
  normaliseIngredients,
  splitIngredientList,
} from "../ingredients";

const result = (...ingredients: string[]) => normaliseIngredients(ingredients);

describe("ingredient taxonomy", () => {
  it("records its version on every result", () => {
    expect(result("rice").version).toBe(INGREDIENT_TAXONOMY_VERSION);
  });

  it.each([
    ["chicken", ["chicken meal", "Chicken Fat", "hydrolysed chicken protein", "chicken liver", "dried hen"]],
    ["beef", ["beef", "beef tallow", "bovine gelatin", "veal"]],
    ["dairy", ["dried whey", "skimmed milk powder", "cheese", "sodium caseinate", "yoghurt", "lactose"]],
    ["egg", ["dried egg", "whole eggs", "egg powder", "albumen"]],
    ["fish", ["salmon", "tuna", "white fish", "fish oil", "anchovies", "herring meal", "menhaden"]],
    ["soy", ["soya bean meal", "soy lecithin", "soybean oil", "tofu"]],
    ["grain", ["wheat", "maize", "brown rice", "oatmeal", "corn gluten meal", "cereals", "barley", "whole grain"]],
    ["peanut", ["peanut butter", "groundnut oil"]],
  ] as const)("detects %s from its common label names", (allergen, terms) => {
    for (const term of terms) {
      expect(result(term).present, term).toContain(allergen);
    }
  });

  it("does not mistake neighbouring words for allergens", () => {
    for (const term of ["eggplant", "oxide", "codfish-free", "coconut", "henna", "turkey", "duck", "lamb", "pea protein", "potato"]) {
      expect(result(term).present, term).toEqual([]);
    }
  });

  it("ignores only the negated term, not the whole ingredient", () => {
    expect(result("grain-free").present).toEqual([]);
    expect(result("free from soy").present).toEqual([]);
    expect(result("no added wheat").present).toEqual([]);
    expect(result("salmon (no artificial colours)").present).toEqual(["fish"]);
    expect(result("grain free recipe with rice").present).toEqual(["grain"]);
  });

  it("marks unnamed animal sources as possible, never as present or absent", () => {
    const meat = result("meat and animal derivatives");
    expect(meat.present).toEqual([]);
    expect(meat.possible).toEqual(["chicken", "beef"]);
    expect(result("poultry by-product meal").possible).toEqual(["chicken"]);
    expect(result("animal fat").possible).toEqual(["chicken", "beef"]);
  });

  it("does not add possible allergens when the animal is named", () => {
    const liver = result("chicken liver");
    expect(liver.present).toEqual(["chicken"]);
    expect(liver.possible).toEqual([]);
    expect(result("beef gelatin").possible).toEqual([]);
  });

  it("keeps possible separate from present and explains each match", () => {
    const mixed = result("poultry fat", "chicken", "natural flavours", "quinoa");
    expect(mixed.present).toEqual(["chicken"]);
    expect(mixed.possible).not.toContain("chicken");
    expect(mixed.possible).toEqual(expect.arrayContaining(["beef", "fish", "soy", "dairy", "grain"]));
    expect(mixed.matches).toContainEqual({ allergen: "grain", state: "possible", ingredient: "quinoa" });
  });

  it("never asserts absence: an empty or unknown list returns nothing", () => {
    expect(result()).toMatchObject({ present: [], possible: [] });
    expect(result("vitamins", "minerals").present).toEqual([]);
  });

  it("only returns known allergen slugs", () => {
    const all = result("chicken", "beef", "milk", "egg", "tuna", "soya", "peanut", "wheat", "meat");
    for (const slug of [...all.present, ...all.possible]) expect(ALLERGEN_SLUGS).toContain(slug);
  });
});

describe("splitIngredientList", () => {
  it("splits on commas and semicolons but not inside brackets", () => {
    expect(splitIngredientList("Chicken (20%), rice; vitamins (A, D3, E), fish oil.")).toEqual([
      "Chicken (20%)", "rice", "vitamins (A, D3, E)", "fish oil",
    ]);
  });
});
