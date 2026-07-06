import { type AIProviderModelConfig, resolveEmbeddingConfig } from "@domain/ai"
import { type OrganizationId, type ProjectId, TraceId } from "@domain/shared"
import { MessageEmbeddingRepository, TraceSearchRepository } from "@domain/spans"
import { Effect } from "effect"

/**
 * Whether any of the given traces' messages have vectors in `message_embeddings` for the active model.
 * `trace_message_occurrences` is written at ingest even when embedding is skipped (over budget, provider
 * failure), so a semantic evaluation must gate on embeddings — not occurrences — or it would score 0
 * against nothing. Reused by the live readiness pre-check and the builder preview.
 *
 * `traceIds` is the trigger trace for the live gate; the whole session for preview.
 */
export const hasSessionEmbeddings = ({
  organizationId,
  projectId,
  traceIds,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceIds: readonly string[]
}) =>
  Effect.gen(function* () {
    if (traceIds.length === 0) return false

    const traceSearchRepo = yield* TraceSearchRepository
    const embeddingRepo = yield* MessageEmbeddingRepository
    const config: AIProviderModelConfig = yield* resolveEmbeddingConfig()

    const occurrences = yield* traceSearchRepo.listMessageOccurrencesForTraces({
      organizationId,
      projectId,
      traceIds: traceIds.map((traceId) => TraceId(traceId)),
    })
    const contentHashes = [...new Set(occurrences.map((occurrence) => occurrence.contentHash))]
    if (contentHashes.length === 0) return false

    // Model-keyed: findByHashes filters by embedding_model, so a stale-model vector never counts as ready.
    const rows = yield* embeddingRepo.findByHashes({
      organizationId,
      projectId,
      contentHashes,
      embeddingModel: config.model,
    })
    return rows.length > 0
  })
