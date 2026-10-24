import { normalizePetProfile, type PetProfile } from "./pet";
import { readPetNotes } from "./pet-notes";
import { parseStrictIsoDate } from "./common";

export const PASSPORT_MAX_BYTES = 65536;
export const PASSPORT_MAX_PETS = 10;
export type PassportPet = Pick<PetProfile, "name" | "species" | "breed" | "birthday" | "gender" | "weightKg" | "allergies" | "diet" | "activity" | "vetDiet" | "lifeStage"> & {
  notes: string | null; instagram: string; birthdayMonth: string | null;
  sizeClass: string | null; dietaryNeeds: string[];
};
function invalid(): never { throw new Error("invalid_passport"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, limit = 80): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid();
  return value.trim() || null;
}
function list(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item))) invalid();
  return [...new Set(value as string[])].sort();
}
function clean(value: unknown, now = new Date()): PassportPet {
  const input = record(value);
  const birthday = text(input.birthday);
  const birthdayMonth = text(input.birthdayMonth);
  if (birthday && (!parseStrictIsoDate(birthday) || birthday < "1900-01-01" || birthday > now.toISOString().slice(0, 10))) invalid();
  if (birthdayMonth && (!/^\d{4}-\d{2}$/.test(birthdayMonth) || !parseStrictIsoDate(birthdayMonth + "-01") || birthdayMonth < "1900-01" || birthdayMonth > now.toISOString().slice(0, 7))) invalid();
  if (birthday && birthdayMonth) invalid();
  const weightKg = input.weightKg == null ? null : input.weightKg;
  if (weightKg !== null && (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > 500)) invalid();
  if (input.vetDiet != null && typeof input.vetDiet !== "boolean") invalid();
  const instagram = (text(input.instagram, 31) || "").replace(/^@/, "");
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) invalid();
  const sizeClass = text(input.sizeClass);
  if (sizeClass && !["xs", "s", "m", "l", "xl"].includes(sizeClass)) invalid();
  const normalised = normalizePetProfile({
    name: text(input.name), species: text(input.species, 64), breed: text(input.breed, 80),
    birthday, gender: text(input.gender, 64), weightKg, allergies: list(input.allergies),
    diet: text(input.diet, 64), activity: text(input.activity, 64), vetDiet: input.vetDiet,
    lifeStage: text(input.lifeStage, 64), notes: text(input.notes, 2000),
  }, now);
  if (!normalised.valid || !normalised.value) invalid();
  const { version: _version, quizProfile: _quiz, photoFileGid: _photo, ...profile } = normalised.value;
  return { ...profile, instagram, birthdayMonth, sizeClass, dietaryNeeds: list(input.dietaryNeeds) };
}

/** Explicit projection from canonical or legacy profiles. Unknown envelopes never travel. */
export function passportFromProfile(value: unknown, now = new Date()): PassportPet {
  const pet = record(value);
  const parsed = readPetNotes(typeof pet.notes === "string" ? pet.notes : null);
  const extras = parsed.extras || {};
  const birthday = pet.birthday !== undefined ? pet.birthday : pet.birthdate;
  const month = typeof birthday === "string" && /^\d{4}-\d{2}$/.test(birthday) ? birthday : birthday ? null : pet.birthdayMonth ?? extras.birthdayMonth;
  const unit = pet.weightUnit ?? pet.unit ?? "kg";
  if (!["kg", "lb"].includes(String(unit))) invalid();
  const weight = pet.weightKg !== undefined ? pet.weightKg : pet.weight;
  const weightKg = weight == null ? null : typeof weight === "number" ? weight * (pet.weightKg === undefined && unit === "lb" ? 0.45359237 : 1) : invalid();
  const dietaryNeeds = extras.dietaryNeeds ?? pet.dietaryNeeds ?? [];
  return clean({
    name: pet.name, species: pet.species, breed: pet.breed, birthday: month ? null : birthday,
    birthdayMonth: month, gender: pet.gender, weightKg, allergies: pet.allergies,
    diet: pet.diet !== undefined ? pet.diet : list(dietaryNeeds)[0],
    activity: pet.activity !== undefined ? pet.activity : extras.activity,
    vetDiet: pet.vetDiet !== undefined ? pet.vetDiet : extras.vetDiet,
    lifeStage: pet.version === 1 ? pet.lifeStage : extras.passportLifeStage !== undefined ? extras.passportLifeStage : pet.lifeStage,
    notes: parsed.notes, instagram: pet.instagram !== undefined ? pet.instagram : parsed.instagram,
    sizeClass: extras.sizeClass ?? pet.sizeClass, dietaryNeeds,
  }, now);
}

export function parsePassport(source: string, now = new Date()): PassportPet[] {
  if (typeof source !== "string" || new TextEncoder().encode(source).byteLength > PASSPORT_MAX_BYTES) invalid();
  const value = record(JSON.parse(source));
  if (value.format !== "petsona-passport" || ![1, 2].includes(Number(value.version)) || !Array.isArray(value.pets) || value.pets.length < 1 || value.pets.length > PASSPORT_MAX_PETS) invalid();
  if (value.version !== 1 && value.version !== 2) invalid();
  return value.pets.map(pet => value.version === 1 ? passportFromProfile(pet, now) : clean(pet, now));
}

export function serializePassport(profiles: unknown[], now = new Date()): string {
  const result = JSON.stringify({ format: "petsona-passport", version: 2, pets: profiles.map(pet => passportFromProfile(pet, now)) }, null, 2);
  parsePassport(result, now);
  return result;
}

export function passportFingerprint(pet: PassportPet): string { return JSON.stringify(clean(pet)); }

/** Only safe, named optional extras are reconstructed. Account and photo fields stay empty. */
export function passportToProfile(pet: PassportPet): PetProfile {
  const value = clean(pet);
  const notes = "petsona-theme:" + JSON.stringify({
    notes: value.notes, instagram: value.instagram, birthdayMonth: value.birthdayMonth,
    sizeClass: value.sizeClass, dietaryNeeds: value.dietaryNeeds,
    activity: value.activity, vetDiet: value.vetDiet, passportLifeStage: value.lifeStage,
  });
  return normalizePetProfile({ ...value, notes }).value!;
}
