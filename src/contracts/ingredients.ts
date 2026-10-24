/**
 * Versioned ingredient-to-allergen taxonomy shared by every evidence source
 * (product text, manufacturer pages and, later, OCR).
 *
 * The result only ever says an allergen is present or possibly present. Not
 * finding a term is never evidence of absence: absence comes only from
 * merchant-reviewed `allergen_evidence`.
 */
export const INGREDIENT_TAXONOMY_VERSION = "ingredients-2026-10-23.1" as const;

/** Allergens a shopper can record. Keep aligned with the Finder allergies step. */
export const ALLERGEN_SLUGS = [
  "chicken",
  "beef",
  "dairy",
  "grain",
  "egg",
  "fish",
  "soy",
  "peanut",
] as const;
export type AllergenSlug = (typeof ALLERGEN_SLUGS)[number];

interface TermRule {
  /** Matched against one ingredient at a time, case-insensitively. */
  pattern: RegExp;
  present?: readonly AllergenSlug[];
  /** The term may contain these allergens but does not name the source. */
  possible?: readonly AllergenSlug[];
  /** Skip when the same ingredient already names an animal ("chicken liver"). */
  unnamedAnimal?: true;
}

const word = (alternatives: string) =>
  new RegExp(`(?<![a-z])(?:${alternatives})(?![a-z])`, "gi");

const UNNAMED_ANIMAL: readonly AllergenSlug[] = ["chicken", "beef"];

// Order does not matter: every matching rule contributes. Built on first use so
// storefront bundles that import @petsona/contracts can tree-shake it away.
let termRules: readonly TermRule[] | undefined;
function rules(): readonly TermRule[] {
  return (termRules ??= [
  { pattern: word("chicken|hen"), present: ["chicken"] },
  { pattern: word("poultry"), possible: ["chicken"] },
  { pattern: word("beef|bovine|veal|ox|cattle"), present: ["beef"] },
  {
    pattern: word(
      "milk|whey|casein|caseinates?|cheese|yogh?urt|lactose|butter|cream|dairy",
    ),
    present: ["dairy"],
  },
  {
    pattern: word("eggs?|egg (?:powder|product|yolk)s?|albumen|ovalbumin"),
    present: ["egg"],
  },
  {
    pattern: word(
      "fish|salmon|tuna|white ?fish|herring|mackerel|anchov(?:y|ies)|sardines?|cod|pollock|trout|menhaden|hake|haddock|plaice|pilchards?|capelin",
    ),
    present: ["fish"],
  },
  {
    pattern: word("soy|soya|soybeans?|soyabeans?|tofu|edamame"),
    present: ["soy"],
  },
  { pattern: word("peanuts?|groundnuts?|arachis"), present: ["peanut"] },
  {
    pattern: word(
      "wheat|barley|oats?|oatmeal|rye|corn|cornstarch|cornmeal|maize|rice|sorghum|millet|spelt|triticale|cereals?|grains?|gluten|bran|semolina|durum|bulgur|couscous",
    ),
    present: ["grain"],
  },
  // Pseudo-cereals are often sold as grain-free but some shoppers avoid them.
  { pattern: word("quinoa|buckwheat|amaranth"), possible: ["grain"] },
  // Unnamed animal sources: the species cannot be established from the label.
  {
    pattern: word(
      "meat|meat meal|meat by-?products?|animal (?:fat|digest|protein|by-?products?|derivatives?)|meat and animal derivatives|liver|tallow|lard|gelatine?|collagen|bone broth|broth",
    ),
    possible: UNNAMED_ANIMAL,
    unnamedAnimal: true,
  },
  {
    pattern: word("hydroly[sz]ed protein|protein hydroly[sz]ate|natural flavou?rs?|flavourings?|flavorings?"),
    possible: ["chicken", "beef", "fish", "soy", "dairy"],
  },
  {
    pattern: word("vegetable protein(?: extracts?)?|derivatives of vegetable origin|vegetable by-?products?"),
    possible: ["soy", "grain"],
  },
  ]);
}

const NAMED_ANIMAL = new Set<AllergenSlug>(["chicken", "beef", "fish", "egg", "dairy"]);

/** "Grain-free", "free from soy", "no added chicken": only the adjacent term is negated. */
function negatedAt(text: string, start: number, end: number): boolean {
  return (
    /^\s*-?\s*free\b/i.test(text.slice(end)) ||
    /\b(?:no|without|zero|free (?:from|of))\s+(?:added\s+)?$/i.test(
      text.slice(0, start),
    )
  );
}

function ruleMatches(rule: TermRule, text: string): boolean {
  for (const m of text.matchAll(rule.pattern)) {
    if (!negatedAt(text, m.index, m.index + m[0].length)) return true;
  }
  return false;
}

export interface AllergenMatch {
  allergen: AllergenSlug;
  state: "present" | "possible";
  /** The ingredient text that produced the match, trimmed. */
  ingredient: string;
}

export interface NormalisedIngredients {
  version: typeof INGREDIENT_TAXONOMY_VERSION;
  present: AllergenSlug[];
  /** Possible but not established. Never includes an allergen in `present`. */
  possible: AllergenSlug[];
  matches: AllergenMatch[];
}

export function normaliseIngredients(
  ingredients: readonly string[],
): NormalisedIngredients {
  const matches: AllergenMatch[] = [];
  for (const raw of ingredients) {
    const ingredient = raw.trim().slice(0, 200);
    if (!ingredient) continue;
    const hits = rules().filter((rule) => ruleMatches(rule, ingredient));
    const namesAnimal = hits.some((rule) =>
      (rule.present ?? []).some((slug) => NAMED_ANIMAL.has(slug)),
    );
    for (const rule of hits) {
      if (rule.unnamedAnimal && namesAnimal) continue;
      for (const allergen of rule.present ?? [])
        matches.push({ allergen, state: "present", ingredient });
      for (const allergen of rule.possible ?? [])
        matches.push({ allergen, state: "possible", ingredient });
    }
  }
  const present = ALLERGEN_SLUGS.filter((slug) =>
    matches.some((m) => m.allergen === slug && m.state === "present"),
  );
  const possible = ALLERGEN_SLUGS.filter(
    (slug) =>
      !present.includes(slug) &&
      matches.some((m) => m.allergen === slug && m.state === "possible"),
  );
  return { version: INGREDIENT_TAXONOMY_VERSION, present, possible, matches };
}

/** Splits a label's ingredient list on commas and semicolons outside brackets. */
export function splitIngredientList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(" || char === "[") depth += 1;
    if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    if ((char === "," || char === ";") && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .slice(0, 100);
}
