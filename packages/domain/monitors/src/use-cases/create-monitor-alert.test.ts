import {
  buildMonitorAlert,
  createMonitorAlertUseCase,
  type Monitor,
  type MonitorAlert,
  MonitorRepository,
} from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { MonitorAlertId, MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))
const savedSearchId = "s".repeat(24)
const at = new Date("2026-06-01T10:00:00.000Z")

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

const seedAlert: MonitorAlert = {
  id: MonitorAlertId("a".repeat(24)),
  monitorId,
  kind: "savedSearch.match",
  source: { type: "savedSearch", id: savedSearchId },
  condition: null,
  severity: "low",
  createdAt: at,
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
})

describe("createMonitorAlertUseCase", () => {
  it("adds a saved-search alert to a user monitor", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ alerts: [seedAlert] })])
    const result = await run(
      createMonitorAlertUseCase({
        monitorId,
        kind: "savedSearch.threshold",
        source: { type: "savedSearch", id: savedSearchId },
        condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
      }),
      repo,
    )
    expect(result.alerts.length).toBe(2)
    expect(monitors[0]?.alerts.at(-1)).toMatchObject({ kind: "savedSearch.threshold", severity: "medium" })
  })

  it("rejects an issue.* kind (not user-creatable)", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ alerts: [seedAlert] })])
    const error = await runError(
      createMonitorAlertUseCase({ monitorId, kind: "issue.regressed", source: { type: "issue", id: null } }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("kind")
  })

  it("rejects a kind/source-type mismatch", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ alerts: [seedAlert] })])
    const error = await runError(
      createMonitorAlertUseCase({ monitorId, kind: "savedSearch.match", source: { type: "issue", id: savedSearchId } }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("source")
  })

  it("rejects a saved-search alert without a source id", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ alerts: [seedAlert] })])
    const error = await runError(
      createMonitorAlertUseCase({ monitorId, kind: "savedSearch.match", source: { type: "savedSearch", id: null } }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("source")
  })

  it("rejects a condition whose kind does not match the alert kind", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ alerts: [seedAlert] })])
    const error = await runError(
      createMonitorAlertUseCase({
        monitorId,
        kind: "savedSearch.threshold",
        source: { type: "savedSearch", id: savedSearchId },
        condition: {
          kind: "savedSearch.escalating",
          threshold: { mode: "absolute", count: 1 },
          window: { minutes: 5 },
        },
      }),
      repo,
    )
    expect(error._tag).toBe("AlertConditionMismatchError")
  })

  it("rejects adding an alert to a system monitor", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ system: true, alerts: [seedAlert] })])
    const error = await runError(
      createMonitorAlertUseCase({
        monitorId,
        kind: "savedSearch.match",
        source: { type: "savedSearch", id: savedSearchId },
      }),
      repo,
    )
    expect(error._tag).toBe("SystemMonitorForbiddenError")
  })
})
