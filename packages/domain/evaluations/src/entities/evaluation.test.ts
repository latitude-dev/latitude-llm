import { describe, expect, it } from "vitest"
import { evaluationAlignmentJobStatusSchema } from "./evaluation.ts"

describe("evaluationAlignmentJobStatusSchema", () => {
  it("accepts a completed job status with an evaluation id", () => {
    const parsed = evaluationAlignmentJobStatusSchema.parse({
      jobId: "job-123",
      status: "completed",
      evaluationId: "e".repeat(24),
      error: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:01:00.000Z"),
    })

    expect(parsed.status).toBe("completed")
    expect(parsed.evaluationId).toBe("e".repeat(24))
  })

  it("accepts a running job status before an evaluation row exists", () => {
    const parsed = evaluationAlignmentJobStatusSchema.parse({
      jobId: "job-123",
      status: "running",
      evaluationId: null,
      error: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:01:00.000Z"),
    })

    expect(parsed.status).toBe("running")
    expect(parsed.evaluationId).toBeNull()
  })

  it("rejects completed statuses without an evaluation id", () => {
    const result = evaluationAlignmentJobStatusSchema.safeParse({
      jobId: "job-123",
      status: "completed",
      evaluationId: null,
      error: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:01:00.000Z"),
    })

    expect(result.success).toBe(false)
  })

  it("requires a structured error for failed statuses", () => {
    const result = evaluationAlignmentJobStatusSchema.safeParse({
      jobId: "job-123",
      status: "failed",
      evaluationId: null,
      error: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:01:00.000Z"),
    })

    expect(result.success).toBe(false)
  })
})
