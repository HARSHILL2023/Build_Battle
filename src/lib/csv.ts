import Papa from "papaparse";
import { z } from "zod";
import { hashReview } from "./text";

export const ALLOWED_CATEGORIES = [
  "Product Feedback",
  "Customer Service",
  "Fraud and Scam",
  "Operational Issues",
  "Other",
] as const;

export const feedbackSchema = z.object({
  review: z
    .string({ error: "Review text is required." })
    .trim()
    .min(3, "Review must be at least 3 characters.")
    .max(2000, "Review must be 2000 characters or fewer."),
  category: z.enum(ALLOWED_CATEGORIES, "Select a valid category."),
});

export interface CsvParseResult {
  valid: { review: string; category: string; hash: string }[];
  errors: { row: number; message: string }[];
  totalRows: number;
}

const MAX_ROWS = 20000;
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Validate and normalize an uploaded CSV. Never throws on malformed
 * content; returns per-row errors instead. Requires `review` and
 * `category` headers (case-insensitive); extra columns are ignored.
 */
export function parseFeedbackCsv(content: string, filename: string): CsvParseResult {
  void filename;
  if (content.length > MAX_BYTES) {
    return {
      valid: [],
      errors: [{ row: 0, message: `File is too large. Maximum size is ${MAX_BYTES / 1024 / 1024} MB.` }],
      totalRows: 0,
    };
  }
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0 && (!parsed.meta.fields || parsed.meta.fields.length === 0)) {
    return {
      valid: [],
      errors: [{ row: 0, message: `Could not parse CSV: ${parsed.errors[0].message}` }],
      totalRows: 0,
    };
  }
  const fields = (parsed.meta.fields ?? []).map((f) => f.trim().toLowerCase());
  const reviewIdx = fields.indexOf("review");
  const categoryIdx = fields.indexOf("category");
  if (reviewIdx === -1 || categoryIdx === -1) {
    return {
      valid: [],
      errors: [
        {
          row: 0,
          message:
            "Missing required headers. The CSV must contain `review` and `category` columns.",
        },
      ],
      totalRows: 0,
    };
  }
  const reviewKey = parsed.meta.fields![reviewIdx];
  const categoryKey = parsed.meta.fields![categoryIdx];

  const valid: CsvParseResult["valid"] = [];
  const errors: CsvParseResult["errors"] = [];
  const rows = parsed.data.slice(0, MAX_ROWS + 1);
  rows.forEach((row, i) => {
    const rowNum = i + 2; // header is row 1
    const review = (row[reviewKey] ?? "").trim();
    const rawCategory = (row[categoryKey] ?? "").trim();
    if (!review && !rawCategory) return; // skip blank lines
    if (!review) {
      errors.push({ row: rowNum, message: "Empty review text." });
      return;
    }
    if (review.length > 2000) {
      errors.push({ row: rowNum, message: "Review exceeds 2000 characters." });
      return;
    }
    // Map unknown categories to Other rather than rejecting the row.
    const category = (ALLOWED_CATEGORIES as readonly string[]).includes(rawCategory)
      ? rawCategory
      : "Other";
    valid.push({ review, category, hash: hashReview(review, category) });
  });

  const totalRows = parsed.data.length;
  if (totalRows > MAX_ROWS && errors.length < 50) {
    errors.push({
      row: 0,
      message: `File has ${totalRows.toLocaleString()} rows; only the first ${MAX_ROWS.toLocaleString()} were imported.`,
    });
  }
  return { valid, errors: errors.slice(0, 50), totalRows };
}
