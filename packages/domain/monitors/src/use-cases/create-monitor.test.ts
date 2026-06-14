import { createMonitorUseCase, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { type SavedSearch, SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { OrganizationId, ProjectId, SavedSearchId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = "s".repeat(24)
const semanticSearchId = "z".repeat(24)
const at = new Date("2026-06-01T10:00:00.000Z")

const makeSavedSearch = (id: string, query: string | null): SavedSearch => ({
  id: SavedSearchId(id),
  organizationId,
  projectId,
  slug: `search-${id.slice(0, 4)}`,
  name: `Search ${id.slice(0, 4)}`,
  query,
  filterSet: {},
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

// One exact-match search (monitorable) and one with a semantic part (not).
const SEEDED_SEARCHES: readonly SavedSearch[] = [
  makeSavedSearch(savedSearchId, '"500 Internal Server Error"'),
  makeSavedSearch(semanticSearchId, 'checkout failed "500"'),
]

const provide = (repo: MonitorRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(
      SavedSearchRepository,
      SavedSearchRepository.of(createFakeSavedSearchRepository(SEEDED_SEARCHES).repository),
    ),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

type UseCaseContext = SqlClient | MonitorRepository | SavedSearchRepository

const run = <A, E>(effect: Effect.Effect<A, E, UseCaseContext>, repo: MonitorRepositoryShape) =>
  Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const runError = <A, E>(effect: Effect.Effect<A, E, UseCaseContext>, repo: MonitorRepositoryShape) =>
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

  it("rejects an alert watching a saved search with a semantic part", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Semantic watch",
        alerts: [{ kind: "savedSearch.match", source: { type: "savedSearch", id: semanticSearchId } }],
      }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("source")
    expect(monitors).toHaveLength(0)
  })

  it("rejects an alert watching a saved search that does not exist", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Ghost watch",
        alerts: [{ kind: "savedSearch.match", source: { type: "savedSearch", id: "g".repeat(24) } }],
      }),
      repo,
    )
    expect(error._tag).toBe("SavedSearchNotFoundError")
    expect(monitors).toHaveLength(0)
  })

  const toolTarget = {
    stream: "spans" as const,
    filterSet: { operation: [{ op: "eq" as const, value: "execute_tool" }] },
    query: null,
    savedSearchId: null,
    metric: { kind: "errorRate" as const },
  }

  it("creates a unified target-on-monitor with a sourceless alert", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const monitor = await run(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Tool errors",
        target: toolTarget,
        alerts: [
          {
            kind: "metric.threshold",
            condition: {
              kind: "metric.threshold",
              metric: { kind: "errorRate" },
              threshold: { mode: "absolute", value: 0.1 },
            },
          },
        ],
      }),
      repo,
    )
    expect(monitor.target).toEqual(toolTarget)
    expect(monitor.alerts[0]?.source).toBeNull()
    expect(monitor.alerts[0]?.kind).toBe("metric.threshold")
    expect(monitors).toHaveLength(1)
  })

  it("rejects a unified alert without a target", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "No target",
        alerts: [{ kind: "event.matched" }],
      }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("target")
    expect(monitors).toHaveLength(0)
  })

  it("rejects mixing a saved-search alert and a unified alert on one monitor", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Mixed kinds",
        target: toolTarget,
        alerts: [
          matchAlert,
          {
            kind: "metric.threshold",
            condition: { kind: "metric.threshold", metric: { kind: "errorRate" }, threshold: { mode: "absolute", value: 0.1 } },
          },
        ],
      }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("alerts")
    expect(monitors).toHaveLength(0)
  })

  it("rejects a legacy saved-search alert paired with a target", async () => {
    const { repo, monitors } = createFakeMonitorRepository()
    const error = await runError(
      createMonitorUseCase({ organizationId, projectId, name: "Mixed", target: toolTarget, alerts: [matchAlert] }),
      repo,
    )
    expect(error._tag).toBe("ValidationError")
    expect((error as { field: string }).field).toBe("target")
    expect(monitors).toHaveLength(0)
  })
})
