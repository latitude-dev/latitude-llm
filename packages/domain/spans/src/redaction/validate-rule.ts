import type { RedactionRule } from "@domain/shared"

/**
 * Bumped whenever a gate below gets stricter.
 *
 * Validation runs only at write time, so a rule admitted by an older validator keeps running
 * untouched. Storing the version that admitted each rule is what lets a tightened validator
 * flag the survivors instead of trusting them silently.
 */
export const REDACTION_VALIDATOR_VERSION = 1

export interface RuleValidationIssue {
  readonly code: string
  readonly message: string
}

/**
 * Whether a rule is *safe to run*, not whether it matches the right things.
 *
 * Over-breadth is deliberately not judged here. Only the customer's own data can say whether a
 * pattern is too greedy, so that question belongs to the redaction preview, which runs the real
 * policy over their stored spans. An earlier version scored rules against a fixed corpus of
 * strings and blocked on a hit, which rejected legitimate rules — a project whose account numbers
 * are long digit runs could not express them — and asked the customer to trust a judgement about
 * data they had never seen.
 */
export interface RuleValidation {
  readonly ok: boolean
  /** Blocking. The rule must not be saved. */
  readonly errors: readonly RuleValidationIssue[]
  readonly slowestProbeMs: number
  readonly validatorVersion: number
}

/** A pattern this slow on a short input is backtracking exponentially, not merely working hard. */
const EXPONENTIAL_PROBE_BUDGET_MS = 20
const POLYNOMIAL_PROBE_BUDGET_MS = 50

/** Short enough that an exponential pattern is detectable before the probe itself becomes the hang. */
const EXPONENTIAL_PROBE_LENGTHS = [16, 24, 32] as const
const POLYNOMIAL_PROBE_LENGTHS = [2_048, 8_192] as const

const MAX_QUANTIFIER_BOUND = 1_000

/**
 * A key rule whose glob is this short drops almost every attribute on the span. `*` alone drops
 * all of them, which is not a redaction policy so much as an outage.
 */
const MIN_KEY_GLOB_PREFIX_CHARS = 3

export function validateRedactionRule(rule: RedactionRule): RuleValidation {
  const errors: RuleValidationIssue[] = []

  if (rule.kind === "attribute_key") {
    validateKeys(rule.keys, errors)

    return result(errors, 0)
  }

  // Literal terms never reach regex syntax, so there is nothing here that can backtrack.
  if (rule.kind === "terms") return result(errors, 0)

  const compiled = compilePatternForValidation(rule.pattern, rule.ignoreCase === true, rule.dotAll === true, errors)
  if (compiled === null) return result(errors, 0)

  validatePatternSource(rule.pattern, errors)
  if (compiled.test("")) {
    errors.push({
      code: "matches_empty",
      message: "matches the empty string, which would insert a placeholder between every character",
    })
  }

  if (errors.length > 0) return result(errors, 0)

  return result(errors, probePattern(compiled, errors))
}

const result = (errors: RuleValidationIssue[], slowestProbeMs: number): RuleValidation => ({
  ok: errors.length === 0,
  errors,
  slowestProbeMs,
  validatorVersion: REDACTION_VALIDATOR_VERSION,
})

function validateKeys(keys: readonly string[], errors: RuleValidationIssue[]): void {
  for (const key of keys) {
    if (!key.endsWith("*")) continue

    const prefix = key.slice(0, -1)
    if (prefix.length < MIN_KEY_GLOB_PREFIX_CHARS) {
      errors.push({
        code: "glob_too_broad",
        message: `the glob ${key} would drop nearly every attribute on the span`,
      })
    }
  }
}

const compilePatternForValidation = (
  source: string,
  ignoreCase: boolean,
  dotAll: boolean,
  errors: RuleValidationIssue[],
): RegExp | null => {
  try {
    return new RegExp(source, `g${ignoreCase ? "i" : ""}${dotAll ? "s" : ""}`)
  } catch (cause) {
    errors.push({ code: "uncompilable", message: cause instanceof Error ? cause.message : "is not a valid pattern" })

    return null
  }
}

/**
 * Rejects nested unbounded quantifiers and backreferences.
 *
 * Star height above one is the shape that backtracks exponentially, and it is the one thing the
 * timing probe cannot be trusted to find on its own: the probe has to keep its inputs short enough
 * that it does not become the hang it is looking for. Backreferences are refused outright — no PII
 * shape needs one, and they rule out ever moving to a linear-time engine.
 *
 * Both bounds matter. `(a+){2}` and `(a{2,3})+` are bounded on one side and cannot blow up, so
 * treating every quantified group as suspect would reject ordinary patterns.
 */
function validatePatternSource(source: string, errors: RuleValidationIssue[]): void {
  const groups: { unbounded: boolean }[] = [{ unbounded: false }]
  let index = 0
  let inClass = false

  const current = () => groups[groups.length - 1] as { unbounded: boolean }

  while (index < source.length) {
    const character = source[index]

    if (character === "\\") {
      const next = source[index + 1] ?? ""
      if (/[1-9]/.test(next) || next === "k") {
        errors.push({ code: "backreference", message: "uses a backreference, which is not supported" })
      }
      index += 2
      continue
    }

    if (inClass) {
      if (character === "]") inClass = false
      index += 1
      continue
    }

    if (character === "[") {
      inClass = true
      index += 1
      continue
    }

    if (character === "(") {
      groups.push({ unbounded: false })
      // Skip the group-type prefix so `?` in `(?:`, `(?=`, `(?<name>` is not read as a quantifier.
      index += source.startsWith("(?", index) ? 2 : 1
      if (source[index] === "<") {
        const close = source.indexOf(">", index)
        index = close === -1 ? index + 1 : close + 1
      }
      continue
    }

    if (character === ")") {
      const closed = groups.pop() ?? { unbounded: false }
      const quantifier = readQuantifier(source, index + 1)
      if (quantifier.unbounded && closed.unbounded) {
        errors.push({
          code: "nested_quantifier",
          message: "nests one unbounded repetition inside another, which can backtrack exponentially",
        })
      }
      if (groups.length === 0) groups.push({ unbounded: false })
      if (closed.unbounded || quantifier.unbounded) current().unbounded = true
      index = quantifier.end
      continue
    }

    const quantifier = readQuantifier(source, index)
    if (quantifier.end > index) {
      if (quantifier.unbounded) current().unbounded = true
      if (quantifier.overLargeBound) {
        errors.push({
          code: "bound_too_large",
          message: `repeats more than ${MAX_QUANTIFIER_BOUND} times`,
        })
      }
      index = quantifier.end
      continue
    }

    index += 1
  }
}

interface QuantifierRead {
  readonly end: number
  readonly unbounded: boolean
  readonly overLargeBound: boolean
}

/** `*`, `+` and `{n,}` are unbounded; `?`, `{n}` and `{n,m}` are not. */
function readQuantifier(source: string, at: number): QuantifierRead {
  const character = source[at]
  if (character === "*" || character === "+") {
    return { end: skipLazy(source, at + 1), unbounded: true, overLargeBound: false }
  }
  if (character === "?") return { end: skipLazy(source, at + 1), unbounded: false, overLargeBound: false }

  if (character === "{") {
    const close = source.indexOf("}", at)
    if (close === -1) return { end: at, unbounded: false, overLargeBound: false }

    const body = source.slice(at + 1, close)
    if (!/^\d+(,\d*)?$/.test(body)) return { end: at, unbounded: false, overLargeBound: false }

    const [minimum, maximum] = body.split(",")
    const bounds = [minimum, maximum].filter((part) => part !== undefined && part !== "").map(Number)

    return {
      end: skipLazy(source, close + 1),
      unbounded: body.endsWith(","),
      overLargeBound: bounds.some((bound) => bound > MAX_QUANTIFIER_BOUND),
    }
  }

  return { end: at, unbounded: false, overLargeBound: false }
}

const skipLazy = (source: string, at: number): number => (source[at] === "?" ? at + 1 : at)

/**
 * Times the pattern against inputs built from its own alphabet, and returns the slowest run.
 *
 * Two phases, and the order is load-bearing. Exponential blowup is checked first on inputs short
 * enough that the probe cannot itself hang; only once that passes is it safe to try the long
 * inputs that reveal polynomial behaviour.
 */
function probePattern(pattern: RegExp, errors: RuleValidationIssue[]): number {
  const alphabet = probeAlphabet(pattern.source)
  let slowest = 0

  for (const length of EXPONENTIAL_PROBE_LENGTHS) {
    for (const character of alphabet) {
      const elapsed = timeAgainst(pattern, character.repeat(length))
      slowest = Math.max(slowest, elapsed)
      if (elapsed > EXPONENTIAL_PROBE_BUDGET_MS) {
        errors.push({
          code: "catastrophic_backtracking",
          message: `took ${elapsed.toFixed(0)}ms on ${length} characters, so it backtracks catastrophically`,
        })

        return slowest
      }
    }
  }

  for (const length of POLYNOMIAL_PROBE_LENGTHS) {
    for (const character of alphabet) {
      const elapsed = timeAgainst(pattern, character.repeat(length))
      slowest = Math.max(slowest, elapsed)
      if (elapsed > POLYNOMIAL_PROBE_BUDGET_MS) {
        errors.push({
          code: "too_slow",
          message: `took ${elapsed.toFixed(0)}ms on ${length} characters, which is too slow for the ingest path`,
        })

        return slowest
      }
    }
  }

  return slowest
}

/**
 * Characters the pattern is most likely to consume, plus a fixed fallback set.
 *
 * A run of an accepted character followed by one that cannot match is the input that forces a
 * backtracking pattern to explore every split of the run.
 */
function probeAlphabet(source: string): string[] {
  const literals = (source.match(/[A-Za-z0-9]/g) ?? []).slice(0, 4)

  return [...new Set([...literals, "a", "0", " "])]
}

function timeAgainst(pattern: RegExp, run: string): number {
  // A fresh instance per run: `lastIndex` on a global pattern would carry between measurements.
  const probe = new RegExp(pattern.source, pattern.flags)
  const input = `${run}!`
  const started = performance.now()
  probe.test(input)

  return performance.now() - started
}
