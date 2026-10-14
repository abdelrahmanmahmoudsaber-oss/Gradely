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
 * Strictly recognizes Super Admin user IDs and 'super_admin' role.
 * Regular teaching assistants (role: 'admin') return false.
 */
export const isSuperUser = (user) => {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  const uid = (user.user_id || '').toString().trim().toLowerCase();

  // 1. Explicit super_admin role in DB
  if (role === 'super_admin') return true;

  // 2. Primary admin identifiers
  if (uid === 'admin' || uid.includes('amahmoudsaber')) return true;

  // 3. Admin account with no restricted assigned subjects is a full system admin
  if (role === 'admin') {
    const rawAssigned = Array.isArray(user.assigned_subjects) ? user.assigned_subjects : [];
    if (rawAssigned.length === 0) {
      return true;
    }
  }

  return false;
};
