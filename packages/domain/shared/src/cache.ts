import { Data, type Effect, ServiceMap } from "effect"

export class CacheError extends Data.TaggedError("CacheError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  get httpMessage() {
    return this.message
  }
}

export interface CacheSetOptions {
  readonly ttlSeconds?: number
}

export interface CacheStoreShape {
  get(key: string): Effect.Effect<string | null, CacheError>
  set(key: string, value: string, options?: CacheSetOptions): Effect.Effect<void, CacheError>
  delete(key: string): Effect.Effect<void, CacheError>
}

export class CacheStore extends ServiceMap.Service<CacheStore, CacheStoreShape>()("@domain/shared/CacheStore") {}
