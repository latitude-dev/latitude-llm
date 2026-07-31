import { OVERSIZED_FIELD_PLACEHOLDER, REDACTION_MAX_DEPTH, redactionPlaceholder } from "./labels.ts"
import { mergeRedactionCounts, type RedactionCounts, redactLeaf, redactWholeValue } from "./redact-text.ts"
import type { CompiledRuleSet } from "./rules.ts"

interface JsonRedactionResult<T> {
  readonly value: T
  readonly counts: RedactionCounts
  readonly scan: ScanTally
}

export interface ScanTally {
  leaves: number
  chars: number
  oversized: number
}

export const emptyScanTally = (): ScanTally => ({ leaves: 0, chars: 0, oversized: 0 })

export const mergeScanTally = (target: ScanTally, source: ScanTally): void => {
  target.leaves += source.leaves
  target.chars += source.chars
  target.oversized += source.oversized
}

/** Their `content` is base64 binary, so PII inside one is out of scope rather than overlooked. */
const SKIPPED_PART_TYPES: ReadonlySet<string> = new Set(["blob", "file"])

// `JSON.rawJSON` and the reviver's source context ship in Node 25 (workspace engines) but are absent from the ES2022 lib.
const rawJson = JSON as unknown as {
  parse(
    text: string,
    reviver: (key: string, value: unknown, context: { readonly source?: string } | undefined) => unknown,
  ): unknown
  rawJSON(literal: string): object
  isRawJSON(value: unknown): boolean
}

// A plain parse rounds integers past 2^53 and rewrites `3.10` as `3.1`, corrupting ids we only meant to scan past.
const parsePreservingNumbers = (text: string): unknown =>
  rawJson.parse(text, (_key, value, context) =>
    context?.source !== undefined && typeof value === "number" ? rawJson.rawJSON(context.source) : value,
  )

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSkippedPart = (value: Record<string, unknown>): boolean =>
  typeof value.type === "string" && SKIPPED_PART_TYPES.has(value.type)

/**
 * Array length and order, object keys, and non-string leaves are all preserved; only strings change.
 * Every string leaf is scanned whatever its key, since customer JSON stores content under names like `id`.
 */
export function redactJsonValue<T>(value: T, ruleSet: CompiledRuleSet): JsonRedactionResult<T> {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  const walked = walk(value, ruleSet, counts, scan, 0)

  return { value: walked as T, counts, scan }
}

function walk(
  value: unknown,
  ruleSet: CompiledRuleSet,
  counts: RedactionCounts,
  scan: ScanTally,
  depth: number,
): unknown {
  if (typeof value === "string") {
    const outcome = redactLeaf(value, ruleSet)
    mergeRedactionCounts(counts, outcome.counts)
    scan.leaves += 1
    scan.chars += outcome.scannedChars
    if (outcome.oversized) scan.oversized += 1

    return outcome.text
  }

  // A raw number literal is an object, so it would otherwise be walked as one and its digits scanned.
  if (rawJson.isRawJSON(value)) return value

  const isContainer = Array.isArray(value) || isPlainObject(value)
  // Dropping the subtree rather than leaving it unscanned keeps a crafted payload from being a way to smuggle content past.
  if (isContainer && depth >= REDACTION_MAX_DEPTH) {
    scan.oversized += 1

    return OVERSIZED_FIELD_PLACEHOLDER
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const walkedItem = walk(item, ruleSet, counts, scan, depth + 1)
      if (walkedItem !== item) changed = true
      return walkedItem
    })

    return changed ? next : value
  }

  if (isPlainObject(value)) {
    if (isSkippedPart(value)) return value

    let changed = false
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const walkedEntry = walk(entry, ruleSet, counts, scan, depth + 1)
      if (walkedEntry !== entry) changed = true
      next[key] = walkedEntry
    }

    return changed ? next : value
  }

  return value
}

/** A bare scalar is treated as text rather than re-serialized, which would rewrite `"hi"` as `"\"hi\""`. */
export function redactJsonString(value: string, ruleSet: CompiledRuleSet): JsonRedactionResult<string> {
  if (value === "" || ruleSet.rules.length === 0) return { value, counts: {}, scan: emptyScanTally() }

  const parsed = tryParseJsonContainer(value)
  if (parsed === undefined) {
    const outcome = redactLeaf(value, ruleSet)

    return {
      value: outcome.text,
      counts: outcome.counts,
      scan: { leaves: 1, chars: outcome.scannedChars, oversized: outcome.oversized ? 1 : 0 },
    }
  }

  const walked = redactJsonValue(parsed, ruleSet)
  // The walk returns the same reference when no leaf changed, so the original bytes survive an unmatched scan.
  if (walked.value === parsed) return { value, counts: walked.counts, scan: walked.scan }

  return { value: JSON.stringify(walked.value), counts: walked.counts, scan: walked.scan }
}

const tryParseJsonContainer = (value: string): unknown => {
  const trimmed = value.trimStart()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined

  try {
    const parsed = parsePreservingNumbers(value)
    return isPlainObject(parsed) || Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Replaces the whole value of any attribute a key rule names, leaving the key in place.
 *
 * Run before the value pass, whose scan of the resulting placeholder is a harmless no-op: no
 * detector matches a placeholder, which the safe corpus pins by including one.
 */
export function maskKeyedValues(
  map: Readonly<Record<string, string>>,
  ruleSet: CompiledRuleSet,
): JsonRedactionResult<Record<string, string>> {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  let masked = 0
  const next: Record<string, string> = {}

  for (const [key, value] of Object.entries(map)) {
    const label = ruleSet.maskedKeyLabel(key)
    if (label === null) {
      next[key] = value
      continue
    }
    next[key] = redactionPlaceholder(label)
    counts[label] = (counts[label] ?? 0) + 1
    scan.chars += value.length
    masked += 1
  }

  return { value: masked === 0 ? map : next, counts, scan }
}

// `redactJsonString`, not `redactLeaf`: these values duplicate the typed columns and must get the identical walk.
export function redactStringMap(
  map: Readonly<Record<string, string>>,
  ruleSet: CompiledRuleSet,
): JsonRedactionResult<Record<string, string>> {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  const next: Record<string, string> = {}

  for (const [key, value] of Object.entries(map)) {
    const outcome = redactJsonString(value, ruleSet)
    mergeRedactionCounts(counts, outcome.counts)
    mergeScanTally(scan, outcome.scan)
    next[key] = outcome.value
  }

  return { value: next, counts, scan }
}

export interface NumberMapRedactionResult<T> {
  readonly kept: Record<string, T>
  /** Matched keys, moved out because a `Map(String, Int64)` cannot hold a placeholder. */
  readonly relocated: Record<string, string>
  readonly counts: RedactionCounts
  readonly scan: ScanTally
}

// Only `credit_card` is reachable on a bare number; every other entity needs a separator, sigil, or letter.
export function redactNumberMap<T extends number>(
  map: Readonly<Record<string, T>>,
  ruleSet: CompiledRuleSet,
): NumberMapRedactionResult<T> {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  const kept: Record<string, T> = {}
  const relocated: Record<string, string> = {}

  for (const [key, value] of Object.entries(map) as [string, T][]) {
    const text = String(value)
    scan.leaves += 1
    scan.chars += text.length

    const outcome = redactWholeValue(text, ruleSet)
    if (outcome === null) {
      kept[key] = value
      continue
    }
    mergeRedactionCounts(counts, outcome.counts)
    relocated[key] = outcome.placeholder
  }

  return { kept, relocated, counts, scan }
}
