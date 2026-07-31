import { OVERSIZED_FIELD_PLACEHOLDER, REDACTION_MAX_FIELD_CHARS, redactionPlaceholder } from "./labels.ts"
import { type CompiledRuleSet, findRedactionMatches, type RedactionMatch } from "./rules.ts"

/** Keyed by placeholder label rather than by entity, so custom rules count without a widened enum. */
export type RedactionCounts = Record<string, number>

interface TextRedactionResult {
  readonly text: string
  readonly counts: RedactionCounts
}

/**
 * Leftmost, then most specific, then longest. Rules overlap (an Anthropic key matches the generic
 * `sk-` form too), so one winner per region. Rank precedes extent so a rule that identified what it
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

const countByLabel = (matches: readonly RedactionMatch[]): RedactionCounts => {
  const counts: RedactionCounts = {}

  for (const match of matches) {
    counts[match.label] = (counts[match.label] ?? 0) + 1
  }

  return counts
}

export function redactText(text: string, ruleSet: CompiledRuleSet): TextRedactionResult {
  if (text === "" || ruleSet.rules.length === 0) return { text, counts: {} }

  const accepted = resolveOverlaps(findRedactionMatches(text, ruleSet))
  if (accepted.length === 0) return { text, counts: {} }

  // Built left to right in one pass: rewriting the accumulated string per match copies it once per match.
  const pieces: string[] = []
  let cursor = 0
  for (const match of accepted) {
    pieces.push(text.slice(cursor, match.start), redactionPlaceholder(match.label))
    cursor = match.end
  }
  pieces.push(text.slice(cursor))

  return { text: pieces.join(""), counts: countByLabel(accepted) }
}

/** Whole-value replacement for scalars that cannot hold a spliced placeholder; `null` when nothing matched. */
export function redactWholeValue(
  text: string,
  ruleSet: CompiledRuleSet,
): { placeholder: string; counts: RedactionCounts } | null {
  if (text === "" || ruleSet.rules.length === 0) return null

  const accepted = resolveOverlaps(findRedactionMatches(text, ruleSet))
  const label = accepted[0]?.label
  if (label === undefined) return null

  return { placeholder: redactionPlaceholder(label), counts: countByLabel(accepted) }
}

interface LeafRedactionOutcome {
  readonly text: string
  readonly counts: RedactionCounts
  readonly oversized: boolean
  readonly scannedChars: number
}

/** Every path that touches a string goes through this, so the size cap applies uniformly. */
export function redactLeaf(text: string, ruleSet: CompiledRuleSet): LeafRedactionOutcome {
  if (text === "" || ruleSet.rules.length === 0) return { text, counts: {}, oversized: false, scannedChars: 0 }

  if (text.length > REDACTION_MAX_FIELD_CHARS) {
    return { text: OVERSIZED_FIELD_PLACEHOLDER, counts: {}, oversized: true, scannedChars: 0 }
  }

  const result = redactText(text, ruleSet)

  return { text: result.text, counts: result.counts, oversized: false, scannedChars: text.length }
}

export function mergeRedactionCounts(target: RedactionCounts, source: RedactionCounts): void {
  for (const [label, count] of Object.entries(source)) {
    target[label] = (target[label] ?? 0) + count
  }
}

export const totalRedactionCount = (counts: RedactionCounts): number =>
  Object.values(counts).reduce((total, count) => total + count, 0)
