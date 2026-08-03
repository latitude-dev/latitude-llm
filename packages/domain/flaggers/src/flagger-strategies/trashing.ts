import type { FlaggerConversation } from "../conversation.ts"
import { isMessagePart, iterMessageParts } from "./shared.ts"
import type { DetectionResult, FlaggerStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Thrashing Strategy - tool-call sequence view
// ---------------------------------------------------------------------------
//
// NAMING: the slug for this flagger is intentionally "trashing" (a historical typo). It is a
// FROZEN identifier — it is persisted in `flaggers.slug`, in `scores.metadata.flaggerSlug`
// (Postgres + ClickHouse), and exposed as a public API/SDK/MCP key. Do NOT rename the slug.
// The correct user-facing name is "Thrashing": always use that spelling for any UI / display /
// prompt / feedback text (see `annotator.name` below).

const TRASHING_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the Thrashing annotation queue.

Thrashing is when an agent CYCLES between tool calls without making real progress — repeating the same calls, oscillating between states, or accumulating tool invocations that do not move the task forward.

You will be given the ordered sequence of tool calls with their arguments. Judge whether the sequence advances the work or spins in place.

================================================================================
THRASHING PATTERNS (flag when the tool-call sequence shows these)
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
   If calls repeat with no such change, that is thrashing.
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
  readonly messageIndex: number
  readonly turn: number
  readonly name: string
  readonly argsPreview: string
}

const MAX_TOOL_CALLS_IN_PROMPT = 30
const MIN_TOOL_CALLS_FOR_DETECTION = 3

function previewArguments(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

export function extractToolCallSequence(
  conversation: Pick<FlaggerConversation, "allMessages">,
): readonly ToolCallEntry[] {
  const entries: ToolCallEntry[] = []
  let turn = 0

  for (let messageIndex = 0; messageIndex < conversation.allMessages.length; messageIndex++) {
    const message = conversation.allMessages[messageIndex]!
    if (message.role !== "assistant") continue
    turn++

    for (const part of iterMessageParts(message.parts)) {
      if (!isMessagePart(part) || part.type !== "tool_call") continue
      const name = typeof part.name === "string" ? part.name.trim() : ""
      if (!name) continue

      const rawArgs = part.arguments
      entries.push({
        messageIndex,
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
 * Thresholds for the `tool:loop` hint. ≥5 total calls with one tool dominating
 * ≥60% of them is a plausible cycle worth LLM verification, but isn't a hard
 * match (could be legitimate narrowing-via-search etc.).
 */
const TOOL_LOOP_TOTAL_CALLS_THRESHOLD = 5
const TOOL_LOOP_DOMINANT_SHARE_THRESHOLD = 0.6

interface DominantToolUsage {
  readonly name: string
  readonly count: number
  readonly total: number
  readonly share: number
}

/** The dominant tool when the sequence clears the `tool:loop` thresholds, else null. */
export function findDominantToolUsage(entries: readonly ToolCallEntry[]): DominantToolUsage | null {
  if (entries.length < TOOL_LOOP_TOTAL_CALLS_THRESHOLD) return null

  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
  }
  let dominant: { name: string; count: number } | null = null
  for (const [name, count] of counts) {
    if (!dominant || count > dominant.count) dominant = { name, count }
  }
  if (!dominant) return null

  const share = dominant.count / entries.length
  if (share < TOOL_LOOP_DOMINANT_SHARE_THRESHOLD) return null

  return { name: dominant.name, count: dominant.count, total: entries.length, share }
}

const toolCallSignature = (entry: ToolCallEntry): string => `${entry.name}\0${entry.argsPreview}`

const longestConsecutiveSignatureRun = (
  entries: readonly ToolCallEntry[],
): { readonly count: number; readonly messageIndex?: number | undefined } => {
  let bestCount = 0
  let bestMessageIndex: number | undefined
  let currentSignature: string | undefined
  let currentCount = 0
  let currentMessageIndex: number | undefined

  for (const entry of entries) {
    const signature = toolCallSignature(entry)
    if (signature === currentSignature) {
      currentCount++
    } else {
      currentSignature = signature
      currentCount = 1
    }
    currentMessageIndex = entry.messageIndex

    if (currentCount > bestCount) {
      bestCount = currentCount
      bestMessageIndex = currentMessageIndex
    }
  }

  return { count: bestCount, messageIndex: bestMessageIndex }
}

// ---------------------------------------------------------------------------
// Thrashing Strategy implementation
// ---------------------------------------------------------------------------

export const trashingStrategy: FlaggerStrategy = {
  annotator: {
    name: "Thrashing",
    description: "The agent cycles between tools without making progress",
    instructions:
      "Use this queue when the agent repeatedly invokes the same tools or tool sequences, oscillates between states, or accumulates tool calls without advancing toward the goal. Do not use this queue for legitimate retries after transient errors or for iterative refinement that is visibly converging.",
  },

  hintKinds: ["tool:loop", "tool:error", "outlier:tokens", "outlier:duration", "outlier:cost", "moment:stalling"],

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return extractToolCallSequence(conversation).length >= MIN_TOOL_CALLS_FOR_DETECTION
  },

  detectDeterministically(conversation: FlaggerConversation): DetectionResult {
    const entries = extractToolCallSequence(conversation)
    if (entries.length < MIN_TOOL_CALLS_FOR_DETECTION) {
      return { kind: "unmatched" }
    }

    const signatureRun = longestConsecutiveSignatureRun(entries)

    if (signatureRun.count >= MATCHED_IDENTICAL_CALL_THRESHOLD) {
      return {
        kind: "matched",
        feedback: `Thrashing: identical tool+args invocation repeated ${signatureRun.count} times`,
        messageIndex: signatureRun.messageIndex,
      }
    }

    // Dominance-shaped suspicion (one tool ≥60% of ≥5 calls) is the
    // `tool:loop` hint's job (findDominantToolUsage), not this detector's.
    return { kind: "unmatched" }
  },

  buildSystemPrompt(): string {
    return TRASHING_SYSTEM_PROMPT
  },

  buildPrompt(conversation: FlaggerConversation): string {
    const entries = extractToolCallSequence(conversation)

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
