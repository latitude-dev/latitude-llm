import { CacheStore } from "@domain/shared"
import { Effect, Layer } from "effect"

export function createBenchmarkCacheLayer() {
  const values = new Map<string, string>()

  return Layer.succeed(CacheStore, {
    get: (key: string) => Effect.succeed(values.get(key) ?? null),
    set: (key: string, value: string) =>
      Effect.sync(() => {
        values.set(key, value)
      }),
    delete: (key: string) =>
      Effect.sync(() => {
        values.delete(key)
      }),
  })
}
