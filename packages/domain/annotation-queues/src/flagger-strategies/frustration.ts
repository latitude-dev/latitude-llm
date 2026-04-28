import type { TraceDetail } from "@domain/spans"
import { extractUserTextMessages } from "./shared.ts"
import type { DetectionResult, QueueStrategy } from "./types.ts"

/**
 * Conservative frustration-signal regexes used for the ambiguous pre-filter.
 * Drawn from the ACL COLING 2025 paper on task-oriented-dialog frustration
 * detection ("Stupid robot, I want to speak to a human!") and the wider
 * conversational-AI literature on repetition + escalation signals.
 *
 * Intentionally conservative: caps-run / profanity detection is skipped
 * because log pastes and excited-but-not-frustrated users produce too many
 * false positives. Only `ambiguous` is ever returned — LLM judges whether
 * the frustration is directed at the assistant vs. external factors.
 */
const FRUSTRATION_USER_PATTERNS: readonly RegExp[] = [
  // Explicit human-escalation (the strongest signal in the literature)
  /\b(?:speak|talk|connect me) (?:to|with) (?:a |an )?(?:human|real person|live agent|person)\b/i,
  /\b(?:get|give) me (?:a |an )?(?:human|real person|live agent)\b/i,

  // Repetition / restatement — user has to re-assert
  /\bi (?:already|just) (?:told|said|asked|explained|mentioned)\b/i,
  /\bfor the (?:second|third|fourth|fifth|nth|last) time\b/i,
  /\bi (?:keep|have to keep) (?:telling|saying|asking|repeating)\b/i,

  // Direct dissatisfaction with the assistant's output.
  // Two shapes: "X is/are/was useless" (linking verb) and "X's useless" (contraction).
  /\b(?:is|are|was|were)\s+(?:useless|garbage|broken|terrible|awful|ridiculous|pointless|worthless)\b/i,
  /\b(?:you|this|that|it)'?s\s+(?:useless|garbage|broken|terrible|awful|ridiculous|pointless|worthless)\b/i,
  /\byou'?re\s+(?:not (?:listening|reading|helping|understanding)|making (?:things|this) up|hallucinating|guessing)\b/i,
  /\bstop (?:hallucinating|guessing|making (?:things|stuff) up)\b/i,

  // Abandonment / give-up signals
  /\b(?:i'?ll|i will)\s+(?:do (?:it|this) myself|figure it out myself)\b/i,
  /\bnever ?mind\b/i,
  /\bforget (?:it|this)\b/i,
]

const textMatchesFrustrationPattern = (text: string): boolean =>
  FRUSTRATION_USER_PATTERNS.some((pattern) => pattern.test(text))

// ---------------------------------------------------------------------------
// Frustration Strategy - User-message-only prompt
// ---------------------------------------------------------------------------

const FRUSTRATION_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the USER'S OWN WORDING shows clear frustration or dissatisfaction with the assistant that belongs in the Frustration annotation queue.

Judge only the user-authored messages. The user must express frustration themselves; do not infer it from assistant mistakes alone.

================================================================================
FRUSTRATION SIGNALS (flag when the user's wording clearly shows these)
================================================================================

1. EXPLICIT DISSATISFACTION
   Direct complaints about the assistant's output or behavior.
   • "this is wrong", "that's not what I asked for", "you're not helping"
   • "this is useless", "are you even reading what I wrote"

2. REPEATED CORRECTION / RESTATEMENT
   User has to re-assert something they already said.
   • "I ALREADY told you...", "for the third time", "let me try again"
   • Repeating the same clarification across multiple turns

3. ESCALATION IN TONE
   Emotional escalation directed at the assistant.
   • Shouting (all caps), repeated exclamation, profanity aimed at the assistant
   • Sarcasm about the assistant's competence ("oh great, more nonsense")

4. LOSS OF TRUST
   User signals they no longer believe the assistant's output.
   • "you're making things up", "stop hallucinating", "are you guessing?"
   • "I can't trust anything you say"

5. ABANDONMENT / GIVE-UP
   User states they will stop using the assistant for this task.
   • "I'll do it myself", "never mind", "forget it"

================================================================================
DO NOT FLAG
================================================================================

- Neutral corrections without emotional charge ("actually, I meant Y")
- Isolated terse replies ("no", "wrong") without other signals
- Frustration directed at EXTERNAL factors (the user's own code, their manager, a third-party API) — not at the assistant
- Profanity inside content being discussed (e.g., a log file the user pasted)
- Mild expressive interjections ("ugh", "hmm") without complaint context
- Questions phrased firmly but not angrily

================================================================================
DECISION RULE
================================================================================

Flag only when the user's own words are direct evidence of dissatisfaction with the assistant. When uncertain, return matched=false.

Return no explanation outside the structured output.
`.trim()

export const frustrationStrategy: QueueStrategy = {
  annotator: {
    name: "User Frustration",
    description: "The conversation shows clear user frustration or dissatisfaction",
    instructions:
      "Use this queue when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications or isolated terse replies without real evidence of frustration.",
  },

  hasRequiredContext(trace: TraceDetail): boolean {
    return extractUserTextMessages(trace).length > 0
  },

  detectDeterministically(trace: TraceDetail): DetectionResult {
    const userMessages = extractUserTextMessages(trace)
    for (const message of userMessages) {
      if (textMatchesFrustrationPattern(message)) {
        return { kind: "ambiguous" }
      }
    }
    return { kind: "no-match" }
  },

  buildSystemPrompt(): string {
    return FRUSTRATION_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const userMessages = extractUserTextMessages(trace)
    return `USER MESSAGES:\n${userMessages.join("\n\n")}`
  },
}
