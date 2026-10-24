import { describe, expect, it } from "vitest";
import { parsePassport, passportFromProfile, passportFingerprint, passportToProfile, serializePassport } from "../passport";
import { normalizePetProfile } from "../pet";
import { readPetNotes } from "../pet-notes";
const encode = (pets: unknown[], version = 2) => JSON.stringify({ format: "petsona-passport", version, pets });
const full = { name: "Milo", species: "dog", breed: "Golden Retriever", birthday: "2020-02-29", gender: "male", weightKg: 12.5, allergies: ["fish", "chicken"], diet: "grain-free", activity: "high", vetDiet: true, lifeStage: "adult", notes: "Needs a quiet feeding place.", instagram: "milo.pet", sizeClass: "m", dietaryNeeds: ["grain-free", "sensitive"] };
describe("pet passport", () => {
  it("round trips canonical optional fields through the provider's safe notes envelope", () => {
    const parsed = parsePassport(encode([full]))[0];
    const restored = passportToProfile(parsed);
    expect(passportFromProfile(restored)).toEqual(parsed);
    expect(readPetNotes(restored.notes).instagram).toBe("milo.pet");
    expect(restored.photoFileGid).toBeNull(); expect(restored.quizProfile).toBeNull();
    expect(parsePassport(serializePassport([restored]))[0]).toEqual(parsed);
  });
  it("strips ownership, photos, arbitrary notes extras and Finder state on both boundaries", () => {
    const raw = { ...full, id: "do-not-transfer", customerGid: "do-not-transfer", photoFileGid: "do-not-transfer", quizProfile: { token: "do-not-transfer" }, notes: 'petsona-theme:{"notes":"Hello","instagram":"milo.pet","owner":"do-not-transfer","token":"do-not-transfer"}' };
    const exported = serializePassport([raw]); expect(exported).not.toContain("do-not-transfer");
    const imported = passportToProfile(parsePassport(encode([{ ...full, owner: "do-not-transfer", pending: raw }]))[0]);
    expect(JSON.stringify(imported)).not.toContain("do-not-transfer");
  });
  it("accepts old v1 passports, converts pounds once and keeps multiple dietary values", () => {
    const parsed = parsePassport(encode([{ name: "Luna", species: "cat", birthdate: "2020-01-01", weight: 10, unit: "lb", dietaryNeeds: ["sensitive", "grain-free"] }], 1))[0];
    expect(parsed.weightKg).toBe(4.536); expect(parsed.dietaryNeeds).toEqual(["grain-free", "sensitive"]);
    expect(passportFromProfile(passportToProfile(parsed))).toEqual(parsed);
  });
  it("keeps unknown species, weight and birthday unknown, and month precision explicit", () => {
    const blank = parsePassport(encode([{ name: "Milo" }]))[0];
    expect(blank.birthday).toBeNull(); expect(blank.species).toBeNull(); expect(blank.weightKg).toBeNull();
    const month = passportFromProfile({ name: "Milo", birthday: "2020-02" });
    expect(month.birthday).toBeNull(); expect(month.birthdayMonth).toBe("2020-02");
    expect(passportFromProfile(passportToProfile(month))).toEqual(month);
  });
  it("uses all details for duplicates and canonicalises units, breeds and list order", () => {
    const left = passportFromProfile(full);
    const right = passportFromProfile({ ...full, breed: "golden-retriever", allergies: ["chicken", "fish"] });
    expect(passportFingerprint(left)).toBe(passportFingerprint(right));
    expect(passportFingerprint(left)).not.toBe(passportFingerprint({ ...right, instagram: "another.pet" }));
  });
  it("rejects invalid entire batches rather than silently sanitising malformed fields", () => {
    for (const mutation of [{ name: "" }, { name: "a".repeat(81) }, { birthday: "2024-02-30" }, { birthday: "2999-01-01" }, { birthdayMonth: "2020-02" }, { birthday: "2020-02" }, { weightKg: "5" }, { weightKg: 501 }, { weightKg: -1 }, { allergies: [false] }, { allergies: Array(31).fill("fish") }, { instagram: "bad handle" }, { vetDiet: "true" }, { notes: "a".repeat(2001) }]) {
      expect(() => parsePassport(encode([full, { ...full, ...mutation }]))).toThrow();
    }
  });
  it("preserves an explicitly recorded zero accepted by the canonical profile contract", () => {
    const profile = normalizePetProfile({ name: "Milo", weightKg: 0 });
    expect(profile.valid).toBe(true);
    expect(parsePassport(serializePassport([profile.value]))[0].weightKg).toBe(0);
  });
  it("bounds file size, list count and version", () => {
    for (const input of [encode([]), encode(Array(11).fill(full)), encode([full], 3), encode([full]).replace('"version":2', '"version":"2"'), encode([full]) + " ".repeat(65536)]) expect(() => parsePassport(input)).toThrow();
  });
  it("does not let a retained month override a later full birthday", () => {
    const profile = passportToProfile(passportFromProfile({ name: "Milo", birthday: "2020-02" }));
    const edited = normalizePetProfile({ ...profile, birthday: "2020-02-17" }).value!;
    const exported = passportFromProfile(edited);
    expect(exported.birthday).toBe("2020-02-17");
    expect(exported.birthdayMonth).toBeNull();
    const cleared = normalizePetProfile({ ...edited, birthday: null }).value!;
    expect(passportFromProfile(cleared).birthdayMonth).toBeNull();
  });
  it("does not let retained legacy life stage override a later canonical edit", () => {
    const profile = passportToProfile(parsePassport(encode([full]))[0]);
    const edited = normalizePetProfile({ ...profile, lifeStage: "senior" }).value!;
    expect(passportFromProfile(edited).lifeStage).toBe("senior");
  });
});
