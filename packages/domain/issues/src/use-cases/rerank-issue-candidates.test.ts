import { createFakeAI } from "@domain/ai/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  ISSUE_DISCOVERY_MIN_RELEVANCE,
  ISSUE_DISCOVERY_RERANK_CANDIDATES,
  ISSUE_DISCOVERY_RERANK_MODEL,
} from "../constants.ts"
import { rerankIssueCandidatesUseCase } from "./rerank-issue-candidates.ts"

describe("rerankIssueCandidatesUseCase", () => {
  it("reranks using issue title and description only", async () => {
    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      rerank: () => Effect.succeed([{ index: 0, relevanceScore: 0.92 }]),
    })

    const result = await Effect.runPromise(
      rerankIssueCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [
          {
            uuid: "issue-1",
            title: "Token leakage",
            description: "Agent exposed API tokens",
            score: 0.8,
          },
        ],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(aiCalls.rerank).toHaveLength(1)
    expect(aiCalls.rerank[0]?.model).toBe(ISSUE_DISCOVERY_RERANK_MODEL)
    expect(aiCalls.rerank[0]?.documents).toEqual(["Title: Token leakage\n\nDescription: Agent exposed API tokens"])
    expect(result).toEqual({
      matchedIssueUuid: "issue-1",
      similarityScore: 0.92,
    })
  })

  it("limits reranking to the top issue discovery candidates by fused score", async () => {
    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      rerank: () => Effect.succeed([{ index: ISSUE_DISCOVERY_RERANK_CANDIDATES - 1, relevanceScore: 0.95 }]),
    })
    const candidates = Array.from({ length: ISSUE_DISCOVERY_RERANK_CANDIDATES + 1 }, (_, index) => ({
      uuid: `issue-${index + 1}`,
      title: `Issue ${index + 1}`,
      description: `Description ${index + 1}`,
      score: 1 - index / 100,
    }))

    const result = await Effect.runPromise(
      rerankIssueCandidatesUseCase({
        query: "agent exposes tokens",
        candidates,
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result).toEqual({
      matchedIssueUuid: `issue-${ISSUE_DISCOVERY_RERANK_CANDIDATES}`,
      similarityScore: 0.95,
    })
    expect(aiCalls.rerank[0]?.documents).toHaveLength(ISSUE_DISCOVERY_RERANK_CANDIDATES)
    expect(aiCalls.rerank[0]?.documents.at(-1)).toContain(`Issue ${ISSUE_DISCOVERY_RERANK_CANDIDATES}`)
    expect(aiCalls.rerank[0]?.documents.join("\n")).not.toContain(`Issue ${ISSUE_DISCOVERY_RERANK_CANDIDATES + 1}`)
  })

  it("uses ISSUE_DISCOVERY_MIN_RELEVANCE as fixed threshold", async () => {
    const { layer: aiLayer } = createFakeAI({
      rerank: () => Effect.succeed([{ index: 0, relevanceScore: ISSUE_DISCOVERY_MIN_RELEVANCE - 0.01 }]),
    })

    const result = await Effect.runPromise(
      rerankIssueCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [{ uuid: "issue-1", title: "bad", description: "candidate one", score: 0.8 }],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result).toEqual({
      matchedIssueUuid: null,
      similarityScore: 0,
    })
  })
})
