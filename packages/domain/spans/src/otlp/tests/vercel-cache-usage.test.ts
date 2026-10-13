import { cacheHitRate } from "@repo/utils"
import { describe, expect, it } from "vitest"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpKeyValue } from "../types.ts"

describe("Vercel AI SDK overlapping cache usage", () => {
  it("normalizes read-inclusive input while preserving cache writes through OTLP ingestion", () => {
    const usage = {
      "gen_ai.usage.input_tokens": 26_127,
      "gen_ai.usage.output_tokens": 139,
      "ai.usage.inputTokens": 26_127,
      "ai.usage.outputTokens": 139,
      "ai.usage.totalTokens": 26_266,
      "ai.usage.cachedInputTokens": 20_335,
      "ai.usage.inputTokenDetails.cacheReadTokens": 20_335,
      "ai.usage.inputTokenDetails.cacheWriteTokens": 20_335,
      "ai.usage.inputTokenDetails.noCacheTokens": 5_792,
      "ai.usage.outputTokenDetails.reasoningTokens": 105,
    }
    const attributes: OtlpKeyValue[] = Object.entries(usage).map(([key, value]) => ({
      key,
      value: { intValue: String(value) },
    }))
    const { spans } = transformOtlpToSpans(
      {
        resourceSpans: [
          {
            scopeSpans: [
              {
                scope: { name: "ai" },
                spans: [
                  {
                    traceId: "0af7651916cd43dd8448eb211c80319c",
                    spanId: "a1b2c3d4e5f60002",
                    name: "ai.streamText.doStream",
                    startTimeUnixNano: "1710590400000000000",
                    endTimeUnixNano: "1710590401000000000",
                    attributes: [
                      ...attributes,
                      { key: "ai.operationId", value: { stringValue: "ai.streamText.doStream" } },
                      { key: "ai.model.provider", value: { stringValue: "openrouter" } },
                      { key: "ai.model.id", value: { stringValue: "google/gemini-3-flash-preview" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        organizationId: "org_test",
        apiKeyId: "key_test",
        ingestedAt: new Date("2026-10-13T00:00:00Z"),
        defaultProjectId: "proj_test",
        projectIdBySlug: new Map(),
      },
    )

    expect(spans).toHaveLength(1)
    const span = spans[0]
    if (!span) throw new Error("Expected one ingested span")
    expect(span.tokensInput).toBe(5_792)
    expect(span.tokensCacheRead).toBe(20_335)
    expect(span.tokensCacheCreate).toBe(20_335)
    expect(
      span.tokensInput + span.tokensCacheRead + span.tokensCacheCreate + span.tokensOutput + span.tokensReasoning,
    ).toBe(26_266 + 20_335)
    expect(
      cacheHitRate({ input: span.tokensInput, cacheRead: span.tokensCacheRead, cacheCreate: span.tokensCacheCreate }),
    ).toBeCloseTo(20_335 / (26_127 + 20_335))
    expect(span.attrInt["ai.usage.inputTokenDetails.cacheWriteTokens"]).toBe(20_335)
  })
})
