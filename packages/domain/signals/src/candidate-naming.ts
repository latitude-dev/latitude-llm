import { SIGNAL_NAME_MAX_LENGTH } from "./constants.ts"

const ELLIPSIS = "..."

/**
 * Shortest first sentence worth using as a name. Below this the sentence split
 * almost certainly landed on an abbreviation ("e.g.", "i.e."), and the full
 * feedback truncated reads better than a four-character title.
 */
const MIN_FIRST_SENTENCE_LENGTH = 16

const FALLBACK_NAME = "Unnamed signal"

export const collapseWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim()

export const truncateSignalName = (name: string): string => {
  const collapsed = collapseWhitespace(name)
  if (collapsed.length <= SIGNAL_NAME_MAX_LENGTH) {
    return collapsed
  }

  return `${collapsed.slice(0, SIGNAL_NAME_MAX_LENGTH - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`
}

const firstSentence = (collapsed: string): string => {
  const sentence = collapsed.match(/^.*?[.!?](?=\s|$)/)?.[0]?.trim() ?? ""
  return sentence.length >= MIN_FIRST_SENTENCE_LENGTH ? sentence : collapsed
}

interface CandidatePlaceholder {
  readonly name: string
  readonly description: string
}

/**
 * Deterministic name and description for a freshly discovered candidate.
 *
 * Summarizing a cluster from its single first member is not a well-posed task,
 * and asking a model to do it produces titles like `description` or a sentence
 * explaining that one occurrence is not enough. The real summary is generated
 * once at promotion, over the whole cluster; until then the occurrence's own
 * words carry both fields.
 */
export const buildCandidatePlaceholder = (feedback: string): CandidatePlaceholder => {
  const collapsed = collapseWhitespace(feedback)
  if (collapsed.length === 0) {
    return { name: FALLBACK_NAME, description: FALLBACK_NAME }
  }

  return {
    name: truncateSignalName(firstSentence(collapsed).replace(/\.$/, "")),
    description: collapsed,
  }
}
