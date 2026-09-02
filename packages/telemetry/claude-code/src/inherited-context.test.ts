import { describe, expect, it } from "vitest"
import { formatTraceparent, inheritedSessionId, parseInheritedContext, parseTraceparent } from "./inherited-context.ts"

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"
const SPAN = "00f067aa0ba902b7"

describe("parseTraceparent", () => {
  it("accepts a well-formed version 00 header", () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-01`)).toEqual({ traceId: TRACE, parentSpanId: SPAN })
  })

  it("uppercases are normalized", () => {
    expect(parseTraceparent(`00-${TRACE.toUpperCase()}-${SPAN.toUpperCase()}-01`)).toEqual({
      traceId: TRACE,
      parentSpanId: SPAN,
    })
  })

  it("ignores trailing fields on a future version", () => {
    expect(parseTraceparent(`01-${TRACE}-${SPAN}-01-extra`)).toEqual({ traceId: TRACE, parentSpanId: SPAN })
  })

  it("rejects a version 00 header with extra fields", () => {
    expect(parseTraceparent(`00-${TRACE}-${SPAN}-01-extra`)).toBeUndefined()
  })

  it.each([
    ["forbidden version", `ff-${TRACE}-${SPAN}-01`],
    ["all-zero trace id", `00-${"0".repeat(32)}-${SPAN}-01`],
    ["all-zero span id", `00-${TRACE}-${"0".repeat(16)}-01`],
    ["short trace id", `00-abc-${SPAN}-01`],
    ["non-hex span id", `00-${TRACE}-zzzzzzzzzzzzzzzz-01`],
    ["missing flags", `00-${TRACE}-${SPAN}`],
    ["empty", ""],
    // `$` matches before a trailing newline in JS, so these pass the per-field
    // patterns unless the whole value is checked for whitespace.
    ["a newline inside the trace id", `00-${TRACE}\n-${SPAN}-01`],
    ["a newline inside the span id", `00-${TRACE}-${SPAN}\n-01`],
    ["a newline inside the flags", `00-${TRACE}-${SPAN}-01\n-x`],
  ])("rejects %s", (_label, header) => {
    expect(parseTraceparent(header)).toBeUndefined()
  })

  it("round-trips what formatTraceparent produces", () => {
    expect(parseTraceparent(formatTraceparent(TRACE, SPAN))).toEqual({ traceId: TRACE, parentSpanId: SPAN })
  })
})

describe("parseInheritedContext", () => {
  it("returns nothing when no traceparent is present", () => {
    expect(parseInheritedContext({})).toBeUndefined()
  })

  it("reads the standard TRACEPARENT variable", () => {
    expect(parseInheritedContext({ TRACEPARENT: `00-${TRACE}-${SPAN}-01` })).toEqual({
      traceId: TRACE,
      parentSpanId: SPAN,
      sessionId: undefined,
    })
  })

  it("prefers the Latitude-scoped variable over an unrelated pipeline's", () => {
    const other = "0af7651916cd43dd8448eb211c80319c"
    const ctx = parseInheritedContext({
      TRACEPARENT: `00-${other}-${SPAN}-01`,
      LATITUDE_TRACEPARENT: `00-${TRACE}-${SPAN}-01`,
    })
    expect(ctx?.traceId).toBe(TRACE)
  })

  it("carries an inherited session id", () => {
    const ctx = parseInheritedContext({ TRACEPARENT: `00-${TRACE}-${SPAN}-01`, LATITUDE_SESSION_ID: "hermes-sess" })
    expect(ctx?.sessionId).toBe("hermes-sess")
  })

  it("treats a blank session id as absent", () => {
    const ctx = parseInheritedContext({ TRACEPARENT: `00-${TRACE}-${SPAN}-01`, LATITUDE_SESSION_ID: "   " })
    expect(ctx?.sessionId).toBeUndefined()
  })

  it("honours the opt-out", () => {
    const env = { TRACEPARENT: `00-${TRACE}-${SPAN}-01`, LATITUDE_CLAUDE_CODE_INHERIT_CONTEXT: "0" }
    expect(parseInheritedContext(env)).toBeUndefined()
  })

  it("ignores a malformed header rather than failing the hook", () => {
    expect(parseInheritedContext({ TRACEPARENT: "garbage" })).toBeUndefined()
  })
})

describe("inheritedSessionId", () => {
  it("is readable without a traceparent, so a session that never joins still groups", () => {
    expect(inheritedSessionId({ LATITUDE_SESSION_ID: "hermes-sess" })).toBe("hermes-sess")
  })

  it("treats a blank id as absent", () => {
    expect(inheritedSessionId({ LATITUDE_SESSION_ID: "   " })).toBeUndefined()
    expect(inheritedSessionId({})).toBeUndefined()
  })

  it("honours the opt-out", () => {
    expect(
      inheritedSessionId({ LATITUDE_SESSION_ID: "hermes-sess", LATITUDE_CLAUDE_CODE_INHERIT_CONTEXT: "0" }),
    ).toBeUndefined()
  })
})
