import { createClient, type RedisClientType } from "redis";
import logger from "./logger";

export const TWAP_CACHE_TTL_SECONDS = 60;

type JsonRedisClient = RedisClientType;

const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
let redisClient: JsonRedisClient | null = null;
let redisConnectPromise: Promise<JsonRedisClient | null> | null = null;

function cacheKey(asset: string): string {
  return `twap:${asset}`;
}

async function getRedisClient(): Promise<JsonRedisClient | null> {
  if (!process.env.REDIS_URL) return null;
  if (redisClient?.isReady) return redisClient;
  if (!redisConnectPromise) {
    const client = createClient({ url: process.env.REDIS_URL }) as JsonRedisClient;
    client.on("error", (error) => logger.warn("twap_cache_redis_error", { error: error.message }));
    redisConnectPromise = client.connect()
      .then(() => {
        redisClient = client;
        return client;
      })
      .catch((error) => {
        logger.warn("twap_cache_redis_unavailable", { error: error instanceof Error ? error.message : String(error) });
        redisConnectPromise = null;
        return null;
      });
  }
  return redisConnectPromise;
}

/**
 * Return a TWAP value from Redis when present, otherwise fetch it and cache it
 * for 60 seconds. The in-memory fallback keeps development usable without a
 * Redis service while production uses the shared Redis cache.
 */
export async function getCachedTwapPrice<T>(asset: string, fetchPrice: () => Promise<T>): Promise<T> {
  const key = cacheKey(asset);
  const client = await getRedisClient();

  if (client) {
    const cached = await client.get(key);
    if (cached !== null) {
      logger.debug("twap_cache_hit", { key, ttlSeconds: TWAP_CACHE_TTL_SECONDS });
      return JSON.parse(cached) as T;
    }
  } else {
    const cached = memoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug("twap_cache_hit", { key, ttlSeconds: TWAP_CACHE_TTL_SECONDS, backend: "memory" });
      return cached.value as T;
    }
    memoryCache.delete(key);
  }

  logger.debug("twap_cache_miss", { key });
  const value = await fetchPrice();
  const serialized = JSON.stringify(value);
  if (client) {
    await client.setEx(key, TWAP_CACHE_TTL_SECONDS, serialized);
  } else {
    memoryCache.set(key, { value, expiresAt: Date.now() + TWAP_CACHE_TTL_SECONDS * 1000 });
  }
  return value;
}

export function twapCacheKey(asset: string): string {
  return cacheKey(asset);
}
