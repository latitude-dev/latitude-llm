import { describe, expect, it } from "vitest"
import { payloadSchemaFor } from "./notification.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

/**
 * Stored payloads are re-parsed with `payloadSchemaFor(kind)` at every read
 * site, so rows written before a schema gained fields must keep parsing.
 */
describe("incident payload backwards compatibility", () => {
  const legacyBase = {
    alertIncidentId: cuid("ai"),
    sourceType: "issue",
    sourceId: cuid("i"),
    incidentKind: "issue.new",
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
      incidentKind: "issue.escalating",
    })
    expect(parsed.assigneeId).toBeUndefined()
    expect(parsed.priority).toBeUndefined()
  })

  it("parses pre-triage incident.closed payloads", () => {
    const parsed = payloadSchemaFor("incident.closed").parse({
      ...legacyBase,
      incidentKind: "issue.escalating",
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
