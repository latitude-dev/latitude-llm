import { CacheStore } from "@domain/shared"
import { Effect, Layer } from "effect"

/**
 * In-memory `CacheStore` for unit tests. TTLs are recorded but never expire —
 * a test that needs expiry deletes the entry from `entries` instead.
 */
export const createFakeCacheStore = (seed: Iterable<readonly [string, string]> = []) => {
  const entries = new Map<string, string>(seed)
  const ttlSeconds = new Map<string, number | undefined>()

  const layer = Layer.succeed(CacheStore, {
    get: (key) => Effect.sync(() => entries.get(key) ?? null),
    set: (key, value, options) =>
      Effect.sync(() => {
        entries.set(key, value)
        ttlSeconds.set(key, options?.ttlSeconds)
      }),
    delete: (key) =>
      Effect.sync(() => {
        entries.delete(key)
        ttlSeconds.delete(key)
      }),
  })

  return { layer, entries, ttlSeconds }
}
