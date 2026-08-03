import { DEFAULT_REDACTION_ENTITIES, REDACTION_ENTITIES } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { REDACTION_ENTITY_META } from "./redaction-entities.ts"

describe("redaction entity copy", () => {
  /**
   * A category ships off by default only because it also matches values that are not personal
   * data. Without the caution saying which, someone turning it on has no way to know what they
   * are trading away — so the two lists have to stay in step.
   */
  it("explains every category that ships off by default", () => {
    const offByDefault = REDACTION_ENTITIES.filter((entity) => !DEFAULT_REDACTION_ENTITIES.includes(entity))

    expect(offByDefault.length).toBeGreaterThan(0)
    for (const entity of offByDefault) {
      expect(REDACTION_ENTITY_META[entity].caution).toBeDefined()
    }
  })
})
