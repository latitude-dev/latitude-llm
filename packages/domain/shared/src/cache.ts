import { EffectService } from "@repo/effect-service"
import type { Effect } from "effect"
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

export class CacheStore extends EffectService<CacheStore, CacheStoreShape>()("@domain/shared/CacheStore") {}
