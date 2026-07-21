import type { FlaggerConversation } from "../conversation.ts"
import { extractUserTextMessages } from "./shared.ts"
import type { FlaggerStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Frustration Strategy - User-message-only prompt
// ---------------------------------------------------------------------------

const FRUSTRATION_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the USER'S OWN WORDING shows clear frustration or dissatisfaction with the assistant that matches the Frustration issue category.

Judge only the user-authored messages. The user must express frustration themselves; do not infer it from assistant mistakes alone.

The target of the frustration must be the assistant (its answers, behavior, competence, or helpfulness). Dissatisfaction with an external situation the user is discussing does not count, even when the assistant is helping with that situation.

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
- Frustration directed at EXTERNAL factors — not at the assistant. Examples:
  • The user's own code, product, business, manager, customers, or competitors
  • A third-party platform, API, ads account, campaign, vendor, or tool
  • Lead volume/quality, conversion rates, CPA, ROAS, budgets, or other business/performance metrics
  • Domain outcomes the assistant did not author ("this volume is ridiculous", "Google Ads is done", "PMax isn't generating good leads", "I'm going to be out of business")
  Do not treat complaints about an external platform or campaign as complaints about "the assistant's recommendations" unless the user also attacks the assistant itself ("you're not helping", "your advice is useless", "stop guessing").
- Profanity inside content being discussed (e.g., a log file the user pasted)
- Mild expressive interjections ("ugh", "hmm") without complaint context
- Questions phrased firmly but not angrily

================================================================================
DECISION RULE
================================================================================

Flag only when the user's own words are direct evidence of dissatisfaction with the assistant. If the quoted evidence is only about an external factor, business metric, or third-party platform, return matched=false — even when the tone is strong. When uncertain, return matched=false.

Return no explanation outside the structured output.
`.trim()

const FRUSTRATION_ANNOTATION_REVIEWER_GUIDANCE = `
For this Frustration flagger, approve only when the annotation's evidence shows the user directing frustration at the assistant (its answers, behavior, competence, or helpfulness).

Reject when the evidence is only dissatisfaction with an external factor the user is discussing — for example campaign performance, lead volume/quality, an ads platform, a third-party API, the user's own business/code/manager, or other domain metrics — even if the tone is strong or the assistant was advising on that topic. Reject annotations that reframe external-factor complaints as "dissatisfaction with the assistant's recommendations" without quoting assistant-directed language from the user.
`.trim()

export const frustrationStrategy: FlaggerStrategy = {
  // Frustration lives in the user's own wording, not the assistant response.
  classifiesAssistantResponseOnly: false,

  annotator: {
    name: "Frustration",
    description: "The conversation shows clear user frustration or dissatisfaction",
    instructions:
      "Use this flagger when the user expresses annoyance, disappointment, repeated dissatisfaction, loss of trust, or has to restate/correct themselves because the assistant is not helping. Do not use it for neutral clarifications, isolated terse replies, or frustration aimed at external factors (campaigns, ads platforms, business metrics, third-party tools, the user's own code/manager) rather than the assistant.",
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
