import { describe, expect, it } from "vitest"
import { adminCreateDemoProjectInputSchema, adminGetOrganizationInputSchema } from "./organizations.functions.ts"

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

describe("adminCreateDemoProjectInputSchema", () => {
  it("accepts a valid organizationId + projectName", () => {
    expect(
      adminCreateDemoProjectInputSchema.safeParse({ organizationId: "org-123", projectName: "Demo Project" }).success,
    ).toBe(true)
  })

  it("rejects an empty projectName", () => {
    expect(adminCreateDemoProjectInputSchema.safeParse({ organizationId: "org-123", projectName: "" }).success).toBe(
      false,
    )
  })

  it("rejects a projectName above the max length", () => {
    expect(
      adminCreateDemoProjectInputSchema.safeParse({ organizationId: "org-123", projectName: "x".repeat(257) }).success,
    ).toBe(false)
  })

  it("rejects an empty organizationId", () => {
    expect(adminCreateDemoProjectInputSchema.safeParse({ organizationId: "", projectName: "Demo" }).success).toBe(false)
  })

  it("rejects a missing projectName", () => {
    expect(adminCreateDemoProjectInputSchema.safeParse({ organizationId: "org-123" }).success).toBe(false)
  })
})
