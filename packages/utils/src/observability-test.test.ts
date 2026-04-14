import { describe, expect, it } from "vitest"
import { LatitudeObservabilityTestError } from "./observability-test.ts"

describe("LatitudeObservabilityTestError", () => {
  it("uses a stable error name for log/APM filters", () => {
    const err = new LatitudeObservabilityTestError("api")
    expect(err.name).toBe("LatitudeObservabilityTestError")
    expect(err.service).toBe("api")
    expect(err.message).toContain("api")
  })
})
