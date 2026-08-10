import { describe, expect, it } from "vitest"
import { metricOrderForMode, resolveMetricForMode, unitNounForMode } from "./histogram-metrics.ts"

describe("metricOrderForMode", () => {
  it("leads with the mode's own unit", () => {
    expect(metricOrderForMode("sessions")[0]).toBe("sessions")
    expect(metricOrderForMode("traces")[0]).toBe("traces")
  })

  it("omits the session count in traces mode", () => {
    expect(metricOrderForMode("traces")).not.toContain("sessions")
    expect(metricOrderForMode("sessions")).toContain("traces")
  })
})

describe("resolveMetricForMode", () => {
  it("falls back to the mode's leading metric when unset", () => {
    expect(resolveMetricForMode(undefined, "sessions")).toBe("sessions")
    expect(resolveMetricForMode(undefined, "traces")).toBe("traces")
  })

  it("keeps an explicit pick the mode offers", () => {
    expect(resolveMetricForMode("cost", "traces")).toBe("cost")
    expect(resolveMetricForMode("traces", "sessions")).toBe("traces")
  })

  it("drops a pick the mode does not offer", () => {
    expect(resolveMetricForMode("sessions", "traces")).toBe("traces")
  })
})

describe("unitNounForMode", () => {
  it("names the row the aggregate is computed over", () => {
    expect(unitNounForMode("sessions")).toBe("session")
    expect(unitNounForMode("traces")).toBe("trace")
  })
})
