import { describe, expect, it } from "vitest"
import { isPostHogTracked, POSTHOG_TRACKED_EVENTS } from "./whitelist.ts"

describe("PostHog whitelist", () => {
  it("includes lifecycle and adoption events", () => {
    expect(POSTHOG_TRACKED_EVENTS.has("OrganizationCreated")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("ProjectCreated")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("UserSignedUp")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("MemberJoined")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("MemberInvited")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("ApiKeyCreated")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("DatasetCreated")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("EvaluationConfigured")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("AnnotationQueueItemCompleted")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("ProjectDeleted")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("FirstTraceReceived")).toBe(true)
  })

  it("explicitly excludes high-volume events", () => {
    // SpanIngested fires per span and would dominate PostHog billing/noise.
    expect(POSTHOG_TRACKED_EVENTS.has("SpanIngested")).toBe(false)
    expect(POSTHOG_TRACKED_EVENTS.has("MagicLinkEmailRequested")).toBe(false)
  })

  it("narrows unknown strings via isPostHogTracked", () => {
    expect(isPostHogTracked("OrganizationCreated")).toBe(true)
    expect(isPostHogTracked("SpanIngested")).toBe(false)
    expect(isPostHogTracked("DefinitelyNotAnEvent")).toBe(false)
  })
})
