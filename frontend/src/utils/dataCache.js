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

/**
 * Checks if a user is the Super Admin (مدير النظام العام).
 * Relies ONLY on the server-authoritative `role` field returned from the DB.
 * Never hardcodes user identifiers in client-side code (ISSUE-26 fix).
 */
export const isSuperUser = (user) => {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();

  // Sole authoritative check: super_admin role assigned by the database
  return role === 'super_admin';
};
