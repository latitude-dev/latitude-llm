/**
 * Flagger annotations that pinpoint where a signal manifests in a seeded
 * conversation, so the Scores tab's "click a score → scroll to its anchor"
 * flow, the shareable `?scoreId=` link, and the signal → session auto-focus all
 * have something to land on.
 *
 * Every signal gets one anchored occurrence plus one conversation-level one, so
 * both branches are reachable from the same signal: the anchored session scrolls
 * to a message, the unanchored one opens the conversation from the top.
 */

import { SEED_SIGNAL_FIXTURES } from "./issues.ts"
import {
  TAU2_SEED_TRAJECTORIES,
  type Tau2SeedTrajectory,
  tau2TrajectoryIndexForSignalOccurrence,
} from "./tau2-trajectories.ts"

/**
 * The conversation drawer pages messages in as the reader scrolls, and the
 * scroll-to-anchor pass only waits for a render — not for another chunk. An
 * anchor past the first chunk would have no DOM node to find, so seeded anchors
 * stay inside it. Mirrors `CONVERSATION_CHUNK_SIZE` in the web app.
 */
const CONVERSATION_FIRST_CHUNK_MESSAGES = 25

/** Named signal fixtures, the ones the demo tours; the generated tail stays unannotated. */
const ANNOTATED_SIGNAL_COUNT = 8

/** Substring anchors cover a clause, not a wall of text. */
const SUBSTRING_ANCHOR_MAX_LENGTH = 160
const SUBSTRING_ANCHOR_MIN_LENGTH = 32

/** Flaggers that plausibly author these support failures, rotated per signal. */
const ANNOTATION_FLAGGER_SLUGS = ["bluffing", "incompletion", "forgetting"] as const

export type SeedAnnotationAnchor = {
  readonly messageIndex: number
  /** Set together with the offsets for a substring anchor; absent for a whole-message one. */
  readonly partIndex?: number
  readonly startOffset?: number
  readonly endOffset?: number
}

export type SeedAnchoredAnnotation = {
  /** Suffix of the deterministic score id, unique across the fixture set. */
  readonly key: string
  /** Index into `SEED_SIGNAL_FIXTURES`; the seeders resolve it to their scoped signal id. */
  readonly signalIndex: number
  /** Index into `TAU2_SEED_TRAJECTORIES`; the seeders resolve it to the `tau2-trajectory` trace. */
  readonly trajectoryIndex: number
  readonly feedback: string
  readonly rawFeedback: string
  readonly flaggerSlug: string
  /** Null for a conversation-level annotation, which has no message to scroll to. */
  readonly anchor: SeedAnnotationAnchor | null
  readonly daysAgo: number
  readonly hour: number
  readonly minute: number
}

/**
 * Assistant turns that can carry an anchor: they have text to highlight, they
 * are inside the conversation the drawer renders (which stops at the last
 * assistant turn), and they land in its first chunk. The rendered conversation
 * is `[system, ...turns]`, so every turn shifts one index down.
 */
function anchorableAssistantTurns(trajectory: Tau2SeedTrajectory) {
  const lastAssistantTurn = trajectory.messages.map((message) => message.role).lastIndexOf("assistant")
  const turns: { readonly messageIndex: number; readonly text: string }[] = []

  for (let turn = 0; turn <= lastAssistantTurn; turn++) {
    const messageIndex = turn + 1
    if (messageIndex >= CONVERSATION_FIRST_CHUNK_MESSAGES) break
    const message = trajectory.messages[turn]
    if (!message || message.role !== "assistant") continue
    const text = message.content ?? ""
    if (text.trim().length === 0) continue
    turns.push({ messageIndex, text })
  }

  return turns
}

/**
 * Offsets covering the turn's opening claim. Stops at the first line break so
 * the highlight stays inside one rendered block instead of bleeding across a
 * markdown list, and returns null when nothing long enough fits — the caller
 * then anchors the whole turn instead.
 */
function openingClaimOffsets(text: string): { readonly startOffset: number; readonly endOffset: number } | null {
  const lineBreak = text.indexOf("\n")
  const cap = Math.min(text.length, lineBreak === -1 ? text.length : lineBreak, SUBSTRING_ANCHOR_MAX_LENGTH)
  if (cap < SUBSTRING_ANCHOR_MIN_LENGTH) return null

  const sentenceEnd = text.slice(0, cap).search(/[.!?](\s|$)/)
  const endOffset = sentenceEnd >= SUBSTRING_ANCHOR_MIN_LENGTH ? sentenceEnd + 1 : text.lastIndexOf(" ", cap)
  return endOffset >= SUBSTRING_ANCHOR_MIN_LENGTH ? { startOffset: 0, endOffset } : null
}

function anchoredAnnotation(signalIndex: number, maxTrajectories: number): SeedAnchoredAnnotation | null {
  const signal = SEED_SIGNAL_FIXTURES[signalIndex]
  const trajectoryIndex = tau2TrajectoryIndexForSignalOccurrence({ signalIndex, occurrenceIndex: 0, maxTrajectories })
  const trajectory = TAU2_SEED_TRAJECTORIES[trajectoryIndex]
  if (!signal || !trajectory) return null

  const turns = anchorableAssistantTurns(trajectory)
  const turn = turns[turns.length - 1]
  if (!turn) return null

  // Odd signals pinpoint a substring so the text-selection highlight is covered
  // too; even ones anchor the whole turn.
  const offsets = signalIndex % 2 === 1 ? openingClaimOffsets(turn.text) : null
  const rawFeedback = offsets
    ? "This exact claim is not backed by the tool results."
    : "This turn is where the agent commits to an outcome the tools never confirmed."

  return {
    key: `anchored:${signalIndex}`,
    signalIndex,
    trajectoryIndex,
    feedback: `${signal.name}: ${rawFeedback} (tau2 ${trajectory.domain} task ${trajectory.taskId}, reward ${trajectory.reward})`,
    rawFeedback,
    flaggerSlug: ANNOTATION_FLAGGER_SLUGS[signalIndex % ANNOTATION_FLAGGER_SLUGS.length] ?? "bluffing",
    anchor: { messageIndex: turn.messageIndex, ...(offsets ? { partIndex: 0, ...offsets } : {}) },
    daysAgo: signalIndex % 7,
    hour: (signalIndex * 5 + 9) % 24,
    minute: (signalIndex * 13) % 60,
  }
}

function conversationLevelAnnotation(signalIndex: number, maxTrajectories: number): SeedAnchoredAnnotation | null {
  const signal = SEED_SIGNAL_FIXTURES[signalIndex]
  const trajectoryIndex = tau2TrajectoryIndexForSignalOccurrence({ signalIndex, occurrenceIndex: 1, maxTrajectories })
  const trajectory = TAU2_SEED_TRAJECTORIES[trajectoryIndex]
  if (!signal || !trajectory) return null
  // Same trajectory as the anchored occurrence would put both annotations on one
  // session, hiding the difference between them.
  if (
    trajectoryIndex === tau2TrajectoryIndexForSignalOccurrence({ signalIndex, occurrenceIndex: 0, maxTrajectories })
  ) {
    return null
  }

  const rawFeedback = "The whole conversation ends without meeting the customer's goal, and no single turn is at fault."

  return {
    key: `conversation:${signalIndex}`,
    signalIndex,
    trajectoryIndex,
    feedback: `${signal.name}: ${rawFeedback} (tau2 ${trajectory.domain} task ${trajectory.taskId}, reward ${trajectory.reward})`,
    rawFeedback,
    flaggerSlug: ANNOTATION_FLAGGER_SLUGS[(signalIndex + 1) % ANNOTATION_FLAGGER_SLUGS.length] ?? "incompletion",
    anchor: null,
    daysAgo: (signalIndex + 3) % 7,
    hour: (signalIndex * 5 + 14) % 24,
    minute: (signalIndex * 17) % 60,
  }
}

export function buildSeedAnchoredAnnotations(
  maxTrajectories = TAU2_SEED_TRAJECTORIES.length,
): readonly SeedAnchoredAnnotation[] {
  return Array.from({ length: ANNOTATED_SIGNAL_COUNT }, (_, signalIndex) => signalIndex).flatMap((signalIndex) =>
    [
      anchoredAnnotation(signalIndex, maxTrajectories),
      conversationLevelAnnotation(signalIndex, maxTrajectories),
    ].filter((annotation): annotation is SeedAnchoredAnnotation => annotation !== null),
  )
}
