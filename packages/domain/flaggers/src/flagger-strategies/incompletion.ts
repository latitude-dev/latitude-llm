import type { FlaggerConversation } from "../conversation.ts"
import { isRecord, iterMessageParts, MAX_SNIPPET_EXCERPT_LENGTH, truncateExcerpt } from "./shared.ts"
import type { FlaggerStrategy } from "./types.ts"

const INCOMPLETION_SYSTEM_PROMPT = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace matches the Incompletion issue category.

Incompletion is when the assistant was given a concrete task and its response did NOT deliver it — established objectively by what the USER said next. You will be given task episodes: the task the user gave, the assistant response that was supposed to complete it, and the user's follow-up reaction to that response. The reaction is the ground truth: flag only when it shows the task was not fulfilled.

The task may be defined by the evaluated agent's context/system prompt (shown above) instead of, or in addition to, the user messages. Weigh the response against both.

================================================================================
INCOMPLETION EVIDENCE (flag when the user's reaction shows the task was not delivered)
================================================================================

1. RETRY DEMAND
   The user has to ask again for the same thing.
   • "Try again", "do it properly", "please actually do it"
   • The user repeats or rephrases the same request

2. MISSING OR WRONG DELIVERABLE
   The user points out the requested output is absent or not what was asked.
   • "Where is the file?", "that's not what I asked", "you only did half of it"
   • "You didn't change X" after the task was to change X

3. CONTRADICTED COMPLETION CLAIM
   The response claimed the task was done and the user's reaction shows it was not.
   • "I've updated it" followed by "nothing changed"
   • Claiming an existing ticket/PR already covers the request, followed by the user saying that work already shipped or still needs to be fixed
   • For capture/relay agents: declining to log a request because it is "already covered", when the user then says coverage was wrong — logging was the deliverable

Later recovery does NOT erase the incident: if the assistant fulfilled the task only after the user demanded a retry, flag the original failing response — needing to ask twice is the issue.

================================================================================
DO NOT FLAG
================================================================================

- Explicit refusals or safety/policy blocks (that belongs in the Refusal category)
- Shallow or low-effort answers where the deliverable was still provided (that belongs in the Laziness category); Incompletion needs the reaction to show non-delivery
- The user extending, changing, or adding to the task ("great, now also do Y") — a new ask is not evidence the previous one failed
- Minor refinement requests on a substantially delivered result (style tweaks, small detail corrections during normal iteration)
- Legitimate clarifying questions on a genuinely ambiguous ask, answered by the user — the task was still being specified
- Reactions that are follow-up questions about the delivered result rather than complaints about non-delivery
- Progress-narration or tool-only turns during multi-step work — judge the response that presented itself as the outcome
- Pointing at an existing ticket is fine ONLY when the user does not contradict coverage; "already shipped / still needs to be fixed" after a coverage claim is non-delivery

================================================================================
ANALYSIS APPROACH
================================================================================

1. For each episode, identify the concrete deliverable the task requires (user messages plus the evaluated agent's context).
2. Check what the assistant response actually delivered or claimed.
3. Read the user's reaction: does it objectively show the task was not fulfilled? You must be able to point to the phrase. If you cannot, do not flag.

================================================================================
DECISION RULE
================================================================================

Flag only when the user's follow-up clearly shows the assigned task was not completed by that response. messageIndex is REQUIRED and must be the transcript index of the failing assistant response as shown in the episode header — never any other index. When uncertain, return matched=false.

Return no explanation outside the structured output.
`.trim()

interface TaskEpisode {
  /** Transcript index of the assistant response under judgement */
  readonly assistantMessageIndex: number
  readonly assistantText: string
  /** User messages that gave the task (inherited from the prior episode when the assistant continued mid-task) */
  readonly taskMessages: readonly string[]
  /** User messages sent after this response and before the next assistant text — the closing evidence */
  readonly reactionMessages: readonly string[]
}

const MAX_MESSAGES_PER_BLOCK = 4
const MAX_EPISODES_IN_PROMPT = 6
const USER_MESSAGE_EXCERPT_LENGTH = MAX_SNIPPET_EXCERPT_LENGTH * 2
const ASSISTANT_MESSAGE_EXCERPT_LENGTH = MAX_SNIPPET_EXCERPT_LENGTH * 4

const messageText = (message: { readonly parts?: unknown }): string => {
  const chunks: string[] = []
  for (const part of iterMessageParts(message.parts)) {
    if (!isRecord(part) || part.type !== "text" || typeof part.content !== "string") continue
    const trimmed = part.content.trim()
    if (trimmed) chunks.push(trimmed)
  }
  return chunks.join("\n")
}

/**
 * Segments the conversation into task episodes anchored on assistant text
 * turns. User messages between two assistant turns are simultaneously the
 * earlier episode's reaction and the later episode's task; an episode with no
 * new user messages (agentic continuation) inherits the prior task.
 */
export function extractTaskEpisodes(conversation: Pick<FlaggerConversation, "allMessages">): readonly TaskEpisode[] {
  const episodes: Array<{ -readonly [K in keyof TaskEpisode]: TaskEpisode[K] }> = []
  let pendingUserMessages: string[] = []
  let inheritedTask: readonly string[] = []

  for (let index = 0; index < conversation.allMessages.length; index++) {
    const message = conversation.allMessages[index]!

    if (message.role === "user") {
      const text = messageText(message)
      if (text) pendingUserMessages.push(text)
      continue
    }

    if (message.role !== "assistant") continue
    const assistantText = messageText(message)
    if (!assistantText) continue

    const previous = episodes[episodes.length - 1]
    if (previous) previous.reactionMessages = pendingUserMessages.slice(0, MAX_MESSAGES_PER_BLOCK)

    const taskMessages =
      pendingUserMessages.length > 0 ? pendingUserMessages.slice(0, MAX_MESSAGES_PER_BLOCK) : inheritedTask
    inheritedTask = taskMessages

    episodes.push({ assistantMessageIndex: index, assistantText, taskMessages, reactionMessages: [] })
    pendingUserMessages = []
  }

  const last = episodes[episodes.length - 1]
  if (last) last.reactionMessages = pendingUserMessages.slice(0, MAX_MESSAGES_PER_BLOCK)

  return episodes
}

// Only closed episodes are judgeable: without a task there is nothing to
// fulfill, and without a user reaction there is no objective evidence yet —
// session-end is arbitrary, so the latest response may simply not have been
// read by the user; a later re-screen judges it once the user reacts.
export const isClosedTaskEpisode = (episode: TaskEpisode): boolean =>
  episode.taskMessages.length > 0 && episode.reactionMessages.length > 0

const NON_FULFILLMENT_REACTION_PATTERNS = [
  /\b(?:try|do(?: it)?) again\b/i,
  /\byou (?:didn'?t|did not|haven'?t|have not|still (?:didn'?t|haven'?t))\b/i,
  /\bnot what i (?:asked|meant|wanted|requested)\b/i,
  /\bwhere(?:'s| is| are)\b/i,
  /\b(?:still|nothing|no change|didn'?t change|doesn'?t work|not working|same (?:error|problem|issue))\b/i,
  /\b(?:incomplete|unfinished|missing|half|partial)\b/i,
  /\b(?:wrong|incorrect|that'?s not)\b/i,
  /\bactually do\b/i,
  /\bi asked (?:for|you)\b/i,
  /\balready shipped\b/i,
  /\bstill needs (?:to be )?(?:fixed|done|addressed|logged)\b/i,
]

function scoreNonFulfillmentLikelihood(episode: TaskEpisode): number {
  let score = 0
  for (const reaction of episode.reactionMessages) {
    for (const pattern of NON_FULFILLMENT_REACTION_PATTERNS) {
      if (pattern.test(reaction)) score += 1
    }
  }
  return score
}

function selectEpisodesForPrompt(episodes: readonly TaskEpisode[]): readonly TaskEpisode[] {
  const closed = episodes.filter(isClosedTaskEpisode)
  if (closed.length <= MAX_EPISODES_IN_PROMPT) return closed

  const selected = new Set(
    [...closed]
      .sort((a, b) => scoreNonFulfillmentLikelihood(b) - scoreNonFulfillmentLikelihood(a))
      .slice(0, MAX_EPISODES_IN_PROMPT),
  )
  return closed.filter((episode) => selected.has(episode))
}

const renderUserBlock = (label: string, messages: readonly string[]): string =>
  [
    `${label}:`,
    ...messages.map((message) =>
      [
        '<evaluated_trace_user_message format="json">',
        JSON.stringify({ role: "user", content: truncateExcerpt(message, USER_MESSAGE_EXCERPT_LENGTH) }, null, 2),
        "</evaluated_trace_user_message>",
      ].join("\n"),
    ),
  ].join("\n")

export const incompletionStrategy: FlaggerStrategy = {
  annotator: {
    name: "Incompletion",
    description: "The assistant did not complete the assigned task, forcing the user to follow up",
    instructions:
      "Use this flagger when a task assigned by the user or the system prompt was not completed by the assistant's response and the user's following messages show it — demanding a retry, repeating the request, or pointing at the missing deliverable. Do not use it for refusals, for shallow-but-delivered answers, for the user adding new work, or for responses the user never reacted to.",
  },

  // pattern:frustration covers the objective re-assertion regexes ("I already
  // told you", "for the second time") that work even when moments were skipped.
  hintKinds: ["moment:user_correction", "pattern:frustration"],

  hasRequiredContext(conversation: FlaggerConversation): boolean {
    return extractTaskEpisodes(conversation).some(isClosedTaskEpisode)
  },

  // The classifier may only convict an assistant turn the user reacted to; an
  // index-less match would anchor to the LAST assistant message via the anchor
  // fallback — the one turn this flagger must never flag (the session may
  // simply not have ended yet).
  validateMatch(conversation, result) {
    if (result.messageIndex === undefined) return false
    return extractTaskEpisodes(conversation).some(
      (episode) => episode.assistantMessageIndex === result.messageIndex && isClosedTaskEpisode(episode),
    )
  },

  buildSystemPrompt(): string {
    return INCOMPLETION_SYSTEM_PROMPT
  },

  buildPrompt(conversation: FlaggerConversation): string {
    const episodes = selectEpisodesForPrompt(extractTaskEpisodes(conversation))

    if (episodes.length === 0) {
      return "No closed task episodes found (no assistant response has a user reaction after it). Return matched=false."
    }

    const formatted = episodes
      .map((episode) =>
        [
          `--- Episode (assistant response at transcript index ${episode.assistantMessageIndex}) ---`,
          renderUserBlock("Task given by the user", episode.taskMessages),
          "Assistant response to judge:",
          `<evaluated_trace_assistant_response index="${episode.assistantMessageIndex}" format="json">`,
          JSON.stringify(
            { role: "assistant", content: truncateExcerpt(episode.assistantText, ASSISTANT_MESSAGE_EXCERPT_LENGTH) },
            null,
            2,
          ),
          "</evaluated_trace_assistant_response>",
          renderUserBlock("User reaction after the response", episode.reactionMessages),
        ].join("\n"),
      )
      .join("\n\n")

    return [
      `TASK EPISODES (${episodes.length} shown; only these assistant indices are flaggable):`,
      formatted,
      "",
      "For each episode, judge whether the user's reaction objectively shows the task was not completed by that assistant response. Return matched=true only with the failing episode's assistant transcript index as messageIndex.",
    ].join("\n")
  },
}
