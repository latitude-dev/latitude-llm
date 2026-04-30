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
  const encodeCursor = (cursor: { traceCount: number; organizationId: string }): string =>
    Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")

  it("accepts an empty payload (first page, default limit)", () => {
    expect(adminListOrganizationsByUsageInputSchema.safeParse({}).success).toBe(true)
  })

  it("accepts and decodes a valid base64url-encoded cursor", () => {
    const cursor = encodeCursor({ traceCount: 42, organizationId: "org-1" })
    const result = adminListOrganizationsByUsageInputSchema.safeParse({ cursor, limit: 25 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cursor).toEqual({ traceCount: 42, organizationId: "org-1" })
    }
  })

  it("rejects a malformed cursor (non-decodable input becomes a 400, not a 500)", () => {
    // Plain string — not a valid base64url payload that decodes to a cursor.
    expect(adminListOrganizationsByUsageInputSchema.safeParse({ cursor: "abc" }).success).toBe(false)
  })

  it("rejects a cursor whose decoded shape doesn't match the schema", () => {
    const cursor = Buffer.from(JSON.stringify({ traceCount: -1, organizationId: "" }), "utf8").toString("base64url")
    expect(adminListOrganizationsByUsageInputSchema.safeParse({ cursor }).success).toBe(false)
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
