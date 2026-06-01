import {
  type Monitor,
  type MonitorAlert,
  MonitorRepository,
  type MonitorRepositoryShape,
  updateMonitorAlertUseCase,
} from "@domain/monitors"
import { MonitorAlertId, MonitorId, NotFoundError, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

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

const buildRepo = (monitor: Monitor) => {
  const calls = {
    updateAlert: [] as { alertId: string; sourceId: string | null; condition: unknown; severity: string }[],
  }
  const repo: MonitorRepositoryShape = {
    findById: (id) =>
      id === monitor.id ? Effect.succeed(monitor) : Effect.fail(new NotFoundError({ entity: "Monitor", id })),
    findBySlug: () => Effect.die("findBySlug not used"),
    list: () => Effect.die("list not used"),
    provisionSystemMonitors: () => Effect.die("provisionSystemMonitors not used"),
    setMuted: () => Effect.die("setMuted not used"),
    softDelete: () => Effect.die("softDelete not used"),
    updateMetadata: () => Effect.die("updateMetadata not used"),
    updateAlert: (input) => {
      calls.updateAlert.push(input)
      return Effect.void
    },
    countActiveBySlug: () => Effect.die("countActiveBySlug not used"),
  }
  return { repo, calls }
}

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
    const { repo, calls } = buildRepo(escalatingMonitor(true))
    const result = await run(
      updateMonitorAlertUseCase({ monitorId, alertId, condition: { kind: "issue.escalating", sensitivity: 5 } }),
      repo,
    )
    expect(result.alerts[0]?.condition).toEqual({ kind: "issue.escalating", sensitivity: 5 })
    expect(calls.updateAlert[0]?.condition).toEqual({ kind: "issue.escalating", sensitivity: 5 })
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
    const { repo, calls } = buildRepo(monitor)
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
    expect(calls.updateAlert[0]).toMatchObject({ sourceId: "t".repeat(24), severity: "high" })
  })

  it("rejects a condition whose kind does not match the alert", async () => {
    const { repo, calls } = buildRepo(escalatingMonitor(false))
    const error = await runError(
      updateMonitorAlertUseCase({
        monitorId,
        alertId,
        condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
      }),
      repo,
    )
    expect(error._tag).toBe("AlertConditionMismatchError")
    expect(calls.updateAlert).toEqual([])
  })

  it("rejects changing the severity of a system monitor's alert", async () => {
    const { repo, calls } = buildRepo(escalatingMonitor(true))
    const error = await runError(updateMonitorAlertUseCase({ monitorId, alertId, severity: "low" }), repo)
    expect(error._tag).toBe("SystemMonitorForbiddenError")
    expect(calls.updateAlert).toEqual([])
  })

  it("rejects setting a condition on a system monitor's no-condition alert", async () => {
    const monitor = makeMonitor({ system: true, alerts: [makeAlert({ kind: "issue.new", condition: null })] })
    const { repo } = buildRepo(monitor)
    const error = await runError(
      updateMonitorAlertUseCase({ monitorId, alertId, condition: { kind: "issue.escalating", sensitivity: 2 } }),
      repo,
    )
    // issue.new can't carry an issue.escalating condition — caught as a kind mismatch.
    expect(error._tag).toBe("AlertConditionMismatchError")
  })

  it("rejects an unknown alert id", async () => {
    const { repo } = buildRepo(escalatingMonitor(false))
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
