import { DistributedLockRepository, type ProjectId } from "@domain/shared"
import { Effect } from "effect"
import { IssueDiscoveryLockUnavailableError } from "./errors.ts"

export interface IssueDiscoveryLockInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly lockKey: string
  readonly ttlSeconds: number
}

export const issueDiscoveryLockKey = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly lockKey: string
}) => `org:${input.organizationId}:issues:discovery:${input.projectId}:${input.lockKey}`

export const withIssueDiscoveryLock = <A, E, R>(input: IssueDiscoveryLockInput, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const locks = yield* DistributedLockRepository
    return yield* locks
      .withLock({ key: issueDiscoveryLockKey(input), ttlSeconds: input.ttlSeconds }, effect)
      .pipe(
        Effect.catchTag("DistributedLockUnavailableError", () =>
          Effect.fail(new IssueDiscoveryLockUnavailableError({ projectId: input.projectId, lockKey: input.lockKey })),
        ),
      )
  })
