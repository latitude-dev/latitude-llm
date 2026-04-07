import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import type { EventEnvelope } from "@domain/events"
import { ISSUE_REFRESH_DEBOUNCE_MS } from "@domain/issues"
import type {
  PublishOptions,
  QueueConsumer,
  QueueName,
  TaskHandlers,
  TaskName,
  TaskPayload,
  WorkflowStarterShape,
} from "@domain/queue"
import { QueuePublishError, WorkflowStartError } from "@domain/queue"
import { createFakeQueuePublisher } from "@domain/queue/testing"
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
  const startedWorkflows: Array<{
    readonly workflow: string
    readonly input: unknown
    readonly options: { readonly workflowId: string }
  }> = []
  const workflowStarter: WorkflowStarterShape = {
    start: (workflow, input, options) =>
      Effect.sync(() => {
        startedWorkflows.push({ workflow, input, options })
      }),
  }

  createDomainEventsWorker({ consumer, publisher, workflowStarter })

  return { consumer, published, startedWorkflows }
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

  it("routes SpanIngested to live-traces:end with dedupeKey and debounceMs", async () => {
    const { consumer, published } = setupDispatcher()

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
    expect(published[0]?.options?.dedupeKey).toBe("traces:live:end:trace-abc")
    expect(published[0]?.options?.debounceMs).toBe(TRACE_END_DEBOUNCE_MS)
  })

  it("routes TraceEnded to 3 targets", async () => {
    const { consumer, published } = setupDispatcher()

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
    expect(published.find((p) => p.queue === "live-evaluations")?.options?.dedupeKey).toBe(
      "trace-ended:live-evaluations:org-1:proj-1:trace-abc",
    )
    expect(published.find((p) => p.queue === "live-annotation-queues")?.options?.dedupeKey).toBe(
      "trace-ended:live-annotation-queues:org-1:proj-1:trace-abc",
    )
    expect(published.find((p) => p.queue === "system-annotation-queues")?.options?.dedupeKey).toBe(
      "trace-ended:system-annotation-queues:org-1:proj-1:trace-abc",
    )
  })

  it("TraceEnded completes other legs when one leg fails transiently then succeeds", async () => {
    const consumer = new TestQueueConsumer()
    let liveEvalAttempts = 0
    const { publisher: basePublisher, published } = createFakeQueuePublisher()
    const publisher = {
      ...basePublisher,
      publish: <T extends QueueName, K extends TaskName<T>>(
        queue: T,
        task: K,
        payload: TaskPayload<T, K>,
        options?: PublishOptions,
      ) => {
        if (queue === "live-evaluations") {
          liveEvalAttempts++
          if (liveEvalAttempts < 3) {
            return Effect.fail(
              new QueuePublishError({
                cause: new Error("redis hiccup"),
                queue: "live-evaluations",
              }),
            )
          }
        }
        return basePublisher.publish(queue, task, payload, options)
      },
    }
    const workflowStarter: WorkflowStarterShape = {
      start: () => Effect.void,
    }
    createDomainEventsWorker({ consumer, publisher, workflowStarter })

    const envelope = makeEnvelope("TraceEnded", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-abc",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(3)
    expect(liveEvalAttempts).toBe(3)
  })

  it("TraceEnded fails after retries but still publishes successful legs", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher: basePublisher, published } = createFakeQueuePublisher()
    const publisher = {
      ...basePublisher,
      publish: <T extends QueueName, K extends TaskName<T>>(
        queue: T,
        task: K,
        payload: TaskPayload<T, K>,
        options?: PublishOptions,
      ) => {
        if (queue === "live-evaluations") {
          return Effect.fail(
            new QueuePublishError({
              cause: new Error("persistent failure"),
              queue: "live-evaluations",
            }),
          )
        }
        return basePublisher.publish(queue, task, payload, options)
      },
    }
    const workflowStarter: WorkflowStarterShape = {
      start: () => Effect.void,
    }
    createDomainEventsWorker({ consumer, publisher, workflowStarter })

    const envelope = makeEnvelope("TraceEnded", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-abc",
    })

    const effect = consumer.dispatchTaskEffect("dispatch", envelopeToDispatchPayload(envelope))
    const result = await Effect.runPromise(
      effect.pipe(
        Effect.match({
          onFailure: (error) => ({ ok: false as const, error }),
          onSuccess: () => ({ ok: true as const, error: null }),
        }),
      ),
    )

    expect(result.ok).toBe(false)
    expect(published.map((p) => p.queue).sort()).toEqual(["live-annotation-queues", "system-annotation-queues"])
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

  it("routes IssueRefreshRequested to issues:refresh with dedupe and debounce", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("IssueRefreshRequested", {
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

  it("propagates WorkflowStartError from workflow starter", async () => {
    const consumer = new TestQueueConsumer()
    const { publisher } = createFakeQueuePublisher()
    const workflowStarter: WorkflowStarterShape = {
      start: () =>
        Effect.fail(
          new WorkflowStartError({
            workflow: "issueDiscoveryWorkflow",
            workflowId: "issue-discovery:org-1:proj-1:score-3",
            cause: new Error("temporal down"),
          }),
        ),
    }
    createDomainEventsWorker({ consumer, publisher, workflowStarter })

    const envelope = makeEnvelope("IssueDiscoveryRequested", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-3",
    })

    const effect = consumer.dispatchTaskEffect("dispatch", envelopeToDispatchPayload(envelope))
    const result = await Effect.runPromise(
      effect.pipe(
        Effect.match({
          onFailure: (error) => ({ ok: false as const, error }),
          onSuccess: () => ({ ok: true as const, error: null }),
        }),
      ),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(WorkflowStartError)
    }
  })

  it("starts issueDiscoveryWorkflow for IssueDiscoveryRequested", async () => {
    const { consumer, published, startedWorkflows } = setupDispatcher()

    const envelope = makeEnvelope("IssueDiscoveryRequested", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-3",
    })

    await consumer.dispatchTask("dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(0)
    expect(startedWorkflows).toEqual([
      {
        workflow: "issueDiscoveryWorkflow",
        input: {
          organizationId: "org-1",
          projectId: "proj-1",
          scoreId: "score-3",
        },
        options: {
          workflowId: "issues:discovery:score-3",
        },
      },
    ])
  })
})
