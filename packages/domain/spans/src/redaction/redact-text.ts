import type { RedactionEntity } from "@domain/shared"
import { findRedactionMatches, type RedactionMatch } from "./detectors.ts"
import { OVERSIZED_FIELD_PLACEHOLDER, REDACTION_MAX_FIELD_CHARS, redactionPlaceholder } from "./labels.ts"

export type RedactionCounts = Partial<Record<RedactionEntity, number>>

interface TextRedactionResult {
  readonly text: string
  readonly counts: RedactionCounts
}

/**
 * Leftmost, then most specific, then longest. Detectors overlap (an Anthropic key matches the generic
 * `sk-` form too), so one winner per region. Rank precedes extent so a detector that identified what it
 * matched beats one that merely covered more of it.
 */
export function resolveOverlaps(matches: readonly RedactionMatch[]): RedactionMatch[] {
  const ordered = [...matches].sort((a, b) => a.start - b.start || b.rank - a.rank || b.end - a.end)
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

export function redactText(text: string, entities: ReadonlySet<RedactionEntity>): TextRedactionResult {
  if (text === "" || entities.size === 0) return { text, counts: {} }

  const accepted = resolveOverlaps(findRedactionMatches(text, entities))
  if (accepted.length === 0) return { text, counts: {} }

  // Built left to right in one pass: rewriting the accumulated string per match copies it once per match.
  const pieces: string[] = []
  let cursor = 0
  for (const match of accepted) {
    pieces.push(text.slice(cursor, match.start), redactionPlaceholder(match.entity))
    cursor = match.end
  }
  pieces.push(text.slice(cursor))

  return { text: pieces.join(""), counts: countByEntity(accepted) }
}

/** Whole-value replacement for scalars that cannot hold a spliced placeholder; `null` when nothing matched. */
export function redactWholeValue(
  text: string,
  entities: ReadonlySet<RedactionEntity>,
): { placeholder: string; counts: RedactionCounts } | null {
  if (text === "" || entities.size === 0) return null

  const accepted = resolveOverlaps(findRedactionMatches(text, entities))
  const entity = accepted[0]?.entity
  if (entity === undefined) return null

  return { placeholder: redactionPlaceholder(entity), counts: countByEntity(accepted) }
}

interface LeafRedactionOutcome {
  readonly text: string
  readonly counts: RedactionCounts
  readonly oversized: boolean
  readonly scannedChars: number
}

/** Every path that touches a string goes through this, so the size cap applies uniformly. */
export function redactLeaf(text: string, entities: ReadonlySet<RedactionEntity>): LeafRedactionOutcome {
  if (text === "" || entities.size === 0) return { text, counts: {}, oversized: false, scannedChars: 0 }

  if (text.length > REDACTION_MAX_FIELD_CHARS) {
    return { text: OVERSIZED_FIELD_PLACEHOLDER, counts: {}, oversized: true, scannedChars: 0 }
  }

  const result = redactText(text, entities)

  return { text: result.text, counts: result.counts, oversized: false, scannedChars: text.length }
}

export function mergeRedactionCounts(target: RedactionCounts, source: RedactionCounts): void {
  for (const [entity, count] of Object.entries(source) as [RedactionEntity, number][]) {
    target[entity] = (target[entity] ?? 0) + count
  }
}

export const totalRedactionCount = (counts: RedactionCounts): number =>
  Object.values(counts).reduce((total, count) => total + count, 0)
