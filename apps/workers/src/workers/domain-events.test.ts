import type { EventEnvelope } from "@domain/events"
import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createDomainEventsWorker, ISSUE_REFRESH_DEBOUNCE_MS, TRACE_END_DEBOUNCE_MS } from "./domain-events.ts"

type AnyTaskHandlers = Record<string, (payload: unknown) => Effect.Effect<void, unknown>>

class TestQueueConsumer implements QueueConsumer {
  handlers: AnyTaskHandlers | null = null
  start() {
    return Effect.void
  }
  stop() {
    return Effect.void
  }
  subscribe<T extends QueueName>(_queue: T, handlers: TaskHandlers<T>) {
    this.handlers = handlers as unknown as AnyTaskHandlers
  }

  async dispatchTask(task: string, payload: unknown): Promise<void> {
    const handler = this.handlers?.[task]
    if (!handler) throw new Error(`No handler for task ${task}`)
    await Effect.runPromise(handler(payload))
  }

  dispatchTaskEffect(task: string, payload: unknown): Effect.Effect<void, unknown> {
    const handler = this.handlers?.[task]
    if (!handler) throw new Error(`No handler for task ${task}`)
    return handler(payload)
  }
}

const makeEnvelope = (name: string, payload: Record<string, unknown>, organizationId = "org-1"): EventEnvelope => ({
  id: `evt-${Date.now()}`,
  event: { name, organizationId, payload },
  occurredAt: new Date(),
})

const envelopeToDispatchPayload = (envelope: EventEnvelope) => ({
  id: envelope.id,
  event: envelope.event,
  occurredAt: envelope.occurredAt.toISOString(),
})

describe("domain-events dispatcher", () => {
  it("routes MagicLinkEmailRequested to magic-link-email:send", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({ consumer, publisher })

    const envelope = makeEnvelope("MagicLinkEmailRequested", {
      email: "a@b.com",
      magicLinkUrl: "https://x",
      authIntentId: null,
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("magic-link-email")
    expect(published[0]?.task).toBe("send")
    expect(published[0]?.payload).toEqual({
      email: "a@b.com",
      magicLinkUrl: "https://x",
      authIntentId: null,
    })
  })

  it("routes OrganizationCreated to api-keys:create with default key name", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({ consumer, publisher })

    const envelope = makeEnvelope(
      "OrganizationCreated",
      { organizationId: "org-new", name: "Acme", slug: "acme" },
      "org-new",
    )

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("api-keys")
    expect(published[0]?.task).toBe("create")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-new",
      name: "Default API Key",
    })
  })

  it("routes UserDeletionRequested to user-deletion:delete", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({
      consumer,
      publisher,
    })

    const envelope = makeEnvelope("UserDeletionRequested", {
      organizationId: "org-1",
      userId: "u-1",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("user-deletion")
    expect(published[0]?.task).toBe("delete")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-1",
      userId: "u-1",
    })
  })

  it("routes SpanIngested to live-traces:end with dedupeKey and debounceMs", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({
      consumer,
      publisher,
    })

    const envelope = makeEnvelope("SpanIngested", {
      projectId: "proj-1",
      traceId: "trace-abc",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("live-traces")
    expect(published[0]?.task).toBe("end")
    expect(published[0]?.payload).toEqual({
      projectId: "proj-1",
      traceId: "trace-abc",
    })
    expect(published[0]?.options?.dedupeKey).toBe("live-traces:end:org-1:proj-1:trace-abc")
    expect(published[0]?.options?.debounceMs).toBe(TRACE_END_DEBOUNCE_MS)
  })

  it("routes TraceEnded to 3 targets", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({
      consumer,
      publisher,
    })

    const envelope = makeEnvelope("TraceEnded", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-abc",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(3)
    expect(published.map((p) => `${p.queue}:${p.task}`).sort()).toEqual([
      "live-annotation-queues:curate",
      "live-evaluations:enqueue",
      "system-annotation-queues:flag",
    ])
  })

  it("fails on unhandled events", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeQueuePublisher()

    createDomainEventsWorker({
      consumer,
      publisher,
    })

    const envelope = makeEnvelope("UnknownEvent", { foo: "bar" })
    const effect = consumer.dispatchTaskEffect("dispatch", envelopeToDispatchPayload(envelope))

    const result = await Effect.runPromise(
      effect.pipe(
        Effect.match({
          onFailure: (error) => ({
            ok: false as const,
            error: error as { _tag: string; name: string },
          }),
          onSuccess: () => ({ ok: true as const, error: null }),
        }),
      ),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error._tag).toBe("UnhandledEventError")
      expect(result.error.name).toBe("UnknownEvent")
    }
  })

  it("routes ScoreImmutable to analytic-scores:save and issue refresh when issue ownership exists", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({ consumer, publisher })

    const envelope = makeEnvelope("ScoreImmutable", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
      issueId: "issue-42",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(2)
    expect(published[0]?.queue).toBe("analytic-scores")
    expect(published[0]?.task).toBe("save")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-1",
    })
    expect(published[1]?.queue).toBe("issues")
    expect(published[1]?.task).toBe("refresh")
    expect(published[1]?.options?.dedupeKey).toBe("issues:refresh:issue-42")
    expect(published[1]?.options?.debounceMs).toBe(ISSUE_REFRESH_DEBOUNCE_MS)
  })

  it("routes ScoreImmutable to analytic-scores:save without issue refresh when no issue is attached", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher, published } = createFakeQueuePublisher()

    createDomainEventsWorker({ consumer, publisher })

    const envelope = makeEnvelope("ScoreImmutable", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-2",
      issueId: null,
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("analytic-scores")
    expect(published[0]?.task).toBe("save")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-2",
    })
  })
})
