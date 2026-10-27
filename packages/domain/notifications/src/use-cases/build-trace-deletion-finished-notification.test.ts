import { describe, expect, it } from "vitest"
import { buildTraceDeletionFinishedNotification } from "./build-trace-deletion-finished-notification.ts"

const base = {
  organizationId: "o".repeat(24),
  projectId: "p".repeat(24),
  traceDeletionRequestId: "r".repeat(24),
  status: "completed" as const,
  matchedTraceCount: 42,
}

describe("buildTraceDeletionFinishedNotification", () => {
  it("notifies the user who requested the deletion, once per request", () => {
    const request = buildTraceDeletionFinishedNotification({ ...base, requestedBy: { type: "user", id: "user-1" } })

    expect(request).toMatchObject({
      userId: "user-1",
      kind: "trace-deletion.finished",
      idempotencyKey: `trace-deletion.finished:${base.traceDeletionRequestId}`,
      projectId: base.projectId,
      payload: { traceDeletionRequestId: base.traceDeletionRequestId, status: "completed", matchedTraceCount: 42 },
    })
  })

  it("notifies nobody for API key and staff deletions", () => {
    expect(
      buildTraceDeletionFinishedNotification({ ...base, requestedBy: { type: "api_key", id: "key-1" } }),
    ).toBeNull()
    expect(
      buildTraceDeletionFinishedNotification({ ...base, requestedBy: { type: "staff", id: "staff-1" } }),
    ).toBeNull()
  })
})
