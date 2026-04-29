import { beforeEach, describe, expect, it, vi } from "vitest"

const TEST_TRACE_CREATED_AT = "2024-01-15T10:00:00.000Z"

const { mockActivities } = vi.hoisted(() => {
  const mockActivities = {
    runFlagger: vi.fn(async (): Promise<{ matched: boolean }> => ({ matched: false })),
    draftAnnotate: vi.fn(async () => ({
      traceId: "trace-1",
      feedback: "Test feedback",
      traceCreatedAt: "2024-01-15T10:00:00.000Z",
      scoreId: "score-default",
    })),
    saveAnnotation: vi.fn(async () => ({
      flaggerId: "flagger-1",
      traceId: "trace-1",
      draftAnnotationId: "draft-1",
    })),
  }

  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  log: { info: vi.fn() },
  proxyActivities: () => mockActivities,
}))

import { flaggerWorkflow } from "./flagger-workflow.ts"

const FLAGGER_ID = "flagger-1"

describe("flaggerWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns not_matched when flagger returns matched=false", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: false })

    const result = await flaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerId: FLAGGER_ID,
      flaggerSlug: "empty-response",
    })

    expect(result).toEqual({
      action: "not_matched",
      flaggerId: FLAGGER_ID,
      flaggerSlug: "empty-response",
      traceId: "trace-1",
      durationMs: expect.any(Number),
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.runFlagger).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "empty-response",
    })
    expect(mockActivities.draftAnnotate).not.toHaveBeenCalled()
    expect(mockActivities.saveAnnotation).not.toHaveBeenCalled()
  })

  it("calls draftAnnotate and saveAnnotation when flagger returns matched=true", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      traceId: "trace-1",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
      scoreId: "score-from-draft",
    })
    mockActivities.saveAnnotation.mockResolvedValueOnce({
      flaggerId: FLAGGER_ID,
      traceId: "trace-1",
      draftAnnotationId: "draft-456",
    })

    const result = await flaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerId: FLAGGER_ID,
      flaggerSlug: "refusal",
    })

    expect(result).toEqual({
      action: "annotated",
      flaggerId: FLAGGER_ID,
      flaggerSlug: "refusal",
      traceId: "trace-1",
      draftAnnotationId: "draft-456",
      durationMs: expect.any(Number),
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.runFlagger).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "refusal",
    })
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "refusal",
    })
    expect(mockActivities.saveAnnotation).toHaveBeenCalledTimes(1)
    // The scoreId emitted by draftAnnotate must flow verbatim into
    // saveAnnotation so the LLM telemetry span and the persisted score row
    // share the same id (see PRD: "Identity strategy").
    expect(mockActivities.saveAnnotation).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerId: FLAGGER_ID,
      flaggerSlug: "refusal",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
      scoreId: "score-from-draft",
    })
  })

  it("propagates draftAnnotate errors for Temporal retry", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockRejectedValueOnce(new Error("Draft annotator failed"))

    await expect(
      flaggerWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        traceId: "trace-1",
        flaggerId: FLAGGER_ID,
        flaggerSlug: "frustration",
      }),
    ).rejects.toThrow("Draft annotator failed")

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.saveAnnotation).not.toHaveBeenCalled()
  })

  it("propagates saveAnnotation errors for Temporal retry", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      traceId: "trace-1",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
      scoreId: "score-save-failure",
    })
    mockActivities.saveAnnotation.mockRejectedValueOnce(new Error("Save failed"))

    await expect(
      flaggerWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        traceId: "trace-1",
        flaggerId: FLAGGER_ID,
        flaggerSlug: "frustration",
      }),
    ).rejects.toThrow("Save failed")

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.saveAnnotation).toHaveBeenCalledTimes(1)
  })

  it("handles different flagger slugs correctly", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      traceId: "trace-1",
      feedback: "Tool call error feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
      scoreId: "score-tool",
    })
    mockActivities.saveAnnotation.mockResolvedValueOnce({
      flaggerId: "flagger-tool",
      traceId: "trace-1",
      draftAnnotationId: "draft-tool",
    })

    await flaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerId: "flagger-tool",
      flaggerSlug: "tool-call-errors",
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "tool-call-errors",
    })
    expect(mockActivities.draftAnnotate).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerSlug: "tool-call-errors",
    })
    expect(mockActivities.saveAnnotation).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      flaggerId: "flagger-tool",
      flaggerSlug: "tool-call-errors",
      feedback: "Tool call error feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
      scoreId: "score-tool",
    })
  })
})
