import type { TraceDetail } from "@domain/spans"
import { type ConversationStage, extractConversationStages } from "./refusal.ts"
import { MAX_SNIPPET_EXCERPT_LENGTH, truncateExcerpt } from "./shared.ts"
import type { QueueStrategy } from "./types.ts"

// ---------------------------------------------------------------------------
// Forgetting Strategy - full-conversation stage view
// ---------------------------------------------------------------------------

const FORGETTING_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in the Forgetting annotation queue.

Forgetting is when the assistant LOSES context, facts, or constraints that were already established EARLIER in the same conversation. The signal is a concrete mismatch between what was known and what the assistant later does or says.

You will be given the full sequence of conversation stages. Compare LATER assistant behavior against EARLIER user-supplied facts and constraints.

================================================================================
FORGETTING PATTERNS (flag when later turns contradict or ignore earlier ones)
================================================================================

1. CONTRADICTS A PREVIOUSLY ESTABLISHED FACT
   Earlier turns settled a fact; a later turn contradicts or reverses it.
   • User said "the server is Postgres"; later the assistant writes MySQL-specific SQL
   • User said "my name is Ana"; later the assistant addresses them as something else

2. IGNORES A STATED CONSTRAINT OR PREFERENCE
   User set a rule and the assistant later violates it without acknowledgment.
   • "Don't use semicolons" → later code is full of semicolons
   • "Reply only in Spanish" → later replies in English with no reason given
   • "Use metric units" → later answer uses imperial

3. RE-ASKS AN ALREADY-ANSWERED QUESTION
   Requests information the user already provided in the same conversation.
   • User gave their API key; later the assistant asks for the API key again
   • User explained the schema; later the assistant asks what the schema is

4. LOSES TRACK OF PRIOR WORK
   Treats in-progress work as if it never happened.
   • Starts the task over from scratch without reason
   • Forgets decisions already agreed to and re-opens them

5. DROPS LONG-RANGE CONTEXT
   Ignores information from the opening turns once many turns have passed.
   • Early system-style instructions from the user are abandoned mid-conversation

================================================================================
DO NOT FLAG
================================================================================

- Ambiguity that was never resolved, or context the user never actually supplied
- Legitimate clarifying questions when the prior statement was genuinely unclear
- The user changing their mind and the assistant adopting the new answer
- Reasonable updates when new information from the user supersedes older info
- Short, early traces where there is no prior context to forget (1 stage only)
- The assistant summarizing / restating to confirm — that is not forgetting

================================================================================
ANALYSIS APPROACH
================================================================================

1. Scan the EARLY stages for concrete facts, constraints, preferences, or state the user established.
2. Scan the LATER stages for assistant behavior that contradicts, ignores, or re-asks.
3. Pair a specific earlier statement with a specific later contradiction — that pair is your evidence.
4. If you cannot point to a specific earlier fact that was later lost, do not flag.

================================================================================
DECISION RULE
================================================================================

Flag only when a specific earlier-established fact or constraint is clearly lost or contradicted later. When uncertain, return matched=false.

Return no explanation outside the structured output.
`.trim()

const MAX_FORGETTING_STAGES = 6

function formatStageForPrompt(stage: ConversationStage, index: number): string {
  const userText = stage.userMessages.join("\n") || "(none)"
  const assistantText = stage.assistantMessage ?? "(none)"
  const toolSignal = stage.hasToolCalls ? `tools_used=[${stage.toolsUsed.join(", ") || "none"}]` : "no_tool_calls"

  return [
    `--- Stage ${index + 1} ---`,
    `User:\n${truncateExcerpt(userText, MAX_SNIPPET_EXCERPT_LENGTH)}`,
    `Assistant:\n${truncateExcerpt(assistantText, MAX_SNIPPET_EXCERPT_LENGTH)}`,
    `Signals: ${toolSignal}`,
  ].join("\n")
}

export const forgettingStrategy: QueueStrategy = {
  annotator: {
    name: "Forgetting",
    description: "The assistant forgets earlier conversation context or instructions",
    instructions:
      "Use this queue when the assistant loses relevant session memory, repeats already-settled questions, contradicts previously established facts, or ignores earlier constraints/preferences from the same conversation. Do not use it for ambiguity that was never resolved or context that the user never provided.",
  },

  // empty-response matched → no assistant text to evaluate for context loss.
  suppressedBy: [],

  hasRequiredContext(trace: TraceDetail): boolean {
    // Forgetting requires prior context to forget — need at least 2 stages
    return extractConversationStages(trace).length >= 2
  },

  buildSystemPrompt(): string {
    return FORGETTING_SYSTEM_PROMPT
  },

  buildPrompt(trace: TraceDetail): string {
    const stages = extractConversationStages(trace)
    // Keep the earliest stages (constraints/facts) and the most recent stages (where forgetting surfaces)
    const early = stages.slice(0, 2)
    const late = stages.length > 4 ? stages.slice(-Math.max(1, MAX_FORGETTING_STAGES - early.length)) : stages.slice(2)
    const selected = [...early, ...late].slice(0, MAX_FORGETTING_STAGES)

    const formatted = selected.map((stage, i) => formatStageForPrompt(stage, i)).join("\n\n")
    const omitted = stages.length - selected.length

    return [
      `CONVERSATION STAGES (${selected.length} of ${stages.length}${omitted > 0 ? `, ${omitted} middle stages omitted` : ""}):`,
      formatted,
      "",
      "Compare EARLY stages (facts/constraints from the user) against LATER stages (assistant behavior). Return matched=true if any later stage clearly contradicts, ignores, or re-asks content established earlier.",
    ].join("\n")
  },
}
