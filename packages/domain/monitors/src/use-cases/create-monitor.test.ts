import { createMonitorUseCase, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = "s".repeat(24)

const provide = (repo: MonitorRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const runError = <A, E>(effect: Effect.Effect<A, E, SqlClient | MonitorRepository>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(provide(repo))))

const matchAlert = { kind: "savedSearch.match" as const, source: { type: "savedSearch" as const, id: savedSearchId } }

describe("createMonitorUseCase", () => {
  it("creates a non-system monitor with its alerts and a derived slug", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const monitor = await run(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "5xx spikes",
        description: "  Watch the error endpoints  ",
        alerts: [
          matchAlert,
          {
            kind: "savedSearch.threshold",
            source: { type: "savedSearch", id: savedSearchId },
            condition: { kind: "savedSearch.threshold", threshold: { mode: "absolute", count: 100 } },
          },
        ],
      }),
      repo,
    )

    expect(monitor).toMatchObject({
      slug: "5xx-spikes",
      name: "5xx spikes",
      system: false,
      description: "Watch the error endpoints",
    })
    expect(monitor.alerts.map((a) => a.kind)).toEqual(["savedSearch.match", "savedSearch.threshold"])
    expect(monitors).toHaveLength(1)
    expect(monitors[0]?.alerts).toHaveLength(2)
  })

  it("appends a unique suffix when the slug is already taken", async () => {
    const { repo } = createFakeMonitorRepository()
    const first = await run(
      createMonitorUseCase({ organizationId, projectId, name: "Latency", alerts: [matchAlert] }),
      repo,
    )
    const second = await run(
      createMonitorUseCase({ organizationId, projectId, name: "Latency", alerts: [matchAlert] }),
      repo,
    )
    expect(first.slug).toBe("latency")
    expect(second.slug).not.toBe("latency")
    expect(second.slug.startsWith("latency-")).toBe(true)
  })

  it("rejects an empty alert list", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(createMonitorUseCase({ organizationId, projectId, name: "Empty", alerts: [] }), repo)
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("alerts")
    expect(monitors).toHaveLength(0)
  })

  it("rejects a blank name", async () => {
    const { repo } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({ organizationId, projectId, name: "   ", alerts: [matchAlert] }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("name")
  })

  it("rejects an alert whose kind is not user-creatable", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Bad",
        alerts: [{ kind: "issue.new", source: { type: "issue", id: null } }],
      }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("kind")
    expect(monitors).toHaveLength(0)
  })
})
