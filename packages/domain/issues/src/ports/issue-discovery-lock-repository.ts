import type { ConcurrentSqlTransactionError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

export interface IssueDiscoveryLockInput {
  readonly projectId: ProjectId
  readonly lockKey: string
}

export interface IssueDiscoveryLockRepositoryShape {
  withLock<A, E, R>(
    input: IssueDiscoveryLockInput,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | RepositoryError | ConcurrentSqlTransactionError, R | SqlClient>
}

export class IssueDiscoveryLockRepository extends ServiceMap.Service<
  IssueDiscoveryLockRepository,
  IssueDiscoveryLockRepositoryShape
>()("@domain/issues/IssueDiscoveryLockRepository") {}
