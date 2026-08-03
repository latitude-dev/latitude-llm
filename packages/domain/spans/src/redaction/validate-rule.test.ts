import { REDACTION_ENTITIES, type RedactionRule } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { compileRuleSet } from "./rules.ts"
import { REDACTION_VALIDATOR_VERSION, validateRedactionRule } from "./validate-rule.ts"

const patternRule = (pattern: string, overrides: Record<string, unknown> = {}): RedactionRule =>
  ({ id: "r", label: "ACCOUNT_NUMBER", kind: "pattern", pattern, ...overrides }) as RedactionRule

const termsRule = (terms: string[]): RedactionRule => ({ id: "r", label: "ACCOUNT_NUMBER", kind: "terms", terms })

const keyRule = (...keys: string[]): RedactionRule => ({ id: "r", label: "STAFF_ID", kind: "attribute_key", keys })

const codes = (rule: RedactionRule) => validateRedactionRule(rule).errors.map((issue) => issue.code)

describe("validateRedactionRule on patterns", () => {
  /**
   * The half that matters most. A validator that rejects the patterns customers actually need is
   * worse than none, because it pushes them back to asking us to ship a detector.
   */
  it.each([
    "ACCT-\\d{9}",
    "(?:ACCT|ACCNT)-\\d{9}",
    "CUST[0-9]{6,10}",
    "[A-Z]{2}-\\d{4}-[A-Z]{2}",
    "policy #\\d+",
    "\\bMRN\\s?\\d{7}\\b",
    "(?<![A-Za-z0-9])EMP\\d{5}(?![A-Za-z0-9])",
    "urn:acme:customer:[0-9a-f]{8}",
  ])("accepts the legitimate pattern %s", (pattern) => {
    expect(validateRedactionRule(patternRule(pattern))).toMatchObject({ ok: true, errors: [] })
  })

  /**
   * Both bounds have to be unbounded for star height to blow up. Treating every quantified group
   * as suspect would reject ordinary patterns, so these are checked against the quantifier gate
   * specifically. Over-breadth is the preview's question, not this validator's.
   */
  it.each([
    "(a{2,3})+",
    "(a+){2}",
    "(?:ab)+",
    "(a|b)+",
  ])("does not read %s as nested repetition, since one side is bounded", (pattern) => {
    expect(codes(patternRule(pattern))).not.toContain("nested_quantifier")
  })

  it.each([
    ["(a+)+$", "nested_quantifier"],
    ["(a*)*b", "nested_quantifier"],
    ["(\\d+)*x", "nested_quantifier"],
    ["([a-z]+)+@", "nested_quantifier"],
    ["(x+x+)+y", "nested_quantifier"],
  ])("rejects %s as nested repetition", (pattern, code) => {
    expect(codes(patternRule(pattern))).toContain(code)
  })

  /**
   * Polynomial blowup, which is the accident a customer writes by hand. It has to be caught here
   * rather than by the probe: `a*a*a*b` runs in well under a millisecond at the probe's longest
   * input and for seconds once the input is a few hundred characters long.
   */
  it.each([
    "a*a*a*b",
    "\\w+\\d+",
    "\\d*\\d*x",
    "[0-9]+[0-9]+-",
    "a*b?a*",
    "\\d+.*\\d+",
  ])("rejects %s as adjacent unbounded repetition", (pattern) => {
    expect(codes(patternRule(pattern))).toContain("adjacent_quantifier")
  })

  /**
   * The other half of the adjacency gate, and the reason overlap is measured rather than assumed.
   * Each of these repeats twice over with nothing required between, so a rule that only counted
   * quantifiers would refuse them all — and they are the shapes real identifiers are made of.
   */
  it.each([
    "[A-Z]+\\d*",
    "\\d+-\\d+",
    "\\d+\\s*\\d+",
    "[A-Z]+_[0-9]+",
    "(?:acct|cust)-\\d+",
  ])("accepts %s, whose repeated parts cannot compete for a character", (pattern) => {
    expect(codes(patternRule(pattern))).not.toContain("adjacent_quantifier")
  })

  // Only a term that must match something can end the ambiguity, so a bounded one is not a fence.
  it("does not treat an optional part as separating two repetitions", () => {
    expect(codes(patternRule("\\d+x?\\d+"))).toContain("adjacent_quantifier")
  })

  /**
   * `(?<=` and `(?<!` are lookbehinds, not named groups. Skipping to the next `>` swallowed
   * everything between, so the nested repetition here went unreported by the scanner.
   */
  it("scans past a lookbehind rather than skipping to the next angle bracket", () => {
    expect(codes(patternRule("(?<![0-9])(\\d+)+>"))).toContain("nested_quantifier")
  })

  it("reads a named group's name without mistaking it for pattern text", () => {
    expect(codes(patternRule("(?<acct>ACCT-\\d{9})"))).toEqual([])
  })

  it("rejects a backreference, which also rules out a linear-time engine later", () => {
    expect(codes(patternRule("(\\d{4})-\\1"))).toContain("backreference")
  })

  it("rejects a pattern that does not compile", () => {
    expect(codes(patternRule("ACCT-(\\d{9}"))).toContain("uncompilable")
  })

  it("rejects a pattern that matches the empty string", () => {
    expect(codes(patternRule("\\d*"))).toContain("matches_empty")
  })

  it("rejects an absurd repetition bound", () => {
    expect(codes(patternRule("a{5000}"))).toContain("bound_too_large")
  })

  /**
   * Deliberately allowed. Only the customer's own data can say whether a pattern is too greedy, so
   * over-breadth is the preview's question, not this one — blocking here rejected rules a project
   * whose identifiers really are long digit runs legitimately needs.
   */
  it.each(["\\d{4,}", "[0-9]+", "\\w{3,}", "[A-Za-z]+"])("accepts the broad pattern %s as safe to run", (pattern) => {
    expect(validateRedactionRule(patternRule(pattern))).toMatchObject({ ok: true, errors: [] })
  })

  it("stamps the validator version that admitted the rule", () => {
    expect(validateRedactionRule(patternRule("ACCT-\\d{9}")).validatorVersion).toBe(REDACTION_VALIDATOR_VERSION)
  })

  it("times the pattern and reports the slowest run", () => {
    const validation = validateRedactionRule(patternRule("ACCT-\\d{9}"))

    expect(validation.slowestProbeMs).toBeGreaterThanOrEqual(0)
  })

  /**
   * Repetition nested across an alternation rather than a group boundary. The probe cannot be the
   * answer here: this shape stays under budget at every length the probe can safely reach, and only
   * blows up on inputs long enough that running it would be the outage. So the scanner decides it.
   */
  it.each([
    "(?:a|aa)+$",
    "(a|aa)+$",
    "(?:\\d|\\w)+!",
    "(ab|a)*c",
  ])("rejects %s, whose repeated choice can start either branch the same way", (pattern) => {
    expect(codes(patternRule(pattern))).toContain("ambiguous_alternation")
  })

  /**
   * The reason branch overlap is measured rather than assumed. A repeated choice between things that
   * cannot start alike is unambiguous, and these are ordinary ways to spell a character set.
   */
  it.each([
    "(a|b)+",
    "(?:\\d|-)+x",
    "(?:[A-Z]|[0-9])+-",
    "(?:acct|xust)-\\d+",
  ])("accepts %s, whose branches cannot start with the same character", (pattern) => {
    expect(codes(patternRule(pattern))).not.toContain("ambiguous_alternation")
  })

  it("finishes quickly even when rejecting a catastrophic pattern", () => {
    const started = performance.now()
    validateRedactionRule(patternRule("(a+)+$"))

    expect(performance.now() - started).toBeLessThan(2_000)
  })

  /**
   * The validator runs on a request thread, so how long it takes to say no is part of its contract.
   * `a*a*a*b` is the case that made this necessary: it is invisible at the probe's longest input and
   * takes 14 seconds at 256 characters, so any probe long enough to see it is long enough to wedge
   * the process. It has to be refused from the source alone, which is what this pins.
   */
  it.each([
    "a*a*a*b",
    "(a+)+$",
    "(a|aa)+$",
    "\\w+\\w+\\w+!",
  ])("refuses %s in a few milliseconds, never by running it to completion", (pattern) => {
    const started = performance.now()
    const validation = validateRedactionRule(patternRule(pattern))

    expect(validation.ok).toBe(false)
    expect(performance.now() - started).toBeLessThan(250)
  })
})

/**
 * The shipped detectors are the only corpus of real PII shapes the repo has, so they are what says
 * whether the adjacency gate is calibrated or merely strict. They are not themselves subject to the
 * validator — they are hand-audited, and several use backreferences a customer rule may not — so
 * this asserts only that none of them trips the gate written to judge customer patterns.
 */
describe("the adjacency gate against every built-in detector", () => {
  const builtIns = compileRuleSet({
    entities: new Set(REDACTION_ENTITIES),
    redactMetadata: false,
    identities: "keep",
    rules: [],
  })

  it("rejects none of them, so it is not simply refusing repeated parts", () => {
    const tripped = builtIns.rules
      .filter((rule) => codes(patternRule(rule.pattern.source)).includes("adjacent_quantifier"))
      .map((rule) => `${rule.label}: ${rule.pattern.source}`)

    expect(tripped).toEqual([])
  })
})

describe("validateRedactionRule on terms", () => {
  it("accepts an ordinary term list", () => {
    expect(validateRedactionRule(termsRule(["ACME-1234", "ACME-5678"]))).toMatchObject({ ok: true })
  })

  // Literal terms never reach regex syntax, so there is nothing here to backtrack.
  it("runs no pattern gates on a term that looks like regex source", () => {
    expect(validateRedactionRule(termsRule(["(a+)+$"]))).toMatchObject({ ok: true, errors: [] })
  })

  it("accepts a term that happens to be an ordinary technical string", () => {
    expect(validateRedactionRule(termsRule(["localhost:3000"]))).toMatchObject({ ok: true })
  })
})

describe("validateRedactionRule on attribute keys", () => {
  it("accepts an exact key and a specific glob", () => {
    expect(validateRedactionRule(keyRule("acme.staff.id", "acme.customer.*"))).toMatchObject({ ok: true })
  })

  // `*` alone drops every attribute on the span, which is an outage rather than a policy.
  it.each(["*", "a*", "ab*"])("rejects the over-broad glob %s", (glob) => {
    expect(codes(keyRule(glob))).toContain("glob_too_broad")
  })

  // Nothing is scanned for a key rule, so there is no pattern to time either.
  it("runs no timing probe, since it matches keys rather than values", () => {
    expect(validateRedactionRule(keyRule("acme.staff.id")).slowestProbeMs).toBe(0)
  })
})
