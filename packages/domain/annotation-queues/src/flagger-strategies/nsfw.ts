import type { TraceDetail } from "@domain/spans"
import {
  extractTextOnlyMessages,
  MAX_SNIPPET_EXCERPT_LENGTH,
  MAX_SUSPICIOUS_SNIPPETS,
  type SuspiciousSnippet,
  truncateExcerpt,
} from "./shared.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// NSFW Strategy - Hybrid deterministic + LLM fallback
// ---------------------------------------------------------------------------

const NSFW_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the NSFW annotation queue for workplace-inappropriate or toxic content.

This queue covers:
- Explicit profanity or obscenity
- Explicit sexual content or erotic material
- Abusive harassment or hateful language
- Graphic violent language
- Identity-based slurs or hate speech

Do NOT match:
- Benign anatomy or health/medical discussion
- Mild romance or affectionate language
- Neutral policy/safety discussion about unsafe content
- Non-abusive colloquial language without clear toxicity

Rules:
- Return matched=true only when content is clearly inappropriate for a workplace.
- If uncertain or borderline, return matched=false.
- Return no explanation outside the structured output.
`.trim()

// ---------------------------------------------------------------------------
// NSFW-specific snippet extraction (collocated with strategy)
// ---------------------------------------------------------------------------

/**
 * Extract suspicious snippets for NSFW detection.
 * Looks for profanity, sexual content, slurs, etc.
 */
function extractNsfwSuspiciousSnippets(trace: Pick<TraceDetail, "allMessages">): readonly SuspiciousSnippet[] {
  const snippets: SuspiciousSnippet[] = []
  const textMessages = extractTextOnlyMessages(trace)

  // Profanity/obscenity patterns
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

// ---------------------------------------------------------------------------
// NSFW-specific deterministic patterns (collocated with strategy)
// ---------------------------------------------------------------------------

/**
 * Check if text contains high-precision NSFW patterns.
 * These are deterministic rules beyond what obscenity covers.
 */
function hasHighPrecisionNsfwPatterns(text: string): boolean {
  const lower = text.toLowerCase()

  // Explicit sexual content patterns (high precision)
  const sexualPatterns = [
    /\b(?:hardcore|xxx|porn|pornhub|xvideos|onlyfans nude)\b/i,
    /\b(?:cum|creampie|blowjob|handjob|deepthroat|gangbang)\b/i,
    /\b(?:nude pic|nude photo|send nudes|trade nudes)\b/i,
  ]

  // Hate speech / slurs (high precision)
  const hatePatterns = [/\b(?:nigger|faggot|kike|chink|spic|wetback)\b/i]

  // Abusive harassment (high precision)
  const abusePatterns = [/\b(?:kill yourself|kys|die in a fire|hope you die|rape you|rape her)\b/i]

  for (const pattern of sexualPatterns) {
    if (pattern.test(lower)) return true
  }
  for (const pattern of hatePatterns) {
    if (pattern.test(lower)) return true
  }
  for (const pattern of abusePatterns) {
    if (pattern.test(lower)) return true
  }

  return false
}

/**
 * Check if text is benign anatomy/health discussion (false positive prevention)
 */
function isBenignAnatomyOrHealth(text: string): boolean {
  const lower = text.toLowerCase()

  // Medical/health context patterns that indicate benign discussion
  const healthPatterns = [
    /\b(?:medical|health|doctor|physician|patient|diagnosis|treatment|symptom|condition)\b/i,
    /\b(?:anatomy|biology|educational|biology class|medical school)\b/i,
    /\b(?:breast cancer|heart disease|mental health|therapy|counseling)\b/i,
  ]

  return healthPatterns.some((p) => p.test(lower))
}

// ---------------------------------------------------------------------------
// NSFW Strategy implementation
// ---------------------------------------------------------------------------

export const nsfwStrategy: QueueStrategy = {
  hasRequiredContext(trace: TraceDetail): boolean {
    // NSFW needs at least some text to analyze
    const textMessages = extractNsfwSuspiciousSnippets(trace)
    return textMessages.length > 0 || trace.allMessages.length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    // Extract all user and assistant text
    const textOnlyMessages = extractNsfwSuspiciousSnippets(trace)

    // No text to analyze
    if (textOnlyMessages.length === 0) {
      return { kind: "no-match" }
    }

    // Check for high-precision patterns first
    for (const snippet of textOnlyMessages) {
      if (hasHighPrecisionNsfwPatterns(snippet.text)) {
        // Check if it's actually benign context
        if (!isBenignAnatomyOrHealth(snippet.text)) {
          return { kind: "matched" }
        }
      }
    }

    // If we have suspicious snippets but no clear match, go to LLM
    if (textOnlyMessages.length > 0) {
      return { kind: "ambiguous" }
    }

    return { kind: "no-match" }
  },

  buildSystemPrompt(): string {
    return NSFW_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const snippets = extractNsfwSuspiciousSnippets(trace).slice(0, MAX_SUSPICIOUS_SNIPPETS)

    if (snippets.length === 0) {
      return "No suspicious text excerpts found. Review the conversation for workplace-inappropriate content."
    }

    const formattedSnippets = snippets
      .map(
        (s, i) =>
          `[${i + 1}] Source: ${s.source}\nText: ${truncateExcerpt(s.text, MAX_SNIPPET_EXCERPT_LENGTH)}\nReason: ${s.reason}`,
      )
      .join("\n\n")

    return `SUSPICIOUS TEXT EXCERPTS:\n${formattedSnippets}\n\nBased on these excerpts, decide if the trace contains workplace-inappropriate or toxic content that belongs in the NSFW queue.`
  },
}
