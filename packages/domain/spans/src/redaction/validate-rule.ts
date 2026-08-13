import type { RedactionRule } from "@domain/shared"

/**
 * Bumped whenever a gate below gets stricter.
 *
 * Validation runs only at write time, so a rule admitted by an older validator keeps running
 * untouched. Storing the version that admitted each rule is what lets a tightened validator
 * flag the survivors instead of trusting them silently.
 */
export const REDACTION_VALIDATOR_VERSION = 2

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

/**
 * A pattern this slow on a short input is backtracking exponentially, not merely working hard.
 *
 * Generous by four orders of magnitude — a linear pattern scans these inputs in microseconds — so
 * the budget exists to bound the probe's own cost, not to grade the pattern.
 */
const PROBE_BUDGET_MS = 8

/**
 * Short enough that the probe cannot become the hang it is looking for.
 *
 * There is no length that reveals polynomial blowup safely. `a*a*a*b` runs in 0.4ms at 32
 * characters and 14 seconds at 256, so a probe long enough to expose it is also long enough to
 * wedge the event loop of whichever process is validating — and validation runs on a request.
 * Polynomial shapes are therefore caught by the source scanner instead, which decides without
 * executing anything; the probe only backstops exponential shapes.
 *
 * The step between rungs is what bounds the worst case, and it has to stay small. Exponential cost
 * doubles per character, so a step of 8 would let a rung that passed at the budget be followed by
 * one costing 256 times as much — seconds, from inputs that look harmlessly short. At a step of 4
 * the next rung can only be ~16x the last, which keeps the whole ladder inside a few hundred
 * milliseconds even for a pattern engineered to sit just under the budget.
 */
const PROBE_LENGTHS = [12, 16, 20, 24] as const

/** Timing is noisy at this scale, and noise only ever adds, so the fastest run is the honest one. */
const PROBE_ATTEMPTS = 3

// Abort retries only after the fastest measurement exceeds PROBE_ABORT_MS (wide margin over budget).
const PROBE_ABORT_MS = PROBE_BUDGET_MS * 10

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

  validatePatternSource(rule.pattern, rule.ignoreCase === true, errors)
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

interface GroupFrame {
  unbounded: boolean
  /**
   * The preceding term's atom, if that term was unbounded and nothing mandatory has closed it off.
   *
   * This is what makes adjacency detectable: two unbounded quantifiers over overlapping atoms with
   * no mandatory term between them leave the engine free to split a run either way.
   */
  pendingAtom: string | null
  /** The first atom of each alternation branch, which is what decides whether the branches are ambiguous. */
  firstAtoms: string[]
  atBranchStart: boolean
}

const newFrame = (): GroupFrame => ({
  unbounded: false,
  pendingAtom: null,
  firstAtoms: [],
  atBranchStart: true,
})

/**
 * Rejects the pattern shapes that backtrack, plus backreferences, by reading the source alone.
 *
 * This carries the whole weight of ReDoS defence, because the timing probe cannot: see
 * `PROBE_LENGTHS`. Two shapes matter, and both are decided without executing the pattern.
 *
 * *Nested* unbounded quantifiers — `(a+)+` — backtrack exponentially. Both bounds matter here:
 * `(a+){2}` and `(a{2,3})+` are bounded on one side and cannot blow up, so treating every
 * quantified group as suspect would reject ordinary patterns.
 *
 * *Adjacent* unbounded quantifiers over atoms that can match the same character — `a*a*`, `\w+\d+`
 * — backtrack polynomially, which is the far more common accident and the one a customer writes by
 * hand. Overlap is what makes them ambiguous, so it is tested rather than assumed: `[A-Z]+\d*` is
 * two adjacent unbounded quantifiers that can never compete for a character, and rejecting it would
 * refuse a perfectly ordinary identifier shape.
 *
 * An unboundedly repeated *alternation whose branches can start with the same character* — `(a|aa)+`
 * — is exponential for the same reason and needs deciding here too, because it is the one shape that
 * stays under the probe's budget at every length the probe can safely reach. Overlap is tested the
 * same way, so `(?:\d|-)+` and `(a|b)+` stay allowed.
 *
 * Backreferences are refused outright — no PII shape needs one, and they rule out ever moving to a
 * linear-time engine.
 */
function validatePatternSource(source: string, ignoreCase: boolean, errors: RuleValidationIssue[]): void {
  const groups: GroupFrame[] = [newFrame()]
  let index = 0

  const current = () => groups[groups.length - 1] as GroupFrame
  let reportedAdjacent = false
  let reportedAmbiguous = false

  const handleTerm = (atom: string, quantifier: QuantifierRead): void => {
    const frame = current()
    if (quantifier.overLargeBound) {
      errors.push({ code: "bound_too_large", message: `repeats more than ${MAX_QUANTIFIER_BOUND} times` })
    }

    if (frame.atBranchStart) {
      frame.firstAtoms.push(atom)
      // An optional opener leaves whatever follows it able to start the branch too.
      if (!quantifier.optional) frame.atBranchStart = false
    }

    if (quantifier.unbounded) {
      if (frame.pendingAtom !== null && atomsOverlap(frame.pendingAtom, atom, ignoreCase) && !reportedAdjacent) {
        reportedAdjacent = true
        errors.push({
          code: "adjacent_quantifier",
          message:
            "repeats two overlapping parts without anything required between them, which can backtrack for seconds on long input",
        })
      }
      frame.unbounded = true
      frame.pendingAtom = atom

      return
    }

    // Only a term that must match something can end the ambiguity: `a*b?a*` still splits either way.
    if (!quantifier.optional) frame.pendingAtom = null
  }

  while (index < source.length) {
    const character = source[index]

    if (character === "\\") {
      const next = source[index + 1] ?? ""
      if (/[1-9]/.test(next) || next === "k") {
        errors.push({ code: "backreference", message: "uses a backreference, which is not supported" })
      }
      const quantifier = readQuantifier(source, index + 2)
      handleTerm(source.slice(index, index + 2), quantifier)
      index = quantifier.end
      continue
    }

    if (character === "[") {
      const close = endOfCharacterClass(source, index)
      const quantifier = readQuantifier(source, close + 1)
      handleTerm(source.slice(index, close + 1), quantifier)
      index = quantifier.end
      continue
    }

    if (character === "(") {
      groups.push(newFrame())
      index = skipGroupPrefix(source, index)
      continue
    }

    if (character === ")") {
      const closed = groups.pop() ?? newFrame()
      const quantifier = readQuantifier(source, index + 1)
      if (quantifier.unbounded && closed.unbounded) {
        errors.push({
          code: "nested_quantifier",
          message: "nests one unbounded repetition inside another, which can backtrack exponentially",
        })
      }
      if (quantifier.unbounded && !reportedAmbiguous && hasOverlappingBranches(closed.firstAtoms, ignoreCase)) {
        reportedAmbiguous = true
        errors.push({
          code: "ambiguous_alternation",
          message:
            "repeats a choice whose options can start with the same character, which can backtrack exponentially",
        })
      }
      if (groups.length === 0) groups.push(newFrame())
      // A group's alphabet is not worth deriving, so it is treated as matching anything: conservative, and rare.
      if (closed.unbounded) current().unbounded = true
      handleTerm(ANY_ATOM, quantifier)
      index = quantifier.end
      continue
    }

    // A different branch cannot be adjacent to this one, and an anchor is not a term at all.
    if (character === "|") {
      current().pendingAtom = null
      current().atBranchStart = true
      index += 1
      continue
    }
    if (character === "^" || character === "$") {
      index += 1
      continue
    }

    const quantifier = readQuantifier(source, index + 1)
    handleTerm(character ?? "", quantifier)
    index = quantifier.end
  }
}

/**
 * Positions the cursor just past `(`, `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!` or `(?<name>`.
 *
 * The whole prefix has to go, not just `(?`. A leftover `:` reads as a literal term, which would
 * both stand in for the group's real first atom and be mistaken for something a quantifier applies
 * to. Only a named group carries a `>`; searching for one in a lookbehind would swallow its body.
 */
function skipGroupPrefix(source: string, open: number): number {
  if (!source.startsWith("(?", open)) return open + 1

  const after = open + 2
  if (source[after] === ":" || source[after] === "=" || source[after] === "!") return after + 1
  if (source[after] !== "<") return after

  if (source[after + 1] === "=" || source[after + 1] === "!") return after + 2

  const close = source.indexOf(">", after)

  return close === -1 ? after + 1 : close + 1
}

/** `]` is a literal when it opens the class body, so `[]]` and `[^]]` close on the second one. */
function endOfCharacterClass(source: string, open: number): number {
  let index = open + 1
  if (source[index] === "^") index += 1
  if (source[index] === "]") index += 1

  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2
      continue
    }
    if (source[index] === "]") return index
    index += 1
  }

  return source.length - 1
}

/** Two branches that can begin with the same character leave the engine a choice to backtrack over. */
const hasOverlappingBranches = (firstAtoms: readonly string[], ignoreCase: boolean): boolean =>
  firstAtoms.length > 1 &&
  firstAtoms.some((atom, position) =>
    firstAtoms.slice(position + 1).some((other) => atomsOverlap(atom, other, ignoreCase)),
  )

const ANY_ATOM = "."

/**
 * Whether two single-character atoms can both match some character.
 *
 * Decided by asking the engine rather than by parsing classes and escapes, so `\d`, `\w`, `[A-Z]`,
 * `[^0-9]`, `\p{L}` and a bare literal are all handled by the same three lines. The alphabet only
 * has to be broad enough to find an overlap that exists, not to enumerate Unicode.
 *
 * `ignoreCase` has to be honoured here or the answer is wrong in the unsafe direction: under `i` the
 * engine reads `a` and `A`, or `[a-z]` and `[A-Z]`, as competing for the same character, and judging
 * them disjoint would let `(a|A)+` through as unambiguous when it backtracks exponentially.
 */
function atomsOverlap(left: string, right: string, ignoreCase: boolean): boolean {
  if (left === ANY_ATOM || right === ANY_ATOM) return true

  const matchesLeft = atomMatcher(left, ignoreCase)
  const matchesRight = atomMatcher(right, ignoreCase)
  if (matchesLeft === null || matchesRight === null) return true

  return OVERLAP_ALPHABET.some((character) => matchesLeft.test(character) && matchesRight.test(character))
}

const OVERLAP_ALPHABET = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..." \t\n",
  ..."-_.@+/:,;!?#$%&*=~^'\"`|\\()[]{}<>",
  "é",
]

const atomMatcher = (atom: string, ignoreCase: boolean): RegExp | null => {
  try {
    return new RegExp(`^(?:${atom})$`, ignoreCase ? "ui" : "u")
  } catch {
    return null
  }
}

interface QuantifierRead {
  readonly end: number
  readonly unbounded: boolean
  /** Can match nothing, so it never separates two unbounded repetitions. */
  readonly optional: boolean
  readonly overLargeBound: boolean
}

/** `*`, `+` and `{n,}` are unbounded; `?`, `{n}` and `{n,m}` are not. `*`, `?` and `{0,m}` are optional. */
function readQuantifier(source: string, at: number): QuantifierRead {
  const character = source[at]
  if (character === "*")
    return { end: skipLazy(source, at + 1), unbounded: true, optional: true, overLargeBound: false }
  if (character === "+") {
    return { end: skipLazy(source, at + 1), unbounded: true, optional: false, overLargeBound: false }
  }
  if (character === "?") {
    return { end: skipLazy(source, at + 1), unbounded: false, optional: true, overLargeBound: false }
  }

  const absent = { end: at, unbounded: false, optional: false, overLargeBound: false }

  if (character === "{") {
    const close = source.indexOf("}", at)
    if (close === -1) return absent

    const body = source.slice(at + 1, close)
    if (!/^\d+(,\d*)?$/.test(body)) return absent

    const [minimum, maximum] = body.split(",")
    const bounds = [minimum, maximum].filter((part) => part !== undefined && part !== "").map(Number)

    return {
      end: skipLazy(source, close + 1),
      unbounded: body.endsWith(","),
      optional: Number(minimum) === 0,
      overLargeBound: bounds.some((bound) => bound > MAX_QUANTIFIER_BOUND),
    }
  }

  return absent
}

const skipLazy = (source: string, at: number): number => (source[at] === "?" ? at + 1 : at)

/**
 * Times the pattern against short inputs built from its own alphabet, and returns the slowest run.
 *
 * A backstop, not the defence. It runs last, once the source scanner has already refused the shapes
 * that could make the probe itself the hang, and it stays at `PROBE_LENGTHS` for the same reason.
 */
function probePattern(pattern: RegExp, errors: RuleValidationIssue[]): number {
  const alphabet = probeAlphabet(pattern.source)
  let slowest = 0

  for (const length of PROBE_LENGTHS) {
    for (const character of alphabet) {
      const elapsed = timeAgainst(pattern, character.repeat(length))
      slowest = Math.max(slowest, elapsed)
      if (elapsed > PROBE_BUDGET_MS) {
        errors.push({
          code: "catastrophic_backtracking",
          message: `took ${elapsed.toFixed(0)}ms on ${length} characters, so it backtracks catastrophically`,
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

/**
 * Fastest of several runs: a scheduler hiccup or a cold JIT can only ever make a run look slower.
 *
 * Retrying stops once the fastest measurement is past the budget by a wide margin
 * (`PROBE_ABORT_MS`). Repetition is here to keep noise from condemning a rule that was only
 * marginally slow, and a pattern already past the budget by a wide margin is not marginal —
 * re-running it just pays its cost again.
 */
function timeAgainst(pattern: RegExp, run: string): number {
  const input = `${run}!`
  let fastest = Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    // A fresh instance per run: `lastIndex` on a global pattern would carry between measurements.
    const probe = new RegExp(pattern.source, pattern.flags)
    const started = performance.now()
    probe.test(input)
    fastest = Math.min(fastest, performance.now() - started)
    if (fastest > PROBE_ABORT_MS) return fastest
  }

  return fastest
}
