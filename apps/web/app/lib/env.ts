import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PNR_HASH_SALT: z
    .string()
    .min(16, "PNR_HASH_SALT must be at least 16 characters for cryptographic security")
    .default(
      process.env.PNR_HASH_SALT && process.env.PNR_HASH_SALT.length >= 16
        ? process.env.PNR_HASH_SALT
        : "railrefund-default-salt-minimum-16-chars"
    ),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(60000),
  PROVIDER_TIMEOUT_MS: z.coerce.number().positive().default(15000),
  PROVIDER_MAX_RETRIES: z.coerce.number().nonnegative().default(1),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  ALLOW_MOCK_PROVIDER: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  PNR_PROVIDER: z.string().optional().default("mock"),
  RAPIDAPI_KEY: z.string().optional(),
  RAPIDAPI_HOST: z.string().optional(),
  RAPIDAPI_PNR_ENDPOINT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables at boot:", result.error.format());
    throw new Error(
      `Environment validation failed: ${result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`
    );
  }
  return result.data;
}

export const env = parseEnv();
