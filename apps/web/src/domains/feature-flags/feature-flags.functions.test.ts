import { describe, expect, it } from "vitest"
import { hasFeatureFlagInputSchema } from "./feature-flags.functions.ts"

describe("feature flag server function input validation", () => {
  it("accepts arbitrary string identifiers so unknown flags can resolve to false", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: "new-dashboard" })

    expect(result.success).toBe(true)
  })

  it("keeps empty identifiers as valid input for the domain helper false path", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: "" })

    expect(result.success).toBe(true)
  })

  it("rejects non-string identifiers", () => {
    const result = hasFeatureFlagInputSchema.safeParse({ identifier: 123 })

    expect(result.success).toBe(false)
  })
})
