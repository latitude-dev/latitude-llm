import { describe, expect, it } from "vitest"
import { groupOf, payloadSchemaFor } from "./notification.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

describe("notification groups", () => {
  it("keeps signal kinds out of the monitors group", () => {
    expect(groupOf("signal.discovered")).toBe("signals")
    expect(groupOf("signal.regressed")).toBe("signals")
    expect(groupOf("incident.opened")).toBe("incidents")
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
