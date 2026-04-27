import { Context, type Effect } from "effect"
import type { CacheError } from "./errors.ts"

export { CacheError } from "./errors.ts"

export interface CacheSetOptions {
  readonly ttlSeconds?: number
}

export interface CacheStoreShape {
  get(key: string): Effect.Effect<string | null, CacheError>
  set(key: string, value: string, options?: CacheSetOptions): Effect.Effect<void, CacheError>
  delete(key: string): Effect.Effect<void, CacheError>
}

export class CacheStore extends Context.Service<CacheStore, CacheStoreShape>()("@domain/shared/CacheStore") {}
