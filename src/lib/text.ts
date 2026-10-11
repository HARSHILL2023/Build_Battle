import { createHash } from "node:crypto";

/** Normalize review text for duplicate detection. */
export function normalizeReview(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'“”‘’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable hash of a review + category pair. */
export function hashReview(review: string, category: string): string {
  return createHash("sha256")
    .update(`${normalizeReview(review)}||${category.trim().toLowerCase()}`)
    .digest("hex");
}

/**
 * Guard against spreadsheet formula injection in CSV exports.
 * Prefixes cells that start with =, +, -, @, tab or carriage return.
 */
export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

/** Escape a value for CSV output. */
export function toCsvCell(value: string | number | null | undefined): string {
  const s = sanitizeCsvCell(String(value ?? ""));
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Truncate long text for previews without breaking words badly. */
export function truncate(text: string, max = 140): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trim()}…`;
}
