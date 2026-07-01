import { beforeAll, describe, expect, it } from "vitest"
import type { SpanDetail } from "../../entities/span.ts"
import type { TransformContext } from "../transform.ts"
import { transformOtlpToSpans } from "../transform.ts"
import type { OtlpExportTraceServiceRequest, OtlpKeyValue, OtlpSpan } from "../types.ts"

function str(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}
function int(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: String(value) } }
}

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c"
const SCOPE_NAME = "openclaw"

const CONTEXT: TransformContext = {
  organizationId: "org_test",
  apiKeyId: "key_test",
  ingestedAt: new Date("2026-06-23T12:00:00Z"),
  defaultProjectId: "proj_test",
  projectIdBySlug: new Map(),
}

// The assistant message OpenClaw puts on `openclaw.content.output_messages`,
// with usage + provider cost (USD) embedded — additive tokens (input excludes
// cache; totalTokens = input + output + cacheRead).
const OUTPUT_MESSAGES = JSON.stringify([
  {
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    model: "gpt-5.5",
    usage: {
      input: 951,
      output: 127,
      cacheRead: 20864,
      cacheWrite: 0,
      reasoningTokens: 0,
      totalTokens: 21942,
      cost: { input: 0.004755, output: 0.00381, cacheRead: 0.010432, cacheWrite: 0, total: 0.018997 },
    },
  },
])

function span(spanId: string, name: string, attributes: OtlpKeyValue[]): OtlpSpan {
  return {
    traceId: TRACE_ID,
    spanId,
    name,
    startTimeUnixNano: "1700000000000000000",
    endTimeUnixNano: "1700000001000000000",
    attributes,
  } as OtlpSpan
}

function buildTrace(): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: { attributes: [str("service.name", "openclaw-gateway")] },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME, version: "2026.6.9" },
            spans: [
              span("1111111111111111", "openclaw.run", []),
              span("2222222222222222", "openclaw.model.call", [
                str("gen_ai.operation.name", "chat"),
                str("gen_ai.system", "openai"),
                str("gen_ai.request.model", "gpt-5.5"),
                str("openclaw.content.output_messages", OUTPUT_MESSAGES),
              ]),
              span("3333333333333333", "openclaw.tool.execution", [str("gen_ai.tool.name", "bash")]),
              // Orphan usage span the plugin emits as its own root — must be dropped.
              span("4444444444444444", "openclaw.model.usage", [
                int("gen_ai.usage.input_tokens", 43123),
                int("gen_ai.usage.output_tokens", 287),
              ]),
            ],
          },
        ],
      },
    ],
  }
}

describe("OpenClaw diagnostics-otel ingest", () => {
  let spans: SpanDetail[]
  const find = (name: string) => spans.find((s) => s.name === name)

  beforeAll(() => {
    spans = transformOtlpToSpans(buildTrace(), CONTEXT).spans as SpanDetail[]
  })

  it("drops the orphan openclaw.model.usage span", () => {
    expect(find("openclaw.model.usage")).toBeUndefined()
    expect(spans).toHaveLength(3)
  })

  it("classifies run/tool spans by name (scope openclaw)", () => {
    expect(find("openclaw.run")?.operation).toBe("invoke_agent")
    const tool = find("openclaw.tool.execution")
    expect(tool?.operation).toBe("execute_tool")
    expect(tool?.toolName).toBe("bash")
  })

  it("classifies OpenClaw plugin subagent spans as create_agent", () => {
    const trace: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: { attributes: [str("service.name", "openclaw-gateway")] },
          scopeSpans: [
            {
              scope: { name: "@latitude-data/openclaw-telemetry", version: "0.1.0" },
              spans: [
                span("aaaaaaaaaaaaaaaa", "agent", []),
                span("bbbbbbbbbbbbbbbb", "subagent", [
                  str("openclaw.subagent.label", "research"),
                  str("openclaw.subagent.agent_id", "child-1"),
                ]),
              ],
            },
          ],
        },
      ],
    }
    const pluginSpans = transformOtlpToSpans(trace, CONTEXT).spans
    const subagent = pluginSpans.find((s) => s.name === "subagent")
    expect(subagent?.operation).toBe("create_agent")
    expect(subagent?.attrString["openclaw.subagent.label"]).toBe("research")
  })

  it("resolves successful spans to ok status even though OTel status arrives unset", () => {
    // OpenClaw signals success out-of-band, not via OTel status — so these would
    // otherwise render with the neutral/gray status in the waterfall.
    expect(find("openclaw.run")?.statusCode).toBe("ok")
    expect(find("openclaw.model.call")?.statusCode).toBe("ok")
    expect(find("openclaw.tool.execution")?.statusCode).toBe("ok")
  })

  it("reads tokens from the embedded usage on the model.call span (additive, no inference)", () => {
    const call = find("openclaw.model.call")
    expect(call?.operation).toBe("chat")
    expect(call?.tokensInput).toBe(951)
    expect(call?.tokensOutput).toBe(127)
    expect(call?.tokensCacheRead).toBe(20864)
    expect(call?.tokensCacheCreate).toBe(0)
    expect(call?.tokensReasoning).toBe(0)
  })

  it("uses the provider's real cost (not estimated), folding cache cost into input", () => {
    const call = find("openclaw.model.call")
    // input + cacheRead + cacheWrite = 0.004755 + 0.010432 + 0 = 0.015187 USD
    expect(call?.costInputMicrocents).toBe(1_518_700)
    expect(call?.costOutputMicrocents).toBe(381_000)
    expect(call?.costTotalMicrocents).toBe(1_899_700)
    expect(call?.costIsEstimated).toBe(false)
  })
})
