import { describe, expect, it } from "vitest"
import { isPostHogTracked, POSTHOG_TRACKED_EVENTS } from "./whitelist.ts"

describe("PostHog whitelist", () => {
  it("includes the v1 lifecycle events", () => {
    expect(POSTHOG_TRACKED_EVENTS.has("OrganizationCreated")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("ProjectCreated")).toBe(true)
    expect(POSTHOG_TRACKED_EVENTS.has("ScoreCreated")).toBe(true)
  })

  it("explicitly excludes high-volume events", () => {
    // TraceEnded and SpanIngested fire per trace/span and would dominate
    // PostHog billing/noise. Keep them out of the whitelist.
    expect(POSTHOG_TRACKED_EVENTS.has("TraceEnded")).toBe(false)
    expect(POSTHOG_TRACKED_EVENTS.has("SpanIngested")).toBe(false)
  })

  it("narrows unknown strings via isPostHogTracked", () => {
    expect(isPostHogTracked("OrganizationCreated")).toBe(true)
    expect(isPostHogTracked("TraceEnded")).toBe(false)
    expect(isPostHogTracked("DefinitelyNotAnEvent")).toBe(false)
  })
})
