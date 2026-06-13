import type { OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

export interface MessageEmbedding {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly contentHash: string
  readonly embedding: readonly number[]
  readonly embeddingModel: string
  readonly insertedAt: Date
}

export interface MessageEmbeddingUpsert {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly contentHash: string
  readonly embedding: readonly number[]
  readonly embeddingModel: string
  readonly insertedAt?: Date
}

export interface MessageEmbeddingRepositoryShape {
  findByHashes(args: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly contentHashes: readonly string[]
    // Pushes the `embedding_model` filter into SQL so the read uses the full
    // (org, project, model, content_hash) primary key instead of scanning every
    // model for the org+project. Pass it whenever the active model is known.
    readonly embeddingModel?: string
  }): Effect.Effect<readonly MessageEmbedding[], RepositoryError>

  upsertMany(rows: readonly MessageEmbeddingUpsert[]): Effect.Effect<void, RepositoryError>
}

export class MessageEmbeddingRepository extends Context.Service<
  MessageEmbeddingRepository,
  MessageEmbeddingRepositoryShape
>()("@domain/spans/MessageEmbeddingRepository") {}
