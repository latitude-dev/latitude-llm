import { QueuePublishError } from "@domain/queue"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Monitor, MonitorAlert } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"
import { createFakeMonitorRepository } from "../testing/fake-monitor-repository.ts"
import { sweepSavedSearchMonitorsUseCase } from "./sweep-saved-search-monitors.ts"

const organizationId = OrganizationId("o".repeat(24))

const savedSearchAlert = (monitorId: string): MonitorAlert => ({
  id: `${monitorId}-alert`.padEnd(24, "0").slice(0, 24) as MonitorAlert["id"],
  monitorId: monitorId as MonitorAlert["monitorId"],
  kind: "savedSearch.match",
  source: { type: "savedSearch", id: "s".repeat(24) },
  condition: null,
  severity: "low",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
})

const monitor = (id: string, projectId: ProjectId, alerts: readonly MonitorAlert[]): Monitor => ({
  id: id.padEnd(24, "0").slice(0, 24) as Monitor["id"],
  organizationId,
  projectId,
  slug: `monitor-${id}`,
  name: `Monitor ${id}`,
  description: "",
  system: false,
  alerts,
  mutedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
})

const projectA = ProjectId("a".repeat(24))
const projectB = ProjectId("b".repeat(24))

const run = (monitors: readonly Monitor[], opts: { failOn?: ReadonlySet<string> } = {}) => {
  const { repo } = createFakeMonitorRepository(monitors)
  const published: Array<{ organizationId: string; projectId: string }> = []
  return Effect.runPromise(
    sweepSavedSearchMonitorsUseCase({
      publish: (payload) => {
        if (opts.failOn?.has(payload.projectId)) {
          return Effect.fail(new QueuePublishError({ cause: "boom", queue: "monitors" }))
        }
        published.push(payload)
        return Effect.void
      },
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, repo),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  ).then((result) => ({ result, published }))
}

describe("sweepSavedSearchMonitorsUseCase", () => {
  it("fans out one publish per distinct project holding active saved-search alerts", async () => {
    const { result, published } = await run([
      monitor("m1", projectA, [savedSearchAlert("m1")]),
      monitor("m2", projectA, [savedSearchAlert("m2")]),
      monitor("m3", projectB, [savedSearchAlert("m3")]),
    ])
    expect(result).toEqual({ attempted: 2, published: 2, failed: 0 })
    expect(published.map((p) => p.projectId).sort()).toEqual([projectA, projectB].sort())
  })

  it("tallies per-project publish failures without aborting the rest", async () => {
    const { result } = await run(
      [monitor("m1", projectA, [savedSearchAlert("m1")]), monitor("m3", projectB, [savedSearchAlert("m3")])],
      { failOn: new Set([projectA]) },
    )
    expect(result).toEqual({ attempted: 2, published: 1, failed: 1 })
  })
})
