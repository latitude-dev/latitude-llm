import { describe, expect, it } from "vitest"
import { applySeverityFloor, flaggerSeverityFloor } from "./severity-floor.ts"

describe("flaggerSeverityFloor", () => {
  it("floors the detectors whose failure class is defined as severe", () => {
    expect(flaggerSeverityFloor("pii-leakage")).toBe("urgent")
    expect(flaggerSeverityFloor("nsfw")).toBe("high")
    expect(flaggerSeverityFloor("jailbreaking")).toBe("high")
  })

  // Deterministic is not the same as severe: these are left to the model.
  it("leaves other detectors and non-flagger scores unfloored", () => {
    expect(flaggerSeverityFloor("low-cache-hit-rate")).toBeNull()
    expect(flaggerSeverityFloor("frustration")).toBeNull()
    expect(flaggerSeverityFloor(undefined)).toBeNull()
  })
})

describe("applySeverityFloor", () => {
  it("raises a rating below the floor", () => {
    expect(applySeverityFloor("low", "urgent")).toBe("urgent")
    expect(applySeverityFloor("medium", "high")).toBe("high")
  })

  it("never lowers a rating above the floor", () => {
    expect(applySeverityFloor("urgent", "high")).toBe("urgent")
    expect(applySeverityFloor("high", "high")).toBe("high")
  })

  it("takes the floor when the model returned nothing", () => {
    expect(applySeverityFloor(null, "high")).toBe("high")
  })

  it("leaves the rating untouched with no floor", () => {
    expect(applySeverityFloor("low", null)).toBe("low")
    expect(applySeverityFloor(null, null)).toBeNull()
  })
})
