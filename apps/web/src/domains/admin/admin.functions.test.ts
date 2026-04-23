import { MAX_SEARCH_QUERY_LENGTH } from "@domain/admin"
import { describe, expect, it } from "vitest"
import { adminSearchInputSchema } from "./admin.functions.ts"

describe("adminSearchInputSchema", () => {
  it("accepts a valid query with default entity type", () => {
    const result = adminSearchInputSchema.safeParse({ q: "alice" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe("all")
    }
  })

  it("accepts each valid entity type", () => {
    for (const type of ["all", "user", "organization", "project"] as const) {
      expect(adminSearchInputSchema.safeParse({ q: "ab", type }).success).toBe(true)
    }
  })

  it("rejects an unknown entity type", () => {
    expect(adminSearchInputSchema.safeParse({ q: "ab", type: "workspace" }).success).toBe(false)
  })

  it("rejects queries above the max length", () => {
    const result = adminSearchInputSchema.safeParse({
      q: "a".repeat(MAX_SEARCH_QUERY_LENGTH + 1),
    })
    expect(result.success).toBe(false)
  })

  it("accepts short or empty queries at the schema level (use-case short-circuits below the minimum)", () => {
    // The minimum is enforced by `unifiedSearchUseCase` so the RPC returns an
    // empty result for short queries — this keeps URL-level behaviour
    // consistent with the debounced client (no error flash for 0-1 char).
    expect(adminSearchInputSchema.safeParse({ q: "" }).success).toBe(true)
    expect(adminSearchInputSchema.safeParse({ q: "a" }).success).toBe(true)
  })
})
