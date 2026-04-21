import type { TraceDetail } from "@domain/spans"
import { type ConversationStage, extractConversationStages } from "./refusal.ts"
import { MAX_STAGES_PER_PROMPT } from "./shared.ts"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Laziness Strategy - Multi-stage classifier with work signals
// ---------------------------------------------------------------------------

const LAZINESS_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the Laziness annotation queue.

Laziness is when the assistant:
- Avoids doing the requested work
- Stops early without justification
- Gives a shallow partial answer
- Pushes obvious work back to the user

This queue captures laziness incidents anywhere in the conversation. Later recovery does NOT erase an earlier laziness incident.

Do NOT match:
- Explicit refusal that belongs in the Refusal queue
- Genuine blockers caused by missing access, missing context, or policy constraints
- Rate limit or capacity responses
- Tool-only responses when that was appropriate

Rules:
- Review each candidate stage independently.
- Return matched=true if ANY stage shows the assistant avoiding work.
- Consider work signals: tool_calls, tools_used, message_length.
- If uncertain, return matched=false.
- Return no explanation outside the structured output.
`.trim()

// ---------------------------------------------------------------------------
// Laziness-specific stage ranking (collocated with laziness strategy)
// ---------------------------------------------------------------------------

/** Score a stage for laziness likelihood based on assistant message patterns */
function scoreLazinessLikelihood(stage: ConversationStage): number {
  if (!stage.assistantMessage) return 0

  const text = stage.assistantMessage.toLowerCase()
  let score = 0

  // Punt patterns - pushing work back to user
  const puntPatterns = [
    { pattern: /\byou (?:can|should|could|might want to|may want to)\b/i, weight: 3 },
    { pattern: /\byou'(?:ll|d) (?:need to|have to|want to)\b/i, weight: 3 },
    { pattern: /\blet me know (?:if|when)\b/i, weight: 2 },
    { pattern: /\bfee?l free to\b/i, weight: 2 },
    { pattern: /\b(?:try|attempt|check|look into|explore) (?:it|that|this|yourself)\b/i, weight: 2 },
    { pattern: /\bup to you\b/i, weight: 2 },
    { pattern: /\bi (?:suggest|recommend) (?:you|that you)\b/i, weight: 2 },
    { pattern: /\b(?:refer to|check|consult) (?:the|your)\b/i, weight: 1 },
  ]

  for (const { pattern, weight } of puntPatterns) {
    if (pattern.test(text)) score += weight
  }

  // Shallow answer patterns
  const shallowPatterns = [
    { pattern: /\b(?:in summary|to summarize|in short|briefly)\b/i, weight: 1 },
    { pattern: /\bhere(?:'s| is) (?:a|an|the) (?:brief|quick|short|simple)\b/i, weight: 1 },
    { pattern: /\bwithout (?:more|further|additional)\b/i, weight: 1 },
    { pattern: /\blimited (?:information|context|details)\b/i, weight: 1 },
  ]

  for (const { pattern, weight } of shallowPatterns) {
    if (pattern.test(text)) score += weight
  }

  // Short response indicator (heuristic based on content density)
  if (stage.assistantMessage.length < 100 && !stage.hasToolCalls) {
    score += 1
  }

  // Lack of work signals
  if (!stage.hasToolCalls && stage.userMessages.length > 0) {
    const userAskingForWork = stage.userMessages.some((msg) =>
      /\b(?:create|generate|build|write|implement|calculate|analyze|research|find|get|list)\b/i.test(msg),
    )
    if (userAskingForWork) score += 1
  }

  return score
}

/** Rank stages by laziness likelihood and return top K */
function rankStagesByLazinessLikelihood(
  stages: readonly ConversationStage[],
  topK: number = MAX_STAGES_PER_PROMPT,
): readonly ConversationStage[] {
  return [...stages]
    .map((stage) => ({ stage, score: scoreLazinessLikelihood(stage) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ stage }) => stage)
}

// ---------------------------------------------------------------------------
// Work Signals - collocated with laziness strategy (its primary consumer)
// ---------------------------------------------------------------------------

export interface WorkSignals {
  /** Total tool calls across the trace */
  readonly toolCalls: number
  /** Unique tool names used */
  readonly toolsUsed: readonly string[]
  /** Total assistant messages */
  readonly assistantMessages: number
  /** Average assistant message length */
  readonly averageAssistantMessageLength: number
}

/** Maximum tool calls to summarize in work signals */
const MAX_TOOL_CALLS_SUMMARY = 10

/**
 * Extract compact work signals for laziness detection.
 */
export function extractWorkSignals(trace: Pick<TraceDetail, "allMessages">): WorkSignals {
  let toolCalls = 0
  const toolsUsed = new Set<string>()
  let assistantMessages = 0
  let totalAssistantLength = 0

  for (const message of trace.allMessages) {
    if (message.role === "assistant") {
      assistantMessages++
      for (const part of message.parts) {
        if (part.type === "text" && typeof part.content === "string") {
          totalAssistantLength += part.content.length
        } else if (part.type === "tool_call") {
          toolCalls++
          const toolName = typeof part.name === "string" ? part.name.trim() : ""
          if (toolName) toolsUsed.add(toolName)
        }
      }
    }
  }

  return {
    toolCalls: Math.min(toolCalls, MAX_TOOL_CALLS_SUMMARY),
    toolsUsed: Array.from(toolsUsed).slice(0, 10),
    assistantMessages: Math.min(assistantMessages, MAX_TOOL_CALLS_SUMMARY),
    averageAssistantMessageLength: assistantMessages > 0 ? Math.round(totalAssistantLength / assistantMessages) : 0,
  }
}

/**
 * Get work signals for a specific conversation stage.
 */
export function getStageWorkSignals(stage: ConversationStage): WorkSignals {
  return {
    toolCalls: stage.hasToolCalls ? stage.toolsUsed.length : 0,
    toolsUsed: stage.toolsUsed.slice(0, 10),
    assistantMessages: stage.assistantMessage ? 1 : 0,
    averageAssistantMessageLength: stage.assistantMessage?.length ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Laziness Strategy implementation
// ---------------------------------------------------------------------------

export const lazinessStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    const stages = extractConversationStages(trace)
    return stages.length > 0
  },

  buildSystemPrompt(): string {
    return LAZINESS_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const allStages = extractConversationStages(trace)
    const topStages = rankStagesByLazinessLikelihood(allStages, MAX_STAGES_PER_PROMPT)

    if (topStages.length === 0) {
      return "No conversation stages found."
    }

    // Include work signals for each stage
    const formattedStages = topStages
      .map((stage, i) => {
        const workSignals = getStageWorkSignals(stage)
        const signals = [
          `tool_calls=${workSignals.toolCalls}`,
          `tools_used=[${workSignals.toolsUsed.join(", ") || "none"}]`,
          `assistant_messages=${workSignals.assistantMessages}`,
          `avg_msg_length=${workSignals.averageAssistantMessageLength}`,
        ].join(", ")

        return [
          `--- Stage ${i + 1} ---`,
          `Work signals: ${signals}`,
          `User messages:\n${stage.userMessages.join("\n") || "(none)"}`,
          `Assistant response:\n${stage.assistantMessage || "(none)"}`,
        ].join("\n")
      })
      .join("\n\n")

    const overallSignals = extractWorkSignals(trace)

    return [
      `OVERALL WORK SIGNALS:`,
      `total_tool_calls=${overallSignals.toolCalls}`,
      `tools_used=[${overallSignals.toolsUsed.join(", ") || "none"}]`,
      `assistant_messages=${overallSignals.assistantMessages}`,
      ``,
      `CANDIDATE STAGES (top ${topStages.length} ranked by laziness likelihood):`,
      formattedStages,
      "",
      "Review each stage. Return matched=true if ANY stage shows the assistant avoiding work, giving shallow answers, or pushing work back to the user.",
    ].join("\n")
  },
}
