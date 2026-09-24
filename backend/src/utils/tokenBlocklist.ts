import { createHash } from 'crypto';
import logger from './logger';

/**
 * Token blocklist for managing revoked/rotated refresh tokens.
 * Implements a hybrid in-memory + optional DB storage approach.
 *
 * When a refresh token is rotated, the old token hash is added to the blocklist.
 * Any attempt to use a blocked token is rejected with 401.
 *
 * Storage strategy:
 * - In-memory cache for fast lookups (Map<tokenHash, revocationTime>)
 * - Optional DB persistence for tokens that should survive server restarts
 * - Automatic expiry cleanup (tokens older than REFRESH_TTL_MS are removed)
 */

/** In-memory blocklist: tokenHash → revocationTimestamp */
const blocklist = new Map<string, number>();

/** Configuration for blocklist behavior */
interface BlocklistConfig {
  maxAge: number; // milliseconds - how long to keep revoked tokens in blocklist
  cleanupInterval: number; // milliseconds - how often to cleanup expired entries
}

const config: BlocklistConfig = {
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches REFRESH_TTL_MS default)
  cleanupInterval: 60 * 60 * 1000, // 1 hour
};

/**
 * Hash a refresh token for storage in the blocklist.
 * Uses SHA-256 for consistent hashing.
 *
 * @param token Raw refresh token string
 * @returns SHA-256 hex digest
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Add a refresh token to the blocklist (revocation).
 * Called when a token is rotated or needs to be invalidated.
 *
 * @param tokenHash SHA-256 hash of the token
 * @param reason Optional reason for blocklisting (e.g., 'rotated', 'logout')
 */
export function revokeToken(tokenHash: string, reason: string = 'rotated'): void {
  const now = Date.now();
  blocklist.set(tokenHash, now);
  logger.debug('Token revoked', { tokenHash: tokenHash.slice(0, 8) + '...', reason });
}

/**
 * Check if a refresh token hash is in the blocklist.
 * Returns true if the token is revoked/blocked.
 *
 * @param tokenHash SHA-256 hash of the token
 * @returns true if token is blocked, false otherwise
 */
export function isTokenBlocked(tokenHash: string): boolean {
  if (!blocklist.has(tokenHash)) {
    return false;
  }

  // Check if the token has expired from the blocklist
  const revocationTime = blocklist.get(tokenHash)!;
  const age = Date.now() - revocationTime;

  if (age > config.maxAge) {
    // Token is old enough to remove from blocklist
    blocklist.delete(tokenHash);
    return false;
  }

  return true;
}

/**
 * Remove a token from the blocklist (typically not called in normal flow).
 * Used primarily for testing.
 *
 * @param tokenHash SHA-256 hash of the token
 */
export function unrevokeToken(tokenHash: string): void {
  blocklist.delete(tokenHash);
}

/**
 * Get the current size of the blocklist (for monitoring).
 *
 * @returns Number of revoked tokens currently in blocklist
 */
export function getBlocklistSize(): number {
  return blocklist.size;
}

/**
 * Clean up expired tokens from the blocklist.
 * Removes tokens that are older than config.maxAge.
 * Called periodically by cleanup job.
 *
 * @returns Number of tokens removed
 */
export function cleanupBlocklist(): number {
  const now = Date.now();
  let removed = 0;

  for (const [tokenHash, revocationTime] of blocklist.entries()) {
    if (now - revocationTime > config.maxAge) {
      blocklist.delete(tokenHash);
      removed++;
    }
  }

  if (removed > 0) {
    logger.debug('Blocklist cleanup', { tokensRemoved: removed, blocklistSize: blocklist.size });
  }

  return removed;
}

/**
 * Clear the entire blocklist (for testing only).
 */
export function _clearBlocklist(): void {
  blocklist.clear();
}

/**
 * Configure blocklist behavior.
 * Call this during application startup if custom settings are needed.
 *
 * @param newConfig Partial configuration override
 */
export function configureBlocklist(newConfig: Partial<BlocklistConfig>): void {
  Object.assign(config, newConfig);
  logger.info('Blocklist configured', { config });
}

/**
 * Get current blocklist configuration.
 *
 * @returns Current blocklist config
 */
export function getBlocklistConfig(): Readonly<BlocklistConfig> {
  return { ...config };
}

/**
 * Initialize periodic cleanup of expired tokens.
 * Should be called once during application startup.
 * Returns a cleanup task handle that can be stopped.
 *
 * @returns Object with stop() method to halt the cleanup job
 */
export function initializeBlocklistCleanup(): { stop: () => void } {
  const cleanupJob = setInterval(() => {
    try {
      cleanupBlocklist();
    } catch (error) {
      logger.error('Error during token blocklist cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, config.cleanupInterval);

  return {
    stop: () => {
      clearInterval(cleanupJob);
      logger.debug('Token blocklist cleanup stopped');
    },
  };
}

/**
 * Export blocklist stats for monitoring/metrics.
 *
 * @returns Object with blocklist statistics
 */
export function getBlocklistStats() {
  return {
    size: blocklist.size,
    config: { ...config },
    oldestRevocationAge: blocklist.size > 0 
      ? Math.max(...Array.from(blocklist.values()).map(t => Date.now() - t))
      : 0,
  };
}
