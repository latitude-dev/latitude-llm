import { deleteMonitorUseCase, type Monitor, MonitorRepository, type MonitorRepositoryShape } from "@domain/monitors"
import { MonitorId, NotFoundError, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))
const at = new Date("2026-06-01T10:00:00.000Z")

const makeMonitor = (overrides: Partial<Monitor> = {}): Monitor => ({
  id: monitorId,
  organizationId,
  projectId,
  slug: "my-monitor",
  name: "My monitor",
  description: "",
  system: overrides.system ?? false,
  alerts: [],
  mutedAt: null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const buildRepo = (monitor: Monitor) => {
  const calls = { softDelete: [] as string[] }
  const repo: MonitorRepositoryShape = {
    findById: (id) =>
      id === monitor.id ? Effect.succeed(monitor) : Effect.fail(new NotFoundError({ entity: "Monitor", id })),
    findBySlug: () => Effect.die("findBySlug not used"),
    list: () => Effect.die("list not used"),
    provisionSystemMonitors: () => Effect.die("provisionSystemMonitors not used"),
    setMuted: () => Effect.die("setMuted not used"),
    softDelete: (id) => {
      calls.softDelete.push(id)
      return Effect.void
    },
    updateMetadata: () => Effect.die("updateMetadata not used"),
    updateAlert: () => Effect.die("updateAlert not used"),
    countActiveBySlug: () => Effect.die("countActiveBySlug not used"),
  }
  return { repo, calls }
}

const provide = (repo: MonitorRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

describe("deleteMonitorUseCase", () => {
  it("soft-deletes a user monitor", async () => {
    const { repo, calls } = buildRepo(makeMonitor({ system: false }))
    const result = await Effect.runPromise(deleteMonitorUseCase({ id: monitorId }).pipe(Effect.provide(provide(repo))))
    expect(result.deletedAt).toBeInstanceOf(Date)
    expect(calls.softDelete).toEqual([monitorId])
  })

  it("rejects deleting a system monitor and does not call the repo", async () => {
    const { repo, calls } = buildRepo(makeMonitor({ system: true }))
    const error = await Effect.runPromise(
      deleteMonitorUseCase({ id: monitorId }).pipe(Effect.flip, Effect.provide(provide(repo))),
    )
    expect(error._tag).toBe("SystemMonitorForbiddenError")
    expect(calls.softDelete).toEqual([])
  })
})
