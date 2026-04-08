import type { RepositoryError } from "@domain/shared"
import { type Effect } from "effect"
import { EffectService } from "@repo/effect-service"

export interface IssueProjectionCandidate {
  readonly uuid: string
  readonly title: string
  readonly description: string
  readonly score: number
}

export interface UpsertIssueProjectionInput {
  readonly projectId: string
  readonly uuid: string
  readonly title: string
  readonly description: string
  readonly vector: number[]
}

export interface DeleteIssueProjectionInput {
  readonly projectId: string
  readonly uuid: string
}

export interface HybridSearchInput {
  readonly projectId: string
  readonly query: string
  readonly vector: number[]
}

export type IssuesCollectionProperties = {
  title: string // searchable issue title mirrored from Postgres
  description: string // searchable issue description mirrored from Postgres
}

export class IssueProjectionRepository extends EffectService<
  IssueProjectionRepository,
  {
    upsert(input: UpsertIssueProjectionInput): Effect.Effect<void, RepositoryError>
    delete(input: DeleteIssueProjectionInput): Effect.Effect<void, RepositoryError>
    hybridSearch(input: HybridSearchInput): Effect.Effect<readonly IssueProjectionCandidate[], RepositoryError>
  }
>()("@domain/issues/IssueProjectionRepository") {}
