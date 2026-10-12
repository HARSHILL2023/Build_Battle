import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 72; // bcrypt input limit

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .toLowerCase()
  .pipe(z.email());

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
