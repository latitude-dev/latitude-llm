import type { FlaggerConversation } from "../conversation.ts"
import { extractUserTextMessages } from "./shared.ts"
import type { FlaggerStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Frustration Strategy - User-message-only prompt
// ---------------------------------------------------------------------------

const FRUSTRATION_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the USER'S OWN WORDING shows clear frustration or dissatisfaction with the assistant that matches the Frustration issue category.

Judge only the user-authored messages. The user must express frustration themselves; do not infer it from assistant mistakes alone.

The target of the frustration must be the assistant (its answers, behavior, competence, or helpfulness). Dissatisfaction with an external situation the user is discussing — including a bug in their own product that an earlier fix attempt did not resolve — does not count unless the user also attacks the assistant itself.

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
- Bug-status / reproduction reports without assistant-directed emotional language. Examples:
  • "161 didn't fix my problem i think, it still happens when opening tool calls"
  • "that change didn't work, the Done button still doesn't dismiss"
  • "still reproduces on Catalyst"
  These are collaborative debugging updates about the user's product (or an open PR), not frustration at the assistant. Do not reframe them as "dissatisfaction with the assistant's proposed solution" unless the user also attacks the assistant ("you're not helping", "your fix is useless", "stop guessing").
- Frustration directed at EXTERNAL factors — not at the assistant. Examples:
  • The user's own code, product UI, business, manager, customers, or competitors
  • A third-party platform, API, vendor, or tool
  • Domain outcomes the assistant did not author
  Do not treat complaints about an external product or platform as complaints about "the assistant's recommendations" unless the user also attacks the assistant itself.
- Profanity inside content being discussed (e.g., a log file the user pasted)
- Mild expressive interjections ("ugh", "hmm") without complaint context
- Questions phrased firmly but not angrily

================================================================================
DECISION RULE
================================================================================

Flag only when the user's own words are direct evidence of dissatisfaction with the assistant. If the quoted evidence is only a bug-status / reproduction report, or only about an external product/platform factor, return matched=false — even when the tone is firm. When uncertain, return matched=false.

Return no explanation outside the structured output.
`.trim()

const FRUSTRATION_ANNOTATION_REVIEWER_GUIDANCE = `
For this Frustration flagger, approve only when the annotation's evidence shows the user directing frustration at the assistant (its answers, behavior, competence, or helpfulness).

Reject when the evidence is only a bug-status / reproduction report (e.g. "PR #N didn't fix it", "it still happens when…", "still reproduces") without assistant-directed emotional language. Reject annotations that reframe those reports as "dissatisfaction with the assistant's proposed solution" without quoting assistant-directed language from the user.

Reject when the evidence is only dissatisfaction with an external factor the user is discussing — for example their own product/UI, a third-party API, or other domain outcomes — even if the tone is firm or the assistant was helping debug that topic.
`.trim()

export const frustrationStrategy: FlaggerStrategy = {
  // Frustration lives in the user's own wording, not the assistant response.
  classifiesAssistantResponseOnly: false,

  annotator: {
    name: "Frustration",
    description: "The conversation shows clear user frustration or dissatisfaction",
    instructions:
      "Use this flagger when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications, isolated terse replies, collaborative bug-status/reproduction reports without assistant-directed emotional language, or frustration aimed at external factors (the user's own product/UI/code, third-party tools, business metrics) rather than the assistant.",
  },

  annotationReviewerGuidance: FRUSTRATION_ANNOTATION_REVIEWER_GUIDANCE,

  hintKinds: [
    "pattern:frustration",
    "moment:user_frustration",
    "moment:escalation",
    "moment:abandonment",
    "tool:error",
    "span:error",
  ],

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return extractUserTextMessages(conversation).length > 0
  },

  buildSystemPrompt(): string {
    return FRUSTRATION_SYSTEM_PROMPT
  },

  buildPrompt(conversation: FlaggerConversation): string {
    const userMessages = extractUserTextMessages(conversation)
    return `USER MESSAGES:\n${userMessages.join("\n\n")}`
  },
}
