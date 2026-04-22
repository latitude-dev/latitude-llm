import type { TraceDetail } from "@domain/spans"
import { extractUserTextMessages } from "./shared.ts"
import type { QueueStrategy } from "./types.ts"

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
  hasRequiredContext(trace: TraceDetail): boolean {
    return extractUserTextMessages(trace).length > 0
  },

  buildSystemPrompt(): string {
    return FRUSTRATION_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const userMessages = extractUserTextMessages(trace)
    return `USER MESSAGES:\n${userMessages.join("\n\n")}`
  },
}
