import { describe, expect, it } from "vitest"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue } from "../types.ts"

const TRACE = "0af7651916cd43dd8448eb211c80319c"

const str = (key: string, value: string): OtlpKeyValue => ({ key, value: { stringValue: value } })
const int = (key: string, value: number): OtlpKeyValue => ({ key, value: { intValue: String(value) } })

const baseContext = {
  organizationId: "org-1",
  apiKeyId: "key-1",
  ingestedAt: new Date("2026-04-10T12:00:00.000Z"),
  defaultProjectId: "proj-1",
  projectIdBySlug: new Map<string, string>(),
}

function llmSpan(spanId: string, attributes: OtlpKeyValue[]) {
  return {
    traceId: TRACE,
    spanId,
    name: spanId,
    startTimeUnixNano: "1710590400000000000",
    endTimeUnixNano: "1710590401000000000",
    attributes,
    status: { code: 1 },
  }
}

function request(spans: ReturnType<typeof llmSpan>[]): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [str("service.name", "test")] },
        scopeSpans: [{ scope: { name: "scope", version: "1" }, spans }],
      },
    ],
  }
}

const unpricedAttrs = (model: string): OtlpKeyValue[] => [
  str("gen_ai.provider.name", "@some-vendor/unmapped-sdk"),
  str("gen_ai.request.model", model),
  int("gen_ai.usage.input_tokens", 1_000),
  int("gen_ai.usage.output_tokens", 500),
]

describe("transformOtlpToSpans unpriced cost reporting", () => {
  it("groups unpriced spans by project, provider and model with a count", () => {
    const { spans, unpricedSpanGroups } = transformOtlpToSpans(
      request([
        llmSpan("s1", unpricedAttrs("mystery-model")),
        llmSpan("s2", unpricedAttrs("mystery-model")),
        llmSpan("s3", unpricedAttrs("other-model")),
      ]),
      baseContext,
    )

    expect(spans).toHaveLength(3)
    expect(unpricedSpanGroups).toEqual([
      { projectId: "proj-1", provider: "@some-vendor/unmapped-sdk", model: "mystery-model", spans: 2 },
      { projectId: "proj-1", provider: "@some-vendor/unmapped-sdk", model: "other-model", spans: 1 },
    ])
  })

  it("reports nothing for spans it can price", () => {
    const { spans, unpricedSpanGroups } = transformOtlpToSpans(
      request([
        llmSpan("s1", [
          str("gen_ai.provider.name", "@anthropic-ai/claude-agent-sdk"),
          str("gen_ai.request.model", "claude-opus-4-8"),
          int("gen_ai.usage.input_tokens", 1_000),
          int("gen_ai.usage.output_tokens", 500),
        ]),
      ]),
      baseContext,
    )

    expect(spans[0]?.costTotalMicrocents).toBeGreaterThan(0)
    expect(unpricedSpanGroups).toEqual([])
  })

  it("ignores spans that carry no token usage", () => {
    const { unpricedSpanGroups } = transformOtlpToSpans(
      request([llmSpan("s1", [str("gen_ai.provider.name", "@some-vendor/unmapped-sdk")])]),
      baseContext,
    )

    expect(unpricedSpanGroups).toEqual([])
  })
})
