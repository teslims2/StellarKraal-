import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "verbose", "debug", "silly"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3001),
  RPC_URL: z.string().url(),
  CONTRACT_ID: z.string().min(1),
  NEXT_PUBLIC_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  FRONTEND_URL: z.string().url().optional(),
  // Rate limiting (requests per minute per IP)
  RATE_LIMIT_GLOBAL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_WRITE: z.coerce.number().int().positive().default(10),
  // Request timeouts in milliseconds
  TIMEOUT_GLOBAL_MS: z.coerce.number().int().positive().default(30000),
  TIMEOUT_WRITE_MS: z.coerce.number().int().positive().default(15000),
  // Webhook HMAC signing secret (min 16 chars)
  WEBHOOK_SECRET: z.string().min(16).optional(),
  // Admin API key for /api/admin/* endpoints
  ADMIN_API_KEY: z.string().min(8).optional(),
  // RPC connection pool size
  POOL_MIN: z.coerce.number().int().positive().default(2),
  POOL_MAX: z.coerce.number().int().positive().default(10),
  // Appraisal cache TTL in milliseconds
  APPRAISAL_CACHE_TTL_MS: z.coerce.number().int().positive().default(300000),
  // JWT secret for signing access tokens (min 32 chars in production)
  JWT_SECRET: z.string().min(16).optional(),
  // Audit log directory
  AUDIT_LOG_DIR: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`\nEnvironment validation failed:\n${issues}\n`);
  process.exit(1);
}

export const config = parsed.data;
