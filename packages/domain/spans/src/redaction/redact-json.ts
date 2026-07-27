import type { RedactionEntity } from "@domain/shared"
import { REDACTION_SKIP_KEYS } from "./labels.ts"
import { mergeRedactionCounts, type RedactionCounts, redactLeaf } from "./redact-text.ts"

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

export interface JsonRedactionOptions {
  readonly entities: ReadonlySet<RedactionEntity>
  /** When false, walk and count but return the input untouched. This is `dryRun`. */
  readonly mutate: boolean
}

/**
 * Part types whose `content` is base64-encoded binary rather than text. Scanning
 * them wastes CPU proportional to the payload and can only produce noise. PII
 * inside an image is out of scope, not overlooked.
 */
const SKIPPED_PART_TYPES: ReadonlySet<string> = new Set(["blob", "file"])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isSkippedPart = (value: Record<string, unknown>): boolean =>
  typeof value.type === "string" && SKIPPED_PART_TYPES.has(value.type)

/**
 * Walk arbitrary JSON and redact string leaves.
 *
 * Structure is preserved exactly: array length and order (message pairing and
 * `messageIndex` references depend on it), object keys, and every non-string
 * leaf. Only string values change, and only in `mutate` mode.
 *
 * Skip-keys are an optimization. Every detector is high-precision, so scanning a
 * structural value costs CPU but cannot corrupt it.
 */
export function redactJsonValue<T>(value: T, options: JsonRedactionOptions): JsonRedactionResult<T> {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  const walked = walk(value, options, counts, scan)

  return { value: walked as T, counts, scan }
}

function walk(value: unknown, options: JsonRedactionOptions, counts: RedactionCounts, scan: ScanTally): unknown {
  if (typeof value === "string") {
    const outcome = redactLeaf(value, options.entities, options.mutate)
    mergeRedactionCounts(counts, outcome.counts)
    scan.leaves += 1
    scan.chars += outcome.scannedChars
    if (outcome.oversized) scan.oversized += 1

    return outcome.text
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const walkedItem = walk(item, options, counts, scan)
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
      if (REDACTION_SKIP_KEYS.has(key)) {
        next[key] = entry
        continue
      }

      const walkedEntry = walk(entry, options, counts, scan)
      if (walkedEntry !== entry) changed = true
      next[key] = walkedEntry
    }

    return changed ? next : value
  }

  return value
}

/**
 * Redact a string that may itself hold serialized JSON, which is how `tool_input`,
 * `tool_output`, and `events_json` arrive.
 *
 * A parsed payload is walked structurally and re-serialized, so keys and
 * non-string leaves survive. Anything that is not JSON, or that parses to a bare
 * scalar, is treated as plain text: re-serializing a scalar would rewrite `"hi"`
 * as `"\"hi\""` and corrupt the field.
 */
export function redactJsonString(value: string, options: JsonRedactionOptions): JsonRedactionResult<string> {
  if (value === "" || options.entities.size === 0) return { value, counts: {}, scan: emptyScanTally() }

  const parsed = tryParseJsonContainer(value)
  if (parsed === undefined) {
    const outcome = redactLeaf(value, options.entities, options.mutate)

    return {
      value: outcome.text,
      counts: outcome.counts,
      scan: { leaves: 1, chars: outcome.scannedChars, oversized: outcome.oversized ? 1 : 0 },
    }
  }

  const walked = redactJsonValue(parsed, options)
  if (!options.mutate) return { value, counts: walked.counts, scan: walked.scan }

  return { value: JSON.stringify(walked.value), counts: walked.counts, scan: walked.scan }
}

const tryParseJsonContainer = (value: string): unknown => {
  const trimmed = value.trimStart()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    return isPlainObject(parsed) || Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Redact the values of a string map, preserving every key. */
export function redactStringMap(
  map: Readonly<Record<string, string>>,
  options: JsonRedactionOptions,
): JsonRedactionResult<Record<string, string>> {
  const counts: RedactionCounts = {}
  const scan = emptyScanTally()
  const next: Record<string, string> = {}

  for (const [key, value] of Object.entries(map)) {
    const outcome = redactLeaf(value, options.entities, options.mutate)
    mergeRedactionCounts(counts, outcome.counts)
    scan.leaves += 1
    scan.chars += outcome.scannedChars
    if (outcome.oversized) scan.oversized += 1
    next[key] = outcome.text
  }

  return { value: next, counts, scan }
}
