import type { IssueId, NotFoundError, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

// Tiny read-only view of the issues domain so evaluations can depend on the
// data it needs without importing `@domain/issues` directly and creating a
// cyclic workspace dependency.

export interface EvaluationIssue {
  readonly id: IssueId
  readonly projectId: string
  readonly name: string
  readonly description: string
}

export class EvaluationIssueRepository extends ServiceMap.Service<
  EvaluationIssueRepository,
  {
    findById(id: IssueId): Effect.Effect<EvaluationIssue, NotFoundError | RepositoryError, SqlClient>
  }
>()("@domain/evaluations/EvaluationIssueRepository") {}
