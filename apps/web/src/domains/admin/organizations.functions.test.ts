import { ORGANIZATION_USAGE_MAX_LIMIT } from "@domain/admin"
import { describe, expect, it } from "vitest"
import { adminGetOrganizationInputSchema, adminListOrganizationsByUsageInputSchema } from "./organizations.functions.ts"

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

describe("adminListOrganizationsByUsageInputSchema", () => {
  it("accepts an empty payload (first page, default limit)", () => {
    expect(adminListOrganizationsByUsageInputSchema.safeParse({}).success).toBe(true)
  })

  it("accepts a cursor and limit within bounds", () => {
    expect(
      adminListOrganizationsByUsageInputSchema.safeParse({
        cursor: "abc",
        limit: 25,
      }).success,
    ).toBe(true)
  })

  it("rejects a non-positive limit", () => {
    expect(adminListOrganizationsByUsageInputSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(adminListOrganizationsByUsageInputSchema.safeParse({ limit: -1 }).success).toBe(false)
  })

  it("rejects a limit above the configured maximum", () => {
    expect(
      adminListOrganizationsByUsageInputSchema.safeParse({ limit: ORGANIZATION_USAGE_MAX_LIMIT + 1 }).success,
    ).toBe(false)
  })

  it("rejects an oversized cursor (defensive abuse bound)", () => {
    expect(adminListOrganizationsByUsageInputSchema.safeParse({ cursor: "x".repeat(1025) }).success).toBe(false)
  })
})
