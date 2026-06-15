const cache = new Map();
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export function getCachedModels(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { models: entry.models, cached: true, cachedAt: entry.cachedAt };
}

export function getStaleModels(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  return { models: entry.models, cached: true, stale: true, cachedAt: entry.cachedAt };
}

export function setCachedModels(key, models, ttlMs = DEFAULT_TTL_MS) {
  cache.set(key, {
    models,
    cachedAt: new Date(),
    expiresAt: Date.now() + ttlMs
  });
}

export function clearModelCache(keyPrefix) {
  for (const key of cache.keys()) {
    if (!keyPrefix || key.startsWith(keyPrefix)) cache.delete(key);
  }
}
