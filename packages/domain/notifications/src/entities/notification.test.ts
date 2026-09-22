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
    expect(routeOf("signal.reprioritized", {})).toEqual({ group: "signals", topic: "signal.reprioritized" })
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

describe("signalReprioritizedPayloadSchema", () => {
  it("rejects a cleared priority — only increases are ever stored", () => {
    const parsed = payloadSchemaFor("signal.reprioritized").safeParse({
      signalId: cuid("s"),
      actorUserId: cuid("u"),
      reprioritizedAt: "2026-07-01T10:00:00.000Z",
      priority: null,
      previousPriority: "high",
      severity: "high",
    })

    expect(parsed.success).toBe(false)
  })
})

describe("agentScoreWeeklyDigestPayloadSchema", () => {
  const digest = {
    projectId: cuid("p"),
    date: "2026-09-21",
    windowStart: "2026-09-16",
    windowEnd: "2026-09-22",
    score: 71.4,
    interval: { lower: 68.1, upper: 74.7 },
    scoringVersion: "agent-score-v5-provisional",
    windowDays: 7,
    eligibleSessionCount: 312,
    publishedDayCount: 5,
    dimensions: {
      outcome: { score: 74, delta: 2.5 },
      reliability: { score: 81, delta: null },
      cost: { score: 66, delta: -1.2 },
      speed: { score: 70, delta: 0 },
      safety: { score: 92, delta: 0.4 },
    },
    comparison: {
      status: "comparable",
      baselineDate: "2026-09-17",
      baselineScore: 68.9,
      delta: 2.5,
      significant: false,
    },
  }

  it("parses a published digest", () => {
    expect(payloadSchemaFor("agent-score.weekly-digest").parse(digest)).toMatchObject({
      score: 71.4,
      publishedDayCount: 5,
    })
  })

  it("parses every comparison branch", () => {
    for (const comparison of [
      { status: "none" },
      { status: "incomparable", reason: "scoringVersion", baselineDate: "2026-09-17", baselineScore: 68.9 },
      { status: "incomparable", reason: "windowDays", baselineDate: "2026-09-17", baselineScore: 68.9 },
    ]) {
      expect(payloadSchemaFor("agent-score.weekly-digest").safeParse({ ...digest, comparison }).success).toBe(true)
    }
  })

  it("requires every dimension — a partial record would render a blank row", () => {
    const { safety: _safety, ...partial } = digest.dimensions
    expect(payloadSchemaFor("agent-score.weekly-digest").safeParse({ ...digest, dimensions: partial }).success).toBe(
      false,
    )
  })

  it("rejects a payload with no project anchor for the idempotency key", () => {
    const { projectId: _projectId, ...anchorless } = digest
    expect(payloadSchemaFor("agent-score.weekly-digest").safeParse(anchorless).success).toBe(false)
  })

  it("routes to its own preferences group", () => {
    expect(routeOf("agent-score.weekly-digest", digest)).toEqual({ group: "agent_score", topic: null })
  })
})
