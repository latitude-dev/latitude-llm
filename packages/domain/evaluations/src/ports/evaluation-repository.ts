import type { EvaluationId, IssueId, NotFoundError, ProjectId, RepositoryError } from "@domain/shared"
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
  findById(id: string): Effect.Effect<Evaluation, NotFoundError | RepositoryError>
  save(evaluation: Evaluation): Effect.Effect<void, RepositoryError>
  listByProjectId(input: {
    readonly projectId: ProjectId
    readonly options?: EvaluationListOptions
  }): Effect.Effect<EvaluationListPage, RepositoryError>
  listByIssueId(input: {
    readonly projectId: ProjectId
    readonly issueId: IssueId
    readonly options?: EvaluationListOptions
  }): Effect.Effect<EvaluationListPage, RepositoryError>
  archive(id: EvaluationId): Effect.Effect<void, RepositoryError>
  unarchive(id: EvaluationId): Effect.Effect<void, RepositoryError>
  softDelete(id: EvaluationId): Effect.Effect<void, RepositoryError>
  archiveByIssueId(input: {
    readonly projectId: ProjectId
    readonly issueId: IssueId
  }): Effect.Effect<void, RepositoryError>
}

export class EvaluationRepository extends ServiceMap.Service<EvaluationRepository, EvaluationRepositoryShape>()(
  "@domain/evaluations/EvaluationRepository",
) {}
