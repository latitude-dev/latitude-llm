import type { TraceDetail } from "@domain/spans"
import { MAX_STAGES_PER_PROMPT } from "./shared.ts"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Refusal Strategy - Multi-stage classifier
// ---------------------------------------------------------------------------

const REFUSAL_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the Refusal annotation queue.

A refusal is when the assistant incorrectly declines, deflects, or over-restricts a request that is:
- Allowed by product policy
- Answerable within system capabilities
- Has required context and permissions

This queue captures incorrect refusals anywhere in the conversation. Later recovery does NOT erase an earlier refusal incident.

Do NOT match:
- Correct safety refusals for unsafe/illegal requests
- Unsupported or permission-blocked requests the system genuinely cannot handle
- Missing-context blockers when information is truly unavailable
- Rate limit or capacity responses

Rules:
- Review each candidate stage independently.
- Return matched=true if ANY stage shows an incorrect refusal.
- If uncertain about whether a refusal is correct, return matched=false.
- Return no explanation outside the structured output.
`.trim()

// ---------------------------------------------------------------------------
// Conversation Stage types and extraction (collocated with refusal/laziness)
// ---------------------------------------------------------------------------

export interface ConversationStage {
  /** User message block that initiated this stage */
  readonly userMessages: readonly string[]
  /** Assistant's response to the user block */
  readonly assistantMessage: string | null
  /** Whether the assistant used tools in this stage */
  readonly hasToolCalls: boolean
  /** Names of tools used in this stage (deduplicated) */
  readonly toolsUsed: readonly string[]
  /** Index of this stage in the conversation (0-based) */
  readonly stageIndex: number
}

/** Maximum messages per stage to include in context */
const MAX_MESSAGES_PER_STAGE = 4

/**
 * Segment trace into conversation stages.
 * A stage is a contiguous user message block followed by an assistant response.
 */
export function extractConversationStages(trace: Pick<TraceDetail, "allMessages">): readonly ConversationStage[] {
  const stages: ConversationStage[] = []
  let currentUserMessages: string[] = []
  let currentHasToolCalls = false
  const currentToolsUsed = new Set<string>()
  let stageIndex = 0

  for (const message of trace.allMessages) {
    if (message.role === "user") {
      // Accumulate user messages
      for (const part of message.parts) {
        if (part.type === "text" && typeof part.content === "string") {
          const trimmed = part.content.trim()
          if (trimmed) currentUserMessages.push(trimmed)
        }
      }
    } else if (message.role === "assistant") {
      // Extract assistant text and tool usage
      let assistantText = ""
      for (const part of message.parts) {
        if (part.type === "text" && typeof part.content === "string") {
          const trimmed = part.content.trim()
          if (trimmed) assistantText = trimmed
        } else if (part.type === "tool_call") {
          currentHasToolCalls = true
          const toolName = typeof part.name === "string" ? part.name.trim() : ""
          if (toolName) currentToolsUsed.add(toolName)
        }
      }

      // Complete the stage
      stages.push({
        userMessages: currentUserMessages.slice(0, MAX_MESSAGES_PER_STAGE),
        assistantMessage: assistantText || null,
        hasToolCalls: currentHasToolCalls,
        toolsUsed: Array.from(currentToolsUsed),
        stageIndex: stageIndex++,
      })

      // Reset for next stage
      currentUserMessages = []
      currentHasToolCalls = false
      currentToolsUsed.clear()
    }
  }

  return stages
}

// ---------------------------------------------------------------------------
// Refusal-specific stage ranking (collocated with refusal strategy)
// ---------------------------------------------------------------------------

/** Score a stage for refusal likelihood based on assistant message patterns */
export function scoreRefusalLikelihood(stage: ConversationStage): number {
  if (!stage.assistantMessage) return 0

  const text = stage.assistantMessage.toLowerCase()
  let score = 0

  // Refusal patterns - higher weight for explicit refusal language
  const refusalPatterns = [
    { pattern: /\bi (?:can'?t|cannot|am unable to|am not able to)\b/i, weight: 3 },
    { pattern: /\bi'm sorry,? (?:but )?i (?:can'?t|cannot)\b/i, weight: 4 },
    { pattern: /\bi apologize,? (?:but )?i (?:can'?t|cannot)\b/i, weight: 4 },
    { pattern: /\bi (?:won'?t|will not) (?:help|assist|provide|do that|generate)\b/i, weight: 4 },
    { pattern: /\bi (?:must|have to) (?:decline|refuse)\b/i, weight: 4 },
    { pattern: /\b(?:that|this) (?:is|would be) (?:inappropriate|harmful|dangerous|illegal|unethical)\b/i, weight: 2 },
    { pattern: /\bi (?:don'?t|do not) (?:feel )?comfortable (?:helping|doing|with)\b/i, weight: 3 },
    { pattern: /\b(i'm|i am) not able to (?:help|assist|do|provide)\b/i, weight: 3 },
    { pattern: /\b(i'm|i am) not (?:allowed|permitted|authorized)\b/i, weight: 3 },
    { pattern: /\bviolates? (?:my|the) (?:policy|guidelines|programming|instructions)\b/i, weight: 2 },
    { pattern: /\bgoes against (?:my|the) (?:policy|guidelines|values)\b/i, weight: 2 },
    { pattern: /\bnot (?:appropriate|allowed|permitted)\b/i, weight: 2 },
    { pattern: /\b(elevat|escalat|report|flag|contact support)\b/i, weight: 1 },
  ]

  for (const { pattern, weight } of refusalPatterns) {
    if (pattern.test(text)) score += weight
  }

  // Deflection patterns
  const deflectionPatterns = [
    { pattern: /\b(?:instead|alternatively|you could|try)\b/i, weight: 1 },
    { pattern: /\b(?:how about|what about|consider)\b/i, weight: 1 },
  ]

  for (const { pattern, weight } of deflectionPatterns) {
    if (pattern.test(text)) score += weight
  }

  return score
}

/** Rank stages by refusal likelihood and return top K */
export function rankStagesByRefusalLikelihood(
  stages: readonly ConversationStage[],
  topK: number = MAX_STAGES_PER_PROMPT,
): readonly ConversationStage[] {
  return [...stages]
    .map((stage) => ({ stage, score: scoreRefusalLikelihood(stage) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ stage }) => stage)
}

// ---------------------------------------------------------------------------
// Refusal-specific formatting helper
// ---------------------------------------------------------------------------

function formatStageForPrompt(stage: ConversationStage, index: number): string {
  const signals = [
    stage.hasToolCalls ? `tools_used=${stage.toolsUsed.join(", ") || "none"}` : "no_tool_calls",
    `assistant_msg_length=${stage.assistantMessage?.length ?? 0}`,
  ].join(", ")

  return [
    `--- Stage ${index + 1} ---`,
    `User messages:\n${stage.userMessages.join("\n") || "(none)"}`,
    `Assistant response:\n${stage.assistantMessage || "(none)"}`,
    `Work signals: ${signals}`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Refusal Strategy implementation
// ---------------------------------------------------------------------------

export const refusalStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    const stages = extractConversationStages(trace)
    return stages.length > 0
  },

  buildSystemPrompt(): string {
    return REFUSAL_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const allStages = extractConversationStages(trace)
    const topStages = rankStagesByRefusalLikelihood(allStages, MAX_STAGES_PER_PROMPT)

    if (topStages.length === 0) {
      return "No conversation stages found."
    }

    const formattedStages = topStages.map((stage, i) => formatStageForPrompt(stage, i)).join("\n\n")

    return [
      `CANDIDATE STAGES (top ${topStages.length} ranked by refusal likelihood):`,
      formattedStages,
      "",
      "Review each stage. Return matched=true if ANY stage shows an incorrect refusal, deflection, or over-restriction of an allowed request.",
    ].join("\n")
  },
}
