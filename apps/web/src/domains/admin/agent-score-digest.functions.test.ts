import { OrganizationId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { isDigestEligible } from "./agent-score-digest.functions.ts"

const ORG = "org-a".padEnd(24, "x")
const OTHER = "org-b".padEnd(24, "x")

describe("isDigestEligible", () => {
  it("admits every organization when the flag is enabled for all", () => {
    expect(isDigestEligible({ enabledForAll: true, organizationIds: [] }, ORG)).toBe(true)
  })

  it("admits an organization on the enabled list", () => {
    expect(isDigestEligible({ enabledForAll: false, organizationIds: [OrganizationId(ORG)] }, ORG)).toBe(true)
  })

  it("refuses an organization that is not on the list", () => {
    expect(isDigestEligible({ enabledForAll: false, organizationIds: [OrganizationId(OTHER)] }, ORG)).toBe(false)
  })

  it("refuses when the flag is enabled nowhere", () => {
    expect(isDigestEligible({ enabledForAll: false, organizationIds: [] }, ORG)).toBe(false)
  })
})
