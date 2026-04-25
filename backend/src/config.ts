import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().default("3001"),
  RPC_URL: z.string().url(),
  CONTRACT_ID: z.string().min(1),
  NEXT_PUBLIC_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  // Rate limiting (optional with defaults)
  RATE_LIMIT_GLOBAL: z.string().default("60"),
  RATE_LIMIT_WRITE: z.string().default("10"),
  // Webhook secret
  WEBHOOK_SECRET: z.string().min(16).optional(),
  // Admin key for webhook admin endpoints
  ADMIN_API_KEY: z.string().min(8).optional(),
  // Connection pool size
  POOL_MIN: z.string().default("2"),
  POOL_MAX: z.string().default("10"),
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
