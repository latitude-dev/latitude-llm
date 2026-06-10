import { AI, AIError, type AIShape, EMBEDDING_DIMENSIONS } from "@domain/ai"
import { parseSearchQuery } from "@domain/spans"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { planSearch } from "./search-plan.ts"

const mockAILayer = Layer.succeed(AI, {
  generate: () => Effect.fail(new AIError({ message: "Generate not implemented in mock" })),
  embed: () => Effect.succeed({ embedding: new Array(EMBEDDING_DIMENSIONS).fill(0.1) }),
  rerank: () => Effect.fail(new AIError({ message: "Rerank not implemented in mock" })),
} as AIShape)

const previousSharedReads = process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS

describe("planSearch", () => {
  afterEach(() => {
    if (previousSharedReads === undefined) {
      delete process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS
    } else {
      process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS = previousSharedReads
    }
  })

  it("uses ANN-shaped shared-message vector retrieval before occurrence fan-out", async () => {
    process.env.LAT_TRACE_SEARCH_SHARED_MESSAGE_EMBEDDINGS_READS = "true"

    const plan = await Effect.runPromise(planSearch(parseSearchQuery("needle")).pipe(Effect.provide(mockAILayer)))
    const normalizedSql = plan.subquery.replace(/\s+/g, " ")

    const messageEmbeddingsIndex = normalizedSql.indexOf("FROM message_embeddings")
    const vectorOrderIndex = normalizedSql.indexOf(
      "ORDER BY cosineDistance(embedding, {queryEmbedding:Array(Float32)}) ASC",
    )
    const vectorLimitIndex = normalizedSql.indexOf("LIMIT {semanticVectorLimit:UInt32}")
    const occurrenceJoinIndex = normalizedSql.indexOf("ON o.content_hash = e.content_hash")
    const roleFilterIndex = normalizedSql.indexOf("WHERE o.role IN ('user', 'assistant')")

    expect(messageEmbeddingsIndex).toBeGreaterThanOrEqual(0)
    expect(vectorOrderIndex).toBeGreaterThan(messageEmbeddingsIndex)
    expect(vectorLimitIndex).toBeGreaterThan(vectorOrderIndex)
    expect(occurrenceJoinIndex).toBeGreaterThan(vectorLimitIndex)
    expect(occurrenceJoinIndex).toBeGreaterThan(messageEmbeddingsIndex)
    expect(roleFilterIndex).toBeGreaterThan(occurrenceJoinIndex)
  })
})
