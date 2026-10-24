/**
 * OCR evidence demo. In production, Google Cloud Vision document text
 * detection reads the merchant's own Shopify-hosted label photos (at most
 * three images, blocks below 0.85 confidence discarded). This demo takes
 * the OCR text as a file so it runs without Google Cloud credentials and
 * shows the two steps that follow: isolating the ingredient statement and
 * mapping ingredients to allergens with the versioned taxonomy.
 */
import { readFileSync } from "node:fs";
import {
  hasIngredientList,
  ingredientBlock,
  OCR_VERSION,
} from "../src/catalogue/ocr.server";
import {
  INGREDIENT_TAXONOMY_VERSION,
  normaliseIngredients,
  splitIngredientList,
} from "../src/contracts/index";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run demo:ocr -- demo/samples/label-ocr-text.txt");
  process.exit(1);
}
const text = readFileSync(file, "utf8");
console.log(`OCR evidence demo (${OCR_VERSION}, taxonomy ${INGREDIENT_TAXONOMY_VERSION})`);
console.log(`\nIngredient statement present: ${hasIngredientList([text]) ? "yes" : "no"}`);
const block = ingredientBlock(text);
console.log(`\nIsolated ingredient block (analysis, feeding and storage text removed):\n  ${block ?? "(none)"}`);
const ingredients = splitIngredientList(
  (block ?? "").replace(/^\s*(?:ingredients|composition)\s*[:.]\s*/i, ""),
);
console.log(`\nSplit into ${ingredients.length} ingredients:`);
for (const ingredient of ingredients) console.log(`  - ${ingredient}`);
console.log("\nAllergen mapping (presence or possible presence only, never absence):");
console.log(JSON.stringify(normaliseIngredients(ingredients), null, 2));
