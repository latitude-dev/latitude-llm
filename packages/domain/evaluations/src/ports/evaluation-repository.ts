import type { EvaluationId, IssueId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"
import { z } from "zod"
import type { Evaluation } from "../entities/evaluation.ts"

export const evaluationListLifecycleSchema = z.enum(["active", "archived", "all"])
export type EvaluationListLifecycle = z.infer<typeof evaluationListLifecycleSchema>

export interface EvaluationListOptions {
  readonly limit?: number
  readonly offset?: number
  readonly lifecycle?: EvaluationListLifecycle
}

export interface EvaluationListPage {
  readonly items: readonly Evaluation[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface EvaluationRepositoryShape {
  findById(id: string): Effect.Effect<Evaluation, NotFoundError | RepositoryError, SqlClient>
  save(evaluation: Evaluation): Effect.Effect<void, RepositoryError, SqlClient>
  listByProjectId(input: {
    readonly projectId: ProjectId
    readonly options?: EvaluationListOptions
  }): Effect.Effect<EvaluationListPage, RepositoryError, SqlClient>
  listByIssueId(input: {
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly options?: EvaluationListOptions
  }): Effect.Effect<EvaluationListPage, RepositoryError, SqlClient>
  listByIssueIds(input: {
    readonly projectId: ProjectId
    readonly issueIds: readonly IssueId[]
    readonly options?: EvaluationListOptions
  }): Effect.Effect<EvaluationListPage, RepositoryError, SqlClient>
  archive(id: EvaluationId): Effect.Effect<void, RepositoryError, SqlClient>
  unarchive(id: EvaluationId): Effect.Effect<void, RepositoryError, SqlClient>
  softDelete(id: EvaluationId): Effect.Effect<void, RepositoryError, SqlClient>
  softDeleteByIssueId(input: {
    readonly projectId: ProjectId
    readonly issueId: IssueId
  }): Effect.Effect<void, RepositoryError, SqlClient>
}

export class EvaluationRepository extends ServiceMap.Service<EvaluationRepository, EvaluationRepositoryShape>()(
  "@domain/evaluations/EvaluationRepository",
) {}
