import { type CohortSummary, getMetricPercentileThreshold } from "@domain/spans"
import type { GenAIMessage } from "rosetta-ai"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"

const PREVIEW_MAX_CHARS = 160

export interface TurnHealth {
  readonly tone: "danger" | "warning" | "none"
  readonly reason: string
}

/**
 * The single "spot the bad ones" signal: red for an error or an extreme
 * (top 1%) latency/cost outlier, amber for a top-5% outlier, nothing otherwise.
 * Outlier levels come from the project cohort baselines.
 */
export function computeTurnHealth(
  trace: { readonly errorCount: number; readonly durationNs: number; readonly costTotalMicrocents: number },
  cohorts: CohortSummary | undefined,
): TurnHealth {
  if (trace.errorCount > 0) {
    return { tone: "danger", reason: `${trace.errorCount} ${trace.errorCount === 1 ? "error" : "errors"}` }
  }
  if (!cohorts) return { tone: "none", reason: "" }

  const exceeds = (metric: "durationNs" | "costTotalMicrocents", level: "p95" | "p99") => {
    const threshold = getMetricPercentileThreshold(cohorts.baselines[metric], level)
    return threshold !== null && trace[metric] >= threshold
  }

  if (exceeds("durationNs", "p99")) return { tone: "danger", reason: "Slow — top 1% of traces" }
  if (exceeds("costTotalMicrocents", "p99")) return { tone: "danger", reason: "Expensive — top 1% of traces" }
  if (exceeds("durationNs", "p95")) return { tone: "warning", reason: "Slow — top 5% of traces" }
  if (exceeds("costTotalMicrocents", "p95")) return { tone: "warning", reason: "Expensive — top 5% of traces" }
  return { tone: "none", reason: "" }
}

export interface ToolStats {
  readonly tools: number
  readonly failed: number
}

/** Per-trace tool-call counts from a flat set of session spans. */
export function computeToolStatsByTrace(spans: readonly SpanRecord[]): Map<string, ToolStats> {
  const stats = new Map<string, { tools: number; failed: number }>()
  for (const span of spans) {
    if (span.operation !== "execute_tool") continue
    const entry = stats.get(span.traceId) ?? { tools: 0, failed: 0 }
    entry.tools++
    if (span.statusCode === "error") entry.failed++
    stats.set(span.traceId, entry)
  }
  return stats
}

function messageText(message: GenAIMessage): string {
  const texts: string[] = []
  for (const part of message.parts ?? []) {
    if (part.type === "text" && typeof part.content === "string") texts.push(part.content)
  }
  return texts.join(" ").replace(/\s+/g, " ").trim()
}

function clamp(text: string): string {
  return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}…` : text
}

/** The turn's prompt: text of the last user message (falls back to the last message with text). */
export function inputPreview(messages: readonly GenAIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "user") continue
    const text = messageText(message)
    if (text) return clamp(text)
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messageText(messages[i])
    if (text) return clamp(text)
  }
  return ""
}

/** The turn's reply: text of the first assistant message (falls back to the first message with text). */
export function outputPreview(messages: readonly GenAIMessage[]): string {
  for (const message of messages) {
    if (message.role !== "assistant") continue
    const text = messageText(message)
    if (text) return clamp(text)
  }
  for (const message of messages) {
    const text = messageText(message)
    if (text) return clamp(text)
  }
  return ""
}
