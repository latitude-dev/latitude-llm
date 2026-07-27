import type { RedactionEntity } from "@domain/shared"
import { findRedactionMatches, type RedactionMatch } from "./detectors.ts"
import { redactionPlaceholder } from "./labels.ts"

export type RedactionCounts = Partial<Record<RedactionEntity, number>>

interface TextRedactionResult {
  readonly text: string
  readonly counts: RedactionCounts
}

/**
 * Leftmost-longest, non-overlapping. Detectors run independently and can report
 * overlapping candidates for the same span of text (a JWT is also `eyJ`-prefixed
 * base64, an Anthropic key also matches the generic `sk-` form), so exactly one
 * winner per region has to be picked before either counting or replacing.
 *
 * Counting and replacement both consume this same accepted set, which is why
 * `dryRun` totals are guaranteed to describe what `enforce` would actually do.
 */
function resolveOverlaps(matches: readonly RedactionMatch[]): RedactionMatch[] {
  const ordered = [...matches].sort((a, b) => a.start - b.start || b.end - a.end)
  const accepted: RedactionMatch[] = []
  let consumedUpTo = -1

  for (const match of ordered) {
    if (match.start < consumedUpTo) continue
    accepted.push(match)
    consumedUpTo = match.end
  }

  return accepted
}

const countByEntity = (matches: readonly RedactionMatch[]): RedactionCounts => {
  const counts: RedactionCounts = {}

  for (const match of matches) {
    counts[match.entity] = (counts[match.entity] ?? 0) + 1
  }

  return counts
}

/**
 * Count what redaction would remove from `text` without modifying it. This is the
 * `dryRun` path.
 */
export function countRedactions(text: string, entities: ReadonlySet<RedactionEntity>): RedactionCounts {
  if (text === "" || entities.size === 0) return {}

  return countByEntity(resolveOverlaps(findRedactionMatches(text, entities)))
}

/**
 * Replace every accepted match with its entity placeholder. Replacement runs
 * right to left so earlier offsets stay valid as the string is rewritten.
 */
export function redactText(text: string, entities: ReadonlySet<RedactionEntity>): TextRedactionResult {
  if (text === "" || entities.size === 0) return { text, counts: {} }

  const accepted = resolveOverlaps(findRedactionMatches(text, entities))
  if (accepted.length === 0) return { text, counts: {} }

  let redacted = text
  for (let index = accepted.length - 1; index >= 0; index--) {
    const match = accepted[index]
    if (!match) continue
    redacted = redacted.slice(0, match.start) + redactionPlaceholder(match.entity) + redacted.slice(match.end)
  }

  return { text: redacted, counts: countByEntity(accepted) }
}

export function mergeRedactionCounts(target: RedactionCounts, source: RedactionCounts): void {
  for (const [entity, count] of Object.entries(source) as [RedactionEntity, number][]) {
    target[entity] = (target[entity] ?? 0) + count
  }
}

export const totalRedactionCount = (counts: RedactionCounts): number =>
  Object.values(counts).reduce((total, count) => total + count, 0)
