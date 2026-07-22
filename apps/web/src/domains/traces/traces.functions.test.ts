import { describe, expect, it } from "vitest"
import { spanIdSchema, traceIdSchema } from "../../server/id-validation.ts"

describe("traceIdSchema", () => {
  const VALID_TRACE_ID = "d8e03a7d206b83271ef46dcc21cb0a3e"

  it("accepts a well-formed 32-character hex trace id", () => {
    expect(traceIdSchema.safeParse(VALID_TRACE_ID).success).toBe(true)
  })

  it("rejects a UUID-formatted trace id (36 characters, the production failure case)", () => {
    const result = traceIdSchema.safeParse("98670045-9d02-48ad-9397-5571547579ba")
    expect(result.success).toBe(false)
  })

  it("rejects a too-short trace id", () => {
    expect(traceIdSchema.safeParse("abc123").success).toBe(false)
  })

  it("rejects an empty trace id", () => {
    expect(traceIdSchema.safeParse("").success).toBe(false)
  })

  it("rejects a non-ASCII trace id with 32 UTF-16 code units but more than 32 bytes", () => {
    expect(traceIdSchema.safeParse("é".repeat(32)).success).toBe(false)
  })

  it("rejects uppercase hex", () => {
    expect(traceIdSchema.safeParse(VALID_TRACE_ID.toUpperCase()).success).toBe(false)
  })
})

describe("spanIdSchema", () => {
  const VALID_SPAN_ID = "13713341029516"

  it("rejects a too-short span id", () => {
    expect(spanIdSchema.safeParse(VALID_SPAN_ID).success).toBe(false)
  })

  it("accepts a well-formed 16-character hex span id", () => {
    expect(spanIdSchema.safeParse("a1b2c3d4e5f60718").success).toBe(true)
  })

  it("rejects a non-hex span id of the right length", () => {
    expect(spanIdSchema.safeParse("not-a-hex-value!").success).toBe(false)
  })
})
