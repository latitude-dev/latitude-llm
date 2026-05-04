import type { CacheError, ProjectId } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { IssueDiscoveryLockUnavailableError } from "../errors.ts"

export interface IssueDiscoveryLockInput {
  readonly organizationId: string
  readonly projectId: ProjectId
  readonly lockKey: string
  readonly ttlSeconds: number
}

export interface IssueDiscoveryLockRepositoryShape {
  withLock<A, E, R>(
    input: IssueDiscoveryLockInput,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | IssueDiscoveryLockUnavailableError | CacheError, R>
}

export class IssueDiscoveryLockRepository extends Context.Service<
  IssueDiscoveryLockRepository,
  IssueDiscoveryLockRepositoryShape
>()("@domain/issues/IssueDiscoveryLockRepository") {}
