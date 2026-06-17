import { describe, expect, it } from "vitest"
import type { IncidentEventPayload, SignalAssignedPayload, WrappedReportPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "./idempotency-key.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

describe("buildIdempotencyKey", () => {
  it("keys incident kinds on the alert incident id", () => {
    const payload = {
      alertIncidentId: cuid("ai"),
      sourceType: "issue",
      sourceId: cuid("i"),
      incidentKind: "issue.new",
      severity: "medium",
    } as IncidentEventPayload
    expect(buildIdempotencyKey({ kind: "incident.event", payload })).toBe(`incident.event:${cuid("ai")}`)
  })

  it("keys wrapped reports on the report id", () => {
    const payload: WrappedReportPayload = { wrappedReportId: cuid("wr"), link: "https://example/x" }
    expect(buildIdempotencyKey({ kind: "wrapped.report", payload })).toBe(`wrapped.report:${cuid("wr")}`)
  })

  it("mints a fresh key per custom message", () => {
    const payload = { title: "Heads up" }
    const first = buildIdempotencyKey({ kind: "custom.message", payload })
    const second = buildIdempotencyKey({ kind: "custom.message", payload })
    expect(first).not.toBe(second)
  })

  it("keys issue.assigned per assignment event via assignedAt", () => {
    const payload: SignalAssignedPayload = {
      signalId: cuid("i"),
      actorUserId: cuid("a"),
      assignedAt: "2026-05-07T10:00:00.000Z",
    }
    // Deterministic for the same event (outbox redelivery replays the key)…
    expect(buildIdempotencyKey({ kind: "issue.assigned", payload })).toBe(
      `issue.assigned:${cuid("i")}:2026-05-07T10:00:00.000Z`,
    )
    // …and distinct for a later re-assignment of the same issue.
    expect(
      buildIdempotencyKey({
        kind: "issue.assigned",
        payload: { ...payload, assignedAt: "2026-05-08T09:00:00.000Z" },
      }),
    ).toBe(`issue.assigned:${cuid("i")}:2026-05-08T09:00:00.000Z`)
  })
})
