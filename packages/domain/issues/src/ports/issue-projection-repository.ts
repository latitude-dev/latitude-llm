import type { RepositoryError } from "@domain/shared"
import { type Effect, ServiceMap } from "effect"

export interface IssueProjectionCandidate {
  readonly uuid: string
  readonly title: string
  readonly description: string
  readonly score: number
}

export interface UpsertIssueProjectionInput {
  readonly uuid: string
  readonly title: string
  readonly description: string
  readonly vector: number[]
  readonly tenantName: string
}

export interface DeleteIssueProjectionInput {
  readonly uuid: string
  readonly tenantName: string
}

export interface HybridSearchInput {
  readonly query: string
  readonly vector: number[]
  readonly tenantName: string
  readonly alpha: number
  readonly limit: number
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
