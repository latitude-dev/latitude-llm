import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { cascadeSourceDeletionUseCase } from "./cascade-source-deletion.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const searchX = "x".repeat(24)
const searchY = "y".repeat(24)

const alert = (id: string, sourceId: string): MonitorAlert => ({
  id: id.padEnd(24, "0").slice(0, 24) as MonitorAlert["id"],
  monitorId: "m".repeat(24) as MonitorAlert["monitorId"],
  kind: "savedSearch.match",
  source: { type: "savedSearch", id: sourceId },
  condition: null,
  severity: "low",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
})

const monitor = (id: string, alerts: readonly MonitorAlert[]): Monitor => ({
  id: id.padEnd(24, "0").slice(0, 24) as Monitor["id"],
  organizationId,
  projectId,
  slug: `monitor-${id}`,
  name: `Monitor ${id}`,
  description: "",
  system: false,
  alerts: alerts.map((a) => ({ ...a, monitorId: id.padEnd(24, "0").slice(0, 24) as MonitorAlert["monitorId"] })),
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
})

describe("cascadeSourceDeletionUseCase", () => {
  it("soft-deletes matching alerts and prunes monitors left empty", async () => {
    const onlyX = monitor("m1", [alert("a1", searchX), alert("a2", searchX)])
    const mixed = monitor("m2", [alert("a3", searchX), alert("a4", searchY)])
    const { repo, monitors } = createFakeMonitorRepository([onlyX, mixed])

    const result = await Effect.runPromise(
      cascadeSourceDeletionUseCase({ sourceType: "savedSearch", sourceId: searchX }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MonitorRepository, repo),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
          ),
        ),
      ),
    )

    expect(result).toEqual({ deletedAlertCount: 3, deletedMonitorCount: 1 })
    // m1 (all alerts watched X) is pruned; m2 survives with its searchY alert.
    expect(monitors.find((m) => m.slug === "monitor-m1")?.deletedAt).not.toBeNull()
    const survivor = monitors.find((m) => m.slug === "monitor-m2")
    expect(survivor?.deletedAt).toBeNull()
    expect(survivor?.alerts.map((a) => a.source.id)).toEqual([searchY])
  })

  it("is a no-op when nothing watches the source", async () => {
    const { repo } = createFakeMonitorRepository([monitor("m1", [alert("a1", searchY)])])
    const result = await Effect.runPromise(
      cascadeSourceDeletionUseCase({ sourceType: "savedSearch", sourceId: searchX }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MonitorRepository, repo),
            Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
          ),
        ),
      ),
    )
    expect(result).toEqual({ deletedAlertCount: 0, deletedMonitorCount: 0 })
  })
})
