import { describe, expect, it } from "vitest"
import { adminGetProjectInputSchema, adminGetProjectMetricsInputSchema } from "./projects.functions.ts"

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

describe("adminGetProjectMetricsInputSchema", () => {
  it("accepts a valid projectId without windowDays (uses default)", () => {
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "proj-123" }).success).toBe(true)
  })

  it("accepts a windowDays in range", () => {
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "proj-123", windowDays: 14 }).success).toBe(true)
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "proj-123", windowDays: 90 }).success).toBe(true)
  })

  it("rejects a non-positive windowDays", () => {
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "proj-123", windowDays: 0 }).success).toBe(false)
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "proj-123", windowDays: -7 }).success).toBe(false)
  })

  it("rejects windowDays above the configured maximum", () => {
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "proj-123", windowDays: 91 }).success).toBe(false)
  })

  it("rejects an empty projectId", () => {
    expect(adminGetProjectMetricsInputSchema.safeParse({ projectId: "" }).success).toBe(false)
  })
})
