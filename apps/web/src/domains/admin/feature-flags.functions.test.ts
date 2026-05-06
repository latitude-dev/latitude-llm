import { FEATURE_FLAG_IDENTIFIER_MAX_LENGTH, FEATURE_FLAG_NAME_MAX_LENGTH } from "@domain/feature-flags"
import { describe, expect, it } from "vitest"
import {
  adminCreateFeatureFlagInputSchema,
  adminFeatureFlagIdentifierInputSchema,
  adminOrganizationFeatureFlagMutationInputSchema,
  adminOrganizationFeatureFlagsInputSchema,
} from "./feature-flags.functions.ts"

describe("adminCreateFeatureFlagInputSchema", () => {
  it("accepts identifier with optional metadata", () => {
    expect(
      adminCreateFeatureFlagInputSchema.safeParse({
        identifier: "new-dashboard",
        name: "New dashboard",
        description: "Rolls out the new dashboard.",
      }).success,
    ).toBe(true)
  })

  it("rejects empty or oversized identifiers", () => {
    expect(adminCreateFeatureFlagInputSchema.safeParse({ identifier: "" }).success).toBe(false)
    expect(
      adminCreateFeatureFlagInputSchema.safeParse({
        identifier: "x".repeat(FEATURE_FLAG_IDENTIFIER_MAX_LENGTH + 1),
      }).success,
    ).toBe(false)
  })

  it("rejects oversized names", () => {
    expect(
      adminCreateFeatureFlagInputSchema.safeParse({
        identifier: "new-dashboard",
        name: "x".repeat(FEATURE_FLAG_NAME_MAX_LENGTH + 1),
      }).success,
    ).toBe(false)
  })
})

describe("adminFeatureFlagIdentifierInputSchema", () => {
  it("accepts a feature flag identifier", () => {
    expect(adminFeatureFlagIdentifierInputSchema.safeParse({ identifier: "new-dashboard" }).success).toBe(true)
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
  it("accepts organization id and feature flag identifier", () => {
    expect(
      adminOrganizationFeatureFlagMutationInputSchema.safeParse({
        organizationId: "org-123",
        identifier: "new-dashboard",
      }).success,
    ).toBe(true)
  })

  it("rejects missing fields", () => {
    expect(adminOrganizationFeatureFlagMutationInputSchema.safeParse({ organizationId: "org-123" }).success).toBe(false)
    expect(adminOrganizationFeatureFlagMutationInputSchema.safeParse({ identifier: "new-dashboard" }).success).toBe(
      false,
    )
  })
})
