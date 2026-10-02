import type { QueuePublisherShape } from "@domain/queue"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { publishAgentScoreDigestNotificationRequest } from "./agent-score-digest.ts"

describe("publishAgentScoreDigestNotificationRequest", () => {
  it("does not set a BullMQ dedupeKey so failed per-project jobs can retry", async () => {
    const published: Array<{
      queue: string
      task: string
      payload: unknown
      options?: unknown
    }> = []
    const publisher: QueuePublisherShape = {
      publish: (queue, task, payload, options) =>
        Effect.sync(() => {
          published.push({ queue, task, payload, options })
        }),
      scheduleRepeatable: () => Effect.die("scheduleRepeatable should not be called"),
      close: () => Effect.void,
    }

    await Effect.runPromise(
      publishAgentScoreDigestNotificationRequest(publisher, {
        organizationId: "org-1",
        projectId: "project-1",
        windowStart: "2026-09-16",
        windowEnd: "2026-09-22",
      }),
    )

    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({
      queue: "notifications",
      task: "request-agent-score-digest-notifications",
      payload: {
        organizationId: "org-1",
        projectId: "project-1",
        windowStart: "2026-09-16",
        windowEnd: "2026-09-22",
      },
    })
    expect(published[0]?.options).toBeUndefined()
  })
})
