import { REDACTION_ENTITY_LABELS, type RedactionIdentityHandling, type RedactionPolicy } from "@domain/shared"
import { BUILT_IN_DETECTORS } from "./detectors.ts"

/**
 * One pattern plus the label its matches are replaced with.
 *
 * Built-in entities and customer-defined rules collapse to this single shape, which is what
 * keeps everything downstream of matching — overlap resolution, counting, the placeholder,
 * the UI chip — unaware that custom rules exist at all.
 */
export interface CompiledRule {
  readonly label: string
  readonly pattern: RegExp
  readonly validate?: (value: string) => boolean
  /** Breaks an overlap tie at the same offset before extent does. Built-ins set it; custom rules do not. */
  readonly rank: number
  /** Redact this capture group rather than the whole match, for a pattern needing context it must not remove. */
  readonly group?: number
}

export interface CompiledRuleSet {
  readonly rules: readonly CompiledRule[]
}

/** A policy with its patterns already built, so a batch compiles once rather than per span or per leaf. */
export interface CompiledPolicy {
  readonly ruleSet: CompiledRuleSet
  readonly redactMetadata: boolean
  readonly identities: RedactionIdentityHandling
}

export interface RedactionMatch {
  readonly start: number
  readonly end: number
  readonly label: string
  readonly rank: number
}

/**
 * Built-ins are emitted first so that when a built-in and a custom rule match the same
 * offsets with the same length, the built-in wins: `resolveOverlaps` breaks such ties by
 * input order, and a validated label describes the value more accurately than a
 * customer-supplied one.
 */
export function compileRuleSet(policy: RedactionPolicy): CompiledRuleSet {
  const rules: CompiledRule[] = []

  for (const detector of BUILT_IN_DETECTORS) {
    if (!policy.entities.has(detector.entity)) continue

    rules.push({
      label: REDACTION_ENTITY_LABELS[detector.entity],
      pattern: detector.pattern,
      rank: detector.rank ?? 0,
      ...(detector.validate ? { validate: detector.validate } : {}),
      ...(detector.group !== undefined ? { group: detector.group } : {}),
    })
  }

  return { rules }
}

export const compilePolicy = (policy: RedactionPolicy): CompiledPolicy => ({
  ruleSet: compileRuleSet(policy),
  redactMetadata: policy.redactMetadata,
  identities: policy.identities,
})

/**
 * Unsorted and possibly overlapping; the caller resolves overlaps so counting and
 * replacement share one accepted set.
 *
 * Sharing one `RegExp` instance across a whole batch is safe: `matchAll` iterates a clone
 * and never advances the original's `lastIndex`. Rebuilding patterns per leaf to avoid
 * imagined shared state would throw away the point of compiling.
 */
export function findRedactionMatches(text: string, ruleSet: CompiledRuleSet): RedactionMatch[] {
  const matches: RedactionMatch[] = []

  for (const rule of ruleSet.rules) {
    for (const match of text.matchAll(rule.pattern)) {
      const span = spanOf(match, rule.group)
      if (span === undefined) continue
      if (rule.validate && !rule.validate(span.value)) continue

      matches.push({ start: span.start, end: span.end, label: rule.label, rank: rule.rank })
    }
  }

  return matches
}

/** The whole match, or the capture group a rule nominates when it needs context it must not remove. */
const spanOf = (
  match: RegExpExecArray,
  group: number | undefined,
): { start: number; end: number; value: string } | undefined => {
  if (group === undefined) {
    const value = match[0]
    if (match.index === undefined || value === "") return undefined

    return { start: match.index, end: match.index + value.length, value }
  }

  const offsets = match.indices?.[group]
  const value = match[group]
  if (offsets === undefined || value === undefined || value === "") return undefined

  return { start: offsets[0], end: offsets[1], value }
}
