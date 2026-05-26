import { describe, expect, it } from "vitest"
import { hasFeatureFlagInputSchema } from "./feature-flags.functions.ts"

describe("feature flag server function input validation", () => {
  it("accepts known identifiers from the registry", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: "slack" })

    expect(result.success).toBe(true)
  })

  it("rejects unknown identifiers", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: "new-dashboard" })

    expect(result.success).toBe(false)
  })

  it("rejects empty strings", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: "" })

    expect(result.success).toBe(false)
  })

  it("rejects non-string identifiers", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: 123 })

    expect(result.success).toBe(false)
  })
})
