import { AIError, DEFAULT_RERANKING_CONFIG } from "@domain/ai"
import { createFakeAI } from "@domain/ai/testing"
import { SignalId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { SIGNAL_DISCOVERY_MIN_RELEVANCE, SIGNAL_DISCOVERY_RERANK_CANDIDATES } from "../constants.ts"
import { rerankSignalCandidatesUseCase } from "./rerank-issue-candidates.ts"

describe("rerankSignalCandidatesUseCase", () => {
  it("reranks using issue title and description only", async () => {
    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      rerank: () => Effect.succeed([{ index: 0, relevanceScore: 0.92 }]),
    })

    const result = await Effect.runPromise(
      rerankSignalCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [
          {
            signalId: SignalId("issue-1"),
            name: "Token leakage",
            description: "Agent exposed API tokens",
            score: 0.8,
          },
        ],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(aiCalls.rerank).toHaveLength(1)
    expect(aiCalls.rerank[0]?.model).toBe(DEFAULT_RERANKING_CONFIG.model)
    expect(aiCalls.rerank[0]?.provider).toBe(DEFAULT_RERANKING_CONFIG.provider)
    expect(aiCalls.rerank[0]?.documents).toEqual(["Token leakage\n\nAgent exposed API tokens"])
    expect(result).toEqual({
      matchedSignalId: "issue-1",
      similarityScore: 0.92,
    })
  })

  it("degrades to the top hybrid-search candidate when reranking is unavailable", async () => {
    const { layer: aiLayer } = createFakeAI({
      rerank: () => Effect.fail(new AIError({ message: "Voyage AI is unavailable: set LAT_VOYAGE_API_KEY." })),
    })

    const result = await Effect.runPromise(
      rerankSignalCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [
          {
            signalId: SignalId("issue-low"),
            name: "Low score",
            description: "Low-scored candidate",
            score: 0.81,
          },
          {
            signalId: SignalId("issue-top"),
            name: "Top score",
            description: "Top-scored candidate",
            score: 0.93,
          },
        ],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result).toEqual({
      matchedSignalId: "issue-top",
      similarityScore: 0.93,
    })
  })

  it("limits reranking to the top issue discovery candidates by fused score", async () => {
    const { layer: aiLayer, calls: aiCalls } = createFakeAI({
      rerank: () => Effect.succeed([{ index: SIGNAL_DISCOVERY_RERANK_CANDIDATES - 1, relevanceScore: 0.95 }]),
    })
    const candidates = Array.from({ length: SIGNAL_DISCOVERY_RERANK_CANDIDATES + 1 }, (_, index) => ({
      signalId: SignalId(`issue-${index + 1}`),
      name: `Signal ${index + 1}`,
      description: `Description ${index + 1}`,
      score: 1 - index / 100,
    }))

    const result = await Effect.runPromise(
      rerankSignalCandidatesUseCase({
        query: "agent exposes tokens",
        candidates,
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result).toEqual({
      matchedSignalId: `issue-${SIGNAL_DISCOVERY_RERANK_CANDIDATES}`,
      similarityScore: 0.95,
    })
    expect(aiCalls.rerank[0]?.documents).toHaveLength(SIGNAL_DISCOVERY_RERANK_CANDIDATES)
    expect(aiCalls.rerank[0]?.documents.at(-1)).toContain(`Signal ${SIGNAL_DISCOVERY_RERANK_CANDIDATES}`)
    expect(aiCalls.rerank[0]?.documents.join("\n")).not.toContain(`Signal ${SIGNAL_DISCOVERY_RERANK_CANDIDATES + 1}`)
  })

  it("uses SIGNAL_DISCOVERY_MIN_RELEVANCE as fixed threshold", async () => {
    const { layer: aiLayer } = createFakeAI({
      rerank: () => Effect.succeed([{ index: 0, relevanceScore: SIGNAL_DISCOVERY_MIN_RELEVANCE - 0.01 }]),
    })

    const result = await Effect.runPromise(
      rerankSignalCandidatesUseCase({
        query: "agent exposes tokens",
        candidates: [{ signalId: SignalId("issue-1"), name: "bad", description: "candidate one", score: 0.8 }],
      }).pipe(Effect.provide(aiLayer)),
    )

    expect(result).toEqual({
      matchedSignalId: null,
      similarityScore: 0,
    })
  })
})
