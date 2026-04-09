import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockActivities } = vi.hoisted(() => {
  const mockActivities = {
    runFlagger: vi.fn(async () => ({ matched: false })),
    runAnnotate: vi.fn(async () => ({
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
    expect(mockActivities.runAnnotate).not.toHaveBeenCalled()
  })

  it("calls annotate and returns annotated when flagger returns matched=true", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.runAnnotate.mockResolvedValueOnce({
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
    expect(mockActivities.runAnnotate).toHaveBeenCalledTimes(1)
    expect(mockActivities.runAnnotate).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "refusal",
    })
  })

  it("returns annotated with wasCreated=false when annotate returns existing draft", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.runAnnotate.mockResolvedValueOnce({
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
    expect(mockActivities.runAnnotate).toHaveBeenCalledTimes(1)
  })

  it("propagates annotate errors for Temporal retry", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })
    mockActivities.runAnnotate.mockRejectedValueOnce(new Error("Annotator failed"))

    await expect(
      systemQueueFlaggerWorkflow({
        organizationId: "org-1",
        projectId: "proj-1",
        traceId: "trace-1",
        queueSlug: "frustration",
      }),
    ).rejects.toThrow("Annotator failed")

    expect(mockActivities.runFlagger).toHaveBeenCalledTimes(1)
    expect(mockActivities.runAnnotate).toHaveBeenCalledTimes(1)
  })

  it("handles different queue slugs correctly", async () => {
    mockActivities.runFlagger.mockResolvedValueOnce({ matched: true })

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
    expect(mockActivities.runAnnotate).toHaveBeenCalledWith({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-1",
      queueSlug: "tool-call-errors",
    })
  })
})
