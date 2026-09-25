import {
  hashRefreshToken,
  revokeToken,
  isTokenBlocked,
  unrevokeToken,
  getBlocklistSize,
  cleanupBlocklist,
  _clearBlocklist,
  configureBlocklist,
  getBlocklistConfig,
  initializeBlocklistCleanup,
  getBlocklistStats,
} from './tokenBlocklist';

describe('Token Blocklist', () => {
  beforeEach(() => {
    _clearBlocklist();
  });

  describe('hashRefreshToken', () => {
    it('returns consistent SHA-256 hash', () => {
      const token = 'test-refresh-token-123';
      const hash1 = hashRefreshToken(token);
      const hash2 = hashRefreshToken(token);
      expect(hash1).toBe(hash2);
    });

    it('different tokens produce different hashes', () => {
      const hash1 = hashRefreshToken('token-1');
      const hash2 = hashRefreshToken('token-2');
      expect(hash1).not.toBe(hash2);
    });

    it('hash is 64-character hex string (SHA-256)', () => {
      const hash = hashRefreshToken('any-token');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('revokeToken', () => {
    it('adds token to blocklist', () => {
      const token = 'refresh-token-123';
      const hash = hashRefreshToken(token);
      
      revokeToken(hash);
      expect(isTokenBlocked(hash)).toBe(true);
    });

    it('stores revocation timestamp', () => {
      const token = 'refresh-token-123';
      const hash = hashRefreshToken(token);
      const before = Date.now();
      
      revokeToken(hash);
      
      const after = Date.now();
      const stats = getBlocklistStats();
      expect(stats.oldestRevocationAge).toBeGreaterThanOrEqual(0);
      expect(stats.oldestRevocationAge).toBeLessThanOrEqual(after - before);
    });

    it('accepts optional reason parameter', () => {
      const hash = hashRefreshToken('token');
      expect(() => revokeToken(hash, 'logout')).not.toThrow();
      expect(() => revokeToken(hash, 'rotated')).not.toThrow();
    });
  });

  describe('isTokenBlocked', () => {
    it('returns false for tokens not in blocklist', () => {
      const hash = hashRefreshToken('non-revoked-token');
      expect(isTokenBlocked(hash)).toBe(false);
    });

    it('returns true for revoked tokens', () => {
      const hash = hashRefreshToken('revoked-token');
      revokeToken(hash);
      expect(isTokenBlocked(hash)).toBe(true);
    });

    it('returns false for tokens older than maxAge', async () => {
      const hash = hashRefreshToken('old-token');
      configureBlocklist({ maxAge: 100 }); // 100ms for testing
      
      revokeToken(hash);
      expect(isTokenBlocked(hash)).toBe(true);
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should return false and auto-cleanup
      expect(isTokenBlocked(hash)).toBe(false);
    });
  });

  describe('unrevokeToken', () => {
    it('removes token from blocklist', () => {
      const hash = hashRefreshToken('token');
      revokeToken(hash);
      expect(isTokenBlocked(hash)).toBe(true);
      
      unrevokeToken(hash);
      expect(isTokenBlocked(hash)).toBe(false);
    });

    it('handles non-existent tokens gracefully', () => {
      const hash = hashRefreshToken('non-existent');
      expect(() => unrevokeToken(hash)).not.toThrow();
    });
  });

  describe('getBlocklistSize', () => {
    it('returns 0 for empty blocklist', () => {
      expect(getBlocklistSize()).toBe(0);
    });

    it('increments with each revoked token', () => {
      expect(getBlocklistSize()).toBe(0);
      
      revokeToken(hashRefreshToken('token-1'));
      expect(getBlocklistSize()).toBe(1);
      
      revokeToken(hashRefreshToken('token-2'));
      expect(getBlocklistSize()).toBe(2);
    });

    it('decrements when tokens are removed', () => {
      const hash = hashRefreshToken('token');
      revokeToken(hash);
      expect(getBlocklistSize()).toBe(1);
      
      unrevokeToken(hash);
      expect(getBlocklistSize()).toBe(0);
    });
  });

  describe('cleanupBlocklist', () => {
    it('removes expired tokens', async () => {
      configureBlocklist({ maxAge: 100 });
      
      const hash1 = hashRefreshToken('token-1');
      const hash2 = hashRefreshToken('token-2');
      
      revokeToken(hash1);
      await new Promise(resolve => setTimeout(resolve, 150));
      revokeToken(hash2);
      
      // hash1 should be expired, hash2 should be fresh
      const removed = cleanupBlocklist();
      
      expect(removed).toBe(1);
      expect(getBlocklistSize()).toBe(1);
      expect(isTokenBlocked(hash1)).toBe(false);
      expect(isTokenBlocked(hash2)).toBe(true);
    });

    it('returns number of tokens removed', () => {
      configureBlocklist({ maxAge: 100 });
      
      revokeToken(hashRefreshToken('token-1'));
      revokeToken(hashRefreshToken('token-2'));
      revokeToken(hashRefreshToken('token-3'));
      
      expect(getBlocklistSize()).toBe(3);
      
      return new Promise<void>(resolve => {
        setTimeout(() => {
          const removed = cleanupBlocklist();
          expect(removed).toBe(3);
          expect(getBlocklistSize()).toBe(0);
          resolve();
        }, 150);
      });
    });

    it('handles empty blocklist', () => {
      const removed = cleanupBlocklist();
      expect(removed).toBe(0);
    });
  });

  describe('getBlocklistConfig', () => {
    it('returns current configuration', () => {
      const config = getBlocklistConfig();
      expect(config).toHaveProperty('maxAge');
      expect(config).toHaveProperty('cleanupInterval');
      expect(typeof config.maxAge).toBe('number');
      expect(typeof config.cleanupInterval).toBe('number');
    });

    it('returns copy of config (immutable)', () => {
      const config = getBlocklistConfig();
      (config as any).maxAge = 999;
      
      const config2 = getBlocklistConfig();
      expect(config2.maxAge).not.toBe(999);
    });
  });

  describe('configureBlocklist', () => {
    it('updates maxAge setting', () => {
      configureBlocklist({ maxAge: 5000 });
      const config = getBlocklistConfig();
      expect(config.maxAge).toBe(5000);
    });

    it('updates cleanupInterval setting', () => {
      configureBlocklist({ cleanupInterval: 30000 });
      const config = getBlocklistConfig();
      expect(config.cleanupInterval).toBe(30000);
    });

    it('allows partial updates', () => {
      const originalConfig = getBlocklistConfig();
      configureBlocklist({ maxAge: 9999 });
      
      const newConfig = getBlocklistConfig();
      expect(newConfig.maxAge).toBe(9999);
      expect(newConfig.cleanupInterval).toBe(originalConfig.cleanupInterval);
    });
  });

  describe('getBlocklistStats', () => {
    it('returns empty stats for empty blocklist', () => {
      const stats = getBlocklistStats();
      expect(stats.size).toBe(0);
      expect(stats.oldestRevocationAge).toBe(0);
      expect(stats.config).toBeDefined();
    });

    it('returns correct size', () => {
      revokeToken(hashRefreshToken('token-1'));
      revokeToken(hashRefreshToken('token-2'));
      
      const stats = getBlocklistStats();
      expect(stats.size).toBe(2);
    });

    it('tracks oldest revocation age', async () => {
      revokeToken(hashRefreshToken('token-1'));
      await new Promise(resolve => setTimeout(resolve, 100));
      revokeToken(hashRefreshToken('token-2'));
      
      const stats = getBlocklistStats();
      expect(stats.oldestRevocationAge).toBeGreaterThanOrEqual(100);
      expect(stats.oldestRevocationAge).toBeLessThan(200);
    });
  });

  describe('initializeBlocklistCleanup', () => {
    it('returns cleanup task with stop method', () => {
      const task = initializeBlocklistCleanup();
      expect(task).toHaveProperty('stop');
      expect(typeof task.stop).toBe('function');
      task.stop();
    });

    it('can be stopped without errors', () => {
      const task = initializeBlocklistCleanup();
      expect(() => task.stop()).not.toThrow();
      expect(() => task.stop()).not.toThrow(); // second stop is safe
    });

    it('periodically cleans up expired tokens', async () => {
      configureBlocklist({ maxAge: 100, cleanupInterval: 150 });
      
      const hash = hashRefreshToken('token');
      revokeToken(hash);
      
      const task = initializeBlocklistCleanup();
      
      try {
        // Wait for cleanup to run
        await new Promise(resolve => setTimeout(resolve, 250));
        
        // Token should be cleaned up
        expect(getBlocklistSize()).toBe(0);
      } finally {
        task.stop();
      }
    }, 10000); // Increase timeout for this async test
  });

  describe('_clearBlocklist', () => {
    it('empties the blocklist', () => {
      revokeToken(hashRefreshToken('token-1'));
      revokeToken(hashRefreshToken('token-2'));
      expect(getBlocklistSize()).toBe(2);
      
      _clearBlocklist();
      expect(getBlocklistSize()).toBe(0);
    });

    it('makes previously blocked tokens accessible again', () => {
      const hash = hashRefreshToken('token');
      revokeToken(hash);
      expect(isTokenBlocked(hash)).toBe(true);
      
      _clearBlocklist();
      expect(isTokenBlocked(hash)).toBe(false);
    });
  });

  describe('Reuse attack prevention', () => {
    it('blocks token after first blocklist check', () => {
      const hash = hashRefreshToken('token');
      
      // Token is not blocked initially
      expect(isTokenBlocked(hash)).toBe(false);
      
      // Revoke the token
      revokeToken(hash);
      
      // Subsequent checks block the token
      expect(isTokenBlocked(hash)).toBe(true);
      expect(isTokenBlocked(hash)).toBe(true);
    });

    it('prevents multiple concurrent reuse attempts', () => {
      const hash = hashRefreshToken('token');
      revokeToken(hash);
      
      // All concurrent checks should see the token as blocked
      const results = [
        isTokenBlocked(hash),
        isTokenBlocked(hash),
        isTokenBlocked(hash),
      ];
      
      expect(results).toEqual([true, true, true]);
    });

    it('tracks multiple revoked tokens independently', () => {
      const hash1 = hashRefreshToken('token-1');
      const hash2 = hashRefreshToken('token-2');
      
      revokeToken(hash1);
      
      expect(isTokenBlocked(hash1)).toBe(true);
      expect(isTokenBlocked(hash2)).toBe(false);
      
      revokeToken(hash2);
      
      expect(isTokenBlocked(hash1)).toBe(true);
      expect(isTokenBlocked(hash2)).toBe(true);
    });
  });
});
