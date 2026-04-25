import logger from "./logger";

interface CacheEntry {
  value: number;
  cachedAt: number;
  stale: boolean;
}

const cache = new Map<string, CacheEntry>();
let ttlMs = 5 * 60 * 1000; // default 5 minutes

export function configureCacheTTL(ms: number): void {
  ttlMs = ms;
}

export function getAppraisal(collateralId: string): CacheEntry | null {
  const entry = cache.get(collateralId);
  if (!entry) {
    logger.debug("appraisal_cache_miss", { collateralId });
    return null;
  }
  const age = Date.now() - entry.cachedAt;
  if (age > ttlMs) {
    entry.stale = true;
    logger.debug("appraisal_cache_stale", { collateralId, ageMs: age });
  } else {
    logger.debug("appraisal_cache_hit", { collateralId, ageMs: age });
  }
  return entry;
}

export function setAppraisal(collateralId: string, value: number): void {
  cache.set(collateralId, { value, cachedAt: Date.now(), stale: false });
}

/** Call when an oracle price update is detected to invalidate a specific entry. */
export function invalidateAppraisal(collateralId: string): void {
  const deleted = cache.delete(collateralId);
  if (deleted) {
    logger.info("appraisal_cache_invalidated", { collateralId });
  }
}

/** Invalidate all cached appraisals (e.g. on a global oracle update). */
export function invalidateAll(): void {
  const size = cache.size;
  cache.clear();
  logger.info("appraisal_cache_invalidated_all", { count: size });
}

/** Exposed for testing only. */
export function _cacheSize(): number {
  return cache.size;
}
