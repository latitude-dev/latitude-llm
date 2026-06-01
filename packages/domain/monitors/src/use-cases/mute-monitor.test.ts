import {
  type Monitor,
  MonitorRepository,
  type MonitorRepositoryShape,
  muteMonitorUseCase,
  unmuteMonitorUseCase,
} from "@domain/monitors"
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
  mutedAt: overrides.mutedAt ?? null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const buildRepo = (monitor: Monitor) => {
  const calls = { setMuted: [] as { id: string; mutedAt: Date | null }[] }
  const repo: MonitorRepositoryShape = {
    findById: (id) =>
      id === monitor.id ? Effect.succeed(monitor) : Effect.fail(new NotFoundError({ entity: "Monitor", id })),
    findBySlug: () => Effect.die("findBySlug not used"),
    list: () => Effect.die("list not used"),
    provisionSystemMonitors: () => Effect.die("provisionSystemMonitors not used"),
    setMuted: (input) => {
      calls.setMuted.push(input)
      return Effect.void
    },
    softDelete: () => Effect.die("softDelete not used"),
    updateMetadata: () => Effect.die("updateMetadata not used"),
    updateAlert: () => Effect.die("updateAlert not used"),
    countActiveBySlug: () => Effect.die("countActiveBySlug not used"),
  }
  return { repo, calls }
}

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
    const { repo, calls } = buildRepo(makeMonitor({ system: true }))
    const result = await run(muteMonitorUseCase({ id: monitorId }), repo)
    expect(result.mutedAt).toBeInstanceOf(Date)
    expect(calls.setMuted[0]?.mutedAt).toBeInstanceOf(Date)
  })

  it("clears mutedAt on unmute", async () => {
    const { repo, calls } = buildRepo(makeMonitor({ mutedAt: at }))
    const result = await run(unmuteMonitorUseCase({ id: monitorId }), repo)
    expect(result.mutedAt).toBeNull()
    expect(calls.setMuted[0]?.mutedAt).toBeNull()
  })
})
