import { createFakeAI } from "@domain/ai/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { RERANK_MODEL } from "../constants.ts"
import { rerankIssueCandidatesUseCase } from "./rerank-issue-candidates.ts"

describe("rerankIssueCandidatesUseCase", () => {
  it("uses rerank-2.5 and returns best candidate above threshold", async () => {
    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      rerank: () =>
        Effect.succeed([
          { index: 1, relevanceScore: 0.92 },
          { index: 0, relevanceScore: 0.1 },
        ]),
    })

    const result = await Effect.runPromise(
      rerankIssueCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [
          { uuid: "issue-1", title: "bad", description: "unrelated candidate", score: 0.8 },
          { uuid: "issue-2", title: "good", description: "token leakage in responses", score: 0.7 },
        ],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(aiCalls.rerank).toHaveLength(1)
    expect(aiCalls.rerank[0]?.model).toBe(RERANK_MODEL)
    expect(result).toEqual({
      matchedIssueUuid: "issue-2",
      similarityScore: 0.92,
    })
  })

  it("uses MIN_RERANK_RELEVANCE as fixed threshold", async () => {
    const { layer: aiLayer } = createFakeAI({
      rerank: () =>
        Effect.succeed([
          { index: 0, relevanceScore: 0.29 },
          { index: 1, relevanceScore: 0.2 },
        ]),
    })

    const result = await Effect.runPromise(
      rerankIssueCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [
          { uuid: "issue-1", title: "bad", description: "candidate one", score: 0.8 },
          { uuid: "issue-2", title: "good", description: "candidate two", score: 0.7 },
        ],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result).toEqual({
      matchedIssueUuid: null,
      similarityScore: 0,
    })
  })
})
