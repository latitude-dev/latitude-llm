import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { describe, expect, it } from "vitest"
import { buildTau2TrajectorySpans } from "./fixed-traces.ts"

const scope = createSeedScope({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
  queueAssigneeUserIds: [],
  apiKeyId: SEED_API_KEY_ID,
})

describe("buildTau2TrajectorySpans message serialization", () => {
  // The trace/session rollups select messages with `input_messages != ''`, so
  // an empty list must serialize to "" (not "[]"). A leading assistant greeting
  // has no input; if it stored "[]" it would win the earliest-span tie and
  // blank out the whole trace's Input.
  it("never serializes empty message lists as '[]'", () => {
    const spans = buildTau2TrajectorySpans(scope, 50)
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) {
      expect(span.input_messages).not.toBe("[]")
      expect(span.output_messages).not.toBe("[]")
    }
  })

  it("stores '' (not '[]') for the leading greeting span with no prior input", () => {
    const spans = buildTau2TrajectorySpans(scope, 50)
    const emptyInputChatSpans = spans.filter(
      (span) => span.operation === "chat" && span.input_messages === "" && span.output_messages !== "",
    )
    // Every tau2 trajectory opens with an assistant greeting (no input).
    expect(emptyInputChatSpans.length).toBeGreaterThan(0)
  })
})
