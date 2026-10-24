export interface ValidationResult<T> {
  valid: boolean;
  errors: string[];
  value: T | null;
}

const SLUG_PATTERN = /[^a-z0-9-_]/g;

export function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(SLUG_PATTERN, "");
  return normalized.length > 0 ? normalized : null;
}

export function normalizeText(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export function normalizeSlugList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map(normalizeSlug).filter((item): item is string => item !== null),
    ),
  ];
}

export function isJsonSerializable(value: unknown): boolean {
  if (value === undefined) return false;
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && !containsNonJsonValue(value, new Set());
  } catch {
    return false;
  }
}

function containsNonJsonValue(value: unknown, seen: Set<object>): boolean {
  if (value === null) return false;
  if (["function", "symbol", "bigint", "undefined"].includes(typeof value))
    return true;
  if (typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const values = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  const result = values.some((item) => containsNonJsonValue(item, seen));
  seen.delete(value);
  return result;
}

export function parseStrictIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
