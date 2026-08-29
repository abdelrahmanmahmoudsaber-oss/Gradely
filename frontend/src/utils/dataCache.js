/**
 * Centralized In-Memory Client Cache for Maximum Egress Reduction
 * Stores query results in memory to eliminate redundant requests across re-renders,
 * tab switches, and component navigations.
 * Zero-destruction: Only caches non-sensitive academic & structural data.
 * Passwords and auth secrets are NEVER stored in cache.
 */

const memoryCache = new Map();

export const cacheManager = {
  get: (key) => {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    return entry.data;
  },

  set: (key, data) => {
    memoryCache.set(key, { data, timestamp: Date.now() });
  },

  has: (key) => memoryCache.has(key),

  invalidate: (keyOrPrefix) => {
    if (!keyOrPrefix) return;
    for (const key of memoryCache.keys()) {
      if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
        memoryCache.delete(key);
      }
    }
  },

  clear: () => {
    memoryCache.clear();
  }
};
