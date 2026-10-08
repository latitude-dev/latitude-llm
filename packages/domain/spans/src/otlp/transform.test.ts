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

describe("transformOtlpToSpans — reported cost", () => {
  const chat: OtlpKeyValue[] = [
    { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
    { key: "gen_ai.provider.name", value: { stringValue: "openai" } },
    { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } },
    { key: "gen_ai.usage.input_tokens", value: { intValue: "1000" } },
    { key: "gen_ai.usage.output_tokens", value: { intValue: "500" } },
  ]

  it("stores a customer-reported cost as user_reported, exactly as sent", () => {
    const { spans, invalidCostAttributes } = transformOtlpToSpans(
      requestWithSpanAttributes([
        ...chat,
        { key: "latitude.cost.source", value: { stringValue: "user" } },
        { key: "gen_ai.usage.total_cost", value: { stringValue: "0.0123" } },
      ]),
      context,
    )

    expect(spans[0]).toMatchObject({
      costInputMicrocents: 0,
      costOutputMicrocents: 0,
      costTotalMicrocents: 1_230_000,
      costIsEstimated: false,
      costSource: "user_reported",
      costPricedProvider: "",
      costPricedModel: "",
    })
    expect(invalidCostAttributes).toEqual([])
  })

  it("stores a customer-reported zero as free", () => {
    const { spans } = transformOtlpToSpans(
      requestWithSpanAttributes([
        ...chat,
        { key: "latitude.cost.source", value: { stringValue: "user" } },
        { key: "gen_ai.usage.total_cost", value: { doubleValue: 0 } },
      ]),
      context,
    )

    expect(spans[0]?.costTotalMicrocents).toBe(0)
    expect(spans[0]?.costSource).toBe("user_reported")
  })

  it("keeps the span, drops the invalid figures and counts them by key", () => {
    const request = requestWithSpanAttributes([
      ...chat,
      { key: "gen_ai.usage.total_cost", value: { doubleValue: -5 } },
      { key: "llm.cost.prompt", value: { stringValue: "not a number" } },
    ])
    const { spans, invalidCostAttributes } = transformOtlpToSpans(request, context)

    expect(spans).toHaveLength(1)
    expect(spans[0]?.costSource).toBe("estimated")
    expect(spans[0]?.costTotalMicrocents).toBe(750_000)
    expect(invalidCostAttributes).toEqual([
      { key: "llm.cost.prompt", spans: 1 },
      { key: "gen_ai.usage.total_cost", spans: 1 },
    ])
  })
})
