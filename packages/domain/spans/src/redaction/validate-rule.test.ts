import type { RedactionRule } from "@domain/shared"
import { describe, expect, it } from "vitest"
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
   * specifically — they are over-broad for other reasons and the corpus gate rejects them on that.
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
   * The syntactic gate is a heuristic, so the probe is the backstop that does not depend on
   * recognising a shape. This pattern nests its repetition across an alternation rather than a
   * group boundary, which is exactly the case a star-height scan is weakest on.
   */
  it("catches catastrophic backtracking the source scan alone would miss", () => {
    const validation = validateRedactionRule(patternRule("(?:a|aa)+$"))

    expect(validation.ok).toBe(false)
    expect(validation.errors.map((issue) => issue.code)).toContain("catastrophic_backtracking")
  })

  it("finishes quickly even when rejecting a catastrophic pattern", () => {
    const started = performance.now()
    validateRedactionRule(patternRule("(a+)+$"))

    expect(performance.now() - started).toBeLessThan(2_000)
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
