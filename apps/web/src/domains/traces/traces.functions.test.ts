import { describe, expect, it } from "vitest"
import { z } from "zod"

// Mirrors the `traceId` input validator shared by traces.functions.ts server
// functions that key a ClickHouse lookup off a single trace: the column is
// `FixedString(32)`, so any other length reaches the driver unguarded and
// throws a raw RepositoryError instead of a clean validation error.
const traceIdInputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().length(32),
})

describe("traceId input validation", () => {
  const VALID_TRACE_ID = "d8e03a7d206b83271ef46dcc21cb0a3e"

  it("accepts a well-formed 32-character trace id", () => {
    const result = traceIdInputSchema.safeParse({ projectId: "proj-123", traceId: VALID_TRACE_ID })
    expect(result.success).toBe(true)
  })

  it("rejects a UUID-formatted trace id (36 characters, the production failure case)", () => {
    const result = traceIdInputSchema.safeParse({
      projectId: "proj-123",
      traceId: "98670045-9d02-48ad-9397-5571547579ba",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["traceId"])
    }
  })

  it("rejects a too-short trace id", () => {
    const result = traceIdInputSchema.safeParse({ projectId: "proj-123", traceId: "abc123" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["traceId"])
    }
  })

  it("rejects an empty trace id", () => {
    const result = traceIdInputSchema.safeParse({ projectId: "proj-123", traceId: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["traceId"])
    }
  })
})
