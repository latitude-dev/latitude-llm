import type { OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface MessageEmbedding {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly contentHash: string
  readonly embedding: readonly number[]
  readonly embeddingModel: string
  readonly lastSeenAt: Date
}

export interface MessageEmbeddingUpsert {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly contentHash: string
  readonly embedding: readonly number[]
  readonly embeddingModel: string
  readonly lastSeenAt?: Date
}

export interface MessageEmbeddingRepositoryShape {
  findByHashes(args: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly contentHashes: readonly string[]
  }): Effect.Effect<readonly MessageEmbedding[], RepositoryError>

  upsertMany(rows: readonly MessageEmbeddingUpsert[]): Effect.Effect<void, RepositoryError>
}

export class MessageEmbeddingRepository extends Context.Service<
  MessageEmbeddingRepository,
  MessageEmbeddingRepositoryShape
>()("@domain/spans/MessageEmbeddingRepository") {}
