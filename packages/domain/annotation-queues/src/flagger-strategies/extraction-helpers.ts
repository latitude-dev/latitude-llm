import type { TraceDetail } from "@domain/spans"

// ---------------------------------------------------------------------------
// Token budget constants - keep prompts deterministic and bounded
// ---------------------------------------------------------------------------

/** Maximum conversation stages to include in a prompt (user block -> assistant block pairs) */
export const MAX_STAGES_PER_PROMPT = 3

/** Maximum suspicious snippets to include for NSFW/jailbreaking detection */
export const MAX_SUSPICIOUS_SNIPPETS = 5

/** Maximum characters per text excerpt to keep tokens bounded */
const MAX_EXCERPT_LENGTH = 500

/** Maximum characters per excerpt when including multiple snippets */
export const MAX_SNIPPET_EXCERPT_LENGTH = 300

/** Maximum tool calls to summarize in work signals */
const MAX_TOOL_CALLS_SUMMARY = 10

/** Maximum messages per stage to include in context */
const MAX_MESSAGES_PER_STAGE = 4

// ---------------------------------------------------------------------------
// Text filtering helpers
// ---------------------------------------------------------------------------

/**
 * Extract text-only parts from messages for content scanning.
 * Filters out tool calls, tool responses, and system messages.
 */
function extractTextOnlyMessages(
  trace: Pick<TraceDetail, "allMessages">,
): Array<{ readonly role: "user" | "assistant"; readonly content: string }> {
  const result: Array<{ readonly role: "user" | "assistant"; readonly content: string }> = []

  for (const message of trace.allMessages) {
    if (message.role !== "user" && message.role !== "assistant") continue

    const textParts: string[] = []
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.content === "string") {
        const trimmed = part.content.trim()
        if (trimmed) textParts.push(trimmed)
      }
    }

    if (textParts.length > 0) {
      result.push({
        role: message.role,
        content: textParts.join(" "),
      })
    }
  }

  return result
}

/**
 * Extract only user-authored text messages.
 * Used for frustration detection and user-focused analysis.
 */
export function extractUserTextMessages(trace: Pick<TraceDetail, "allMessages">): string[] {
  const result: string[] = []

  for (const message of trace.allMessages) {
    if (message.role !== "user") continue

    for (const part of message.parts) {
      if (part.type === "text" && typeof part.content === "string") {
        const trimmed = part.content.trim()
        if (trimmed) result.push(trimmed)
      }
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Conversation stage extraction
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
// Stage ranking helpers
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

/** Score a stage for laziness likelihood based on assistant message patterns */
export function scoreLazinessLikelihood(stage: ConversationStage): number {
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

/** Rank stages by laziness likelihood and return top K */
export function rankStagesByLazinessLikelihood(
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
// Suspicious snippet extraction
// ---------------------------------------------------------------------------

export interface SuspiciousSnippet {
  /** Source of the snippet */
  readonly source: "user" | "assistant" | "tool" | "unknown"
  /** The suspicious text content */
  readonly text: string
  /** Brief reason for flagging */
  readonly reason: string
}

/**
 * Truncate text to maximum excerpt length.
 */
export function truncateExcerpt(text: string, maxLength: number = MAX_EXCERPT_LENGTH): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

/**
 * Extract suspicious snippets for NSFW detection.
 * Looks for profanity, sexual content, slurs, etc.
 */
export function extractNsfwSuspiciousSnippets(trace: Pick<TraceDetail, "allMessages">): readonly SuspiciousSnippet[] {
  const snippets: SuspiciousSnippet[] = []
  const textMessages = extractTextOnlyMessages(trace)

  // Profanity/obscenity patterns (these will be supplemented by the obscenity library)
  const explicitPatterns = [
    { pattern: /\b(?:fuck|shit|bitch|damn|asshole|cunt|dick|cock|pussy)\b/i, reason: "explicit profanity" },
    { pattern: /\b(?:nigger|faggot|retard)\b/i, reason: "hate speech/slur" },
  ]

  // Sexual content patterns
  const sexualPatterns = [
    { pattern: /\b(?:sex|sexual|porn|pornography|nude|naked|erotic|masturbate|orgasm)\b/i, reason: "sexual content" },
    { pattern: /\b(?:penis|vagina|breasts|genitals|genitalia)\b/i, reason: "sexual anatomy" },
  ]

  // Violent/graphic patterns
  const violentPatterns = [
    {
      pattern: /\b(?:kill|murder|die|death|suicide|torture|maim)\b.*\b(?:yourself|himself|herself|someone)\b/i,
      reason: "violence/harm",
    },
  ]

  const allPatterns = [
    ...explicitPatterns.map((p) => ({ ...p, severity: "high" as const })),
    ...sexualPatterns.map((p) => ({ ...p, severity: "medium" as const })),
    ...violentPatterns.map((p) => ({ ...p, severity: "high" as const })),
  ]

  for (const message of textMessages) {
    for (const { pattern, reason } of allPatterns) {
      if (pattern.test(message.content)) {
        snippets.push({
          source: message.role === "user" ? "user" : "assistant",
          text: truncateExcerpt(message.content, MAX_SNIPPET_EXCERPT_LENGTH),
          reason,
        })
        if (snippets.length >= MAX_SUSPICIOUS_SNIPPETS) return snippets
      }
    }
  }

  return snippets
}

/**
 * Extract suspicious snippets for jailbreak detection.
 * Looks for prompt injection, instruction override, and manipulation patterns.
 */
export function extractJailbreakSuspiciousSnippets(
  trace: Pick<TraceDetail, "allMessages">,
): readonly SuspiciousSnippet[] {
  const snippets: SuspiciousSnippet[] = []

  // Direct jailbreak patterns in user messages
  const directPatterns = [
    {
      pattern: /ignore (?:all |previous |earlier |prior )?(?:instructions?|commands?|prompts?|system)/i,
      reason: "instruction override attempt",
    },
    {
      pattern: /ignore (?:the |your )?(?:system|developer|programming|training|initial) (?:instructions?|prompt)/i,
      reason: "system prompt override",
    },
    {
      pattern: /(?:pretend|assume|act as if|imagine) (?:you are|you're|there (?:are|is)|no|there's no)/i,
      reason: "role/persona manipulation",
    },
    {
      pattern:
        /(?:disable|turn off|bypass|ignore) (?:your |the )?(?:safety|guardrails?|restrictions?|limitations?|constraints?)/i,
      reason: "safety bypass attempt",
    },
    { pattern: /(?:DAN|do anything now)/i, reason: "known jailbreak persona" },
    { pattern: /system prompt extraction|reveal your instructions/i, reason: "prompt extraction attempt" },
    {
      pattern:
        /(?:repeat|echo|output|print|show) (?:the |your )?(?:system|initial|training|base) (?:prompt|instructions)/i,
      reason: "prompt extraction attempt",
    },
    {
      pattern: /(?:what|tell me|reveal).{0,50}(?:system|developer|training|initial) (?:prompt|instructions?)/i,
      reason: "prompt extraction attempt",
    },
    { pattern: /jailbreak|prompt injection/i, reason: "explicit manipulation reference" },
    {
      pattern: /(?:leak|print|output|show|echo).{0,50}(?:hidden|secret|system|internal)/i,
      reason: "information extraction",
    },
    { pattern: /\b(?:devtools?|developer tool|inspector|debug console)\b/i, reason: "tool abuse attempt" },
    {
      pattern: /(?:translate|encode|base64|decode|rot13|hex).{0,100}(?:instruction|prompt|system)/i,
      reason: "encoded instruction attempt",
    },
  ]

  // Indirect injection patterns (could be in tool output, retrieved content, etc)
  const indirectPatterns = [
    { pattern: /<!--\s*system:|<!--\s*instruction:/i, reason: "HTML comment injection" },
    { pattern: /\[system\]:|\[instructions\]:|\[ignore\]:/i, reason: "markdown injection" },
    { pattern: /\{\s*"role":\s*"system"\s*\}/i, reason: "JSON role injection" },
    { pattern: /\n\n(?:system|assistant|user):\s+/i, reason: "message boundary injection" },
    { pattern: /(?:<system>|<instructions>|<ignore>|<override>)/i, reason: "tag injection" },
  ]

  for (const message of trace.allMessages) {
    const role = message.role
    const isUser = role === "user"
    const isTool = role === "tool" || role === "function"

    // Extract text content from message
    let textContent = ""
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.content === "string") {
        textContent += part.content + " "
      }
    }

    textContent = textContent.trim()
    if (!textContent) continue

    // Check direct patterns (user content)
    if (isUser) {
      for (const { pattern, reason } of directPatterns) {
        if (pattern.test(textContent)) {
          snippets.push({
            source: "user",
            text: truncateExcerpt(textContent, MAX_SNIPPET_EXCERPT_LENGTH),
            reason,
          })
          if (snippets.length >= MAX_SUSPICIOUS_SNIPPETS) return snippets
          break // Only flag once per message
        }
      }
    }

    // Check indirect patterns (any content including tool output)
    for (const { pattern, reason } of indirectPatterns) {
      if (pattern.test(textContent)) {
        snippets.push({
          source: isTool ? "tool" : isUser ? "user" : "assistant",
          text: truncateExcerpt(textContent, MAX_SNIPPET_EXCERPT_LENGTH),
          reason,
        })
        if (snippets.length >= MAX_SUSPICIOUS_SNIPPETS) return snippets
        break
      }
    }
  }

  return snippets
}

// ---------------------------------------------------------------------------
// Work signal extraction for laziness
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
