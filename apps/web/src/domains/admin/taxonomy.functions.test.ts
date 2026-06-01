import { describe, expect, it } from "vitest"
import { adminGetProjectTaxonomyInputSchema } from "./taxonomy.functions.ts"

describe("adminGetProjectTaxonomyInputSchema", () => {
  it("accepts a valid projectId", () => {
    expect(adminGetProjectTaxonomyInputSchema.safeParse({ projectId: "proj-123" }).success).toBe(true)
  })

  it("rejects an empty projectId", () => {
    expect(adminGetProjectTaxonomyInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })

  it("rejects a projectId above the max length", () => {
    expect(adminGetProjectTaxonomyInputSchema.safeParse({ projectId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing projectId", () => {
    expect(adminGetProjectTaxonomyInputSchema.safeParse({}).success).toBe(false)
  })
})
