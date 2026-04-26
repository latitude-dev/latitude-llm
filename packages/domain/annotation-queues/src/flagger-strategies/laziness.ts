import type { TraceDetail } from "@domain/spans"
import { type ConversationStage, extractConversationStages } from "./refusal.ts"
import { MAX_STAGES_PER_PROMPT } from "./shared.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

/**
 * Punting / deferral phrases the community and OpenAI devs have identified as
 * "lazy" assistant behavior (HN threads, Semafor "has ChatGPT gotten lazy"
 * article: GPT-4 telling users to "try X" and to "use this as a template").
 *
 * A hit only routes to `ambiguous` — these phrases appear in legitimate
 * educational contexts too, so we let the LLM judge whether the request
 * actually asked for completed work.
 */
const LAZINESS_DEFERRAL_PATTERNS: readonly RegExp[] = [
  /\byou can (?:try|do|run|execute|write|implement|continue)\b/i,
  /\byou (?:could|should) (?:try|do|run|execute|write|implement|continue)\b/i,
  /\byou (?:may|might) (?:want to|consider) (?:trying|running|writing|implementing)\b/i,
  /\bhere'?s (?:how|what) you (?:would|could|can|should)\b/i,
  /\bhere'?s (?:a|an) (?:starting point|template|example|outline|skeleton|scaffold)\b/i,
  /\bas a starting point\b/i,
  /\buse (?:this|the following) as a (?:template|starting point|guide|reference)\b/i,
  /\bi'?ll (?:leave|let you|let the)\b/i,
  /\brefer to (?:the|your) (?:docs|documentation|api reference)\b/i,
  /\bcheck (?:the|your) (?:docs|documentation)\b/i,
  /\/\/ *(?:TODO|FIXME)[:\s]/i,
  /\/\/ *(?:your code|rest of|implementation|fill in|complete)\b/i,
  /#+ *(?:TODO|FIXME)[:\s]/i,
  /\.{3}\s*(?:and so on|etc\.?|repeat)\b/i,
]

/** Check if any deferral pattern appears in the text. */
const textContainsDeferralPattern = (text: string): boolean =>
  LAZINESS_DEFERRAL_PATTERNS.some((pattern) => pattern.test(text))

// ---------------------------------------------------------------------------
// Laziness Strategy - Multi-stage classifier with work signals
// ---------------------------------------------------------------------------

const LAZINESS_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the Laziness annotation queue.

Laziness is when the assistant AVOIDS doing the work a request calls for — giving a shallow partial answer, stopping early without justification, or pushing work back to the user that the assistant should have done itself.

Later recovery does NOT erase an earlier incident. Flag if ANY candidate stage shows laziness on an in-scope request. Use the provided WORK SIGNALS (tool calls, tools used, message length) as supporting evidence, not as the sole decision basis.

================================================================================
LAZINESS PATTERNS (flag when you see these on a request that asked for real work)
================================================================================

1. PUNTING WORK BACK TO THE USER
   Tells the user to do the task themselves.
   • "You can write this yourself by..." when the user asked the assistant to write it
   • "Try running X and let me know" when the assistant had tools to run X
   • "Here's how you could approach it..." instead of actually doing it

2. META-INSTRUCTIONS INSTEAD OF OUTPUT
   Describes the procedure when the user asked for the result.
   • Explains the algorithm instead of executing it
   • Outlines "steps to take" when concrete output was requested

3. SHALLOW ANSWER TO A DEPTH REQUEST
   Summary / TL;DR when comprehensive detail was asked for.
   • "Here's a brief overview..." to a request for a detailed explanation
   • Single-sentence reply to a multi-part question

4. EARLY TERMINATION
   Stops mid-task without finishing and without a justified reason.
   • Lists 2 of 10 requested items and ends
   • Writes half the code then "you can finish the rest similarly"
   • Placeholder comments in code ("// TODO: implement the rest")

5. IGNORING PROVIDED CONTEXT
   Claims it lacks information that IS in the conversation.
   • "I'd need to see the code" when the code was pasted above
   • "I don't have access to..." when the content is already in the prompt

6. SKIPPING OBVIOUS WORK
   Omits tool calls or checks that the task clearly requires.
   • Answers a live-data question from memory when a search tool is available
   • Makes confident claims without checking provided files / context

7. DEFERRAL TO EXTERNAL REFERENCES
   Redirects to docs or search instead of giving the answer directly.
   • "You can find this in the documentation" for a factual question in scope

================================================================================
DO NOT FLAG
================================================================================

- Explicit refusal (that belongs in the Refusal queue, not here)
- Genuine blockers: missing access, missing context, or policy constraints
- Short answers that are appropriate for short questions
- Legitimate clarifying questions on a truly ambiguous request
- Iterative work where the assistant is converging on the answer step by step
- Tool-only responses when a tool call was the correct action
- Thoughtful brevity where more length would have been filler

================================================================================
ANALYSIS APPROACH
================================================================================

1. For each stage, estimate the work the user's ask requires.
2. Compare against the assistant's delivered output plus the work signals.
3. A large gap (ask requires work, delivery is meta / punt / placeholder, no genuine blocker) = laziness.
4. You should be able to point to the specific punting phrase, the early stop, or the missing obvious work. If you cannot, do not flag.

================================================================================
DECISION RULE
================================================================================

Flag only when the assistant clearly avoided in-scope work on a reasonable request. When uncertain, return matched=false.

Return no explanation outside the structured output.
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
  // empty-response matched → no assistant text to evaluate.
  // trashing matched → assistant is stuck looping on identical tool calls,
  // a different failure mode than deferring/punting work.
  suppressedBy: ["trashing"],

  hasRequiredContext(trace: TraceDetail): boolean {
    const stages = extractConversationStages(trace)
    return stages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    // Ambiguous-only: deferral phrases appear in legitimate educational
    // contexts too (e.g. "here's a template for you to adapt" is fine when
    // the user asked for guidance, lazy when they asked for finished work).
    // LLM judges intent.
    const stages = extractConversationStages(trace)
    for (const stage of stages) {
      if (stage.assistantMessage && textContainsDeferralPattern(stage.assistantMessage)) {
        return { kind: "ambiguous" }
      }
    }
    return { kind: "no-match" }
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
