import { stringifyPayload } from "../../helpers/message-payload.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"
import { attrsFromMetadata, type Candidate, first, fromString } from "./utils.ts"

const toolCallIdCandidates: Candidate<string>[] = [
  fromString("gen_ai.tool.call.id"), // OTEL GenAI v1.37+
  fromString("ai.toolCall.id"), // Vercel AI SDK
  fromString("tool_call.id"), // OpenInference / Arize Phoenix
]

const toolNameCandidates: Candidate<string>[] = [
  fromString("gen_ai.tool.name"), // OTEL GenAI v1.37+
  fromString("ai.toolCall.name"), // Vercel AI SDK
  fromString("tool.name"), // OpenInference / Arize Phoenix
  fromString("traceloop.entity.name"), // OpenLLMetry / Traceloop
  fromString("openai.agents.function.name"), // Latitude openai-agents TS bridge
]

function fromJsonOrString(key: string): Candidate<string> {
  return {
    resolve: (attrs) => {
      const kv = attrs.find((a) => a.key === key)
      if (!kv?.value) return undefined

      if (kv.value.stringValue !== undefined) return kv.value.stringValue || undefined
      if (kv.value.kvlistValue?.values) {
        const obj: Record<string, unknown> = {}
        for (const v of kv.value.kvlistValue.values) {
          obj[v.key] = v.value?.stringValue ?? v.value?.intValue ?? v.value?.doubleValue ?? v.value?.boolValue
        }
        return JSON.stringify(obj)
      }
      return undefined
    },
  }
}

const toolInputCandidates: Candidate<string>[] = [
  fromJsonOrString("gen_ai.tool.call.arguments"), // OTEL GenAI v1.37+
  fromString("ai.toolCall.args"), // Vercel AI SDK
  fromString("input.value"), // OpenInference / Arize Phoenix
  fromString("traceloop.entity.input"), // OpenLLMetry / Traceloop
  fromString("openai.agents.function.input"), // Latitude openai-agents TS bridge
]

const toolOutputCandidates: Candidate<string>[] = [
  fromJsonOrString("gen_ai.tool.call.result"), // OTEL GenAI v1.37+
  fromString("ai.toolCall.result"), // Vercel AI SDK
  fromString("output.value"), // OpenInference / Arize Phoenix
  fromString("traceloop.entity.output"), // OpenLLMetry / Traceloop
  fromString("openai.agents.function.output"), // Latitude openai-agents TS bridge
]

interface ResolvedToolExecution {
  readonly toolCallId: string
  readonly toolName: string
  readonly toolInput: string
  readonly toolOutput: string
}

const EMPTY_TOOL_EXECUTION: ResolvedToolExecution = {
  toolCallId: "",
  toolName: "",
  toolInput: "",
  toolOutput: "",
}

export function resolveToolExecution(spanAttrs: readonly OtlpKeyValue[], operation: string): ResolvedToolExecution {
  if (operation !== "execute_tool") return EMPTY_TOOL_EXECUTION

  return {
    toolCallId: first(toolCallIdCandidates, spanAttrs) ?? "",
    toolName: first(toolNameCandidates, spanAttrs) ?? "",
    toolInput: stringifyPayload(first(toolInputCandidates, spanAttrs)),
    toolOutput: stringifyPayload(first(toolOutputCandidates, spanAttrs)),
  }
}

/**
 * `tool_call_id` and `toolCallId` are what a vendor SDK writes into its own metadata. They are not
 * OTEL attributes — the semconv spelling is the dotted `tool_call.id` above — so they are not
 * candidates, and a live span should not resolve by them.
 */
const VENDOR_TOOL_CALL_ID_KEYS = ["tool_call_id", "toolCallId"] as const

const vendorToolCallId = (attrs: readonly OtlpKeyValue[]): string | undefined =>
  VENDOR_TOOL_CALL_ID_KEYS.reduce<string | undefined>((found, key) => found ?? stringAttr(attrs, key), undefined)

/**
 * `resolveToolExecution` for a span read out of a source's API rather than off OTLP attributes.
 *
 * Same shape, same `execute_tool` gate and the same candidate lists, so a tool span groups with the
 * same tool ingested live. The row's `input` and `output` are the call's arguments and result — the
 * correspondence the attribute resolver relies on when it reads OpenInference's `input.value` — and
 * `input` is read for the call id too, for the sources that put it inside the arguments rather than
 * beside them.
 *
 * `spanName` is only a fallback for the tool's name because it is only sometimes the tool's: Langfuse
 * and LangSmith rename a tool span after the tool it ran, but Braintrust keeps the instrumentation's
 * own name, which for Pydantic AI is `running tool: <name>` — so tool analytics grew a set of tools
 * called `running tool: lookup_order` that never grouped with the same tool ingested live.
 */
export function resolveToolExecutionFromMetadata({
  metadata,
  operation,
  spanName,
  input,
  output,
}: {
  readonly metadata: Record<string, unknown> | null | undefined
  readonly operation: string
  readonly spanName: string
  readonly input: unknown
  readonly output: unknown
}): ResolvedToolExecution {
  if (operation !== "execute_tool") return EMPTY_TOOL_EXECUTION

  const attrs = attrsFromMetadata(metadata)
  return {
    toolCallId:
      first(toolCallIdCandidates, attrs) ?? vendorToolCallId(attrs) ?? vendorToolCallId(attrsFromMetadata(input)) ?? "",
    toolName: first(toolNameCandidates, attrs) ?? spanName,
    toolInput: stringifyPayload(input),
    toolOutput: stringifyPayload(output),
  }
}
