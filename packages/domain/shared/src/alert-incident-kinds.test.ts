import { describe, expect, it } from "vitest"
import { alertIncidentConditionSchema } from "./alert-incident-condition.ts"
import {
  ALERT_INCIDENT_KIND_LABEL,
  ALERT_INCIDENT_KIND_LIFECYCLE,
  ALERT_INCIDENT_KIND_SOURCE_TYPE,
  ALERT_INCIDENT_KINDS,
  SEVERITY_FOR_KIND,
} from "./alert-incident-kinds.ts"

const UNIFIED_KINDS = ["event.matched", "metric.threshold", "metric.escalating"] as const

describe("alert incident kinds", () => {
  it("includes the unified query-time kinds", () => {
    for (const kind of UNIFIED_KINDS) expect(ALERT_INCIDENT_KINDS).toContain(kind)
  })

  it("covers every kind in the total maps", () => {
    for (const kind of ALERT_INCIDENT_KINDS) {
      expect(ALERT_INCIDENT_KIND_LIFECYCLE[kind]).toBeDefined()
      expect(ALERT_INCIDENT_KIND_LABEL[kind]).toBeTruthy()
      expect(SEVERITY_FOR_KIND[kind]).toBeDefined()
    }
  })

  it("omits a source type for unified kinds (target lives on the monitor) but keeps it for legacy kinds", () => {
    expect(ALERT_INCIDENT_KIND_SOURCE_TYPE["metric.threshold"]).toBeUndefined()
    expect(ALERT_INCIDENT_KIND_SOURCE_TYPE["metric.escalating"]).toBeUndefined()
    expect(ALERT_INCIDENT_KIND_SOURCE_TYPE["event.matched"]).toBeUndefined()
    expect(ALERT_INCIDENT_KIND_SOURCE_TYPE["savedSearch.threshold"]).toBe("savedSearch")
    expect(ALERT_INCIDENT_KIND_SOURCE_TYPE["issue.escalating"]).toBe("issue")
  })

  it("classifies unified escalating as sustained, threshold/match as point", () => {
    expect(ALERT_INCIDENT_KIND_LIFECYCLE["metric.escalating"]).toBe("sustained")
    expect(ALERT_INCIDENT_KIND_LIFECYCLE["metric.threshold"]).toBe("point")
    expect(ALERT_INCIDENT_KIND_LIFECYCLE["event.matched"]).toBe("point")
  })
})

describe("unified metric conditions", () => {
  it("accepts a float absolute threshold (error rate) for metric.threshold", () => {
    const parsed = alertIncidentConditionSchema.parse({
      kind: "metric.threshold",
      metric: { kind: "errorRate" },
      threshold: { mode: "absolute", value: 0.1 },
    })
    expect(parsed.kind).toBe("metric.threshold")
  })

  it("accepts an aggregate metric + expected mode + window for metric.escalating", () => {
    const parsed = alertIncidentConditionSchema.parse({
      kind: "metric.escalating",
      metric: { kind: "p95", field: "duration" },
      threshold: { mode: "expected" },
      window: { minutes: 30 },
    })
    expect(parsed.kind).toBe("metric.escalating")
  })

  it("rejects a metric.escalating with a sub-5-minute window", () => {
    const result = alertIncidentConditionSchema.safeParse({
      kind: "metric.escalating",
      metric: { kind: "count" },
      threshold: { mode: "absolute", value: 3 },
      window: { minutes: 1 },
    })
    expect(result.success).toBe(false)
  })
})
