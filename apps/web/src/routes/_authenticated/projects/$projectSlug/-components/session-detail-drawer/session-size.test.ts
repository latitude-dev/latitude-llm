import { describe, expect, it } from "vitest"
import { isLargeSession, LARGE_SESSION_SPAN_THRESHOLD, LARGE_SESSION_TRACE_THRESHOLD } from "./session-size.ts"

describe("isLargeSession", () => {
  it("keeps session-wide visualizations for sessions at the limits", () => {
    expect(isLargeSession({ traceCount: LARGE_SESSION_TRACE_THRESHOLD, spanCount: LARGE_SESSION_SPAN_THRESHOLD })).toBe(
      false,
    )
  })

  it("defers session-wide visualizations above either limit", () => {
    expect(isLargeSession({ traceCount: LARGE_SESSION_TRACE_THRESHOLD + 1, spanCount: 1 })).toBe(true)
    expect(isLargeSession({ traceCount: 1, spanCount: LARGE_SESSION_SPAN_THRESHOLD + 1 })).toBe(true)
  })
})
