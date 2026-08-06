import { describe, expect, it } from "vitest"
import { applySeverityFloor, flaggerSeverityFloor } from "./severity-floor.ts"

describe("flaggerSeverityFloor", () => {
  it("floors the detectors whose failure class always needs acting on", () => {
    expect(flaggerSeverityFloor("pii-leakage")).toBe("urgent")
    expect(flaggerSeverityFloor("nsfw")).toBe("high")
  })

  // Matching a detector is not the same as deserving attention. `jailbreaking`
  // fires on an attempt the guardrail may have stopped, and the one production
  // signal a person triaged for it they parked at `low` — so it is left to the
  // rubric like any other detector.
  it("leaves other detectors and non-flagger scores unfloored", () => {
    expect(flaggerSeverityFloor("jailbreaking")).toBeNull()
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
