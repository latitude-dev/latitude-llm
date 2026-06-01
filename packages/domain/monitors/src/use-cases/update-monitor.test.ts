import { type Monitor, MonitorRepository, updateMonitorUseCase } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { MonitorId, OrganizationId, ProjectId, SqlClient, ValidationError } from "@domain/shared"
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
  slug: overrides.slug ?? "my-monitor",
  name: overrides.name ?? "My monitor",
  description: overrides.description ?? "",
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

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const runError = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(provide(repo))))

describe("updateMonitorUseCase", () => {
  it("rejects editing a system monitor", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ system: true })])
    const error = await runError(updateMonitorUseCase({ id: monitorId, name: "New" }), repo)
    expect(error._tag).toBe("SystemMonitorForbiddenError")
  })

  it("regenerates the slug when the name's normalised form changes", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ name: "My monitor", slug: "my-monitor" })])
    const result = await run(updateMonitorUseCase({ id: monitorId, name: "Payment errors" }), repo)
    expect(result.name).toBe("Payment errors")
    expect(result.slug).toBe("payment-errors")
    expect(monitors[0]?.slug).toBe("payment-errors")
  })

  it("keeps the slug stable on a cosmetic (case-only) rename", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ name: "My monitor", slug: "my-monitor" })])
    const result = await run(updateMonitorUseCase({ id: monitorId, name: "My Monitor" }), repo)
    expect(result.slug).toBe("my-monitor")
    expect(monitors[0]?.slug).toBe("my-monitor")
  })

  it("rejects an empty name", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor()])
    const error = await runError(updateMonitorUseCase({ id: monitorId, name: "   " }), repo)
    expect(error).toBeInstanceOf(ValidationError)
  })

  it("updates the description without touching the slug", async () => {
    const { repo, monitors } = createFakeMonitorRepository([makeMonitor({ slug: "my-monitor" })])
    const result = await run(updateMonitorUseCase({ id: monitorId, description: "Watch 5xx" }), repo)
    expect(result.description).toBe("Watch 5xx")
    expect(monitors[0]?.slug).toBe("my-monitor")
  })
})
