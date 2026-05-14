import { BILLING_OVERAGE_SYNC_THROTTLE_MS } from "@domain/billing"
import type { EventEnvelope } from "@domain/events"
import { ESCALATION_CHECK_THROTTLE_MS, ISSUE_REFRESH_THROTTLE_MS } from "@domain/issues"
import { createFakeQueuePublisher } from "@domain/queue/testing"
import { SCORE_PUBLICATION_DEBOUNCE } from "@domain/scores"
import { TRACE_END_DEBOUNCE_MS } from "@domain/spans"

import { hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { TestQueueConsumer } from "../testing/index.ts"
import { createDomainEventsWorker } from "./domain-events.ts"

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
  const queue = createFakeQueuePublisher()
  const { publisher, published } = queue

  createDomainEventsWorker({ consumer, publisher })

  return { consumer, published, queue }
}

describe("domain-events dispatcher", () => {
  it("routes MagicLinkEmailRequested to magic-link-email:send", async () => {
    const { consumer, published } = setupDispatcher()
    const magicLinkHash = await Effect.runPromise(hash("https://x"))

    const envelope = makeEnvelope("MagicLinkEmailRequested", {
      email: "a@b.com",
      magicLinkUrl: "https://x",
      organizationId: "org-1",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("magic-link-email")
    expect(published[0]?.task).toBe("send")
    expect(published[0]?.payload).toEqual({
      email: "a@b.com",
      magicLinkUrl: "https://x",
      organizationId: "org-1",
    })
    expect(published[0]?.options?.dedupeKey).toBe(`emails:magic-link:${magicLinkHash}`)
  })

  it("keeps OrganizationCreated as a no-op primary handler while still fanning out to PostHog", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope(
      "OrganizationCreated",
      { organizationId: "org-new", name: "Acme", slug: "acme" },
      "org-new",
    )

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("posthog-analytics")
    expect(published[0]?.task).toBe("track")
  })

  it("routes UserDeletionRequested to user-deletion:delete", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("UserDeletionRequested", {
      organizationId: "org-1",
      userId: "u-1",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    expect(published[0]?.queue).toBe("user-deletion")
    expect(published[0]?.task).toBe("delete")
    expect(published[0]?.payload).toEqual({
      organizationId: "org-1",
      userId: "u-1",
    })
    expect(published[0]?.options?.dedupeKey).toBe("users:deletion:u-1")
  })

  it("routes TracesIngested to per-trace debounced trace-end work and firstTrace check", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("TracesIngested", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceIds: ["trace-abc"],
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published.map((p) => `${p.queue}:${p.task}`).sort()).toEqual(["projects:checkFirstTrace", "trace-end:run"])

    const traceEnd = published.find((p) => p.queue === "trace-end")
    const firstTrace = published.find((p) => p.task === "checkFirstTrace")

    expect(traceEnd?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      traceId: "trace-abc",
    })
    expect(traceEnd?.options).toEqual({
      dedupeKey: "trace-end:run:org-1:proj-1:trace-abc",
      debounceMs: TRACE_END_DEBOUNCE_MS,
    })
    expect(firstTrace?.options?.dedupeKey).toBe("projects:first-trace:proj-1")
  })

  it("routes TracesIngested billing snapshots to billing:recordTraceUsageBatch", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("TracesIngested", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceIds: ["trace-abc", "trace-def"],
      billing: {
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-02-01T00:00:00.000Z",
        includedCredits: 20_000,
        overageAllowed: false,
      },
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    const billing = published.find((p) => p.queue === "billing" && p.task === "recordTraceUsageBatch")
    expect(billing).toMatchObject({
      payload: {
        organizationId: "org-1",
        projectId: "proj-1",
        traceIds: ["trace-abc", "trace-def"],
        planSlug: "free",
        planSource: "free-fallback",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-02-01T00:00:00.000Z",
        includedCredits: 20_000,
        overageAllowed: false,
      },
      options: {
        attempts: 10,
        backoff: { type: "exponential", delayMs: 1_000 },
      },
    })
  })

  it("routes ProjectCreated to projects:provision", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope(
      "ProjectCreated",
      { organizationId: "org-1", projectId: "proj-1", name: "Project", slug: "project" },
      "org-1",
    )

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    const projectsPublish = published.find((p) => p.queue === "projects")
    expect(projectsPublish?.task).toBe("provision")
    expect(projectsPublish?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      name: "Project",
      slug: "project",
    })
    expect(projectsPublish?.options?.dedupeKey).toBe("projects:provision:proj-1")
    // ProjectCreated is whitelisted for PostHog.
    expect(published.some((p) => p.queue === "posthog-analytics")).toBe(true)
  })

  it("fails on unhandled events", async () => {
    const { consumer } = setupDispatcher()

    const envelope = makeEnvelope("UnknownEvent", { foo: "bar" })
    const effect = consumer.dispatchTaskEffect("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

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

  it("fans ScoreAssignedToIssue out to refresh + throttled and debounced escalation checks", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("ScoreAssignedToIssue", {
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-42",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(2)

    const refresh = published.find((p) => p.task === "refresh")
    expect(refresh?.queue).toBe("issues")
    expect(refresh?.payload).toEqual({
      organizationId: "org-1",
      projectId: "proj-1",
      issueId: "issue-42",
    })
    expect(refresh?.options?.dedupeKey).toBe("issues:refresh:issue-42")
    expect(refresh?.options?.throttleMs).toBe(ISSUE_REFRESH_THROTTLE_MS)
    expect(refresh?.options?.debounceMs).toBeUndefined()

    const escalationChecks = published.filter((p) => p.task === "checkEscalation")
    expect(escalationChecks).toHaveLength(1)

    const throttled = escalationChecks[0]
    expect(throttled?.options?.dedupeKey).toBe("issues:check-escalation:issue-42")
    expect(throttled?.options?.throttleMs).toBe(ESCALATION_CHECK_THROTTLE_MS)
    expect(throttled?.options?.debounceMs).toBeUndefined()
  })

  it("routes IncidentCreated to notifications:create-from-incident-opened with stable dedupe key", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("IncidentCreated", {
      organizationId: "org-1",
      projectId: "proj-1",
      alertIncidentId: "ai-1",
      kind: "issue.new",
      sourceType: "issue",
      sourceId: "issue-1",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    const job = published[0]
    expect(job?.queue).toBe("notifications")
    expect(job?.task).toBe("create-from-incident-opened")
    expect(job?.payload).toEqual({ organizationId: "org-1", alertIncidentId: "ai-1" })
    expect(job?.options?.dedupeKey).toBe("notifications:incident-opened:ai-1")
  })

  it("routes IncidentClosed to notifications:create-from-incident-closed with stable dedupe key", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("IncidentClosed", {
      organizationId: "org-1",
      projectId: "proj-1",
      alertIncidentId: "ai-1",
      kind: "issue.escalating",
      sourceType: "issue",
      sourceId: "issue-1",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published).toHaveLength(1)
    const job = published[0]
    expect(job?.queue).toBe("notifications")
    expect(job?.task).toBe("create-from-incident-closed")
    expect(job?.payload).toEqual({ organizationId: "org-1", alertIncidentId: "ai-1" })
    expect(job?.options?.dedupeKey).toBe("notifications:incident-closed:ai-1")
  })

  it("fans out whitelisted events to posthog-analytics:track in addition to the primary handler", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("OrganizationCreated", { organizationId: "org-ph", name: "PH", slug: "ph" }, "org-ph")

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    const byQueue = published.map((p) => `${p.queue}:${p.task}`).sort()
    expect(byQueue).toEqual(["posthog-analytics:track"])

    const ph = published.find((p) => p.queue === "posthog-analytics")
    expect(ph?.payload).toMatchObject({
      eventName: "OrganizationCreated",
      organizationId: "org-ph",
      payload: { organizationId: "org-ph", name: "PH", slug: "ph" },
    })
    expect(ph?.options?.dedupeKey).toBe(`posthog:${envelope.id}`)
  })

  it("does NOT fan out non-whitelisted events to posthog-analytics", async () => {
    const { consumer, published } = setupDispatcher()

    // TracesIngested is handled but deliberately excluded from the PostHog whitelist.
    const envelope = makeEnvelope("TracesIngested", {
      organizationId: "org-1",
      projectId: "proj-1",
      traceIds: ["trace-x"],
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published.some((p) => p.queue === "posthog-analytics")).toBe(false)
  })

  it("routes ScoreCreated to issues:discovery, annotation-scores publish, and markReviewStarted with status-aware dedupe", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("ScoreCreated", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-3",
      issueId: null,
      status: "published",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published.map((p) => `${p.queue}:${p.task}`).sort()).toEqual([
      "annotation-scores:markReviewStarted",
      "annotation-scores:publishHumanAnnotation",
      "issues:discovery",
    ])

    const discovery = published.find((p) => p.task === "discovery")
    expect(discovery?.options?.dedupeKey).toBe("issues:discovery:score-3:published")

    const publish = published.find((p) => p.task === "publishHumanAnnotation")
    expect(publish?.options).toEqual({
      dedupeKey: "annotation-scores:publish-human:score-3",
      debounceMs: SCORE_PUBLICATION_DEBOUNCE,
    })

    const review = published.find((p) => p.task === "markReviewStarted")
    expect(review?.options?.dedupeKey).toBe("annotation-scores:mark-review-started:score-3")
  })

  it("uses distinct discovery dedupe keys for draft vs published scores", async () => {
    const { consumer, published } = setupDispatcher()

    const draftEnvelope = makeEnvelope("ScoreCreated", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-3",
      issueId: null,
      status: "draft",
    })

    const publishedEnvelope = makeEnvelope("ScoreCreated", {
      organizationId: "org-1",
      projectId: "proj-1",
      scoreId: "score-3",
      issueId: null,
      status: "published",
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(draftEnvelope))
    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(publishedEnvelope))

    const discoveryPublishes = published.filter((p) => p.task === "discovery")
    const dedupeKeys = discoveryPublishes.map((p) => p.options?.dedupeKey)
    expect(dedupeKeys).toContain("issues:discovery:score-3:draft")
    expect(dedupeKeys).toContain("issues:discovery:score-3:published")
  })

  it("routes BillingUsagePeriodUpdated to billing-overage:reportOverage when subscription overage is pending", async () => {
    const { consumer, published } = setupDispatcher()

    const envelope = makeEnvelope("BillingUsagePeriodUpdated", {
      organizationId: "org-1",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-02-01T00:00:00.000Z",
      planSource: "subscription",
      overageAllowed: true,
      includedCredits: 100_000,
      consumedCredits: 100_030,
      overageCredits: 30,
      reportedOverageCredits: 0,
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(envelope))

    expect(published[0]).toMatchObject({
      queue: "billing-overage",
      task: "reportOverage",
      payload: {
        organizationId: "org-1",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-02-01T00:00:00.000Z",
        snapshotOverageCredits: 30,
      },
      options: {
        latestThrottleMs: BILLING_OVERAGE_SYNC_THROTTLE_MS,
        attempts: 10,
        backoff: { type: "exponential", delayMs: 1_000 },
      },
    })
  })

  it("coalesces BillingUsagePeriodUpdated overage reports to the latest snapshot without sliding the window", async () => {
    const { consumer, queue } = setupDispatcher()

    const firstEnvelope = makeEnvelope("BillingUsagePeriodUpdated", {
      organizationId: "org-1",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-02-01T00:00:00.000Z",
      planSource: "subscription",
      overageAllowed: true,
      includedCredits: 100_000,
      consumedCredits: 100_030,
      overageCredits: 30,
      reportedOverageCredits: 0,
    })
    const secondEnvelope = makeEnvelope("BillingUsagePeriodUpdated", {
      organizationId: "org-1",
      periodStart: "2026-01-01T00:00:00.000Z",
      periodEnd: "2026-02-01T00:00:00.000Z",
      planSource: "subscription",
      overageAllowed: true,
      includedCredits: 100_000,
      consumedCredits: 105_000,
      overageCredits: 5_000,
      reportedOverageCredits: 0,
    })

    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(firstEnvelope))
    await consumer.dispatchTask("domain-events", "dispatch", envelopeToDispatchPayload(secondEnvelope))

    const pending = queue.getPublishedByDedupeKey(
      "billing-overage",
      "billing:reportOverage:org-1:2026-01-01T00:00:00.000Z:2026-02-01T00:00:00.000Z",
    )
    expect(pending?.options?.latestThrottleMs).toBe(BILLING_OVERAGE_SYNC_THROTTLE_MS)
    expect((pending?.payload as { snapshotOverageCredits: number }).snapshotOverageCredits).toBe(5_000)
  })
})
