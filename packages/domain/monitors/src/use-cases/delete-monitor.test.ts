import { deleteMonitorUseCase, type Monitor, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { MonitorId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

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

const provide = (repo: MonitorRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

describe("deleteMonitorUseCase", () => {
  it("soft-deletes a user monitor", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ system: false })])
    const result = await Effect.runPromise(deleteMonitorUseCase({ id: monitorId }).pipe(Effect.provide(provide(repo))))
    expect(result.deletedAt).toBeInstanceOf(Date)
    expect(monitors[0]?.deletedAt).toBeInstanceOf(Date)
  })

  it("rejects deleting a system monitor and leaves it untouched", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ system: true })])
    const error = await Effect.runPromise(
      deleteMonitorUseCase({ id: monitorId }).pipe(Effect.flip, Effect.provide(provide(repo))),
    )
    expect(error._tag).toBe("SystemMonitorForbiddenError")
    expect(monitors[0]?.deletedAt).toBeNull()
  })
})
