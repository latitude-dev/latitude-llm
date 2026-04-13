import { beforeEach, describe, expect, it, vi } from "vitest"

const TEST_TRACE_CREATED_AT = "2024-01-15T10:00:00.000Z"

const { mockActivities } = vi.hoisted(() => {
  const mockActivities = {
    runFlagger: vi.fn(async () => ({ matched: false })),
    draftAnnotate: vi.fn(async () => ({
      queueId: "queue-1",
      traceId: "trace-1",
      feedback: "Test feedback",
      traceCreatedAt: "2024-01-15T10:00:00.000Z",
    })),
    persistAnnotation: vi.fn(async () => ({
      queueId: "queue-1",
      traceId: "trace-1",
      draftAnnotationId: "draft-1",
      wasCreated: true,
    })),
  }

  return { mockActivities }
})

vi.mock("@temporalio/workflow", () => ({
  log: { info: vi.fn() },
  proxyActivities: () => mockActivities,
}))

import { systemQueueFlaggerWorkflow } from "./system-queue-flagger-workflow.ts"

describe("systemQueueFlaggerWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns not_matched when flagger returns matched=false", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: false })

    const result = await systemQueueFlaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "empty-response",
    })

    expect(result).toEqual({
      action: "not_matched",
      queueSlug: "empty-response",
      traceId: "trace-1",
      durationMs: expect.any(Number),
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.runFlagger).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "empty-response",
    })
    expect(mockActivities.draftAnnotate).not.toHaveBeenCalled()
    expect(mockActivities.persistAnnotation).not.toHaveBeenCalled()
  })

  it("calls draftAnnotate and persistAnnotation when flagger returns matched=true", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      queueId: "queue-123",
      traceId: "trace-1",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
    })
    mockActivities.persistAnnotation.mockResolvedValueOnce({
      queueId: "queue-123",
      traceId: "trace-1",
      draftAnnotationId: "draft-456",
      wasCreated: true,
    })

    const result = await systemQueueFlaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "refusal",
    })

    expect(result).toEqual({
      action: "annotated",
      queueSlug: "refusal",
      traceId: "trace-1",
      queueId: "queue-123",
      draftAnnotationId: "draft-456",
      wasCreated: true,
      durationMs: expect.any(Number),
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.runFlagger).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "refusal",
    })
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "refusal",
    })
    expect(mockActivities.persistAnnotation).toHaveBeenCalledTimes(1)
    expect(mockActivities.persistAnnotation).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "refusal",
      queueId: "queue-123",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
    })
  })

  it("returns annotated with wasCreated=false when persist returns existing draft", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      queueId: "queue-123",
      traceId: "trace-1",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
    })
    mockActivities.persistAnnotation.mockResolvedValueOnce({
      queueId: "queue-123",
      traceId: "trace-1",
      draftAnnotationId: "draft-existing",
      wasCreated: false,
    })

    const result = await systemQueueFlaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "jailbreaking",
    })

    expect(result).toEqual({
      action: "annotated",
      queueSlug: "jailbreaking",
      traceId: "trace-1",
      queueId: "queue-123",
      draftAnnotationId: "draft-existing",
      wasCreated: false,
      durationMs: expect.any(Number),
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.persistAnnotation).toHaveBeenCalledTimes(1)
  })

  it("propagates draftAnnotate errors for Temporal retry", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockRejectedValueOnce(new Error("Draft annotator failed"))

    await expect(
      systemQueueFlaggerWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        traceId: "trace-1",
        queueSlug: "frustration",
      }),
    ).rejects.toThrow("Draft annotator failed")

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.persistAnnotation).not.toHaveBeenCalled()
  })

  it("propagates persistAnnotation errors for Temporal retry", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      queueId: "queue-123",
      traceId: "trace-1",
      feedback: "Generated feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
    })
    mockActivities.persistAnnotation.mockRejectedValueOnce(new Error("Persist failed"))

    await expect(
      systemQueueFlaggerWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        traceId: "trace-1",
        queueSlug: "frustration",
      }),
    ).rejects.toThrow("Persist failed")

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.draftAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.persistAnnotation).toHaveBeenCalledTimes(1)
  })

  it("handles different queue slugs correctly", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.draftAnnotate.mockResolvedValueOnce({
      queueId: "queue-tool",
      traceId: "trace-1",
      feedback: "Tool call error feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
    })
    mockActivities.persistAnnotation.mockResolvedValueOnce({
      queueId: "queue-tool",
      traceId: "trace-1",
      draftAnnotationId: "draft-tool",
      wasCreated: true,
    })

    await systemQueueFlaggerWorkflow({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "tool-call-errors",
    })

    expect(mockActivities.runFlagger).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "tool-call-errors",
    })
    expect(mockActivities.draftAnnotate).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "tool-call-errors",
    })
    expect(mockActivities.persistAnnotation).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "tool-call-errors",
      queueId: "queue-tool",
      feedback: "Tool call error feedback",
      traceCreatedAt: TEST_TRACE_CREATED_AT,
    })
  })
})
