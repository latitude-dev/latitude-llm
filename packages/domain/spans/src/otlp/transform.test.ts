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

describe("transformOtlpToSpans — lone UTF-16 surrogates", () => {
  const loneHighSurrogate = "before\uD83Dafter"
  const sanitized = "before�after"

  it("strips a lone surrogate from a direct string attribute value", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([{ key: "custom.note", value: { stringValue: loneHighSurrogate } }]),
      context,
    )

    expect(spans[0]?.attrString["custom.note"]).toBe(sanitized)
  })

  it("strips a lone surrogate nested inside a structured (array/kvlist) attribute value", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        {
          key: "gen_ai.memory.records",
          value: {
            arrayValue: {
              values: [
                {
                  kvlistValue: {
                    values: [{ key: "content", value: { stringValue: loneHighSurrogate } }],
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
    expect(JSON.parse(records as string)).toEqual([{ content: sanitized }])
  })

  it("strips a lone surrogate from a resource attribute value", () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "deployment.note", value: { stringValue: loneHighSurrogate } }] },
          scopeSpans: [
            {
              scope: { name: "test-scope", version: "1" },
              spans: [
                {
                  traceId: "0".repeat(32),
                  spanId: "0".repeat(16),
                  name: "some_span",
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

    expect(spans[0]?.resourceString["deployment.note"]).toBe(sanitized)
  })

  it("strips a lone surrogate from GenAI message content read by the content parsers", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        {
          key: "gen_ai.input.messages",
          value: {
            stringValue: JSON.stringify([{ role: "user", parts: [{ type: "text", content: loneHighSurrogate }] }]),
          },
        },
      ]),
      context,
    )

    const part = spans[0]?.inputMessages[0]?.parts[0] as { content?: unknown } | undefined
    expect(part?.content).toBe(sanitized)
  })

  it("strips a lone surrogate from the promoted service.name resource attribute", () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: loneHighSurrogate } }] },
          scopeSpans: [
            {
              scope: { name: "test-scope", version: "1" },
              spans: [
                {
                  traceId: "0".repeat(32),
                  spanId: "0".repeat(16),
                  name: "some_span",
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

    expect(spans[0]?.serviceName).toBe(sanitized)
  })

  it("strips a lone surrogate from an attribute key", () => {
    const keyWithSurrogate = "custom.\uD83Dnote"
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([{ key: keyWithSurrogate, value: { stringValue: "fine" } }]),
      context,
    )

    expect(spans[0]?.attrString["custom.�note"]).toBe("fine")
    expect(spans[0]?.attrString[keyWithSurrogate]).toBeUndefined()
  })

  it("strips a lone surrogate from the instrumentation scope name and version", () => {
    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: loneHighSurrogate, version: loneHighSurrogate },
              spans: [
                {
                  traceId: "0".repeat(32),
                  spanId: "0".repeat(16),
                  name: "some_span",
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

    expect(spans[0]?.scopeName).toBe(sanitized)
    expect(spans[0]?.scopeVersion).toBe(sanitized)
  })
})
