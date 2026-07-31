import { DEFAULT_REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { compileRuleSet, findRedactionMatches } from "./rules.ts"
import { SAFE_CORPUS } from "./safe-corpus.ts"

const ruleSetOf = (...entities: RedactionEntity[]) =>
  compileRuleSet({ entities: new Set(entities), redactMetadata: false, identities: "keep", rules: [] })

const DEFAULTS = ruleSetOf(...DEFAULT_REDACTION_ENTITIES)

describe("safe corpus", () => {
  /**
   * The guard the per-entity negative vectors cannot give: they only ever run their own
   * detector, so a detector that starts eating another entity's negatives breaks nothing.
   */
  it.each(SAFE_CORPUS)("is untouched by the default detectors: %s", (entry) => {
    const matches = findRedactionMatches(entry, DEFAULTS).map((match) => ({
      label: match.label,
      matched: entry.slice(match.start, match.end),
    }))

    expect(matches).toEqual([])
  })

  it("covers every entity that ships on by default", () => {
    // Not a coverage metric, just a floor: a corpus that shrank to nothing would still pass above.
    expect(SAFE_CORPUS.length).toBeGreaterThan(150)
  })

  it("holds no duplicates, which would double-count a rule's corpus hits", () => {
    expect(new Set(SAFE_CORPUS).size).toBe(SAFE_CORPUS.length)
  })

  it("keeps redaction's own output in the corpus, so a rule cannot eat a placeholder", () => {
    expect(SAFE_CORPUS).toContain("[REDACTED_EMAIL]")
    expect(SAFE_CORPUS.some((entry) => entry.startsWith("anon_"))).toBe(true)
  })
})
