import { describe, expect, it } from "vitest";
import { readPetNotes, writePetNotes } from "../pet-notes";

describe("portable profile notes", () => {
  it("edits Instagram without losing plain customer notes", () => {
    const encoded = writePetNotes("Loves walks", "Loves walks", "@milo.dog");
    expect(readPetNotes(encoded)).toMatchObject({ notes: "Loves walks", instagram: "milo.dog" });
  });

  it("preserves unknown extras when changing notes and removing Instagram", () => {
    const original = 'petsona-theme:{"instagram":"milo","notes":"Original","color":"brown","sizeClass":"large","future":{"keep":true}}';
    const encoded = writePetNotes(original, "Updated", "");
    expect(JSON.parse(encoded!.slice("petsona-theme:".length))).toEqual({
      instagram: "", notes: "Updated", color: "brown", sizeClass: "large", future: { keep: true },
    });
  });

  it.each(['petsona-theme:{broken', 'petsona-theme:null', 'petsona-theme:[]'])("retains malformed legacy envelopes as notes: %s", (raw) => {
    expect(readPetNotes(raw).notes).toBe(raw);
    expect(writePetNotes(raw, raw, "")).toBe(raw);
  });

  it("does not encode or invent optional values for a name-only profile", () => {
    expect(writePetNotes(null, "", "")).toBeNull();
    expect(readPetNotes(null)).toMatchObject({ notes: "", instagram: "" });
  });
});
