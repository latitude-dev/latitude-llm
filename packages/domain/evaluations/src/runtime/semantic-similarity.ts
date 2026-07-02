import { AI, type AIProviderModelConfig, resolveEmbeddingConfig } from "@domain/ai"
import type { HostSimilarityFunction } from "@domain/sandbox"
import { cosineSimilarity, type OrganizationId, type ProjectId, TraceId } from "@domain/shared"
import { MessageEmbeddingRepository, TraceSearchRepository } from "@domain/spans"
import { hash } from "@repo/utils"
import { Effect } from "effect"

/**
 * Bounds a hostile Advanced-tab script: each distinct query embeds at most once (content-addressed),
 * but a loop could still issue many distinct queries. The embedding lane's wall-clock is the primary
 * guard; this caps the number of host round-trips per run as a secondary one.
 */
const MAX_SIMILARITY_CALLS_PER_RUN = 50

/** Rough token estimate for embedding metering — `AI.embed` does not report usage. */
const estimateEmbeddingTokens = (text: string): number => Math.ceil(text.length / 4)

interface LoadedSession {
  readonly config: AIProviderModelConfig
  readonly hashToVector: Map<string, readonly number[]>
  readonly sessionHashes: readonly string[]
}

interface BuildSemanticSimilarityHostInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /** The session's trace ids (`session.traces[].id`) — used to resolve occurrences → content hashes. */
  readonly traceIds: readonly string[]
}

/**
 * Builds the `semanticSimilarity(query)` host verb for a single sandbox run. The session's message
 * vectors are read from ingest-time `message_embeddings` (never re-embedded) via `trace_message_occurrences`,
 * memoized once per run. Only the query is ever embedded, and only on a genuine content-hash miss, so a
 * fixed literal is embedded once for the whole project and a dynamic query once per distinct value.
 * Org/project/traces come strictly from the closure — never from the script argument.
 */
export const buildSemanticSimilarityHost = ({
  organizationId,
  projectId,
  traceIds,
}: BuildSemanticSimilarityHostInput) =>
  Effect.gen(function* () {
    const embeddingRepo = yield* MessageEmbeddingRepository
    const traceSearchRepo = yield* TraceSearchRepository
    const ai = yield* AI
    const services = yield* Effect.context<never>()

    let loaded: LoadedSession | null = null
    let callCount = 0

    const ensureLoaded = (extraHashes: readonly string[]) =>
      Effect.gen(function* () {
        if (loaded !== null) {
          const missing = extraHashes.filter((contentHash) => !loaded?.hashToVector.has(contentHash))
          if (missing.length > 0) {
            const rows = yield* embeddingRepo.findByHashes({
              organizationId,
              projectId,
              contentHashes: missing,
              embeddingModel: loaded.config.model,
            })
            for (const row of rows) loaded.hashToVector.set(row.contentHash, row.embedding)
          }
          return loaded
        }

        const config = yield* resolveEmbeddingConfig()
        const occurrences = yield* traceSearchRepo.listMessageOccurrencesForTraces({
          organizationId,
          projectId,
          traceIds: traceIds.map((traceId) => TraceId(traceId)),
        })
        const sessionHashes = [...new Set(occurrences.map((occurrence) => occurrence.contentHash))]
        // Batch the query hash with the session hashes so the common single-query run does one findByHashes.
        const allHashes = [...new Set([...extraHashes, ...sessionHashes])]
        const rows =
          allHashes.length > 0
            ? yield* embeddingRepo.findByHashes({
                organizationId,
                projectId,
                contentHashes: allHashes,
                embeddingModel: config.model,
              })
            : []
        loaded = {
          config,
          hashToVector: new Map(rows.map((row) => [row.contentHash, row.embedding])),
          sessionHashes,
        }
        return loaded
      })

    const computeSimilarity = (query: string) =>
      Effect.gen(function* () {
        const queryHash = yield* hash(query)
        const session = yield* ensureLoaded([queryHash])

        // Nothing to compare against — return the lowest score without embedding the query.
        if (session.sessionHashes.length === 0) return { similarity: 0, tokens: 0 }

        let queryVector = session.hashToVector.get(queryHash)
        let tokens = 0
        if (queryVector === undefined) {
          // Embed as "document" (like the stored messages) so cosine is apples-to-apples; content-address
          // it so the same query string is never embedded twice across runs.
          const { embedding } = yield* ai.embed({
            text: query,
            provider: session.config.provider,
            model: session.config.model,
            inputType: "document",
          })
          queryVector = embedding
          tokens = estimateEmbeddingTokens(query)
          session.hashToVector.set(queryHash, embedding)
          yield* embeddingRepo.upsertMany([
            { organizationId, projectId, contentHash: queryHash, embedding, embeddingModel: session.config.model },
          ])
        }

        // Start at 0: negative cosines never lower the score, so the result stays in [0,1] and a session
        // with no (matching) vectors returns 0 — the lowest score, never a skip.
        let maxSimilarity = 0
        for (const contentHash of session.sessionHashes) {
          const vector = session.hashToVector.get(contentHash)
          if (vector !== undefined) maxSimilarity = Math.max(maxSimilarity, cosineSimilarity(queryVector, vector))
        }
        return { similarity: maxSimilarity, tokens }
      })

    const host: HostSimilarityFunction = async ({ query }) => {
      callCount += 1
      if (callCount > MAX_SIMILARITY_CALLS_PER_RUN) {
        throw new Error(`semanticSimilarity() exceeded the per-run call cap of ${MAX_SIMILARITY_CALLS_PER_RUN}`)
      }
      const startedAt = performance.now()
      const { similarity, tokens } = await Effect.runPromiseWith(services)(computeSimilarity(query))
      const duration = Math.max(0, Math.round((performance.now() - startedAt) * 1_000_000))
      return { similarity, tokens, duration, cost: 0 }
    }

    return host
  })
