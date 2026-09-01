/**
 * Reads a span dump and reports what actually reached telemetry, then what Latitude's own OTLP
 * parsers extract from it. Runs the real `@domain/spans` code by relative path so the verdict
 * matches ingest without a Latitude instance running.
 *
 * Usage: pnpm tsx examples/tools-app/inspect.ts <scenario|all>
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseContent } from "../../../../domain/spans/src/otlp/content/index.ts"
import { resolveOperation } from "../../../../domain/spans/src/otlp/resolvers/operation.ts"
import { resolveToolExecution } from "../../../../domain/spans/src/otlp/resolvers/tool-execution.ts"
import type { OtlpKeyValue } from "../../../../domain/spans/src/otlp/types.ts"
import type { DumpedSpan, SpanDump } from "./telemetry.ts"
import { SPANS_DIR } from "./telemetry.ts"

type GenAIPart = { type: string; id?: string | null; name?: string; arguments?: unknown; response?: unknown }
type GenAIMessageLike = { role: string; parts?: GenAIPart[] }

export type ToolObservation = {
  toolCallId: string
  toolName: string
  payload: unknown
  source: string
}

export type Inspection = {
  /** Tool call inputs telemetry carried, keyed by tool call id. */
  calls: Map<string, ToolObservation>
  /** Tool outputs telemetry carried, keyed by tool call id. */
  results: Map<string, ToolObservation>
  executeToolSpans: number
  /** What Latitude's ingest parsers would surface in the conversation view. */
  latitudeCalls: Set<string>
  latitudeResults: Set<string>
}

function toOtlpAttrs(attributes: Record<string, unknown>): OtlpKeyValue[] {
  return Object.entries(attributes).map(([key, value]) => {
    if (typeof value === "string") return { key, value: { stringValue: value } }
    if (typeof value === "boolean") return { key, value: { boolValue: value } }
    if (typeof value === "number") {
      return Number.isInteger(value)
        ? { key, value: { intValue: String(value) } }
        : { key, value: { doubleValue: value } }
    }
    if (Array.isArray(value)) {
      return {
        key,
        value: {
          arrayValue: {
            values: value.map((item) =>
              typeof item === "string" ? { stringValue: item } : { stringValue: JSON.stringify(item) },
            ),
          },
        },
      }
    }
    return { key, value: { stringValue: JSON.stringify(value) } }
  })
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function preview(value: unknown, max = 100): string {
  if (value === undefined) return "–"
  const text = typeof value === "string" ? value : JSON.stringify(value)
  if (text === undefined) return "–"
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** GenAI semconv messages (`@ai-sdk/otel`, AI SDK v7). */
function readGenAiMessages(attributes: Record<string, unknown>, key: string): GenAIMessageLike[] {
  const parsed = parseJson(attributes[key])
  return Array.isArray(parsed) ? (parsed as GenAIMessageLike[]) : []
}

/** Vercel `ai.*` messages (AI SDK v6): prompt messages carry `tool-result` content parts. */
function readVercelPromptToolResults(attributes: Record<string, unknown>): ToolObservation[] {
  const messages = parseJson(attributes["ai.prompt.messages"])
  if (!Array.isArray(messages)) return []
  const observations: ToolObservation[] = []
  for (const message of messages as { content?: unknown }[]) {
    if (!Array.isArray(message.content)) continue
    for (const raw of message.content as {
      type?: string
      toolCallId?: string
      toolName?: string
      output?: unknown
    }[]) {
      if (raw.type !== "tool-result" && raw.type !== "tool-error") continue
      observations.push({
        toolCallId: raw.toolCallId ?? "?",
        toolName: raw.toolName ?? "?",
        payload: raw.output,
        source: "ai.prompt.messages",
      })
    }
  }
  return observations
}

function readVercelResponseToolCalls(attributes: Record<string, unknown>): ToolObservation[] {
  const parsed = parseJson(attributes["ai.response.toolCalls"])
  if (!Array.isArray(parsed)) return []
  return (parsed as { toolCallId?: string; toolName?: string; input?: unknown }[]).map((call) => ({
    toolCallId: call.toolCallId ?? "?",
    toolName: call.toolName ?? "?",
    payload: call.input,
    source: "ai.response.toolCalls",
  }))
}

function observationsFromGenAiMessages(messages: GenAIMessageLike[], key: string) {
  const calls: ToolObservation[] = []
  const results: ToolObservation[] = []
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type === "tool_call") {
        calls.push({
          toolCallId: part.id ?? "?",
          toolName: part.name ?? "?",
          payload: part.arguments,
          source: key,
        })
      } else if (part.type === "tool_call_response") {
        results.push({ toolCallId: part.id ?? "?", toolName: "", payload: part.response, source: key })
      }
    }
  }
  return { calls, results }
}

function orderSpans(spans: DumpedSpan[]): (DumpedSpan & { depth: number })[] {
  const childrenOf = new Map<string, DumpedSpan[]>()
  const known = new Set(spans.map((span) => span.spanId))
  for (const span of spans) {
    const parentKey = span.parentSpanId && known.has(span.parentSpanId) ? span.parentSpanId : "root"
    childrenOf.set(parentKey, [...(childrenOf.get(parentKey) ?? []), span])
  }
  const ordered: (DumpedSpan & { depth: number })[] = []
  const walk = (parentKey: string, depth: number) => {
    for (const child of (childrenOf.get(parentKey) ?? []).sort((a, b) => a.startTimeMs - b.startTimeMs)) {
      ordered.push({ ...child, depth })
      walk(child.spanId, depth + 1)
    }
  }
  walk("root", 0)
  return ordered
}

export function inspectDump(dump: SpanDump): Inspection {
  const inspection: Inspection = {
    calls: new Map(),
    results: new Map(),
    executeToolSpans: 0,
    latitudeCalls: new Set(),
    latitudeResults: new Set(),
  }

  console.log(
    `\n── spans (${dump.spans.length}) ─ scenario: ${dump.scenario} ─ ai ${dump.aiSdkVersion} ─ ${dump.model}`,
  )

  for (const span of orderSpans(dump.spans)) {
    const attrs = toOtlpAttrs(span.attributes)
    const operation = resolveOperation(attrs, span.name, span.scope, Boolean(span.parentSpanId))
    const indent = "  ".repeat(span.depth)
    const dropped = span.passesSmartFilter ? "" : "  [dropped by smart filter]"
    console.log(`${indent}▸ ${span.name}  op=${operation}${dropped}`)

    const output = observationsFromGenAiMessages(
      readGenAiMessages(span.attributes, "gen_ai.output.messages"),
      "gen_ai.output.messages",
    )
    const input = observationsFromGenAiMessages(
      readGenAiMessages(span.attributes, "gen_ai.input.messages"),
      "gen_ai.input.messages",
    )
    const observedCalls = [...output.calls, ...readVercelResponseToolCalls(span.attributes)]
    const observedResults = [...output.results, ...input.results, ...readVercelPromptToolResults(span.attributes)]

    if (operation === "execute_tool") {
      const execution = resolveToolExecution(attrs, operation)
      inspection.executeToolSpans++
      const toolCallId = execution.toolCallId || span.name
      if (execution.toolInput) {
        observedCalls.push({
          toolCallId,
          toolName: execution.toolName,
          payload: execution.toolInput,
          source: "tool span arguments",
        })
      }
      if (execution.toolOutput) {
        observedResults.push({
          toolCallId,
          toolName: execution.toolName,
          payload: execution.toolOutput,
          source: "tool span result",
        })
      }
      console.log(`${indent}    execute_tool ${execution.toolName || "?"}`)
      console.log(`${indent}      arguments  ${preview(execution.toolInput)}`)
      console.log(`${indent}      result     ${preview(execution.toolOutput)}`)
    }

    for (const call of observedCalls) {
      if (!inspection.calls.has(call.toolCallId)) inspection.calls.set(call.toolCallId, call)
      console.log(`${indent}    tool call   ${call.toolName || "?"}  ${preview(call.payload)}   (${call.source})`)
    }
    for (const result of observedResults) {
      if (!inspection.results.has(result.toolCallId)) inspection.results.set(result.toolCallId, result)
      console.log(`${indent}    tool result ${result.toolName || "?"}  ${preview(result.payload)}   (${result.source})`)
    }

    const parsed = parseContent(attrs)
    for (const message of [...parsed.outputMessages, ...parsed.inputMessages] as GenAIMessageLike[]) {
      for (const part of message.parts ?? []) {
        if (part.type === "tool_call") inspection.latitudeCalls.add(part.id ?? "?")
        if (part.type === "tool_call_response") inspection.latitudeResults.add(part.id ?? "?")
      }
    }
    if (parsed.inputMessages.length || parsed.outputMessages.length || parsed.toolDefinitions.length) {
      console.log(
        `${indent}    latitude parse  in=${parsed.inputMessages.length}msg out=${parsed.outputMessages.length}msg ` +
          `toolDefs=${parsed.toolDefinitions.length}`,
      )
    }
  }

  return inspection
}

export function reportTotals(inspection: Inspection, appSide: { calls: string[]; results: string[] }): void {
  const missingCalls = appSide.calls.filter((id) => !inspection.calls.has(id))
  const missingResults = appSide.results.filter((id) => !inspection.results.has(id))

  console.log("\n── verdict")
  console.log(`  app process received   ${appSide.calls.length} tool call(s), ${appSide.results.length} result(s)`)
  console.log(`  telemetry carried      ${inspection.calls.size} tool call(s), ${inspection.results.size} result(s)`)
  console.log(`  execute_tool spans     ${inspection.executeToolSpans}`)
  console.log(
    `  Latitude would show    ${inspection.latitudeCalls.size} tool_call, ${inspection.latitudeResults.size} tool_call_response`,
  )
  if (missingCalls.length || missingResults.length) {
    console.log(`  MISSING                ${missingCalls.length} input(s), ${missingResults.length} output(s)`)
    for (const id of missingResults) console.log(`    no output in telemetry for tool call ${id}`)
  } else {
    console.log("  MISSING                nothing — telemetry matches what the app saw")
  }
}

function main(): void {
  const target = process.argv[2] ?? "all"
  if (!existsSync(SPANS_DIR)) {
    console.log(`No dumps in ${SPANS_DIR}. Run run.ts first.`)
    return
  }
  const scenarios =
    target === "all"
      ? readdirSync(SPANS_DIR)
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.replace(/\.json$/, ""))
      : [target]

  if (scenarios.length === 0) {
    console.log(`No dumps in ${SPANS_DIR}. Run run.ts first.`)
    return
  }

  for (const scenario of scenarios) {
    inspectDump(JSON.parse(readFileSync(join(SPANS_DIR, `${scenario}.json`), "utf8")) as SpanDump)
  }
}

if (process.argv[1]?.endsWith("inspect.ts")) main()
