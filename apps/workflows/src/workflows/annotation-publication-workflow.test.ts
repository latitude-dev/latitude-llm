import type { EnrichAnnotationForPublicationResult } from "@domain/annotations"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { callOrder, mockActivities } = vi.hoisted(() => {
  const callOrder: string[] = []
  const mockActivities = {
    enrichAnnotationForPublication: vi.fn(async (): Promise<EnrichAnnotationForPublicationResult> => {
      callOrder.push("enrichAnnotationForPublication")
      return {
        status: "enriched",
        enrichedFeedback: "Clusterable sentence",
        resolvedSessionId: "session-1",
        resolvedSpanId: "span-1",
      }
    }),
    writePublishedAnnotationScore: vi.fn(async () => {
      callOrder.push("writePublishedAnnotationScore")
    }),
  }
  return { callOrder, mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mockActivities,
}))

import { publishAnnotationWorkflow } from "./annotation-publication-workflow.ts"

describe("publishAnnotationWorkflow", () => {
  beforeEach(() => {
    callOrder.length = 0
    vi.clearAllMocks()
  })

  it("runs enrich then write when the score is still a draft", async () => {
    const result = await publishAnnotationWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({ action: "published", scoreId: "score-1" })
    expect(callOrder).toEqual(["enrichAnnotationForPublication", "writePublishedAnnotationScore"])
    expect(mockActivities.writePublishedAnnotationScore).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      enrichedFeedback: "Clusterable sentence",
      resolvedSessionId: "session-1",
      resolvedSpanId: "span-1",
    })
  })

  it("skips write when enrichment sees an already-published score", async () => {
    mockActivities.enrichAnnotationForPublication.mockImplementationOnce(async () => ({
      status: "already-published" as const,
    }))

    const result = await publishAnnotationWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })

    expect(result).toEqual({ action: "already-published", scoreId: "score-1" })
    expect(mockActivities.writePublishedAnnotationScore).not.toHaveBeenCalled()
  })

  it("skips enrichment activity when preEnrichedFeedback is provided", async () => {
    const result = await publishAnnotationWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      preEnrichedFeedback: "System-generated feedback",
    })

    expect(result).toEqual({ action: "published", scoreId: "score-1" })
    expect(callOrder).toEqual(["writePublishedAnnotationScore"])
    expect(mockActivities.enrichAnnotationForPublication).not.toHaveBeenCalled()
    expect(mockActivities.writePublishedAnnotationScore).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      enrichedFeedback: "System-generated feedback",
      resolvedSessionId: null,
      resolvedSpanId: null,
    })
  })
})
