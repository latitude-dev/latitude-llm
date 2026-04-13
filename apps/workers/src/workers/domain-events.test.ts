import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import type { EventEnvelope } from "@domain/events"
import { ISSUE_REFRESH_DEBOUNCE_MS } from "@domain/issues"
import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { SCORE_PUBLICATION_DEBOUNCE } from "@domain/scores"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createDomainEventsWorker } from "./domain-events.ts"

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

const setupDispatcher = () => {
  const consumer = new TestQueueConsumer()
  const { publisher, published } = createFakeQueuePublisher()

  createDomainEventsWorker({ consumer, publisher })

  return { consumer, published }
}

describe("domain-events dispatcher", () => {
  it("routes MagicLinkEmailRequested to magic-link-email:send", async () => {
    const { consumer, published } = setupDispatcher()
    const magicLinkHash = await Effect.runPromise(hash("https://x"))

    const envelope = makeEnvelope("MagicLinkEmailRequested", {
      email: "a@b.com",
      magicLinkUrl: "https://x",
      emailFlow: null,
      organizationId: "org-1",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("magic-link-email")
    expect(published[0]?.task).toBe("send")
    expect(published[0]?.payload).toEqual({
      email: "a@b.com",
      magicLinkUrl: "https://x",
      emailFlow: null,
      organizationId: "org-1",
    })
    expect(published[0]?.options?.dedupeKey).toBe(`emails:magic-link:${magicLinkHash}`)
  })

  it("routes OrganizationCreated to api-keys:create with default key name", async () => {
    const { consumer, published } = setupDispatcher()

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
      name: DEFAULT_API_KEY_NAME,
    })
    expect(published[0]?.options?.dedupeKey).toBe("api-keys:create:org-new")
  })

  it("routes UserDeletionRequested to user-deletion:delete", async () => {
    const { consumer, published } = setupDispatcher()

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
    expect(published[0]?.options?.dedupeKey).toBe("users:deletion:u-1")
  })

  it("routes SpanIngested to 3 targets with dedupeKey and debounceMs", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("SpanIngested", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-abc",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toEqual([
      {
        queue: "live-evaluations",
        task: "enqueue",
        payload: {
          organizationId: "org-1",
          projectId: "proj-1",
          traceId: "trace-abc",
        },
        options: {
          dedupeKey: "evaluations:live:enqueue:trace-abc",
          debounceMs: TRACE_END_DEBOUNCE_MS,
        },
      },
      {
        queue: "live-annotation-queues",
        task: "curate",
        payload: {
          organizationId: "org-1",
          projectId: "proj-1",
          traceId: "trace-abc",
        },
        options: {
          dedupeKey: "annotation-queues:live:curate:trace-abc",
          debounceMs: TRACE_END_DEBOUNCE_MS,
        },
      },
      {
        queue: "system-annotation-queues",
        task: "fanOut",
        payload: {
          organizationId: "org-1",
          projectId: "proj-1",
          traceId: "trace-abc",
        },
        options: {
          dedupeKey: "annotation-queues:system:fan-out:trace-abc",
          debounceMs: TRACE_END_DEBOUNCE_MS,
        },
      },
    ])
  })

  it("rejects legacy TraceEnded events", async () => {
    const { consumer } = setupDispatcher()

    const envelope = makeEnvelope("TraceEnded", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-abc",
    })

    const result = await Effect.runPromise(
      consumer.dispatchTaskEffect("dispatch", envelopeToDispatchPayload(envelope)).pipe(
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
      expect(result.error.name).toBe("TraceEnded")
    }
  })

  it("routes ProjectCreated to projects:provision", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope(
      "ProjectCreated",
      { organizationId: "org-1", projectId: "proj-1", name: "Project", slug: "project" },
      "org-1",
    )

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("projects")
    expect(published[0]?.task).toBe("provision")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Project",
      slug: "project",
    })
    expect(published[0]?.options?.dedupeKey).toBe("projects:provision:proj-1")
  })

  it("fails on unhandled events", async () => {
    const { consumer } = setupDispatcher()

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

  it("routes ScoreAssignedToIssue to issues:refresh with dedupe and debounce", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("ScoreAssignedToIssue", {
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-42",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("issues")
    expect(published[0]?.task).toBe("refresh")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-42",
    })
    expect(published[0]?.options?.dedupeKey).toBe("issues:refresh:issue-42")
    expect(published[0]?.options?.debounceMs).toBe(ISSUE_REFRESH_DEBOUNCE_MS)
  })

  it("routes ScoreCreated to issues:discovery, annotation-scores publish, and markReviewStarted", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("ScoreCreated", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-3",
      issueId: null,
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toEqual([
      {
        queue: "issues",
        task: "discovery",
        payload: {
          organizationId: "org-1",
          projectId: "proj-1",
          scoreId: "score-3",
          issueId: null,
        },
        options: {
          dedupeKey: "issues:discovery:score-3",
        },
      },
      {
        queue: "annotation-scores",
        task: "publishHumanAnnotation",
        payload: {
          organizationId: "org-1",
          projectId: "proj-1",
          scoreId: "score-3",
          issueId: null,
        },
        options: {
          debounceMs: SCORE_PUBLICATION_DEBOUNCE,
        },
      },
      {
        queue: "annotation-scores",
        task: "markReviewStarted",
        payload: {
          organizationId: "org-1",
          projectId: "proj-1",
          scoreId: "score-3",
          issueId: null,
        },
        options: {
          dedupeKey: "annotation-scores:mark-review-started:score-3",
        },
      },
    ])
  })
})
