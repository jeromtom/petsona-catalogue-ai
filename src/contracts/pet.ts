import { readPetNotes } from "./pet-notes";
import {
  isJsonSerializable,
  normalizeSlug,
  normalizeSlugList,
  normalizeText,
  parseStrictIsoDate,
  type ValidationResult,
} from "./common";

export const PET_PROFILE_VERSION = 1 as const;
export const PETSONA_PET_METAOBJECT_TYPE = "petsona_pet" as const;
export const PETSONA_CUSTOM_DATA_NAMESPACE = "petsona" as const;
export const PETSONA_PETS_METAFIELD_KEY = "pets" as const;
export const LEGACY_PET_METAOBJECT_TYPE = "$app:pet" as const;
export const LEGACY_PETS_METAFIELD_NAMESPACE = "$app" as const;

export const PETSONA_PET_FIELD_KEYS = {
  name: "name",
  species: "species",
  breed: "breed",
  birthday: "birthday",
  gender: "gender",
  photo: "photo",
  notes: "notes",
  weightKg: "weight_kg",
  allergies: "allergies",
  diet: "diet",
  activity: "activity",
  vetDiet: "vet_diet",
  lifeStage: "life_stage",
  quizProfile: "quiz_profile",
} as const;

export interface MetaobjectFieldSpec {
  key: string;
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export const PETSONA_PET_METAOBJECT = {
  type: PETSONA_PET_METAOBJECT_TYPE,
  name: "Petsona pet",
  description:
    "A customer pet profile used by Petsona and compatible pet-care experiences.",
  displayNameKey: "name",
  access: {
    storefront: "NONE",
    customerAccount: "READ",
  },
  fields: [
    {
      key: "name",
      name: "Name",
      type: "single_line_text_field",
      required: true,
      description: "Pet display name.",
    },
    {
      key: "species",
      name: "Species",
      type: "single_line_text_field",
      description: "Normalised species slug.",
    },
    {
      key: "breed",
      name: "Breed",
      type: "single_line_text_field",
      description: "Normalised breed slug or merchant value.",
    },
    {
      key: "birthday",
      name: "Birthday",
      type: "date",
      description: "Known or estimated birthday.",
    },
    {
      key: "gender",
      name: "Gender",
      type: "single_line_text_field",
      description: "Optional gender value.",
    },
    {
      key: "photo",
      name: "Photo",
      type: "file_reference",
      description: "Shopify file used as the pet avatar.",
    },
    {
      key: "notes",
      name: "Notes",
      type: "multi_line_text_field",
      description: "Merchant or customer supplied notes.",
    },
    {
      key: "weight_kg",
      name: "Weight (kg)",
      type: "number_decimal",
      description: "Current weight in kilograms.",
    },
    {
      key: "allergies",
      name: "Allergies",
      type: "list.single_line_text_field",
      description: "Normalised ingredient or allergen exclusions.",
    },
    {
      key: "diet",
      name: "Diet",
      type: "single_line_text_field",
      description: "Diet preference slug.",
    },
    {
      key: "activity",
      name: "Activity",
      type: "single_line_text_field",
      description: "Activity band slug.",
    },
    {
      key: "vet_diet",
      name: "Veterinary diet",
      type: "boolean",
      description: "Whether veterinary diet guidance applies.",
    },
    {
      key: "life_stage",
      name: "Life stage",
      type: "single_line_text_field",
      description: "Derived or confirmed life stage.",
    },
    {
      key: "quiz_profile",
      name: "Finder profile",
      type: "json",
      description: "Versioned Pet Finder answers and recommendation context.",
    },
  ] satisfies MetaobjectFieldSpec[],
} as const;

export const PETSONA_CUSTOMER_PETS_METAFIELD = {
  namespace: PETSONA_CUSTOM_DATA_NAMESPACE,
  key: PETSONA_PETS_METAFIELD_KEY,
  name: "Petsona pets",
  description: "Pet profiles associated with this customer.",
  ownerType: "CUSTOMER",
  type: "list.metaobject_reference",
  access: { storefront: "NONE", customerAccount: "READ" },
} as const;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface PetProfileInput {
  version?: number;
  name: unknown;
  species?: unknown;
  breed?: unknown;
  birthday?: unknown;
  gender?: unknown;
  notes?: unknown;
  photoFileGid?: unknown;
  weightKg?: unknown;
  allergies?: unknown;
  diet?: unknown;
  activity?: unknown;
  vetDiet?: unknown;
  lifeStage?: unknown;
  quizProfile?: unknown;
}

export interface PetProfile {
  version: typeof PET_PROFILE_VERSION;
  name: string;
  species: string | null;
  breed: string | null;
  birthday: string | null;
  gender: string | null;
  notes: string | null;
  photoFileGid: string | null;
  weightKg: number | null;
  allergies: string[];
  diet: string | null;
  activity: string | null;
  vetDiet: boolean | null;
  lifeStage: string | null;
  quizProfile: JsonValue | null;
}

function parseBirthday(
  value: unknown,
  now: Date,
  errors: string[],
): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const candidate = /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text;
  const parsed = parseStrictIsoDate(candidate);
  if (!parsed) {
    errors.push("birthday is invalid");
    return null;
  }
  if (parsed.getTime() > now.getTime()) {
    errors.push("birthday cannot be in the future");
    return null;
  }
  return candidate;
}

function parseWeight(value: unknown, errors: string[]): number | null {
  if (value === undefined || value === null || value === "") return null;
  const weight = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(weight) || weight < 0 || weight > 500) {
    errors.push("weightKg must be between 0 and 500");
    return null;
  }
  return Math.round(weight * 1000) / 1000;
}

export function normalizePetProfile(
  input: PetProfileInput,
  now: Date = new Date(),
): ValidationResult<PetProfile> {
  const errors: string[] = [];
  if ((input.version ?? PET_PROFILE_VERSION) !== PET_PROFILE_VERSION)
    errors.push("version must be 1");

  const name = normalizeText(input.name) ?? "";
  if (!name) errors.push("name is required");
  else if (name.length > 80) errors.push("name must be 80 characters or fewer");

  const species = normalizeSlug(input.species);
  if (normalizeText(input.species) && !species)
    errors.push("species is invalid");
  const breed = normalizeSlug(input.breed);
  if (normalizeText(input.breed) && !breed) errors.push("breed is invalid");
  const allergies = normalizeSlugList(input.allergies);
  if (
    Array.isArray(input.allergies) &&
    input.allergies.some(
      (value) => typeof value === "string" && value.trim().length > 64,
    )
  ) {
    errors.push("allergies values must be 64 characters or fewer");
  }

  let quizProfile: JsonValue | null = null;
  if (input.quizProfile !== undefined && input.quizProfile !== null) {
    if (!isJsonSerializable(input.quizProfile))
      errors.push("quizProfile must be JSON serializable");
    else quizProfile = input.quizProfile as JsonValue;
  }

  const birthday = parseBirthday(input.birthday, now, errors);
  let notes = normalizeText(input.notes);
  if (birthday && /^\d{4}-\d{2}-\d{2}$/.test(String(input.birthday))) {
    const parsed = readPetNotes(notes);
    if (parsed.extras && Object.hasOwn(parsed.extras, "birthdayMonth")) {
      const { birthdayMonth: _retiredMonth, ...extras } = parsed.extras;
      notes = "petsona-theme:" + JSON.stringify(extras);
    }
  }

  const value: PetProfile = {
    version: PET_PROFILE_VERSION,
    name,
    species,
    breed,
    birthday,
    gender: normalizeSlug(input.gender),
    notes,
    photoFileGid: normalizeText(input.photoFileGid),
    weightKg: parseWeight(input.weightKg, errors),
    allergies,
    diet: normalizeSlug(input.diet),
    activity: normalizeSlug(input.activity),
    vetDiet: typeof input.vetDiet === "boolean" ? input.vetDiet : null,
    lifeStage: normalizeSlug(input.lifeStage),
    quizProfile,
  };

  return errors.length > 0
    ? { valid: false, errors, value: null }
    : { valid: true, errors: [], value };
}
