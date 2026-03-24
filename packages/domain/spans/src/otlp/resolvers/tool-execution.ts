import type { OtlpKeyValue } from "../types.ts"
import { type Candidate, fromString } from "./utils.ts"

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
]

function jsonStringify(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

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
]

const toolOutputCandidates: Candidate<string>[] = [
  fromJsonOrString("gen_ai.tool.call.result"), // OTEL GenAI v1.37+
  fromString("ai.toolCall.result"), // Vercel AI SDK
  fromString("output.value"), // OpenInference / Arize Phoenix
  fromString("traceloop.entity.output"), // OpenLLMetry / Traceloop
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

function first<T>(candidates: readonly Candidate<T>[], attrs: readonly OtlpKeyValue[]): T | undefined {
  for (const c of candidates) {
    const v = c.resolve(attrs)
    if (v !== undefined) return v
  }
  return undefined
}

export function resolveToolExecution(spanAttrs: readonly OtlpKeyValue[], operation: string): ResolvedToolExecution {
  if (operation !== "execute_tool") return EMPTY_TOOL_EXECUTION

  return {
    toolCallId: first(toolCallIdCandidates, spanAttrs) ?? "",
    toolName: first(toolNameCandidates, spanAttrs) ?? "",
    toolInput: jsonStringify(first(toolInputCandidates, spanAttrs) ?? ""),
    toolOutput: jsonStringify(first(toolOutputCandidates, spanAttrs) ?? ""),
  }
}
