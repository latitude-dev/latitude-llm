import { describe, expect, it } from "vitest"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../otlp/types.ts"
import { extractSamplingKey } from "./extract-sampling-key.ts"

const strAttr = (key: string, value: string): OtlpKeyValue => ({ key, value: { stringValue: value } })

const span = (overrides: Partial<OtlpSpan> = {}): OtlpSpan => ({
  traceId: "trace-1",
  spanId: "span-1",
  name: "test",
  startTimeUnixNano: "0",
  endTimeUnixNano: "0",
  ...overrides,
})

const request = (spans: OtlpSpan[], resourceAttrs: OtlpKeyValue[] = []): OtlpExportTraceServiceRequest => ({
  resourceSpans: [
    {
      resource: { attributes: resourceAttrs },
      scopeSpans: [{ spans }],
    },
  ],
})

describe("extractSamplingKey", () => {
  it("returns the span's session.id when present", () => {
    const req = request([span({ attributes: [strAttr("session.id", "sess-1")] })])
    expect(extractSamplingKey(req)).toBe("sess-1")
  })

  it("falls back to a resource-level session.id", () => {
    const req = request([span()], [strAttr("session.id", "resource-sess")])
    expect(extractSamplingKey(req)).toBe("resource-sess")
  })

  it("falls back to trace_id when no session id is present", () => {
    const req = request([span({ traceId: "trace-fallback" })])
    expect(extractSamplingKey(req)).toBe("trace-fallback")
  })

  it("only inspects the first span", () => {
    const req = request([
      span({ traceId: "first" }),
      span({ traceId: "second", attributes: [strAttr("session.id", "sess-second")] }),
    ])
    expect(extractSamplingKey(req)).toBe("first")
  })

  it("recognizes alternative session-id attribute keys", () => {
    const req = request([span({ attributes: [strAttr("langfuse.session.id", "lf-1")] })])
    expect(extractSamplingKey(req)).toBe("lf-1")
  })

  it("returns null when the payload has no spans", () => {
    expect(extractSamplingKey({ resourceSpans: [] })).toBe(null)
    expect(extractSamplingKey({})).toBe(null)
    expect(extractSamplingKey({ resourceSpans: [{ scopeSpans: [] }] })).toBe(null)
  })
})
