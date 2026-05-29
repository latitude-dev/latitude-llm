import { Context, Data, type Effect } from "effect"
import type { CacheError } from "./errors.ts"

export class DistributedLockUnavailableError extends Data.TaggedError("DistributedLockUnavailableError")<{
  readonly key: string
}> {
  readonly httpStatus = 409
  readonly httpMessage = "Distributed lock is currently unavailable"
}

export interface DistributedLockInput {
  readonly key: string
  readonly ttlSeconds: number
}

export interface DistributedLockRepositoryShape {
  withLock<A, E, R>(
    input: DistributedLockInput,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | DistributedLockUnavailableError | CacheError, R>
}

export class DistributedLockRepository extends Context.Service<
  DistributedLockRepository,
  DistributedLockRepositoryShape
>()("@domain/shared/DistributedLockRepository") {}
