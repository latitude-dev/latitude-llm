import { describe, expect, it } from "vitest"
import { adminGetOrganizationInputSchema } from "./organizations.functions.ts"

describe("adminGetOrganizationInputSchema", () => {
  it("accepts a valid organizationId", () => {
    expect(adminGetOrganizationInputSchema.safeParse({ organizationId: "org-123" }).success).toBe(true)
  })

  it("rejects an empty organizationId", () => {
    expect(adminGetOrganizationInputSchema.safeParse({ organizationId: "" }).success).toBe(false)
  })

  it("rejects an organizationId above the max length (defensive abuse bound)", () => {
    expect(adminGetOrganizationInputSchema.safeParse({ organizationId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing organizationId", () => {
    expect(adminGetOrganizationInputSchema.safeParse({}).success).toBe(false)
  })
})
