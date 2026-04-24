import type { TraceDetail } from "@domain/spans"
import { truncateExcerpt } from "./shared.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Trashing Strategy - tool-call sequence view
// ---------------------------------------------------------------------------

const TRASHING_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the Trashing annotation queue.

Trashing is when an agent CYCLES between tool calls without making real progress — repeating the same calls, oscillating between states, or accumulating tool invocations that do not move the task forward.

You will be given the ordered sequence of tool calls with their arguments. Judge whether the sequence advances the work or spins in place.

================================================================================
TRASHING PATTERNS (flag when the tool-call sequence shows these)
================================================================================

1. IDENTICAL-CALL REPETITION
   The same tool invoked with the same (or near-identical) arguments multiple times in a row with no intervening change of state.
   • read_file(foo.ts) → read_file(foo.ts) → read_file(foo.ts)
   • search("term") → search("term") with identical query

2. OSCILLATION BETWEEN STATES
   Alternating A-B-A-B(-A-B) patterns that never settle.
   • enable_feature(x) → disable_feature(x) → enable_feature(x) → ...
   • open_tab → close_tab → open_tab → close_tab

3. CYCLIC TOOL SEQUENCES
   The same multi-step sequence repeats without the task advancing.
   • [list_dir, read_file, search] → [list_dir, read_file, search] → ...
   • Re-running the exact exploration loop with no new conclusions

4. ACCUMULATION WITHOUT PROGRESS
   Many tool calls but no convergence toward a final answer or completed action.
   • Dozens of reads/searches followed by no write, no answer, no decision
   • Tool calls branching out indefinitely with no narrowing

5. ARGUMENT DRIFT WITHOUT DIRECTION
   Arguments vary but with no coherent strategy — random trial-and-error on the same tool.
   • search("a"), search("b"), search("c"), search("d") with no refinement logic

================================================================================
DO NOT FLAG
================================================================================

- Legitimate retries after a transient error (timeout, 5xx, rate limit) — typically 1-3 retries
- Iterative refinement that is visibly CONVERGING (each call uses output of the previous)
- Parallel independent calls to gather distinct pieces of information
- Polling a long-running job with backoff
- Re-reading a file after it was modified (state actually changed)
- Short traces with only 1-2 tool calls — too few to detect cycling
- Exploratory branching that ends in a committed action or answer

================================================================================
ANALYSIS APPROACH
================================================================================

1. Read the tool-call sequence in order; ignore message text unless needed to judge state change.
2. Look for the patterns above — repetition, oscillation, cycles, accumulation.
3. Ask: does each call CHANGE STATE or PRODUCE NEW INFORMATION that the next call uses?
   If calls repeat with no such change, that is trashing.
4. Point to the specific repeated or oscillating sub-sequence as your evidence.

================================================================================
DECISION RULE
================================================================================

Flag only when the sequence clearly spins in place or loops without progress. When uncertain, or when the repetition is explained by transient errors or legitimate refinement, return matched=false.

Return no explanation outside the structured output.
`.trim()

// ---------------------------------------------------------------------------
// Tool-call sequence extraction
// ---------------------------------------------------------------------------

interface ToolCallEntry {
  readonly turn: number
  readonly name: string
  readonly argsPreview: string
}

const MAX_TOOL_CALLS_IN_PROMPT = 30
const MAX_TOOL_ARG_PREVIEW = 160
const MIN_TOOL_CALLS_FOR_DETECTION = 3

function previewArguments(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return truncateExcerpt(value, MAX_TOOL_ARG_PREVIEW)
  try {
    return truncateExcerpt(JSON.stringify(value), MAX_TOOL_ARG_PREVIEW)
  } catch {
    return ""
  }
}

function extractToolCallSequence(trace: Pick<TraceDetail, "allMessages">): readonly ToolCallEntry[] {
  const entries: ToolCallEntry[] = []
  let turn = 0

  for (const message of trace.allMessages) {
    if (message.role !== "assistant") continue
    turn++

    for (const part of message.parts) {
      if (part.type !== "tool_call") continue
      const name = typeof part.name === "string" ? part.name.trim() : ""
      if (!name) continue

      const rawArgs = (part as { arguments?: unknown }).arguments
      entries.push({
        turn,
        name,
        argsPreview: previewArguments(rawArgs),
      })
    }
  }

  return entries
}

function formatToolCallSequence(entries: readonly ToolCallEntry[]): string {
  const shown = entries.slice(0, MAX_TOOL_CALLS_IN_PROMPT)
  const omitted = entries.length - shown.length

  const lines = shown.map((entry, i) => {
    const args = entry.argsPreview ? ` ${entry.argsPreview}` : ""
    return `${i + 1}. [turn ${entry.turn}] ${entry.name}(${args})`
  })

  if (omitted > 0) {
    lines.push(`... ${omitted} more tool calls omitted`)
  }

  return lines.join("\n")
}

function summarizeToolUsage(entries: readonly ToolCallEntry[]): string {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted.map(([name, count]) => `${name}=${count}`).join(", ")
}

// ---------------------------------------------------------------------------
// Deterministic detection — LoopGuard-style signature counting
// ---------------------------------------------------------------------------

/**
 * Threshold for the matched branch. Lifted from the LoopGuard pattern
 * (agentpatterns.tech/failures/infinite-loop): three identical tool+args
 * invocations is the canonical "hard loop" signal used across LangChain,
 * browser-use, and similar agent frameworks.
 */
const MATCHED_IDENTICAL_CALL_THRESHOLD = 3

/**
 * Thresholds for the ambiguous branch. ≥5 total calls with one tool
 * dominating ≥60% of them is a plausible cycle worth LLM verification,
 * but isn't a hard match (could be legitimate narrowing-via-search etc.).
 */
const AMBIGUOUS_TOTAL_CALLS_THRESHOLD = 5
const AMBIGUOUS_DOMINANT_SHARE_THRESHOLD = 0.6

const countBy = <T, K>(items: readonly T[], key: (item: T) => K): Map<K, number> => {
  const counts = new Map<K, number>()
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  }
  return counts
}

const maxCount = (counts: Map<unknown, number>): number => {
  let max = 0
  for (const count of counts.values()) {
    if (count > max) max = count
  }
  return max
}

// ---------------------------------------------------------------------------
// Trashing Strategy implementation
// ---------------------------------------------------------------------------

export const trashingStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    return extractToolCallSequence(trace).length >= MIN_TOOL_CALLS_FOR_DETECTION
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const entries = extractToolCallSequence(trace)
    if (entries.length < MIN_TOOL_CALLS_FOR_DETECTION) {
      return { kind: "no-match" }
    }

    const signatureCounts = countBy(entries, (entry) => `${entry.name} ${entry.argsPreview}`)
    const maxSignatureCount = maxCount(signatureCounts)

    if (maxSignatureCount >= MATCHED_IDENTICAL_CALL_THRESHOLD) {
      return {
        kind: "matched",
        feedback: `Trashing: identical tool+args invocation repeated ${maxSignatureCount} times`,
      }
    }

    if (entries.length >= AMBIGUOUS_TOTAL_CALLS_THRESHOLD) {
      const toolNameCounts = countBy(entries, (entry) => entry.name)
      const dominantShare = maxCount(toolNameCounts) / entries.length
      if (dominantShare >= AMBIGUOUS_DOMINANT_SHARE_THRESHOLD) {
        return { kind: "ambiguous" }
      }
    }

    return { kind: "no-match" }
  },

  buildSystemPrompt(): string {
    return TRASHING_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const entries = extractToolCallSequence(trace)

    if (entries.length === 0) {
      return "No tool calls found in this trace."
    }

    return [
      `TOTAL TOOL CALLS: ${entries.length}`,
      `TOOL USAGE COUNTS: ${summarizeToolUsage(entries)}`,
      "",
      "TOOL CALL SEQUENCE (in order):",
      formatToolCallSequence(entries),
      "",
      "Review the sequence for repetition, oscillation, or cycles without progress. Return matched=true only if the agent is clearly spinning in place.",
    ].join("\n")
  },
}
