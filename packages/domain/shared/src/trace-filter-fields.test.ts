import { describe, expect, it } from "vitest"
import {
  isTraceFilterFieldName,
  SCORE_FILTER_FIELDS,
  TRACE_TELEMETRY_FILTER_FIELDS,
  TRACE_TIME_FILTER_FIELDS,
  unknownTraceFilterFields,
} from "./trace-filter-fields.ts"

describe("isTraceFilterFieldName", () => {
  it("accepts generic telemetry fields", () => {
    expect(isTraceFilterFieldName("status")).toBe(true)
    expect(isTraceFilterFieldName("userId")).toBe(true)
    expect(isTraceFilterFieldName("cost")).toBe(true)
  })

  it("accepts both time-window fields", () => {
    expect(isTraceFilterFieldName("startTime")).toBe(true)
    expect(isTraceFilterFieldName("endTime")).toBe(true)
  })

  it("accepts known score keys and metadata paths", () => {
    expect(isTraceFilterFieldName("score.passed")).toBe(true)
    expect(isTraceFilterFieldName("score.value")).toBe(true)
    expect(isTraceFilterFieldName("metadata.env")).toBe(true)
    expect(isTraceFilterFieldName("metadata.a.b.c")).toBe(true)
  })

  it("rejects unknown fields, typos, unknown score keys, and a bare metadata prefix", () => {
    expect(isTraceFilterFieldName("endTimee")).toBe(false)
    expect(isTraceFilterFieldName("finishedAt")).toBe(false)
    expect(isTraceFilterFieldName("score.bogus")).toBe(false)
    expect(isTraceFilterFieldName("metadata.")).toBe(false)
  })

  it("rejects session-only fields on the trace surface", () => {
    expect(isTraceFilterFieldName("moments")).toBe(false)
    expect(isTraceFilterFieldName("topics")).toBe(false)
  })
})

describe("unknownTraceFilterFields", () => {
  it("returns only the unrecognized keys", () => {
    const unknown = unknownTraceFilterFields({
      startTime: [],
      endTime: [],
      "score.passed": [],
      "metadata.env": [],
      finishedAt: [],
      "score.bogus": [],
    })
    expect(unknown.sort()).toEqual(["finishedAt", "score.bogus"])
  })

  it("returns empty for an empty filter set", () => {
    expect(unknownTraceFilterFields({})).toEqual([])
  })
})

describe("filter-field constants", () => {
  it("includes endTime alongside startTime in the time-window fields", () => {
    expect(TRACE_TIME_FILTER_FIELDS).toContain("startTime")
    expect(TRACE_TIME_FILTER_FIELDS).toContain("endTime")
  })

  it("exposes telemetry and score field lists used by the API schema description", () => {
    expect(TRACE_TELEMETRY_FILTER_FIELDS).toContain("endTime")
    expect(SCORE_FILTER_FIELDS.every((k) => k.startsWith("score."))).toBe(true)
  })
})
