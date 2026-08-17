import { describe, expect, it } from "vitest"
import { payloadSchemaFor, routeOf } from "./notification.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

describe("routeOf", () => {
  const incident = (incidentKind: string) => ({ alertIncidentId: cuid("ai"), incidentKind })

  it("sends signal escalations to the signals group under their own topic", () => {
    for (const kind of ["incident.event", "incident.opened", "incident.closed"] as const) {
      expect(routeOf(kind, incident("signal.escalating"))).toEqual({
        group: "signals",
        topic: "signal.escalating",
      })
    }
  })

  it("sends every monitor trigger to the monitors group, which has no topics", () => {
    for (const trigger of ["monitor.match", "monitor.threshold", "monitor.escalating"]) {
      expect(routeOf("incident.opened", incident(trigger))).toEqual({ group: "monitors", topic: null })
    }
  })

  it("routes the standalone signal kinds by kind alone", () => {
    expect(routeOf("signal.discovered", {})).toEqual({ group: "signals", topic: "signal.discovered" })
    expect(routeOf("signal.regressed", {})).toEqual({ group: "signals", topic: "signal.regressed" })
    expect(routeOf("issue.assigned", {})).toEqual({ group: "personal", topic: null })
  })

  it("falls back to the topic-less monitors group for an unreadable incidentKind", () => {
    expect(routeOf("incident.opened", { incidentKind: "nonsense" })).toEqual({ group: "monitors", topic: null })
    expect(routeOf("incident.opened", {})).toEqual({ group: "monitors", topic: null })
  })
})

/**
 * Stored payloads are re-parsed with `payloadSchemaFor(kind)` at every read
 * site, so rows written before a schema gained fields must keep parsing.
 */
describe("incident payload backwards compatibility", () => {
  const legacyBase = {
    alertIncidentId: cuid("ai"),
    sourceType: "monitor",
    sourceId: cuid("i"),
    incidentKind: "monitor.match",
    severity: "medium",
  }

  it("parses pre-triage incident.event payloads (no assigneeId/priority)", () => {
    const parsed = payloadSchemaFor("incident.event").parse(legacyBase)
    expect(parsed.assigneeId).toBeUndefined()
    expect(parsed.priority).toBeUndefined()
  })

  it("parses pre-triage incident.opened payloads", () => {
    const parsed = payloadSchemaFor("incident.opened").parse({
      ...legacyBase,
      incidentKind: "signal.escalating",
    })
    expect(parsed.assigneeId).toBeUndefined()
    expect(parsed.priority).toBeUndefined()
  })

  it("parses pre-triage incident.closed payloads", () => {
    const parsed = payloadSchemaFor("incident.closed").parse({
      ...legacyBase,
      incidentKind: "signal.escalating",
      recovery: { durationMs: 60_000 },
    })
    expect(parsed.assigneeId).toBeUndefined()
    expect(parsed.priority).toBeUndefined()
  })

  it("round-trips snapshotted triage fields, including explicit nulls", () => {
    const parsed = payloadSchemaFor("incident.event").parse({
      ...legacyBase,
      assigneeId: cuid("u"),
      priority: "urgent",
    })
    expect(parsed.assigneeId).toBe(cuid("u"))
    expect(parsed.priority).toBe("urgent")

    const cleared = payloadSchemaFor("incident.event").parse({
      ...legacyBase,
      assigneeId: null,
      priority: null,
    })
    expect(cleared.assigneeId).toBeNull()
    expect(cleared.priority).toBeNull()
  })
})
