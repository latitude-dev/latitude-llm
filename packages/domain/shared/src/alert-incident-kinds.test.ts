import { describe, expect, it } from "vitest"
import { alertIncidentConditionSchema } from "./alert-incident-condition.ts"
import {
  INCIDENT_NOTIFICATION_KEYS,
  INCIDENT_SOURCE_TYPES,
  isSeverityIncrease,
  MONITOR_TARGET_TYPES,
  MONITOR_TRIGGERS,
} from "./alert-incident-kinds.ts"

describe("incident taxonomy", () => {
  it("separates monitor target, trigger, and incident producer axes", () => {
    expect(MONITOR_TARGET_TYPES).toEqual(["savedSearch", "tool", "user", "session"])
    expect(MONITOR_TRIGGERS).toEqual(["match", "threshold", "escalating"])
    expect(INCIDENT_SOURCE_TYPES).toEqual(["monitor", "signal"])
  })

  it("exposes notification keys as producer plus trigger", () => {
    expect(INCIDENT_NOTIFICATION_KEYS).toEqual([
      "signal.escalating",
      "monitor.match",
      "monitor.threshold",
      "monitor.escalating",
    ])
  })
})

describe("monitor conditions", () => {
  it("accepts a float absolute threshold for threshold triggers", () => {
    const parsed = alertIncidentConditionSchema.parse({
      trigger: "threshold",
      metric: { kind: "errorRate" },
      threshold: { mode: "absolute", value: 0.1 },
    })

    expect(parsed.trigger).toBe("threshold")
  })

  it("accepts an aggregate metric with expected mode and window for escalating triggers", () => {
    const parsed = alertIncidentConditionSchema.parse({
      trigger: "escalating",
      metric: { kind: "median", field: "duration" },
      threshold: { mode: "expected" },
      window: { minutes: 30 },
    })

    expect(parsed.trigger).toBe("escalating")
  })

  it("rejects an escalating condition with a sub-5-minute window", () => {
    const result = alertIncidentConditionSchema.safeParse({
      trigger: "escalating",
      metric: { kind: "count" },
      threshold: { mode: "absolute", value: 3 },
      window: { minutes: 1 },
    })

    expect(result.success).toBe(false)
  })
})

describe("isSeverityIncrease", () => {
  it("is true only for a step up the scale", () => {
    expect(isSeverityIncrease("medium", "high")).toBe(true)
    expect(isSeverityIncrease("low", "urgent")).toBe(true)
    expect(isSeverityIncrease("high", "medium")).toBe(false)
    expect(isSeverityIncrease("high", "high")).toBe(false)
  })

  it("ranks unset below every tier, so a first value is an increase", () => {
    expect(isSeverityIncrease(null, "low")).toBe(true)
    expect(isSeverityIncrease(null, "urgent")).toBe(true)
  })

  it("never counts clearing a value as an increase", () => {
    expect(isSeverityIncrease("urgent", null)).toBe(false)
    expect(isSeverityIncrease("low", null)).toBe(false)
    expect(isSeverityIncrease(null, null)).toBe(false)
  })
})
