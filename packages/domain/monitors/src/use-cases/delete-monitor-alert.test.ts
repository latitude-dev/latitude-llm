import { deleteMonitorAlertUseCase, type Monitor, type MonitorAlert, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { MonitorAlertId, MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))
const alertA = MonitorAlertId("a".repeat(24))
const alertB = MonitorAlertId("b".repeat(24))
const at = new Date("2026-06-01T10:00:00.000Z")

const makeAlert = (id: MonitorAlert["id"]): MonitorAlert => ({
  id,
  monitorId,
  kind: "savedSearch.match",
  source: { type: "savedSearch", id: "s".repeat(24) },
  condition: null,
  severity: "low",
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

describe("deleteMonitorAlertUseCase", () => {
  it("soft-deletes one alert when the monitor has more than one", async () => {
    const { repo, monitors } = createFakeMonitorRepository([
      makeMonitor({ alerts: [makeAlert(alertA), makeAlert(alertB)] }),
    ])
    const result = await run(deleteMonitorAlertUseCase({ monitorId, alertId: alertA }), repo)
    expect(result.alerts.map((a) => a.id)).toEqual([alertB])
    expect(monitors[0]?.alerts.map((a) => a.id)).toEqual([alertB])
  })

  it("refuses to delete the monitor's last alert", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ alerts: [makeAlert(alertA)] })])
    const error = await runError(deleteMonitorAlertUseCase({ monitorId, alertId: alertA }), repo)
    expect(error._tag).toBe("LastMonitorAlertError")
    expect(monitors[0]?.alerts).toHaveLength(1)
  })

  it("rejects an unknown alert id", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ alerts: [makeAlert(alertA), makeAlert(alertB)] })])
    const error = await runError(
      deleteMonitorAlertUseCase({ monitorId, alertId: MonitorAlertId("z".repeat(24)) }),
      repo,
    )
    expect(error._tag).toBe("MonitorAlertNotFoundError")
  })

  it("rejects deleting an alert from a system monitor", async () => {
    const { repo } = createFakeMonitorRepository([
      makeMonitor({ system: true, alerts: [makeAlert(alertA), makeAlert(alertB)] }),
    ])
    const error = await runError(deleteMonitorAlertUseCase({ monitorId, alertId: alertA }), repo)
    expect(error._tag).toBe("SystemMonitorForbiddenError")
  })
})
