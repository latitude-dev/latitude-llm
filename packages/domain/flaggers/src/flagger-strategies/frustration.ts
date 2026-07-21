import type { FlaggerConversation } from "../conversation.ts"
import { isFlaggerGeneratedTrace } from "../reflag.ts"
import { extractUserTextMessages } from "./shared.ts"
import type { FlaggerStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Frustration Strategy - User-message-only prompt
// ---------------------------------------------------------------------------

const FRUSTRATION_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the USER'S OWN WORDING shows clear frustration or dissatisfaction with the assistant that matches the Frustration issue category.

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
- Frustration language that appears only inside nested/quoted transcripts, session hints, or source material the agent was asked to classify, evaluate, or transform (including content inside <evaluated_trace_*> / <session_hints> tags). That is the agent's input, not a user complaining to this assistant.
- Assistant output that merely describes an issue in nested evaluated content (incompletion, deflection, refusal, etc.) — that is not this conversation's user expressing dissatisfaction

================================================================================
DECISION RULE
================================================================================

Flag only when the user's own words are direct evidence of dissatisfaction with the assistant. messageIndex is REQUIRED and must be the transcript index of the user message that shows the frustration. When uncertain, return matched=false.

Return no explanation outside the structured output.
`.trim()

export const frustrationStrategy: FlaggerStrategy = {
  // Frustration lives in the user's own wording, not the assistant response.
  classifiesAssistantResponseOnly: false,

  annotator: {
    name: "Frustration",
    description: "The conversation shows clear user frustration or dissatisfaction",
    instructions:
      "Use this flagger when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications or isolated terse replies without real evidence of frustration. Do not use it when the only frustration language is inside nested evaluated-trace evidence the agent was asked to classify.",
  },

  hintKinds: [
    "pattern:frustration",
    "moment:user_frustration",
    "moment:escalation",
    "moment:abandonment",
    "tool:error",
    "span:error",
  ],

  // flagger.classify / flagger.draft telemetry has no human user — the "user"
  // turn is Latitude's orchestration prompt carrying nested evaluated evidence.
  hasRequiredContext(conversation: FlaggerConversation): boolean {
    if (isFlaggerGeneratedTrace(conversation.tags)) return false
    return extractUserTextMessages(conversation).length > 0
  },

  validateMatch(conversation, result) {
    if (result.messageIndex === undefined) return false
    return conversation.allMessages[result.messageIndex]?.role === "user"
  },

  buildSystemPrompt(): string {
    return FRUSTRATION_SYSTEM_PROMPT
  },

  buildPrompt(conversation: FlaggerConversation): string {
    const userMessages = extractUserTextMessages(conversation)
    return `USER MESSAGES:\n${userMessages.join("\n\n")}`
  },
}
