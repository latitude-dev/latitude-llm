import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { describe, expect, it } from "vitest"

import { frustrationStrategy } from "./frustration.ts"
import { makeTrace, user } from "./test-helpers.ts"

describe("frustrationStrategy.hasRequiredContext", () => {
  it("requires at least one user text message", () => {
    expect(frustrationStrategy.hasRequiredContext(makeTrace([]))).toBe(false)
    expect(frustrationStrategy.hasRequiredContext(makeTrace([user("This still isn't working.")]))).toBe(true)
  })

  it("skips flagger.classify reflag sessions (user role is the classifier prompt)", () => {
    const trace = {
      ...makeTrace([
        user(
          [
            "TRACE EVIDENCE:",
            "<evaluated_trace_evidence>",
            "TOOL CALL SEQUENCE: code → code → code → web_search",
            "The agent abandoned the code path after Buildr API failures.",
            "</evaluated_trace_evidence>",
          ].join("\n"),
        ),
      ]),
      tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerClassify],
    }

    expect(frustrationStrategy.hasRequiredContext(trace)).toBe(false)
  })

  it("skips flagger.draft reflag sessions too", () => {
    const trace = {
      ...makeTrace([user("You're not helping at all.")]),
      tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerDraft],
    }

    expect(frustrationStrategy.hasRequiredContext(trace)).toBe(false)
  })
})
