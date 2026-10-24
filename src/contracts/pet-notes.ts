const NOTES_MARKER = "petsona-theme:";

/** Reads the legacy theme envelope without discarding malformed customer text. */
export function readPetNotes(raw: string | null | undefined) {
  let extras: Record<string, unknown> | null = null;
  if (raw?.startsWith(NOTES_MARKER)) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(NOTES_MARKER.length));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extras = parsed as Record<string, unknown>;
      }
    } catch { /*! Keep malformed legacy content as plain notes. */ }
  }
  return {
    notes: extras ? (typeof extras.notes === "string" ? extras.notes : "") : raw || "",
    instagram: extras && typeof extras.instagram === "string" ? extras.instagram : "",
    extras,
  };
}

/** Changes only the two edited fields, retaining other legacy profile extras. */
export function writePetNotes(raw: string | null | undefined, notes: string, instagram: string): string | null {
  const previous = readPetNotes(raw);
  const handle = instagram.trim().replace(/^@/, "");
  if (!previous.extras && !handle) return notes.trim() || null;
  return NOTES_MARKER + JSON.stringify({
    ...previous.extras,
    notes: notes.trim() || null,
    instagram: handle,
  });
}
