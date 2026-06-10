import { AI, AIError, type AIShape } from "@domain/ai"
import { parseSearchQuery, TRACE_SEARCH_EMBEDDING_DIMENSIONS } from "@domain/spans"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { planSearch } from "./search-plan.ts"

const mockAILayer = Layer.succeed(AI, {
  generate: () => Effect.fail(new AIError({ message: "Generate not implemented in mock" })),
  embed: () => Effect.succeed({ embedding: new Array(TRACE_SEARCH_EMBEDDING_DIMENSIONS).fill(0.1) }),
  rerank: () => Effect.fail(new AIError({ message: "Rerank not implemented in mock" })),
} as AIShape)

describe("planSearch", () => {
  it("applies the shared-message semantic cap after joining to usable occurrences", async () => {
    const plan = await Effect.runPromise(planSearch(parseSearchQuery("needle")).pipe(Effect.provide(mockAILayer)))
    const normalizedSql = plan.subquery.replace(/\s+/g, " ")

    const messageEmbeddingsIndex = normalizedSql.indexOf("FROM message_embeddings")
    const occurrenceJoinIndex = normalizedSql.indexOf("ON o.content_hash = e.content_hash")
    const roleFilterIndex = normalizedSql.indexOf("WHERE o.role IN ('user', 'assistant')")
    const limitIndex = normalizedSql.indexOf("LIMIT {semanticScanLimit:UInt32}")

    expect(messageEmbeddingsIndex).toBeGreaterThanOrEqual(0)
    expect(occurrenceJoinIndex).toBeGreaterThan(messageEmbeddingsIndex)
    expect(roleFilterIndex).toBeGreaterThan(occurrenceJoinIndex)
    expect(limitIndex).toBeGreaterThan(roleFilterIndex)
  })
})
