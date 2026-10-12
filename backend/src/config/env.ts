import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z
    .string({ error: "MONGODB_URI is not set. Point it at a MongoDB instance, e.g. mongodb://localhost:27017/insightflow." })
    .min(1, "MONGODB_URI is not set. Point it at a MongoDB instance, e.g. mongodb://localhost:27017/insightflow."),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  OPENAI_API_KEY: z.string().optional(),
  ADAPTION_API_KEY: z.string().optional(),
  ADAPTION_BASE_URL: z.string().default("https://api.adaptionlabs.ai"),
  NODE_ENV: z.string().default("development"),
  // Session authentication. SESSION_SECRET signs session ids; it must be
  // long, random, and server-side only (never a VITE_* variable).
  SESSION_SECRET: z
    .string({ error: "SESSION_SECRET is not set. Generate one, e.g. `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"`, and keep it server-side." })
    .min(32, "SESSION_SECRET must be at least 32 characters."),
  SESSION_MAX_AGE_HOURS: z.coerce.number().positive().default(12),
  // Public "Try Live Demo" mode. DEMO_ENABLED=false removes the demo entry
  // point (POST /api/auth/demo returns 403). DEMO_SESSION_HOURS caps how
  // long a demo session lives, independent of full-account sessions.
  DEMO_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DEMO_SESSION_HOURS: z.coerce.number().positive().default(2),
  // Cookie transport. SameSite=lax suits same-site dev (localhost:5173 ->
  // localhost:5000); cross-site production hosting needs none + Secure.
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),  COOKIE_SECURE: z
    .enum(["true", "false", "auto"])
    .default("auto")
    .transform((v) => {
      if (v === "true") return true;
      if (v === "false") return false;
      return process.env.NODE_ENV === "production";
    }),
});

export type AppEnv = z.infer<typeof envSchema>;

// Parsed fresh on each call so tests can stub process.env freely.
// Never logs values; only presence is ever reported elsewhere.
export function getEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid environment configuration.");
  }
  return parsed.data;
}

export function frontendOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function isAdaptionConfigured(): boolean {
  return Boolean(process.env.ADAPTION_API_KEY?.trim());
}

