import { DEFAULT_REDACTION_ENTITIES, REDACTION_ENTITIES, type RedactionPolicy } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { BUILT_IN_DETECTORS } from "./detectors.ts"
import { REDACTION_ENTITY_LABELS } from "./labels.ts"
import { compilePolicy, compileRuleSet } from "./rules.ts"

const policy = (overrides: Partial<RedactionPolicy> = {}): RedactionPolicy => ({
  entities: new Set(DEFAULT_REDACTION_ENTITIES),
  redactMetadata: false,
  identities: "keep",
  ...overrides,
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
