import { describe, expect, it } from "vitest"
import {
  adminFeatureFlagIdentifierInputSchema,
  adminOrganizationFeatureFlagMutationInputSchema,
  adminOrganizationFeatureFlagsInputSchema,
} from "./feature-flags.functions.ts"

describe("adminFeatureFlagIdentifierInputSchema", () => {
  it("accepts a known feature flag identifier", () => {
    expect(adminFeatureFlagIdentifierInputSchema.safeParse({ identifier: "slack" }).success).toBe(true)
  })

  it("rejects unknown identifiers", () => {
    expect(adminFeatureFlagIdentifierInputSchema.safeParse({ identifier: "new-dashboard" }).success).toBe(false)
  })

  it("rejects missing identifiers", () => {
    expect(adminFeatureFlagIdentifierInputSchema.safeParse({}).success).toBe(false)
  })
})

describe("adminOrganizationFeatureFlagsInputSchema", () => {
  it("accepts an organization id", () => {
    expect(adminOrganizationFeatureFlagsInputSchema.safeParse({ organizationId: "org-123" }).success).toBe(true)
  })

  it("rejects empty organization ids", () => {
    expect(adminOrganizationFeatureFlagsInputSchema.safeParse({ organizationId: "" }).success).toBe(false)
  })
})

describe("adminOrganizationFeatureFlagMutationInputSchema", () => {
  it("accepts organization id and a known feature flag identifier", () => {
    expect(
      adminOrganizationFeatureFlagMutationInputSchema.safeParse({
        organizationId: "org-123",
        identifier: "slack",
      }).success,
    ).toBe(true)
  })

  it("rejects unknown identifiers", () => {
    expect(
      adminOrganizationFeatureFlagMutationInputSchema.safeParse({
        organizationId: "org-123",
        identifier: "new-dashboard",
      }).success,
    ).toBe(false)
  })

  it("rejects missing fields", () => {
    expect(adminOrganizationFeatureFlagMutationInputSchema.safeParse({ organizationId: "org-123" }).success).toBe(false)
    expect(adminOrganizationFeatureFlagMutationInputSchema.safeParse({ identifier: "slack" }).success).toBe(false)
  })
})
