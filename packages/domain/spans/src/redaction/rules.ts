import {
  isRuleEnabled,
  REDACTION_ENTITY_LABELS,
  type RedactionIdentityHandling,
  type RedactionPolicy,
  type RedactionRule,
} from "@domain/shared"
import { RedactionError } from "../errors.ts"
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
  /**
   * The label to replace a whole attribute value with, when a key rule names that key.
   *
   * Separate from `rules` because it matches the key rather than the value. It masks rather than
   * deletes, so a redacting project's attribute panel still shows every key the exporter sent —
   * the same contract the value passes follow.
   */
  readonly maskedKeyLabel: (key: string) => string | null
  /**
   * Called before each leaf is scanned, to throw once the batch budget is spent.
   *
   * Rides on the rule set because it shares its lifetime — both are built once per policy per
   * batch — and because that puts it where the leaves are without threading it through the walk.
   */
  readonly checkDeadline?: () => void
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
export function compileRuleSet(policy: RedactionPolicy, checkDeadline?: () => void): CompiledRuleSet {
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

  const enabled = policy.rules.filter(isRuleEnabled)
  const keyRules: RedactionRule[] = []

  for (const rule of enabled) {
    if (rule.kind === "attribute_key") keyRules.push(rule)
    if (rule.kind === "terms") rules.push({ label: rule.label, pattern: compileTerms(rule), rank: 0 })
    if (rule.kind === "pattern") rules.push({ label: rule.label, pattern: compilePattern(rule), rank: 0 })
  }

  return { rules, maskedKeyLabel: compileKeyMatcher(keyRules), ...(checkDeadline ? { checkDeadline } : {}) }
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const WORD_CHARACTER = /[A-Za-z0-9_]/

/**
 * Boundaries are per term rather than wrapped around the whole alternation. A term with a
 * non-word edge (`+1-555`, `-verbose`) can never match behind a blanket `(?<![A-Za-z0-9_])`,
 * because the character before it is not a word character either.
 */
const boundedTerm = (term: string, wholeWord: boolean): string => {
  const escaped = escapeRegExp(term)
  if (!wholeWord) return escaped

  const opensOnWord = WORD_CHARACTER.test(term.slice(0, 1))
  const closesOnWord = WORD_CHARACTER.test(term.slice(-1))

  return `${opensOnWord ? "(?<![A-Za-z0-9_])" : ""}${escaped}${closesOnWord ? "(?![A-Za-z0-9_])" : ""}`
}

/**
 * One alternation per rule, so a 200-term list costs a single pass per leaf.
 *
 * Terms are sorted longest first because JS alternation is leftmost-*first*, not
 * leftmost-longest: given `ACME|ACME_CORP`, the input `ACME_CORP` matches only `ACME` and
 * `_CORP` survives in the stored content. Harmless for a boolean `test`, which is why
 * `compileKeywordMatcher` in `@domain/github` gets away without it, and corrupting here.
 */
const compileTerms = (rule: Extract<RedactionRule, { kind: "terms" }>): RegExp => {
  const wholeWord = rule.wholeWord !== false
  const alternatives = [...new Set(rule.terms)]
    .sort((left, right) => right.length - left.length)
    .map((term) => boundedTerm(term, wholeWord))

  return new RegExp(`(?:${alternatives.join("|")})`, rule.caseSensitive === true ? "g" : "gi")
}

/**
 * Patterns are validated at write time, never here: a validator on the ingest path would cost
 * more than the scan. An uncompilable pattern therefore throws, which fails the batch rather
 * than silently writing the content a project asked us to strip.
 */
const compilePattern = (rule: Extract<RedactionRule, { kind: "pattern" }>): RegExp => {
  const flags = `g${rule.ignoreCase ? "i" : ""}${rule.dotAll ? "s" : ""}`

  try {
    return new RegExp(rule.pattern, flags)
  } catch (cause) {
    throw new RedactionError({ reason: `redaction rule ${rule.label} has an uncompilable pattern`, cause })
  }
}

const MATCHES_NO_KEY = () => null

/**
 * Exact keys and `prefix.*` globs, matched with `startsWith` rather than compiled to a regex.
 * Keys are short and structured, so a glob buys nothing a prefix does not, and a prefix cannot
 * be made to backtrack.
 */
/**
 * Exact keys and `prefix.*` globs, matched with `startsWith` rather than compiled to a regex.
 * Keys are short and structured, so a glob buys nothing a prefix does not, and a prefix cannot
 * be made to backtrack.
 *
 * First rule wins when two name the same key, which makes the label deterministic.
 */
const compileKeyMatcher = (rules: readonly RedactionRule[]): ((key: string) => string | null) => {
  const exact = new Map<string, string>()
  const prefixes: { prefix: string; label: string }[] = []

  for (const rule of rules) {
    if (rule.kind !== "attribute_key") continue

    for (const key of rule.keys) {
      if (key.endsWith("*")) prefixes.push({ prefix: key.slice(0, -1), label: rule.label })
      else if (!exact.has(key)) exact.set(key, rule.label)
    }
  }

  if (exact.size === 0 && prefixes.length === 0) return MATCHES_NO_KEY

  return (key) => exact.get(key) ?? prefixes.find((entry) => key.startsWith(entry.prefix))?.label ?? null
}

export const compilePolicy = (policy: RedactionPolicy, checkDeadline?: () => void): CompiledPolicy => ({
  ruleSet: compileRuleSet(policy, checkDeadline),
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
