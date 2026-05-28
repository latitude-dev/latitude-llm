import type { QueueConsumer, QueueName, TaskHandlers } from "@domain/queue"
import type {
  PostHogCaptureInput,
  PostHogClientShape,
  PostHogGroupIdentifyInput,
  PostHogPersonIdentifyInput,
} from "@platform/analytics-posthog"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { createPostHogAnalyticsWorker } from "./posthog-analytics.ts"

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

  dispatch(task: string, payload: unknown): Promise<void> {
    const handler = this.handlers?.[task]
    if (!handler) throw new Error(`No handler for ${task}`)
    return Effect.runPromise(handler(payload))
  }
}

interface FakePostHog extends PostHogClientShape {
  readonly captures: PostHogCaptureInput[]
  readonly groupIdentifies: PostHogGroupIdentifyInput[]
  readonly personIdentifies: PostHogPersonIdentifyInput[]
}

const createFakePostHog = (overrides?: { captureFails?: boolean }): FakePostHog => {
  const captures: PostHogCaptureInput[] = []
  const groupIdentifies: PostHogGroupIdentifyInput[] = []
  const personIdentifies: PostHogPersonIdentifyInput[] = []
  return {
    captures,
    groupIdentifies,
    personIdentifies,
    capture: async (input) => {
      if (overrides?.captureFails) throw new Error("boom")
      captures.push(input)
    },
    groupIdentify: async (input) => {
      groupIdentifies.push(input)
    },
    personIdentify: async (input) => {
      personIdentifies.push(input)
    },
    shutdown: () => Promise.resolve(),
  }
}

describe("posthog-analytics worker", () => {
  it("captures a whitelisted event with org-scoped distinctId, group, and timestamp", async () => {
    const consumer = new TestQueueConsumer()
    const posthog = createFakePostHog()
    createPostHogAnalyticsWorker({ consumer, posthog })

    const occurredAt = "2026-04-13T12:00:00.000Z"
    await consumer.dispatch("track", {
      eventName: "OrganizationCreated",
      organizationId: "org-1",
      payload: { organizationId: "org-1", name: "Acme", slug: "acme" },
      occurredAt,
    })

    expect(posthog.captures).toHaveLength(1)
    expect(posthog.captures[0]).toMatchObject({
      distinctId: "org_org-1",
      event: "OrganizationCreated",
      groups: { organization: "org-1" },
    })
    expect(posthog.captures[0]?.timestamp?.toISOString()).toBe(occurredAt)

    // OrganizationCreated also triggers a groupIdentify so the org gets a
    // name/slug in PostHog's UI.
    expect(posthog.groupIdentifies).toHaveLength(1)
    expect(posthog.groupIdentifies[0]).toEqual({
      groupType: "organization",
      groupKey: "org-1",
      properties: { name: "Acme", slug: "acme" },
    })
  })

  it("personIdentifies the user on UserSignedUp so email is set immediately", async () => {
    const consumer = new TestQueueConsumer()
    const posthog = createFakePostHog()
    createPostHogAnalyticsWorker({ consumer, posthog })

    await consumer.dispatch("track", {
      eventName: "UserSignedUp",
      organizationId: "system",
      payload: { userId: "user-1", email: "new@example.com" },
      occurredAt: "2026-04-13T12:00:00.000Z",
    })

    expect(posthog.personIdentifies).toHaveLength(1)
    expect(posthog.personIdentifies[0]).toEqual({
      distinctId: "user-1",
      properties: { email: "new@example.com" },
    })
  })

  it("personIdentifies the user on UserOnboardingCompleted so onboardingType is a person property", async () => {
    const consumer = new TestQueueConsumer()
    const posthog = createFakePostHog()
    createPostHogAnalyticsWorker({ consumer, posthog })

    await consumer.dispatch("track", {
      eventName: "UserOnboardingCompleted",
      organizationId: "system",
      payload: { userId: "user-1", stackChoice: "coding-agent-machine" },
      occurredAt: "2026-04-13T12:00:00.000Z",
    })

    expect(posthog.personIdentifies).toHaveLength(1)
    expect(posthog.personIdentifies[0]).toEqual({
      distinctId: "user-1",
      properties: { onboardingType: "code-agents" },
    })

    await consumer.dispatch("track", {
      eventName: "UserOnboardingCompleted",
      organizationId: "system",
      payload: { userId: "user-2", stackChoice: "production-agent" },
      occurredAt: "2026-04-13T12:00:00.000Z",
    })

    expect(posthog.personIdentifies[1]).toEqual({
      distinctId: "user-2",
      properties: { onboardingType: "prod-traces" },
    })
  })

  it("skips non-whitelisted events (defense-in-depth)", async () => {
    const consumer = new TestQueueConsumer()
    const posthog = createFakePostHog()
    createPostHogAnalyticsWorker({ consumer, posthog })

    await consumer.dispatch("track", {
      eventName: "TracesIngested",
      organizationId: "org-1",
      payload: { organizationId: "org-1", projectId: "p", traceIds: ["t"] },
      occurredAt: "2026-04-13T12:00:00.000Z",
    })

    expect(posthog.captures).toHaveLength(0)
    expect(posthog.groupIdentifies).toHaveLength(0)
  })

  it("swallows capture failures so the queue is not poisoned", async () => {
    const consumer = new TestQueueConsumer()
    const posthog = createFakePostHog({ captureFails: true })
    createPostHogAnalyticsWorker({ consumer, posthog })

    // Must not reject. If PostHog is down, the job completes (with a logged
    // warning) so other handlers aren't blocked and retries don't pile up.
    await expect(
      consumer.dispatch("track", {
        eventName: "ProjectCreated",
        organizationId: "org-1",
        payload: { organizationId: "org-1", projectId: "p-1", name: "P", slug: "p" },
        occurredAt: "2026-04-13T12:00:00.000Z",
      }),
    ).resolves.toBeUndefined()
  })
})
