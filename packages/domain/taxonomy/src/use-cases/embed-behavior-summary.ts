import { AI } from "@domain/ai"
import { Effect } from "effect"
import { TAXONOMY_EMBEDDING_DIMENSIONS, TAXONOMY_EMBEDDING_MODEL } from "../constants.ts"
import { normalizeTaxonomyEmbedding } from "../helpers.ts"

export interface EmbedBehaviorSummaryInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly text: string
}

export interface EmbeddedBehaviorSummary {
  readonly normalizedEmbedding: number[]
  readonly embeddingModel: string
}

export const embedBehaviorSummaryUseCase = (input: EmbedBehaviorSummaryInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.sessionId", input.sessionId)
    const ai = yield* AI
    const embedding = yield* ai.embed({
      text: input.text,
      model: TAXONOMY_EMBEDDING_MODEL,
      dimensions: TAXONOMY_EMBEDDING_DIMENSIONS,
      inputType: "document",
      telemetry: {
        spanName: "taxonomy.embedBehaviorSummary",
        tags: ["taxonomy", "embedding"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          sessionId: input.sessionId,
        },
      },
    })

    return {
      normalizedEmbedding: normalizeTaxonomyEmbedding(embedding.embedding),
      embeddingModel: TAXONOMY_EMBEDDING_MODEL,
    } satisfies EmbeddedBehaviorSummary
  }).pipe(Effect.withSpan("taxonomy.embedBehaviorSummary"))
