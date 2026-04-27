import { describe, expect, it } from "vitest"
import { adminGetProjectInputSchema } from "./projects.functions.ts"

describe("adminGetProjectInputSchema", () => {
  it("accepts a valid projectId", () => {
    expect(adminGetProjectInputSchema.safeParse({ projectId: "proj-123" }).success).toBe(true)
  })

  it("rejects an empty projectId", () => {
    expect(adminGetProjectInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })

  it("rejects a projectId above the max length (defensive abuse bound)", () => {
    expect(adminGetProjectInputSchema.safeParse({ projectId: "x".repeat(257) }).success).toBe(false)
  })

  it("rejects missing projectId", () => {
    expect(adminGetProjectInputSchema.safeParse({}).success).toBe(false)
  })
})
