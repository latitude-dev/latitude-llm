import { createFakeAI } from "@domain/ai/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { CENTROID_EMBEDDING_DIMENSIONS, CENTROID_EMBEDDING_MODEL } from "../constants.ts"
import { embedIssueSearchQueryUseCase } from "./embed-issue-search-query.ts"

describe("embedIssueSearchQueryUseCase", () => {
  it("embeds and normalizes the issue search query using the issue centroid model", async () => {
    const { layer, calls } = createFakeAI({
      embed: () =>
        Effect.succeed({
          embedding: [3, 4],
        }),
    })

    const result = await Effect.runPromise(
      embedIssueSearchQueryUseCase({
        organizationId: "org-1",
        projectId: "project-1",
        query: "secret leakage",
      }).pipe(Effect.provide(layer)),
    )

    expect(calls.embed).toEqual([
      expect.objectContaining({
        text: "secret leakage",
        model: CENTROID_EMBEDDING_MODEL,
        dimensions: CENTROID_EMBEDDING_DIMENSIONS,
      }),
    ])
    expect(result.query).toBe("secret leakage")
    expect(result.normalizedEmbedding[0]).toBeCloseTo(0.6)
    expect(result.normalizedEmbedding[1]).toBeCloseTo(0.8)
  })
})
