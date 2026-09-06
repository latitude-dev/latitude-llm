import { describe, expect, it } from "vitest"
import { transformOtlpToSpans } from "./transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue } from "./types.ts"

const context = {
  organizationId: "org_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-01-01T00:00:00Z"),
  defaultProjectId: "proj_test",
  projectIdBySlug: new Map<string, string>(),
}

function requestWithSpanAttributes(attributes: readonly OtlpKeyValue[]): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "test-scope", version: "1" },
            spans: [
              {
                traceId: "0".repeat(32),
                spanId: "0".repeat(16),
                name: "update_memory",
                startTimeUnixNano: "1",
                endTimeUnixNano: "2",
                attributes,
              },
            ],
          },
        ],
      },
    ],
  }
}

describe("transformOtlpToSpans — structured attributes", () => {
  it("flattens array/kvlist attributes into attrString as JSON", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        {
          key: "gen_ai.memory.records",
          value: {
            arrayValue: {
              values: [
                {
                  kvlistValue: {
                    values: [
                      { key: "id", value: { stringValue: "mem_1" } },
                      { key: "content", value: { stringValue: "User prefers dark mode" } },
                      { key: "score", value: { doubleValue: 0.95 } },
                    ],
                  },
                },
              ],
            },
          },
        },
      ]),
      context,
    )

    const records = spans[0]?.attrString["gen_ai.memory.records"]
    expect(records).toBeDefined()
    expect(JSON.parse(records as string)).toEqual([{ id: "mem_1", content: "User prefers dark mode", score: 0.95 }])
  })
})

describe("transformOtlpToSpans — memory operations", () => {
  it("classifies memory operations and captures scalar memory attributes", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        { key: "gen_ai.operation.name", value: { stringValue: "update_memory" } },
        { key: "gen_ai.memory.store.id", value: { stringValue: "user-prefs" } },
        { key: "gen_ai.memory.record.id", value: { stringValue: "mem_1" } },
        { key: "gen_ai.memory.record.count", value: { intValue: "3" } },
      ]),
      context,
    )

    const span = spans[0]
    expect(span?.operation).toBe("update_memory")
    expect(span?.attrString["gen_ai.memory.store.id"]).toBe("user-prefs")
    expect(span?.attrString["gen_ai.memory.record.id"]).toBe("mem_1")
    expect(span?.attrInt["gen_ai.memory.record.count"]).toBe(3)
  })
})

describe("transformOtlpToSpans — int64 precision", () => {
  it("keeps an int past 2^53 as exact text rather than rounding it into attrInt", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        { key: "event.timestamp_ns", value: { intValue: "1785506507050123456" } },
        { key: "gen_ai.usage.input_tokens", value: { intValue: "215813" } },
      ]),
      context,
    )

    const span = spans[0]
    expect(span?.attrString["event.timestamp_ns"]).toBe("1785506507050123456")
    expect(span?.attrInt).not.toHaveProperty("event.timestamp_ns")
    expect(span?.attrInt["gen_ai.usage.input_tokens"]).toBe(215813)
  })
})

describe("transformOtlpToSpans — lone UTF-16 surrogate sanitization", () => {
  it("strips a lone surrogate from a direct string span attribute value", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([{ key: "user.note", value: { stringValue: "before\uD83Dafter" } }]),
      context,
    )

    expect(spans[0]?.attrString["user.note"]).toBe("before�after")
  })

  it("strips a lone surrogate from a string nested inside a structured attribute value", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        {
          key: "gen_ai.memory.records",
          value: {
            arrayValue: {
              values: [{ kvlistValue: { values: [{ key: "content", value: { stringValue: "hi\uD83D" } }] } }],
            },
          },
        },
      ]),
      context,
    )

    const records = spans[0]?.attrString["gen_ai.memory.records"]
    expect(JSON.parse(records as string)).toEqual([{ content: "hi�" }])
  })

  it("strips a lone surrogate from a resource attribute value, including the promoted service name", () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "checkout\uD83D" } }] },
          scopeSpans: [
            {
              scope: { name: "test-scope", version: "1" },
              spans: [
                {
                  traceId: "0".repeat(32),
                  spanId: "0".repeat(16),
                  name: "span",
                  startTimeUnixNano: "1",
                  endTimeUnixNano: "2",
                  attributes: [],
                },
              ],
            },
          ],
        },
      ],
    }

    const { spans } = transformOtlpToSpans(request, context)

    expect(spans[0]?.serviceName).toBe("checkout�")
    expect(spans[0]?.resourceString["service.name"]).toBe("checkout�")
  })

  it("strips a lone surrogate from instrumentation scope name and version", () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "scope\uD83D", version: "v1\uD83D" },
              spans: [
                {
                  traceId: "0".repeat(32),
                  spanId: "0".repeat(16),
                  name: "span",
                  startTimeUnixNano: "1",
                  endTimeUnixNano: "2",
                  attributes: [],
                },
              ],
            },
          ],
        },
      ],
    }

    const { spans } = transformOtlpToSpans(request, context)

    expect(spans[0]?.scopeName).toBe("scope�")
    expect(spans[0]?.scopeVersion).toBe("v1�")
  })

  it("strips a lone surrogate reintroduced by JSON-parsing a gen_ai message attribute", () => {
    // The OTLP-level pass sees only the escaped text `\ud83d` (no real surrogate code unit yet),
    // so it can't sanitize this; the surrogate only becomes real once JSON.parse decodes it below.
    const stringValue = JSON.stringify([{ role: "user", parts: [{ type: "text", content: "hi\uD83D" }] }])

    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([{ key: "gen_ai.input.messages", value: { stringValue } }]),
      context,
    )

    const [message] = spans[0]?.inputMessages ?? []
    const part = (message as { parts?: readonly { type: string; content?: unknown }[] } | undefined)?.parts?.[0]
    expect(part?.content).toBe("hi�")
  })
})
