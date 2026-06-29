import { describe, expect, it } from "vitest"
import { listProjectAlertIncidentsInRangeInputSchema } from "./alerts.functions.ts"

const BASE_INPUT = {
  projectId: "proj_123",
  fromIso: "2026-01-01T00:00:00Z",
  toIso: "2026-01-02T00:00:00Z",
}

describe("listProjectAlertIncidentsInRangeInputSchema", () => {
  it("accepts sourceType 'signal'", () => {
    const result = listProjectAlertIncidentsInRangeInputSchema.safeParse({
      ...BASE_INPUT,
      sourceType: "signal",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sourceType).toBe("signal")
  })

  it("accepts sourceType 'monitor'", () => {
    const result = listProjectAlertIncidentsInRangeInputSchema.safeParse({
      ...BASE_INPUT,
      sourceType: "monitor",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sourceType).toBe("monitor")
  })

  it("maps legacy sourceType 'issue' to 'signal'", () => {
    const result = listProjectAlertIncidentsInRangeInputSchema.safeParse({
      ...BASE_INPUT,
      sourceType: "issue",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sourceType).toBe("signal")
  })

  it("accepts omitted sourceType", () => {
    const result = listProjectAlertIncidentsInRangeInputSchema.safeParse(BASE_INPUT)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.sourceType).toBeUndefined()
  })

  it("rejects unknown sourceType values", () => {
    const result = listProjectAlertIncidentsInRangeInputSchema.safeParse({
      ...BASE_INPUT,
      sourceType: "session",
    })
    expect(result.success).toBe(false)
  })
})
