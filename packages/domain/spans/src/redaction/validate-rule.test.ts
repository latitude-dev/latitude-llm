import { REDACTION_ENTITIES, type RedactionRule } from "@domain/shared"
import { validateRedactionRule } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { compileRuleSet } from "./rules.ts"

const codes = (rule: RedactionRule) => validateRedactionRule(rule).errors.map((issue) => issue.code)

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
      .filter((rule) =>
        codes({ id: "r", label: rule.label, kind: "pattern", pattern: rule.pattern.source }).includes(
          "adjacent_quantifier",
        ),
      )
      .map((rule) => `${rule.label}: ${rule.pattern.source}`)

    expect(tripped).toEqual([])
  })
})
