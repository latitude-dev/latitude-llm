import { buildMonitorAlert } from "@domain/monitors"
import { MonitorId } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

const monitorId = MonitorId("m".repeat(24))
const savedSearchId = "s".repeat(24)
const at = new Date("2026-06-01T10:00:00.000Z")

describe("buildMonitorAlert", () => {
  it("defaults severity from the kind and condition to null", async () => {
    const alert = await Effect.runPromise(
      buildMonitorAlert(
        { kind: "savedSearch.match", source: { type: "savedSearch", id: savedSearchId } },
        monitorId,
        at,
      ),
    )
    expect(alert).toMatchObject({ kind: "savedSearch.match", severity: "low", condition: null })
    expect(alert.source).toEqual({ type: "savedSearch", id: savedSearchId })
  })

  it("rejects a kind outside the user-creatable allowlist", async () => {
    const error = await Effect.runPromise(
      buildMonitorAlert({ kind: "issue.new", source: { type: "issue", id: null } }, monitorId, at).pipe(Effect.flip),
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("kind")
  })

  it("rejects a kind/source-type mismatch", async () => {
    const error = await Effect.runPromise(
      buildMonitorAlert(
        { kind: "savedSearch.match", source: { type: "issue", id: savedSearchId } },
        monitorId,
        at,
      ).pipe(Effect.flip),
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("source")
  })

  it("rejects a saved-search alert without a source id", async () => {
    const error = await Effect.runPromise(
      buildMonitorAlert({ kind: "savedSearch.match", source: { type: "savedSearch", id: null } }, monitorId, at).pipe(
        Effect.flip,
      ),
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("source")
  })

  it("rejects a condition whose kind does not match the alert kind", async () => {
    const error = await Effect.runPromise(
      buildMonitorAlert(
        {
          kind: "savedSearch.threshold",
          source: { type: "savedSearch", id: savedSearchId },
          condition: {
            kind: "savedSearch.escalating",
            threshold: { mode: "absolute", count: 1 },
            window: { minutes: 5 },
          },
        },
        monitorId,
        at,
      ).pipe(Effect.flip),
    )
    expect(error._tag).toBe("AlertConditionMismatchError")
  })
})
