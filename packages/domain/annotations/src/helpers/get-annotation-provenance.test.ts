import { describe, expect, it } from "vitest"
import { getAnnotationProvenance } from "./get-annotation-provenance.ts"

const CUID = "a".repeat(24)
const USER_ID = "u".repeat(24)

describe("getAnnotationProvenance", () => {
  it('returns "human" whenever annotatorId is set, regardless of sourceId', () => {
    for (const sourceId of ["UI", "API", "SYSTEM", CUID, "random"]) {
      expect(getAnnotationProvenance({ sourceId, annotatorId: USER_ID })).toBe("human")
    }
  })

  it('returns "api" when annotatorId is null and sourceId is "API"', () => {
    expect(getAnnotationProvenance({ sourceId: "API", annotatorId: null })).toBe("api")
  })

  it('returns "agent" when annotatorId is null and sourceId is a cuid (queue-id case)', () => {
    expect(getAnnotationProvenance({ sourceId: CUID, annotatorId: null })).toBe("agent")
  })

  it('returns "agent" when annotatorId is null and sourceId is "SYSTEM"', () => {
    expect(getAnnotationProvenance({ sourceId: "SYSTEM", annotatorId: null })).toBe("agent")
  })

  it('returns null when annotatorId is null and sourceId is the "UI" sentinel (no human is attached)', () => {
    expect(getAnnotationProvenance({ sourceId: "UI", annotatorId: null })).toBeNull()
  })

  it("returns null when annotatorId is null and sourceId is neither a known sentinel nor a valid cuid", () => {
    expect(getAnnotationProvenance({ sourceId: "something-else", annotatorId: null })).toBeNull()
    expect(getAnnotationProvenance({ sourceId: "", annotatorId: null })).toBeNull()
  })
})
