import { type Monitor, MonitorRepository, muteMonitorUseCase, unmuteMonitorUseCase } from "@domain/monitors"
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
  mutedAt: overrides.mutedAt ?? null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
          Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
        ),
      ),
    ),
  )

describe("muteMonitorUseCase / unmuteMonitorUseCase", () => {
  it("sets mutedAt on mute (user or system monitor)", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ system: true })])
    const result = await run(muteMonitorUseCase({ id: monitorId }), repo)
    expect(result.mutedAt).toBeInstanceOf(Date)
    expect(monitors[0]?.mutedAt).toBeInstanceOf(Date)
  })

  it("clears mutedAt on unmute", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ mutedAt: at })])
    const result = await run(unmuteMonitorUseCase({ id: monitorId }), repo)
    expect(result.mutedAt).toBeNull()
    expect(monitors[0]?.mutedAt).toBeNull()
  })
})
