import { createHash } from "node:crypto"

export type SeedTextPart = {
  readonly type: "text"
  readonly content: string
}

export type SeedToolCallPart = {
  readonly type: "tool_call"
  readonly id: string
  readonly name: string
  readonly arguments: Record<string, unknown>
}

export type SeedToolResponsePart = {
  readonly type: "tool_call_response"
  readonly id: string
  readonly response: unknown
}

export type SeedMessagePart = SeedTextPart | SeedToolCallPart | SeedToolResponsePart

export type SeedMessage = {
  readonly role: "user" | "assistant" | "tool"
  readonly parts: readonly SeedMessagePart[]
}

export type SeedSystemPart = {
  readonly type: "text"
  readonly content: string
}

export type SeedSpanDefinition = {
  readonly label: string
  readonly offsetMs: number
  readonly durationMs: number
  readonly inputMessages: readonly SeedMessage[]
  readonly outputMessages: readonly SeedMessage[]
  readonly usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly totalCostUsd: number
    readonly reasoningTokens?: number
    readonly ttftNs?: number
  }
  readonly finishReasons?: readonly string[]
}

type OtlpAnyValue = {
  readonly stringValue?: string
  readonly boolValue?: boolean
  readonly intValue?: string
  readonly doubleValue?: number
  readonly arrayValue?: {
    readonly values?: readonly OtlpAnyValue[]
  }
}

type OtlpKeyValue = {
  readonly key: string
  readonly value: OtlpAnyValue
}

export type OtlpExportTraceServiceRequest = {
  readonly resourceSpans: readonly [
    {
      readonly resource: {
        readonly attributes: readonly OtlpKeyValue[]
      }
      readonly scopeSpans: readonly [
        {
          readonly scope: {
            readonly name: string
            readonly version: string
          }
          readonly spans: readonly [
            {
              readonly traceId: string
              readonly spanId: string
              readonly parentSpanId?: string
              readonly name: string
              readonly kind: number
              readonly startTimeUnixNano: string
              readonly endTimeUnixNano: string
              readonly attributes: readonly OtlpKeyValue[]
              readonly status: {
                readonly code: number
              }
            },
          ]
        },
      ]
    },
  ]
}

export type BuiltTraceSpan = {
  readonly label: string
  readonly offsetMs: number
  readonly traceId: string
  readonly spanId: string
  readonly request: OtlpExportTraceServiceRequest
}

export function userTextMessage(content: string): SeedMessage {
  return { role: "user", parts: [{ type: "text", content }] }
}

export function assistantTextMessage(content: string): SeedMessage {
  return { role: "assistant", parts: [{ type: "text", content }] }
}

export function assistantToolCallMessage(
  toolCalls: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly arguments: Record<string, unknown>
  }>,
): SeedMessage {
  return {
    role: "assistant",
    parts: toolCalls.map((toolCall) => ({
      type: "tool_call",
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    })),
  }
}

export function toolResponseMessage(callId: string, response: unknown): SeedMessage {
  return {
    role: "tool",
    parts: [{ type: "tool_call_response", id: callId, response }],
  }
}

function hashHex(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length)
}

function toUnixNano(value: Date): string {
  return (BigInt(value.getTime()) * BigInt(1_000_000)).toString()
}

function stringAttr(key: string, value: string): OtlpKeyValue {
  return { key, value: { stringValue: value } }
}

function intAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { intValue: Math.round(value).toString() } }
}

function floatAttr(key: string, value: number): OtlpKeyValue {
  return { key, value: { doubleValue: value } }
}

function stringArrayAttr(key: string, values: readonly string[]): OtlpKeyValue {
  return {
    key,
    value: {
      arrayValue: {
        values: values.map((value) => ({ stringValue: value })),
      },
    },
  }
}

function jsonAttr(key: string, value: unknown): OtlpKeyValue {
  return stringAttr(key, JSON.stringify(value))
}

export function buildTraceRequests(input: {
  readonly traceId: string
  readonly sessionId: string
  readonly userId: string
  readonly serviceName: string
  readonly spans: readonly SeedSpanDefinition[]
  readonly systemInstructions: readonly SeedSystemPart[]
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
  readonly baseTime: Date
  readonly provider?: string
  readonly model?: string
  readonly scopeName?: string
  readonly scopeVersion?: string
}): readonly BuiltTraceSpan[] {
  const provider = input.provider ?? "openai"
  const model = input.model ?? "gpt-4o-mini"
  const scopeName = input.scopeName ?? "@tools/seeds/live-monitor"
  const scopeVersion = input.scopeVersion ?? "1.0.0"

  const spanIds = input.spans.map((span, index) => hashHex(`${input.traceId}:${span.label}:${index.toString()}`, 16))
  const rootSpanId = spanIds[0] ?? hashHex(`${input.traceId}:root`, 16)

  return input.spans.map((span, index) => {
    const spanId = spanIds[index] ?? hashHex(`${input.traceId}:${span.label}:fallback`, 16)
    const startTime = new Date(input.baseTime.getTime() + span.offsetMs)
    const endTime = new Date(startTime.getTime() + span.durationMs)
    const responseId = `seed-${hashHex(`${input.traceId}:${spanId}:response`, 12)}`

    const attributes: OtlpKeyValue[] = [
      stringAttr("gen_ai.operation.name", "chat"),
      stringAttr("gen_ai.provider.name", provider),
      stringAttr("gen_ai.request.model", model),
      stringAttr("gen_ai.response.model", model),
      stringAttr("gen_ai.response.id", responseId),
      stringAttr("session.id", input.sessionId),
      stringAttr("user.id", input.userId),
      stringAttr("gen_ai.conversation.id", input.sessionId),
      intAttr("gen_ai.usage.input_tokens", span.usage.inputTokens),
      intAttr("gen_ai.usage.output_tokens", span.usage.outputTokens),
      floatAttr("gen_ai.usage.total_cost", span.usage.totalCostUsd),
      intAttr("gen_ai.server.time_to_first_token", span.usage.ttftNs ?? 180_000_000),
      stringArrayAttr("gen_ai.response.finish_reasons", span.finishReasons ?? ["stop"]),
      stringArrayAttr("langfuse.trace.tags", input.tags),
      jsonAttr("gen_ai.system_instructions", input.systemInstructions),
      jsonAttr("gen_ai.input.messages", span.inputMessages),
      jsonAttr("gen_ai.output.messages", span.outputMessages),
    ]

    if ((span.usage.reasoningTokens ?? 0) > 0) {
      attributes.push(intAttr("gen_ai.usage.reasoning_tokens", span.usage.reasoningTokens ?? 0))
    }

    for (const [key, value] of Object.entries(input.metadata)) {
      attributes.push(stringAttr(`langfuse.trace.metadata.${key}`, value))
    }

    const request: OtlpExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: {
            attributes: [stringAttr("service.name", input.serviceName)],
          },
          scopeSpans: [
            {
              scope: {
                name: scopeName,
                version: scopeVersion,
              },
              spans: [
                {
                  traceId: input.traceId,
                  spanId,
                  ...(index === 0 ? {} : { parentSpanId: rootSpanId }),
                  name: `chat ${model}`,
                  kind: 3,
                  startTimeUnixNano: toUnixNano(startTime),
                  endTimeUnixNano: toUnixNano(endTime),
                  attributes,
                  status: {
                    code: 1,
                  },
                },
              ],
            },
          ],
        },
      ],
    }

    return {
      label: span.label,
      offsetMs: span.offsetMs,
      traceId: input.traceId,
      spanId,
      request,
    } satisfies BuiltTraceSpan
  })
}
