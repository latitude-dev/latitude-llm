import type { ExperimentId, NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { Experiment } from "../entities/experiment.ts"

export interface ListExperimentsRepositoryInput {
  readonly projectId: ProjectId
  readonly limit: number
  readonly offset: number
  readonly searchQuery?: string
}

export interface ExperimentListPage {
  readonly items: readonly Experiment[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export interface ExperimentSearchResult {
  readonly id: ExperimentId
  readonly projectId: ProjectId
  readonly projectSlug: string
  readonly projectName: string
  readonly slug: string
  readonly name: string
  readonly variantCount: number
}

export interface ExperimentRepositoryShape {
  findById(id: ExperimentId): Effect.Effect<Experiment, NotFoundError | RepositoryError, SqlClient>
  findBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
  }): Effect.Effect<Experiment, NotFoundError | RepositoryError, SqlClient>
  list(input: ListExperimentsRepositoryInput): Effect.Effect<ExperimentListPage, RepositoryError, SqlClient>
  searchOrgWide(input: {
    readonly searchQuery?: string
    readonly preferProjectId?: ProjectId
    readonly limit: number
  }): Effect.Effect<readonly ExperimentSearchResult[], RepositoryError, SqlClient>
  create(experiment: Experiment): Effect.Effect<void, RepositoryError, SqlClient>
  save(experiment: Experiment): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  softDelete(id: ExperimentId): Effect.Effect<void, NotFoundError | RepositoryError, SqlClient>
  countActiveBySlug(input: {
    readonly projectId: ProjectId
    readonly slug: string
    readonly excludeId: ExperimentId
  }): Effect.Effect<number, RepositoryError, SqlClient>
}

export class ExperimentRepository extends Context.Service<ExperimentRepository, ExperimentRepositoryShape>()(
  "@domain/experiments/ExperimentRepository",
) {}
