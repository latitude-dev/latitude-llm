import type { RedactionRule } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  decodeRules,
  describeRule,
  encodeRules,
  isRuleDraftReady,
  labelIssue,
  newRuleDraft,
  toRuleLabel,
  withRuleReplaced,
} from "./redaction-rule-drafts.ts"

const terms = (overrides: Partial<Extract<RedactionRule, { kind: "terms" }>> = {}): RedactionRule => ({
  id: "rule-1",
  label: "ACCOUNT_NUMBER",
  kind: "terms",
  terms: ["ACME-1234"],
  ...overrides,
})

describe("encodeRules", () => {
  it("round-trips a rule of each kind", () => {
    const rules: RedactionRule[] = [
      { id: "a", label: "STAFF_ID", kind: "attribute_key", keys: ["acme.staff.id"] },
      terms({ id: "b", wholeWord: false, caseSensitive: true }),
      { id: "c", label: "CUSTOMER_REF", kind: "pattern", pattern: "ACCT-\\d{9}", ignoreCase: true },
    ]

    expect(decodeRules(encodeRules(rules))).toEqual(rules)
  })

  /**
   * The whole reason this encoding exists. The draft overlay compares with `Object.is` against a
   * baseline rebuilt every render, so an edit-and-undo has to produce a byte-identical string or
   * the field stays dirty forever and the unsaved-changes count lies.
   */
  it("produces an identical string for an edit that was undone", () => {
    const before = encodeRules([terms()])
    const edited = encodeRules([terms({ terms: ["ACME-9999"] })])
    const undone = encodeRules([terms()])

    expect(edited).not.toBe(before)
    expect(undone).toBe(before)
  })

  it("does not depend on the key order of the rule object it is given", () => {
    const declared = { id: "rule-1", label: "ACCOUNT_NUMBER", kind: "terms", terms: ["ACME-1234"] } as RedactionRule
    const reversed = { terms: ["ACME-1234"], kind: "terms", label: "ACCOUNT_NUMBER", id: "rule-1" } as RedactionRule

    expect(encodeRules([reversed])).toBe(encodeRules([declared]))
  })

  it("treats a reordered rule list as a change, since order breaks overlap ties", () => {
    const first = terms({ id: "a", label: "FIRST" })
    const second = terms({ id: "b", label: "SECOND" })

    expect(encodeRules([first, second])).not.toBe(encodeRules([second, first]))
  })

  // Falling back to `[]` would silently delete every rule the customer had.
  it("throws rather than decoding unreadable input to an empty policy", () => {
    expect(() => decodeRules('[{"kind":"terms"}]')).toThrow()
    expect(() => decodeRules("not json")).toThrow()
  })
})

describe("toRuleLabel", () => {
  it.each([
    ["Account number", "ACCOUNT_NUMBER"],
    ["  customer ref  ", "CUSTOMER_REF"],
    ["staff-id", "STAFF_ID"],
    ["a/b", "A_B"],
  ])("turns %s into %s", (input, expected) => {
    expect(toRuleLabel(input)).toBe(expected)
  })

  it("keeps the label inside the length the schema accepts", () => {
    expect(toRuleLabel("x".repeat(80)).length).toBeLessThanOrEqual(32)
  })
})

describe("labelIssue", () => {
  it("says nothing about an empty label, which is just an unfinished draft", () => {
    expect(labelIssue("")).toBeUndefined()
  })

  it("accepts a well-formed label", () => {
    expect(labelIssue("ACCOUNT_NUMBER")).toBeUndefined()
  })

  it("rejects a label a built-in category already uses", () => {
    expect(labelIssue("EMAIL")).toContain("built-in")
  })

  it.each(["ab", "lowercase", "1LEADING", "HAS SPACE"])("rejects the malformed label %s", (label) => {
    expect(labelIssue(label)).toBeDefined()
  })
})

describe("isRuleDraftReady", () => {
  it("is false until the label and the kind's own field are both filled", () => {
    expect(isRuleDraftReady(newRuleDraft("terms"))).toBe(false)
    expect(isRuleDraftReady(terms({ label: "" }))).toBe(false)
    expect(isRuleDraftReady(terms({ terms: [] }))).toBe(false)
    expect(isRuleDraftReady(terms())).toBe(true)
  })
})

describe("withRuleReplaced", () => {
  it("appends a rule that is not in the list yet", () => {
    expect(withRuleReplaced([], terms())).toHaveLength(1)
  })

  it("replaces in place, keeping position so the list does not jump under the cursor", () => {
    const rules = [terms({ id: "a", label: "FIRST" }), terms({ id: "b", label: "SECOND" })]
    const next = withRuleReplaced(rules, terms({ id: "a", label: "FIRST", terms: ["NEW"] }))

    expect(next.map((rule) => rule.id)).toEqual(["a", "b"])
    expect(next[0]).toMatchObject({ terms: ["NEW"] })
  })
})

describe("describeRule", () => {
  it("summarizes each kind for the table row", () => {
    expect(describeRule({ id: "a", label: "S", kind: "attribute_key", keys: ["x.y", "z.*"] })).toBe("x.y, z.*")
    expect(describeRule({ id: "b", label: "P", kind: "pattern", pattern: "ACCT-\\d{9}" })).toBe("ACCT-\\d{9}")
  })

  it("caps a long term list rather than overflowing the row", () => {
    const many = terms({ terms: ["a1", "b2", "c3", "d4", "e5"] })

    expect(describeRule(many)).toBe("a1, b2, c3 and 2 more")
  })
})
