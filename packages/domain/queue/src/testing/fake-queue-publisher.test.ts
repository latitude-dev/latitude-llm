import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createFakeQueuePublisher } from "./fake-queue-publisher.ts"

describe("createFakeQueuePublisher", () => {
  it("records every publish in the published array", async () => {
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      publisher.publish("evaluations", "automaticRefreshAlignment", {
        organizationId: "o",
        projectId: "p",
        issueId: "i",
        evaluationId: "e",
      }),
    )
    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i", evaluationId: "e" },
        { dedupeKey: "k" },
      ),
    )

    expect(published).toHaveLength(2)
  })

  it("collapses repeated publishes with the same dedupeKey to the latest payload", async () => {
    const { publisher, getPublishedByDedupeKey, listDeduped } = createFakeQueuePublisher()

    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i1", evaluationId: "e" },
        { dedupeKey: "dup", debounceMs: 1000 },
      ),
    )
    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i2", evaluationId: "e" },
        { dedupeKey: "dup", debounceMs: 1000 },
      ),
    )

    const latest = getPublishedByDedupeKey("evaluations", "dup")
    expect(latest).toBeDefined()
    expect((latest?.payload as { issueId: string }).issueId).toBe("i2")
    expect(listDeduped()).toHaveLength(1)
  })

  it("keeps different dedupeKeys separate", async () => {
    const { publisher, listDeduped } = createFakeQueuePublisher()

    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i", evaluationId: "a" },
        { dedupeKey: "a" },
      ),
    )
    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i", evaluationId: "b" },
        { dedupeKey: "b" },
      ),
    )

    expect(listDeduped()).toHaveLength(2)
  })

  it("preserves the first payload for repeated publishes with the same dedupeKey + throttleMs", async () => {
    const { publisher, getPublishedByDedupeKey, listDeduped } = createFakeQueuePublisher()

    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i-first", evaluationId: "e" },
        { dedupeKey: "rl", throttleMs: 1000 },
      ),
    )
    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i-second", evaluationId: "e" },
        { dedupeKey: "rl", throttleMs: 1000 },
      ),
    )
    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i-third", evaluationId: "e" },
        { dedupeKey: "rl", throttleMs: 1000 },
      ),
    )

    const pending = getPublishedByDedupeKey("evaluations", "rl")
    expect(pending).toBeDefined()
    expect((pending?.payload as { issueId: string }).issueId).toBe("i-first")
    expect(listDeduped()).toHaveLength(1)
  })

  it("records throttleMs on the published message alongside dedupeKey", async () => {
    const { publisher, published } = createFakeQueuePublisher()

    await Effect.runPromise(
      publisher.publish(
        "evaluations",
        "automaticRefreshAlignment",
        { organizationId: "o", projectId: "p", issueId: "i", evaluationId: "e" },
        { dedupeKey: "k", throttleMs: 3600000 },
      ),
    )

    expect(published[0]?.options).toEqual({ dedupeKey: "k", throttleMs: 3600000 })
  })

  it("ignores publishes without a dedupeKey in the deduped view", async () => {
    const { publisher, published, listDeduped } = createFakeQueuePublisher()

    await Effect.runPromise(
      publisher.publish("evaluations", "automaticRefreshAlignment", {
        organizationId: "o",
        projectId: "p",
        issueId: "i",
        evaluationId: "e",
      }),
    )

    expect(published).toHaveLength(1)
    expect(listDeduped()).toHaveLength(0)
  })
})
