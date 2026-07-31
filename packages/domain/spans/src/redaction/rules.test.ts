import {
  DEFAULT_REDACTION_ENTITIES,
  REDACTION_ENTITIES,
  REDACTION_ENTITY_LABELS,
  type RedactionPolicy,
  type RedactionRule,
} from "@domain/shared"
import { describe, expect, it } from "vitest"
import { BUILT_IN_DETECTORS } from "./detectors.ts"
import { redactText } from "./redact-text.ts"
import { compilePolicy, compileRuleSet } from "./rules.ts"

const policy = (overrides: Partial<RedactionPolicy> = {}): RedactionPolicy => ({
  entities: overrides.entities ?? new Set(DEFAULT_REDACTION_ENTITIES),
  redactMetadata: overrides.redactMetadata ?? false,
  identities: overrides.identities ?? "keep",
  rules: overrides.rules ?? [],
})

/** No built-in entities, so only the custom rule can produce a match. */
const custom = (...rules: RedactionRule[]) => compileRuleSet(policy({ entities: new Set(), rules }))

const redactWith = (text: string, ...rules: RedactionRule[]) => redactText(text, custom(...rules)).text

const terms = (overrides: Partial<Extract<RedactionRule, { kind: "terms" }>> = {}): RedactionRule => ({
  id: "terms-1",
  label: "ACCOUNT_NUMBER",
  kind: "terms",
  terms: ["ACME-1234"],
  ...overrides,
})

const pattern = (source: string, overrides: Record<string, unknown> = {}): RedactionRule =>
  ({ id: "pattern-1", label: "ACCOUNT_NUMBER", kind: "pattern", pattern: source, ...overrides }) as RedactionRule

const keys = (...values: string[]): RedactionRule => ({
  id: "keys-1",
  label: "STAFF_ID",
  kind: "attribute_key",
  keys: values,
})

describe("compileRuleSet", () => {
  it("emits only the rules for enabled entities", () => {
    const ruleSet = compileRuleSet(policy({ entities: new Set(["email"]) }))

    expect(ruleSet.rules.every((rule) => rule.label === "EMAIL")).toBe(true)
    expect(ruleSet.rules.length).toBeGreaterThan(0)
  })

  it("emits nothing when no entity is enabled", () => {
    expect(compileRuleSet(policy({ entities: new Set() })).rules).toEqual([])
  })

  it("labels every rule with its entity's placeholder label", () => {
    const ruleSet = compileRuleSet(policy({ entities: new Set(REDACTION_ENTITIES) }))
    const labels = new Set(ruleSet.rules.map((rule) => rule.label))

    expect(labels).toEqual(new Set(Object.values(REDACTION_ENTITY_LABELS)))
  })

  // An entity can own several patterns (credit cards have five). Dropping any of them silently
  // narrows coverage, which is invisible without counting.
  it("keeps every pattern a built-in entity declares", () => {
    const ruleSet = compileRuleSet(policy({ entities: new Set(REDACTION_ENTITIES) }))

    expect(ruleSet.rules).toHaveLength(BUILT_IN_DETECTORS.length)
  })

  it("preserves built-in declaration order, which is what breaks overlap ties", () => {
    const ruleSet = compileRuleSet(policy({ entities: new Set(REDACTION_ENTITIES) }))

    expect(ruleSet.rules.map((rule) => rule.label)).toEqual(
      BUILT_IN_DETECTORS.map((detector) => REDACTION_ENTITY_LABELS[detector.entity]),
    )
  })
})

describe("compilePolicy", () => {
  it("carries the non-pattern policy fields through unchanged", () => {
    const compiled = compilePolicy(policy({ redactMetadata: true, identities: "pseudonymize" }))

    expect(compiled.redactMetadata).toBe(true)
    expect(compiled.identities).toBe("pseudonymize")
  })
})

describe("custom rules, generally", () => {
  it("appends custom rules after the built-ins, so a built-in wins an exact overlap tie", () => {
    const ruleSet = compileRuleSet(policy({ entities: new Set(["email"]), rules: [terms()] }))

    expect(ruleSet.rules.at(-1)?.label).toBe("ACCOUNT_NUMBER")
    expect(ruleSet.rules[0]?.label).toBe("EMAIL")
  })

  it("skips disabled rules", () => {
    expect(redactWith("id ACME-1234 here", terms({ enabled: false }))).toBe("id ACME-1234 here")
  })

  it("costs one pattern per rule however many terms it carries", () => {
    const many = terms({ terms: Array.from({ length: 50 }, (_, index) => `ACME-${1000 + index}`) })

    expect(custom(many).rules).toHaveLength(1)
  })
})

describe("terms rules", () => {
  it("replaces a term with its own label", () => {
    expect(redactWith("account ACME-1234 closed", terms())).toBe("account [REDACTED_ACCOUNT_NUMBER] closed")
  })

  it("matches case-insensitively by default", () => {
    expect(redactWith("acme-1234", terms())).toBe("[REDACTED_ACCOUNT_NUMBER]")
  })

  it("respects case when asked", () => {
    expect(redactWith("acme-1234", terms({ caseSensitive: true }))).toBe("acme-1234")
  })

  /**
   * JS alternation is leftmost-first, not leftmost-longest, so an unsorted `ACME|ACME_CORP`
   * matches `ACME` and leaves `_CORP` in the stored content. Same class as the credit-card
   * bridging bug: a partial match is worse than none, because it looks redacted.
   */
  it("prefers the longer term when one is a prefix of another", () => {
    const rule = terms({ terms: ["ACME", "ACME_CORP"] })

    expect(redactWith("owner ACME_CORP ltd", rule)).toBe("owner [REDACTED_ACCOUNT_NUMBER] ltd")
    expect(redactWith("owner ACME ltd", rule)).toBe("owner [REDACTED_ACCOUNT_NUMBER] ltd")
  })

  it("keeps both matches when two terms are adjacent", () => {
    const rule = terms({ terms: ["ACME-1234", "ACME-5678"] })

    expect(redactWith("ACME-1234 ACME-5678", rule)).toBe("[REDACTED_ACCOUNT_NUMBER] [REDACTED_ACCOUNT_NUMBER]")
  })

  it("treats terms as literals rather than regex source", () => {
    expect(redactWith("axb", terms({ terms: ["a.b"] }))).toBe("axb")
    expect(redactWith("a.b", terms({ terms: ["a.b"] }))).toBe("[REDACTED_ACCOUNT_NUMBER]")
  })

  it("does not match a term embedded in a longer word", () => {
    expect(redactWith("ACMEXYZ", terms({ terms: ["ACME"] }))).toBe("ACMEXYZ")
  })

  it("matches an embedded term when whole-word matching is off", () => {
    expect(redactWith("ACMEXYZ", terms({ terms: ["ACME"], wholeWord: false }))).toBe("[REDACTED_ACCOUNT_NUMBER]XYZ")
  })

  /**
   * A blanket boundary around the alternation would make these unmatchable: the character
   * before `+1-555` is not a word character either, so the lookbehind can never be satisfied.
   */
  it.each(["+1-555-0100", "-verbose", "@handle"])("still matches %s, whose edges are not word characters", (term) => {
    expect(redactWith(`value ${term} end`, terms({ terms: [term] }))).toBe("value [REDACTED_ACCOUNT_NUMBER] end")
  })

  it("deduplicates repeated terms rather than emitting a redundant alternative", () => {
    expect(redactWith("ACME-1234", terms({ terms: ["ACME-1234", "ACME-1234"] }))).toBe("[REDACTED_ACCOUNT_NUMBER]")
  })
})

describe("pattern rules", () => {
  it("replaces a match with the rule's label", () => {
    expect(redactWith("ref ACCT-123456789 ok", pattern("ACCT-\\d{9}"))).toBe("ref [REDACTED_ACCOUNT_NUMBER] ok")
  })

  it("is case-sensitive unless the rule opts out", () => {
    expect(redactWith("acct-123456789", pattern("ACCT-\\d{9}"))).toBe("acct-123456789")
    expect(redactWith("acct-123456789", pattern("ACCT-\\d{9}", { ignoreCase: true }))).toBe("[REDACTED_ACCOUNT_NUMBER]")
  })

  it("keeps a dot from crossing a newline unless the rule opts in", () => {
    expect(redactWith("a\nb", pattern("a.b"))).toBe("a\nb")
    expect(redactWith("a\nb", pattern("a.b", { dotAll: true }))).toBe("[REDACTED_ACCOUNT_NUMBER]")
  })

  // Fail closed: the alternative is writing content the project asked us to strip.
  it("throws rather than skipping a pattern that cannot compile", () => {
    expect(() => custom(pattern("ACCT-(\\d{9}"))).toThrow(
      expect.objectContaining({ _tag: "RedactionError", reason: expect.stringContaining("uncompilable") }),
    )
  })
})

describe("attribute_key rules", () => {
  it("returns the rule's label for an exact key", () => {
    expect(custom(keys("acme.staff.id")).maskedKeyLabel("acme.staff.id")).toBe("STAFF_ID")
    expect(custom(keys("acme.staff.id")).maskedKeyLabel("acme.staff.name")).toBeNull()
  })

  it("returns the label for a trailing-glob prefix", () => {
    const matcher = custom(keys("acme.customer.*")).maskedKeyLabel

    expect(matcher("acme.customer.tax_id")).toBe("STAFF_ID")
    expect(matcher("acme.customer.")).toBe("STAFF_ID")
    expect(matcher("acme.customers")).toBeNull()
  })

  it("matches nothing when no key rule is configured", () => {
    expect(custom(terms()).maskedKeyLabel("anything")).toBeNull()
  })

  // Deterministic attribution when two rules name the same key, so the placeholder cannot vary.
  it("gives the first rule that names a key the label", () => {
    const first: RedactionRule = { id: "a", label: "FIRST", kind: "attribute_key", keys: ["acme.x"] }
    const second: RedactionRule = { id: "b", label: "SECOND", kind: "attribute_key", keys: ["acme.x"] }

    expect(custom(first, second).maskedKeyLabel("acme.x")).toBe("FIRST")
  })

  it("contributes no value-scanning rule, since it matches keys rather than values", () => {
    expect(custom(keys("acme.staff.id")).rules).toEqual([])
  })
})
