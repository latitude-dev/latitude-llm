import { type Monitor, type MonitorAlert, MonitorRepository, updateMonitorAlertUseCase } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { MonitorAlertId, MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))
const alertId = MonitorAlertId("x".repeat(24))
const at = new Date("2026-06-01T10:00:00.000Z")

const makeAlert = (overrides: Partial<MonitorAlert> & { kind: MonitorAlert["kind"] }): MonitorAlert => ({
  id: alertId,
  monitorId,
  kind: overrides.kind,
  source: overrides.source ?? { type: "issue", id: null },
  condition: overrides.condition ?? null,
  severity: overrides.severity ?? "high",
  createdAt: at,
})

const makeMonitor = (overrides: Partial<Monitor> & { alerts: readonly MonitorAlert[] }): Monitor => ({
  id: monitorId,
  organizationId,
  projectId,
  slug: "my-monitor",
  name: "My monitor",
  description: "",
  system: overrides.system ?? false,
  alerts: overrides.alerts,
  mutedAt: null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const provide = (repo: MonitorRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const runError = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(provide(repo))))

const escalatingMonitor = (system: boolean) =>
  makeMonitor({
    system,
    alerts: [makeAlert({ kind: "issue.escalating", condition: { kind: "issue.escalating", sensitivity: 3 } })],
  })

describe("updateMonitorAlertUseCase", () => {
  it("updates an issue.escalating alert's sensitivity in place (system monitor allowed)", async () => {
    const { repo, monitors } = createFakeMonitorRepository([escalatingMonitor(true)])
    const result = await run(
      updateMonitorAlertUseCase({ monitorId, alertId, condition: { kind: "issue.escalating", sensitivity: 5 } }),
      repo,
    )
    expect(result.alerts[0]?.condition).toEqual({ kind: "issue.escalating", sensitivity: 5 })
    expect(monitors[0]?.alerts[0]?.condition).toEqual({ kind: "issue.escalating", sensitivity: 5 })
  })

  it("lets a user monitor change a saved-search alert's source, condition and severity", async () => {
    const monitor = makeMonitor({
      alerts: [
        makeAlert({
          kind: "savedSearch.threshold",
          source: { type: "savedSearch", id: "s".repeat(24) },
          condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
          severity: "medium",
        }),
      ],
    })
    const { repo, monitors } = createFakeMonitorRepository([monitor])
    const result = await run(
      updateMonitorAlertUseCase({
        monitorId,
        alertId,
        source: { type: "savedSearch", id: "t".repeat(24) },
        condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 250 } },
        severity: "high",
      }),
      repo,
    )
    expect(result.alerts[0]?.source.id).toBe("t".repeat(24))
    expect(result.alerts[0]?.severity).toBe("high")
    expect(monitors[0]?.alerts[0]).toMatchObject({ source: { id: "t".repeat(24) }, severity: "high" })
  })

  it("rejects a condition whose kind does not match the alert", async () => {
    const { repo, monitors } = createFakeMonitorRepository([escalatingMonitor(false)])
    const error = await runError(
      updateMonitorAlertUseCase({
        monitorId,
        alertId,
        condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
      }),
      repo,
    )
    expect(error._tag).toBe("AlertConditionMismatchError")
    expect(monitors[0]?.alerts[0]?.condition).toEqual({ kind: "issue.escalating", sensitivity: 3 })
  })

  it("rejects changing the severity of a system monitor's alert", async () => {
    const { repo, monitors } = createFakeMonitorRepository([escalatingMonitor(true)])
    const error = await runError(updateMonitorAlertUseCase({ monitorId, alertId, severity: "low" }), repo)
    expect(error._tag).toBe("SystemMonitorForbiddenError")
    expect(monitors[0]?.alerts[0]?.severity).toBe("high")
  })

  it("rejects setting a condition on a system monitor's no-condition alert", async () => {
    const monitor = makeMonitor({ system: true, alerts: [makeAlert({ kind: "issue.new", condition: null })] })
    const { repo } = createFakeMonitorRepository([monitor])
    const error = await runError(
      updateMonitorAlertUseCase({ monitorId, alertId, condition: { kind: "issue.escalating", sensitivity: 2 } }),
      repo,
    )
    // issue.new can't carry an issue.escalating condition — caught as a kind mismatch.
    expect(error._tag).toBe("AlertConditionMismatchError")
  })

  it("rejects an unknown alert id", async () => {
    const { repo } = createFakeMonitorRepository([escalatingMonitor(false)])
    const error = await runError(
      updateMonitorAlertUseCase({
        monitorId,
        alertId: MonitorAlertId("z".repeat(24)),
        condition: { kind: "issue.escalating", sensitivity: 4 },
      }),
      repo,
    )
    expect(error._tag).toBe("MonitorAlertNotFoundError")
  })
})
