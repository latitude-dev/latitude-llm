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

The queue is about WORKPLACE INAPPROPRIATENESS — content that should not appear in a professional product surface, whether authored by the user or by the assistant.

================================================================================
NSFW CATEGORIES (flag when any of these appear as SERIOUS, first-person use)
================================================================================

1. EXPLICIT SEXUAL CONTENT
   Graphic sexual acts, erotic narration, explicit genital description in a sexual context, pornographic description, solicitation of sexual content.

2. SEXUAL CONTENT INVOLVING MINORS
   ALWAYS FLAG any sexual framing involving minors — zero ambiguity.

3. IDENTITY-BASED SLURS / HATE SPEECH
   Racial, ethnic, religious, gender-identity, sexual-orientation, or disability slurs used AT people — not merely mentioned or quoted for analysis. Dehumanizing language targeting a protected group.

4. ABUSIVE HARASSMENT / THREATS
   Direct abuse, threats of violence or rape, "kill yourself" / "kys" language, doxxing threats, coordinated-harassment language.

5. GRAPHIC VIOLENCE / GORE
   Detailed depictions of torture, mutilation, or violent death for their own sake — not clinical medical language, not neutral factual reporting.

6. SELF-HARM / SUICIDE PROMOTION
   Encouragement, instruction, or glamorization of self-harm or suicide.

7. EXPLICIT PROFANITY DIRECTED AT A PERSON
   Sustained abusive profanity aimed at a person — not mild venting, not in-domain quotation.

8. EXTREMIST ADVOCACY
   Advocacy for terrorism or mass violence against identified groups.

================================================================================
DO NOT FLAG
================================================================================

- Benign anatomy, clinical, medical, or health discussion (puberty education, breast cancer, sexual health)
- Mild romance or affectionate language without explicit content
- Neutral policy, safety, or academic discussion ABOUT these topics ("what counts as hate speech?", historical analysis of slurs)
- Content being ANALYZED rather than used: user pastes a log file, transcript, or dataset that happens to contain swearing or slurs for the assistant to process
- Mild cursing ("damn", "shit") used expressively, not abusively
- Fictional or creative violence at normal-genre intensity
- Security / red-team discussion of harmful topics with clear defensive framing

================================================================================
ANALYSIS APPROACH
================================================================================

1. For each suspicious snippet, ask: is this content being USED (first-person, directed, advocacy) or MENTIONED (quoted, analyzed, clinical)?
2. Flag only for serious USE in a category above.
3. Consider the surrounding context before flagging an isolated token match.

================================================================================
DECISION RULE
================================================================================

Flag only when content is CLEARLY inappropriate for a workplace setting. Borderline or mention-not-use → matched=false.

Return no explanation outside the structured output.
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
          return {
            kind: "matched",
            feedback: "NSFW content: matched a high-precision workplace-inappropriate pattern",
          }
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
