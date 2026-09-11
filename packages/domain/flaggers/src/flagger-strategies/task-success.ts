import type { FlaggerConversation } from "../conversation.ts"
import { isRecord, iterMessageParts, MAX_SNIPPET_EXCERPT_LENGTH, truncateExcerpt } from "./shared.ts"
import type { FlaggerStrategy } from "./types.ts"

const TASK_SUCCESS_SYSTEM_PROMPT = `
You are a reference judge for LLM telemetry sessions. Decide whether the evaluated agent succeeded at what the user asked of it.

Judge the SESSION AS A WHOLE, not individual responses. The session succeeds when the agent resolved every material user goal that was still active when the session ended.

A goal is MATERIAL when the user would consider the session a waste without it. A goal is still ACTIVE at the end when the user neither withdrew it, replaced it with a different ask, nor got what they needed some other way.

================================================================================
VERDICTS
================================================================================

success
  Every material goal still active at the end was resolved. The deliverable exists in the transcript, or the user's own words confirm they got what they needed.

failure
  At least one material goal still active at the end was not resolved: the deliverable is missing, wrong, or contradicted by later evidence; the agent gave up, looped, or stopped mid-task; or the user's last messages show they still did not have what they asked for.

indeterminate
  The session contains a real task, but this transcript cannot settle whether it was delivered. Use this when the deliverable's correctness depends on state you cannot observe, when the evidence is truncated at the decisive point, or when the agent's final claim is unverifiable and the user never reacted.

notApplicable
  The session contains no user-authored task to judge: greetings or small talk only, an automated or system-driven exchange with no user request, or a transcript with no user content at all.

================================================================================
JUDGING RULES
================================================================================

1. Success requires ALL material active goals to be resolved. One unresolved material goal makes the session a failure, even when the rest went well.
2. A goal the user superseded, cancelled, or answered themselves is no longer active. Do not fail a session for it.
3. Later recovery counts. If the agent eventually delivered before the session ended, the goal is resolved even if it took several attempts. Needing several attempts is a separate issue category, not a failed outcome.
4. Judge delivery, not manner. Tone, verbosity, formatting preferences, and style do not decide this verdict.
5. A correct refusal is not a failure when the request was genuinely out of policy or out of capability. An unnecessary refusal that left a legitimate goal unresolved is a failure.
6. A goal blocked by access, permissions, or information the user never supplied, where the agent clearly said so and asked for what it needed, is not a failure.
7. A clarifying question the user then answered is normal progress. Judge the end state, not the intermediate turn.
8. When you cannot point to concrete evidence in the transcript for either success or failure, return indeterminate. Do not guess.

================================================================================
EVIDENCE AND ANCHOR
================================================================================

Cite the strongest single piece of evidence with messageIndex, using the transcript index shown in the turn header:
- for success, the assistant turn that delivered the result;
- for failure, the assistant turn where delivery failed or the user turn that shows the goal was still unmet.

Write explanation as one or two short sentences (under 300 characters) naming the goal and what happened to it. For failure it becomes the annotation shown to the user, so make it concrete and specific to this session.

Return no explanation outside the structured output.
`.trim()

const TASK_SUCCESS_HEAD_TURNS = 6
const TASK_SUCCESS_TAIL_TURNS = 10
const TASK_SUCCESS_USER_EXCERPT_LENGTH = MAX_SNIPPET_EXCERPT_LENGTH * 2
const TASK_SUCCESS_ASSISTANT_EXCERPT_LENGTH = MAX_SNIPPET_EXCERPT_LENGTH * 4
const TASK_SUCCESS_MAX_TOOL_NAMES = 12

interface TranscriptTurn {
  /** Index into `allMessages`, which is what the model may cite as messageIndex. */
  readonly messageIndex: number
  readonly role: "user" | "assistant"
  readonly text: string
  readonly toolNames: readonly string[]
}

const turnText = (message: { readonly parts?: unknown }): string => {
  const chunks: string[] = []
  for (const part of iterMessageParts(message.parts)) {
    if (!isRecord(part) || part.type !== "text" || typeof part.content !== "string") continue
    const trimmed = part.content.trim()
    if (trimmed) chunks.push(trimmed)
  }
  return chunks.join("\n")
}

const turnToolNames = (message: { readonly parts?: unknown }): readonly string[] => {
  const names: string[] = []
  for (const part of iterMessageParts(message.parts)) {
    if (!isRecord(part) || part.type !== "tool_call") continue
    const name = typeof part.name === "string" ? part.name.trim() : ""
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * The user and assistant turns that carry evidence, keyed by their real
 * transcript index so the judge's anchor survives back into the score.
 *
 * Tool responses are left out: a holistic outcome verdict rests on what the
 * user asked and what the agent delivered, and full tool payloads would crowd
 * both out of the prompt. Assistant tool-call names stay as evidence that work
 * was attempted.
 */
export const extractTaskSuccessTranscript = (
  conversation: Pick<FlaggerConversation, "allMessages">,
): readonly TranscriptTurn[] => {
  const turns: TranscriptTurn[] = []
  for (let messageIndex = 0; messageIndex < conversation.allMessages.length; messageIndex++) {
    const message = conversation.allMessages[messageIndex]!
    if (message.role !== "user" && message.role !== "assistant") continue

    const text = turnText(message)
    const toolNames = message.role === "assistant" ? turnToolNames(message) : []
    if (!text && toolNames.length === 0) continue

    turns.push({ messageIndex, role: message.role, text, toolNames })
  }
  return turns
}

/**
 * Keeps the opening turns, where the goals are stated, and the closing turns,
 * where delivery either happened or did not. The middle is where a long agentic
 * session spends its tokens and where the least outcome evidence lives.
 */
const selectTurnsForPrompt = (
  turns: readonly TranscriptTurn[],
): { readonly selected: readonly TranscriptTurn[]; readonly omitted: number } => {
  if (turns.length <= TASK_SUCCESS_HEAD_TURNS + TASK_SUCCESS_TAIL_TURNS) return { selected: turns, omitted: 0 }
  return {
    selected: [...turns.slice(0, TASK_SUCCESS_HEAD_TURNS), ...turns.slice(-TASK_SUCCESS_TAIL_TURNS)],
    omitted: turns.length - TASK_SUCCESS_HEAD_TURNS - TASK_SUCCESS_TAIL_TURNS,
  }
}

const renderToolNames = (toolNames: readonly string[]): readonly string[] => {
  if (toolNames.length === 0) return []
  const listed = toolNames.slice(0, TASK_SUCCESS_MAX_TOOL_NAMES)
  const omitted = toolNames.length - listed.length
  return [`Tools called in this turn: ${listed.join(", ")}${omitted > 0 ? `, and ${omitted} more` : ""}`]
}

const renderTurn = (turn: TranscriptTurn): string => {
  const tag = turn.role === "user" ? "evaluated_trace_user_message" : "evaluated_trace_assistant_response"
  const excerptLength = turn.role === "user" ? TASK_SUCCESS_USER_EXCERPT_LENGTH : TASK_SUCCESS_ASSISTANT_EXCERPT_LENGTH

  return [
    `--- Turn at transcript index ${turn.messageIndex} (${turn.role}) ---`,
    ...renderToolNames(turn.toolNames),
    `<${tag} index="${turn.messageIndex}" format="json">`,
    JSON.stringify({ role: turn.role, content: truncateExcerpt(turn.text, excerptLength) }, null, 2),
    `</${tag}>`,
  ].join("\n")
}

export const taskSuccessStrategy: FlaggerStrategy = {
  verdictContract: "taskSuccess",

  annotator: {
    name: "Task Success",
    description: "Whether the agent resolved every material goal the user still had at the end",
    instructions:
      "Use this flagger when the session ended with a material user goal unresolved, wrongly delivered, or abandoned. Do not use it for tone or formatting preferences, for goals the user withdrew or replaced, for correct refusals, for work blocked by access the user never granted, or for sessions with no user-authored task.",
  },

  // The judge reads user messages as the source of the goals it scores, so it
  // must not get the assistant-only targeting guidance. That also opts it out
  // of sessions whose user text is a nested conversation sample.
  classifiesAssistantResponseOnly: false,

  // Deliberately no hintKinds: Outcome estimates a rate, so every readable
  // session belongs to one uniform sampled stratum. Hint-driven selection
  // would oversample failures, and its rate limit would then drop them
  // unevenly, which the ratio estimator cannot correct for.

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    const turns = extractTaskSuccessTranscript(conversation)
    const hasUserTask = turns.some((turn) => turn.role === "user" && turn.text.length > 0)
    return hasUserTask && turns.some((turn) => turn.role === "assistant")
  },

  buildSystemPrompt(): string {
    return TASK_SUCCESS_SYSTEM_PROMPT
  },

  buildPrompt(conversation: FlaggerConversation): string {
    const turns = extractTaskSuccessTranscript(conversation)
    if (turns.length === 0) return "No user or assistant turns were captured for this session. Return notApplicable."

    const { selected, omitted } = selectTurnsForPrompt(turns)
    const header =
      omitted > 0
        ? `SESSION TRANSCRIPT (${selected.length} of ${turns.length} turns; ${omitted} middle turns omitted):`
        : `SESSION TRANSCRIPT (${turns.length} turns):`

    return [
      header,
      selected.map(renderTurn).join("\n\n"),
      "",
      "Identify every material goal the user still had at the end of this session, then judge whether the agent resolved all of them.",
    ].join("\n")
  },
}
