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

export type SeedSpanUsage = {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalCostUsd: number
  readonly reasoningTokens?: number
  readonly ttftNs?: number
}

type SeedSpanBaseDefinition = {
  readonly label: string
  readonly offsetMs: number
  readonly durationMs: number
  readonly parentLabel?: string
}

export type SeedChatSpanDefinition = SeedSpanBaseDefinition & {
  readonly type: "chat"
  readonly inputMessages: readonly SeedMessage[]
  readonly outputMessages: readonly SeedMessage[]
  readonly usage: SeedSpanUsage
  readonly finishReasons?: readonly string[]
}

export type SeedToolSpanDefinition = SeedSpanBaseDefinition & {
  readonly type: "tool"
  readonly toolName: string
  readonly toolCallId: string
  readonly toolInput: unknown
  readonly toolOutput: unknown
  readonly name?: string
}

export type SeedWrapperSpanDefinition = SeedSpanBaseDefinition & {
  readonly type: "wrapper"
  readonly name: string
  readonly operation?: string
}

export type SeedSpanDefinition = SeedChatSpanDefinition | SeedToolSpanDefinition | SeedWrapperSpanDefinition

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
  readonly durationMs: number
  readonly emitAtMs: number
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

function buildSharedAttributes(input: {
  readonly sessionId: string
  readonly userId: string
  readonly tags: readonly string[]
  readonly metadata: Readonly<Record<string, string>>
}): OtlpKeyValue[] {
  const attributes: OtlpKeyValue[] = [
    stringAttr("session.id", input.sessionId),
    stringAttr("user.id", input.userId),
    stringAttr("gen_ai.conversation.id", input.sessionId),
    stringArrayAttr("langfuse.trace.tags", input.tags),
  ]

  for (const [key, value] of Object.entries(input.metadata)) {
    attributes.push(stringAttr(`langfuse.trace.metadata.${key}`, value))
  }

  return attributes
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
  const scopeName = input.scopeName ?? "@tools/live-seeds"
  const scopeVersion = input.scopeVersion ?? "1.0.0"
  const spanIdEntries = input.spans.map(
    (span, index) => [span.label, hashHex(`${input.traceId}:${span.label}:${index.toString()}`, 16)] as const,
  )
  const spanIds = new Map(spanIdEntries)

  return input.spans.map((span, _index) => {
    const spanId = spanIds.get(span.label) ?? hashHex(`${input.traceId}:${span.label}:fallback`, 16)
    const startTime = new Date(input.baseTime.getTime() + span.offsetMs)
    const endTime = new Date(startTime.getTime() + span.durationMs)
    const parentSpanId = span.parentLabel === undefined ? undefined : spanIds.get(span.parentLabel)

    if (span.parentLabel !== undefined && parentSpanId === undefined) {
      throw new Error(`Unknown parent span label "${span.parentLabel}" for span "${span.label}"`)
    }

    const attributes = buildSharedAttributes({
      sessionId: input.sessionId,
      userId: input.userId,
      tags: input.tags,
      metadata: input.metadata,
    })

    const responseId = `seed-${hashHex(`${input.traceId}:${spanId}:response`, 12)}`
    let name = span.type === "wrapper" ? span.name : `chat ${model}`
    let kind = 3

    switch (span.type) {
      case "chat": {
        attributes.push(
          stringAttr("gen_ai.operation.name", "chat"),
          stringAttr("gen_ai.provider.name", provider),
          stringAttr("gen_ai.request.model", model),
          stringAttr("gen_ai.response.model", model),
          stringAttr("gen_ai.response.id", responseId),
          intAttr("gen_ai.usage.input_tokens", span.usage.inputTokens),
          intAttr("gen_ai.usage.output_tokens", span.usage.outputTokens),
          floatAttr("gen_ai.usage.total_cost", span.usage.totalCostUsd),
          intAttr("gen_ai.server.time_to_first_token", span.usage.ttftNs ?? 180_000_000),
          stringArrayAttr("gen_ai.response.finish_reasons", span.finishReasons ?? ["stop"]),
          jsonAttr("gen_ai.system_instructions", input.systemInstructions),
          jsonAttr("gen_ai.input.messages", span.inputMessages),
          jsonAttr("gen_ai.output.messages", span.outputMessages),
        )

        if ((span.usage.reasoningTokens ?? 0) > 0) {
          attributes.push(intAttr("gen_ai.usage.reasoning_tokens", span.usage.reasoningTokens ?? 0))
        }

        name = `chat ${model}`
        kind = 3
        break
      }
      case "tool": {
        attributes.push(
          stringAttr("gen_ai.operation.name", "execute_tool"),
          stringAttr("gen_ai.tool.name", span.toolName),
          stringAttr("gen_ai.tool.call.id", span.toolCallId),
          stringAttr("gen_ai.tool.type", "function"),
          jsonAttr("gen_ai.tool.input", span.toolInput),
          jsonAttr("gen_ai.tool.output", span.toolOutput),
        )
        name = span.name ?? `execute_tool ${span.toolName}`
        kind = 2
        break
      }
      case "wrapper": {
        attributes.push(stringAttr("gen_ai.operation.name", span.operation ?? "invoke_agent"))
        name = span.name
        kind = 2
        break
      }
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
                  ...(parentSpanId === undefined ? {} : { parentSpanId }),
                  name,
                  kind,
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
      durationMs: span.durationMs,
      emitAtMs: span.offsetMs + span.durationMs,
      traceId: input.traceId,
      spanId,
      request,
    } satisfies BuiltTraceSpan
  })
}
