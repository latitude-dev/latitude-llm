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
  str("gen_ai.operation.name", "chat"),
  str("gen_ai.provider.name", "@some-vendor/unmapped-sdk"),
  str("gen_ai.request.model", model),
  int("gen_ai.usage.input_tokens", 1_000),
  int("gen_ai.usage.output_tokens", 500),
]

const usageAttrs = (provider: string, model: string, operation = "chat"): OtlpKeyValue[] => [
  str("gen_ai.operation.name", operation),
  str("gen_ai.provider.name", provider),
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
      request([llmSpan("s1", usageAttrs("@anthropic-ai/claude-agent-sdk", "claude-opus-4-8"))]),
      baseContext,
    )

    expect(spans[0]?.costTotalMicrocents).toBeGreaterThan(0)
    expect(unpricedSpanGroups).toEqual([])
  })

  it("ignores spans that carry no token usage", () => {
    // Everything a reportable pair needs except the tokens, so the empty result can only be the
    // no-usage path — the earlier fixture also lacked a model and an operation, which the
    // suppression rules reject first, and would have passed however this branch behaved.
    const { unpricedSpanGroups } = transformOtlpToSpans(
      request([
        llmSpan("s1", [
          str("gen_ai.operation.name", "chat"),
          str("gen_ai.provider.name", "@some-vendor/unmapped-sdk"),
          str("gen_ai.request.model", "mystery-model"),
        ]),
      ]),
      baseContext,
    )

    expect(unpricedSpanGroups).toEqual([])
  })
})

describe("transformOtlpToSpans unpriced reporting suppression", () => {
  // Each case below is a zero that no catalog entry could fix, so alerting on it only teaches
  // the reader to ignore the issue.
  it.each([
    [
      "a non-billable operation, which no cost figure counts",
      usageAttrs("some-proxy", "mystery-model", "invoke_agent"),
    ],
    ["a local runtime, which has no per-token rate to find", usageAttrs("lmstudio", "zai-org/glm-4.7-flash")],
    ["the caller's own free-tier marker", usageAttrs("some-proxy", "stepfun/step-3.7-flash:free")],
    ["a pair the catalog lists and deliberately leaves unpriced", usageAttrs("ollama-cloud", "qwen3.5:397b")],
  ])("does not report %s", (_case, attributes) => {
    const { spans, unpricedSpanGroups } = transformOtlpToSpans(request([llmSpan("s1", attributes)]), baseContext)

    expect(unpricedSpanGroups).toEqual([])
    // The span is still recorded as unpriced: only the alert is withheld, so the Cost page's
    // coverage maths sees exactly what it saw before.
    expect(spans[0]?.costSource).toBe("unpriced")
    expect(spans[0]?.costTotalMicrocents).toBe(0)
  })

  it("does not report usage that arrives with no provider or model", () => {
    const { unpricedSpanGroups } = transformOtlpToSpans(
      request([
        llmSpan("s1", [
          str("gen_ai.operation.name", "chat"),
          int("gen_ai.usage.input_tokens", 1_000),
          int("gen_ai.usage.output_tokens", 500),
        ]),
      ]),
      baseContext,
    )

    expect(unpricedSpanGroups).toEqual([])
  })

  it("still reports a real catalog gap on a billable operation", () => {
    const { spans, unpricedSpanGroups } = transformOtlpToSpans(
      request([llmSpan("s1", usageAttrs("anthropic", "qwen3.7-max"))]),
      baseContext,
    )

    expect(spans[0]?.costSource).toBe("unpriced")
    expect(unpricedSpanGroups).toEqual([{ projectId: "proj-1", provider: "anthropic", model: "qwen3.7-max", spans: 1 }])
  })
})
