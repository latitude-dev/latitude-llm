import { describe, expect, it } from "vitest"
import { buildOtlpRequest } from "./otlp.ts"
import type { BuildResult, SpanRecord } from "./span-builder.ts"
import type { OtlpKeyValue, OtlpSpan } from "./types.ts"

function span(overrides: Partial<SpanRecord> = {}): SpanRecord {
  return {
    spanId: "a".repeat(16),
    traceId: "b".repeat(32),
    parentSpanId: "",
    name: "interaction",
    kind: 1,
    startMs: 1_700_000_000_000,
    endMs: 1_700_000_001_000,
    attrs: {},
    outcome: "ok",
    ...overrides,
  }
}

function result(spans: SpanRecord[]): BuildResult {
  return { runId: "r", spans }
}

function attr(s: OtlpSpan, key: string): OtlpKeyValue | undefined {
  return s.attributes.find((a) => a.key === key)
}

function onlySpan(payload: ReturnType<typeof buildOtlpRequest>): OtlpSpan {
  const s = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0]
  if (!s) throw new Error("no span")
  return s
}

describe("buildOtlpRequest", () => {
  it("strips :gated from kept keys when content capture is on", () => {
    const payload = buildOtlpRequest(
      [
        result([
          span({ attrs: { "gen_ai.input.messages:gated": [{ role: "user", parts: [] }], "openclaw.run.id": "r" } }),
        ]),
      ],
      {
        allowConversationAccess: true,
      },
    )
    const s = onlySpan(payload)
    expect(attr(s, "gen_ai.input.messages")?.value.stringValue).toBe('[{"role":"user","parts":[]}]')
    expect(attr(s, "gen_ai.input.messages:gated")).toBeUndefined()
    expect(attr(s, "latitude.captured.content")?.value.boolValue).toBe(true)
  })

  it("drops every :gated attribute when content capture is off", () => {
    const payload = buildOtlpRequest(
      [
        result([
          span({
            attrs: {
              "gen_ai.input.messages:gated": [],
              "error.message:gated": "secret",
              "gen_ai.usage.input_tokens": 3,
            },
          }),
        ]),
      ],
      { allowConversationAccess: false },
    )
    const s = onlySpan(payload)
    expect(s.attributes.map((a) => a.key)).toEqual(["gen_ai.usage.input_tokens", "latitude.captured.content"])
    expect(attr(s, "latitude.captured.content")?.value.boolValue).toBe(false)
  })

  it("encodes numbers, booleans, arrays and objects", () => {
    const payload = buildOtlpRequest(
      [result([span({ attrs: { i: 3, f: 1.5, b: true, arr: ["x"], obj: { a: 1 }, "gen_ai.usage.cost": 0.0031 } })])],
      { allowConversationAccess: true },
    )
    const s = onlySpan(payload)
    expect(attr(s, "i")?.value.intValue).toBe("3")
    expect(attr(s, "f")?.value.doubleValue).toBe(1.5)
    expect(attr(s, "b")?.value.boolValue).toBe(true)
    expect(attr(s, "arr")?.value.stringValue).toBe('["x"]')
    expect(attr(s, "obj")?.value.stringValue).toBe('{"a":1}')
    expect(attr(s, "gen_ai.usage.cost")?.value.doubleValue).toBeCloseTo(0.0031)
  })

  it("encodes finish reasons as a native string array", () => {
    const payload = buildOtlpRequest(
      [result([span({ attrs: { "gen_ai.response.finish_reasons": ["tool_calls"] } })])],
      {
        allowConversationAccess: true,
      },
    )
    expect(attr(onlySpan(payload), "gen_ai.response.finish_reasons")?.value.arrayValue).toEqual({
      values: [{ stringValue: "tool_calls" }],
    })
  })

  it("preserves span kind, status, timing and parent links", () => {
    const payload = buildOtlpRequest(
      [
        result([
          span(),
          span({
            spanId: "c".repeat(16),
            parentSpanId: "a".repeat(16),
            name: "tool_call:exec",
            kind: 3,
            outcome: "error",
          }),
        ]),
      ],
      { allowConversationAccess: true },
    )
    const spans = payload.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    expect(spans[0]?.status.code).toBe(1)
    expect(spans[0]?.startTimeUnixNano).toBe("1700000000000000000")
    expect(spans[0]?.endTimeUnixNano).toBe("1700000001000000000")
    expect(spans[1]?.kind).toBe(3)
    expect(spans[1]?.status.code).toBe(2)
    expect(spans[1]?.parentSpanId).toBe("a".repeat(16))
    expect(spans[1]?.traceId).toBe("b".repeat(32))
  })

  it("truncates oversized content from the middle within the budget", () => {
    const big = "x".repeat(500)
    const payload = buildOtlpRequest(
      [result([span({ attrs: { "gen_ai.tool.call.result:gated": big, small: "ok" } })])],
      {
        allowConversationAccess: true,
        maxContentChars: 100,
      },
    )
    const s = onlySpan(payload)
    const value = attr(s, "gen_ai.tool.call.result")?.value.stringValue ?? ""
    expect(value.length).toBeLessThanOrEqual(100)
    expect(value).toContain("[truncated by latitude-openclaw]")
    expect(attr(s, "small")?.value.stringValue).toBe("ok")
  })

  it("never splits a surrogate pair when truncating a string", () => {
    const big = "😀".repeat(300)
    const payload = buildOtlpRequest([result([span({ attrs: { "user_prompt:gated": big } })])], {
      allowConversationAccess: true,
      maxContentChars: 101,
    })
    const value = attr(onlySpan(payload), "user_prompt")?.value.stringValue ?? ""
    expect(value.length).toBeLessThanOrEqual(101)
    expect(value.includes("\ufffd")).toBe(false)
    for (const piece of value.split("[truncated by latitude-openclaw]")) {
      expect(() => new TextEncoder().encode(piece)).not.toThrow()
      expect(Array.from(piece).every((ch) => ch === "😀" || ch === "\n" || ch === "…")).toBe(true)
    }
  })

  it("sheds whole messages from the middle so an oversized conversation stays valid JSON", () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      parts: [{ type: "text", content: `message ${i} ${"x".repeat(200)}` }],
    }))
    const payload = buildOtlpRequest([result([span({ attrs: { "gen_ai.input.messages:gated": messages } })])], {
      allowConversationAccess: true,
      maxContentChars: 2_000,
    })
    const value = attr(onlySpan(payload), "gen_ai.input.messages")?.value.stringValue ?? ""
    expect(value.length).toBeLessThanOrEqual(2_000)
    const parsed = JSON.parse(value) as Array<{ role: string; parts: Array<{ content: string }> }>
    expect(parsed[0]?.parts[0]?.content).toContain("message 0 ")
    expect(parsed[parsed.length - 1]?.parts[0]?.content).toContain("message 39 ")
    const marker = parsed.find((m) => m.parts[0]?.content.includes("omitted by latitude-openclaw"))
    expect(marker?.role).toBe("system")
    expect(marker?.parts[0]?.content).toMatch(/\d+ message\(s\) omitted/)
  })

  it("truncates a huge string inside a structured value before shedding items", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", content: "short" }] },
      { role: "tool", parts: [{ type: "tool_call_response", result: "y".repeat(5_000) }] },
      { role: "assistant", parts: [{ type: "text", content: "done" }] },
    ]
    const payload = buildOtlpRequest([result([span({ attrs: { "gen_ai.input.messages:gated": messages } })])], {
      allowConversationAccess: true,
      maxContentChars: 2_000,
    })
    const value = attr(onlySpan(payload), "gen_ai.input.messages")?.value.stringValue ?? ""
    expect(value.length).toBeLessThanOrEqual(2_000)
    const parsed = JSON.parse(value) as Array<{ role: string; parts: Array<{ result?: string }> }>
    expect(parsed.map((m) => m.role)).toEqual(["user", "tool", "assistant"])
    expect(parsed[1]?.parts[0]?.result).toContain("[truncated by latitude-openclaw]")
  })

  it("drops tool definitions from the middle without inventing a tool", () => {
    const tools = Array.from({ length: 30 }, (_, i) => ({
      type: "function",
      name: `tool_${i}`,
      description: "d".repeat(100),
      parameters: { type: "object" },
    }))
    const payload = buildOtlpRequest([result([span({ attrs: { "gen_ai.tool.definitions:gated": tools } })])], {
      allowConversationAccess: true,
      maxContentChars: 1_500,
    })
    const value = attr(onlySpan(payload), "gen_ai.tool.definitions")?.value.stringValue ?? ""
    expect(value.length).toBeLessThanOrEqual(1_500)
    const parsed = JSON.parse(value) as Array<{ name: string }>
    expect(parsed.length).toBeGreaterThan(1)
    expect(parsed.length).toBeLessThan(30)
    expect(parsed[0]?.name).toBe("tool_0")
    expect(parsed[parsed.length - 1]?.name).toBe("tool_29")
    expect(parsed.every((t) => t.name.startsWith("tool_"))).toBe(true)
  })

  it("applies attribute redaction after gating", () => {
    const payload = buildOtlpRequest(
      [result([span({ attrs: { "gen_ai.input.messages:gated": [{ role: "user" }], "openclaw.run.id": "r" } })])],
      {
        allowConversationAccess: true,
        redact: { attributes: ["/^gen_ai\\.input/"], mask: "[]" },
      },
    )
    const s = onlySpan(payload)
    expect(attr(s, "gen_ai.input.messages")?.value.stringValue).toBe("[]")
    expect(attr(s, "openclaw.run.id")?.value.stringValue).toBe("r")
  })

  it("names the service from options and stamps the scope", () => {
    const payload = buildOtlpRequest([result([span()])], { allowConversationAccess: true, serviceName: "alescript" })
    const rs = payload.resourceSpans[0]
    expect(rs?.resource.attributes.find((a) => a.key === "service.name")?.value.stringValue).toBe("alescript")
    expect(rs?.scopeSpans[0]?.scope.name).toBe("@latitude-data/openclaw-telemetry")
  })
})
