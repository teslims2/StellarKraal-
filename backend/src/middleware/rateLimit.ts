import rateLimit from "express-rate-limit";
import { config } from "../config";

const windowMs = 60 * 1000; // 1 minute

export const globalLimiter = rateLimit({
  windowMs,
  max: config.RATE_LIMIT_GLOBAL,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", retryAfter: 60 },
});

export const writeLimiter = rateLimit({
  windowMs,
  max: config.RATE_LIMIT_WRITE,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests", retryAfter: 60 },
});
