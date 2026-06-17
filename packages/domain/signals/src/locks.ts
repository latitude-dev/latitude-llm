import { DistributedLockRepository, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { SignalDiscoveryLockUnavailableError } from "./errors.ts"

export interface SignalDiscoveryLockInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly lockKey: string
  readonly ttlSeconds: number
}

export const signalDiscoveryLockKey = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly lockKey: string
}) => `org:${input.organizationId}:issues:discovery:${input.projectId}:${input.lockKey}`

export const withSignalDiscoveryLock = <A, E, R>(input: SignalDiscoveryLockInput, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const locks = yield* DistributedLockRepository
    return yield* locks
      .withLock({ key: signalDiscoveryLockKey(input), ttlSeconds: input.ttlSeconds }, effect)
      .pipe(
        Effect.catchTag("DistributedLockUnavailableError", () =>
          Effect.fail(new SignalDiscoveryLockUnavailableError({ projectId: input.projectId, lockKey: input.lockKey })),
        ),
      )
  })
