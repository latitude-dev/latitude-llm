import { AI_GENERATE_TELEMETRY_TAGS } from "@domain/ai"
import { describe, expect, it } from "vitest"
import { isFlaggerGeneratedTrace, isReflagSuppressed, reflagSuppressionTags } from "./reflag.ts"

const CLASSIFY = AI_GENERATE_TELEMETRY_TAGS.flaggerClassify[0]
const DRAFT = AI_GENERATE_TELEMETRY_TAGS.flaggerDraft[0]
const NO_REFLAG = AI_GENERATE_TELEMETRY_TAGS.flaggerNoReflag[0]

describe("isFlaggerGeneratedTrace", () => {
  it("is true for traces emitted by a flagger classify call", () => {
    expect(isFlaggerGeneratedTrace([CLASSIFY])).toBe(true)
  })

  it("is true for traces emitted by a flagger draft call", () => {
    expect(isFlaggerGeneratedTrace([DRAFT])).toBe(true)
  })

  it("is false for ordinary production traces", () => {
    expect(isFlaggerGeneratedTrace([])).toBe(false)
    expect(isFlaggerGeneratedTrace(["eval:execute", "live"])).toBe(false)
  })
})

describe("isReflagSuppressed", () => {
  it("is true only when the no-reflag marker is present", () => {
    expect(isReflagSuppressed([CLASSIFY, NO_REFLAG])).toBe(true)
    expect(isReflagSuppressed([NO_REFLAG])).toBe(true)
  })

  it("is false for a first-level flagger trace (no marker)", () => {
    expect(isReflagSuppressed([CLASSIFY])).toBe(false)
    expect(isReflagSuppressed([])).toBe(false)
  })
})

describe("reflagSuppressionTags", () => {
  it("adds the no-reflag tag when the flagged trace is itself flagger-generated", () => {
    expect(reflagSuppressionTags([CLASSIFY])).toEqual(AI_GENERATE_TELEMETRY_TAGS.flaggerNoReflag)
  })

  it("adds nothing when the flagged trace is a normal production trace", () => {
    expect(reflagSuppressionTags([])).toEqual([])
    expect(reflagSuppressionTags(["langfuse.trace.tags"])).toEqual([])
  })

  it("closes the loop: a level-2 trace it tags is then skipped by isReflagSuppressed", () => {
    // Level 1: production flagger trace. We flag it, so its output is stamped.
    const levelTwoTags = [CLASSIFY, ...reflagSuppressionTags([CLASSIFY])]
    // Level 2: must not be flagged again.
    expect(isReflagSuppressed(levelTwoTags)).toBe(true)
  })
})
