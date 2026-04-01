import type { RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

export interface IssueProjectionCandidate {
  readonly uuid: string
  readonly title: string
  readonly description: string
  readonly score: number
}

interface IssueProjectionScopeInput {
  readonly organizationId: string
  readonly projectId: string
}

export interface UpsertIssueProjectionInput extends IssueProjectionScopeInput {
  readonly uuid: string
  readonly title: string
  readonly description: string
  readonly vector: number[]
}

export interface DeleteIssueProjectionInput extends IssueProjectionScopeInput {
  readonly uuid: string
}

export interface HybridSearchInput extends IssueProjectionScopeInput {
  readonly query: string
  readonly vector: number[]
}

export type IssuesCollectionProperties = {
  title: string // searchable issue title mirrored from Postgres
  description: string // searchable issue description mirrored from Postgres
}

export class IssueProjectionRepository extends ServiceMap.Service<
  IssueProjectionRepository,
  {
    upsert(input: UpsertIssueProjectionInput): Effect.Effect<void, RepositoryError>
    delete(input: DeleteIssueProjectionInput): Effect.Effect<void, RepositoryError>
    hybridSearch(input: HybridSearchInput): Effect.Effect<readonly IssueProjectionCandidate[], RepositoryError>
  }
>()("@domain/issues/IssueProjectionRepository") {}
