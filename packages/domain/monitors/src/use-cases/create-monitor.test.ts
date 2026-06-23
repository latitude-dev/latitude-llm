import { createMonitorUseCase, MonitorRepository } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import type { SavedSearch } from "@domain/saved-searches"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { OrganizationId, ProjectId, SavedSearchId, SqlClient, ValidationError } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const savedSearchId = SavedSearchId("s".repeat(24))
const savedSearch: SavedSearch = {
  id: savedSearchId,
  organizationId,
  projectId,
  slug: "payment-failures",
  name: "Payment failures",
  query: '"payment"',
  filterSet: {},
  deletedAt: null,
  createdAt: new Date("2026-06-20T00:00:00.000Z"),
  updatedAt: new Date("2026-06-20T00:00:00.000Z"),
}

const provide = (repo: MonitorRepositoryShape) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(
      SavedSearchRepository,
      SavedSearchRepository.of(createFakeSavedSearchRepository([savedSearch]).repository),
    ),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(
  effect: Effect.Effect<A, E, SqlClient | MonitorRepository | SavedSearchRepository>,
  repo: MonitorRepositoryShape,
) => Effect.runPromise(effect.pipe(Effect.provide(provide(repo))))

const runError = <A, E>(
  effect: Effect.Effect<A, E, SqlClient | MonitorRepository | SavedSearchRepository>,
  repo: MonitorRepositoryShape,
) => Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(provide(repo))))

describe("createMonitorUseCase", () => {
  it("creates a collapsed monitor with inline target, rule, config, and severity", async () => {
    const { repo, monitors } = createFakeMonitorRepository()

    const result = await run(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Payment failures",
        description: "Watch saved search matches",
        target: { type: "savedSearch", id: savedSearchId, filterSet: { status: [{ op: "eq", value: "error" }] } },
        rule: {
          trigger: "threshold",
          severity: "high",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 3 },
              direction: "above",
            },
          },
        },
      }),
      repo,
    )

    expect(result).toMatchObject({
      organizationId,
      projectId,
      slug: "payment-failures",
      name: "Payment failures",
      description: "Watch saved search matches",
      system: false,
      target: {
        type: "savedSearch",
        id: savedSearchId,
        kind: "savedSearch",
        stream: "traces",
        query: null,
        savedSearchId,
        metric: { kind: "count" },
      },
      rule: {
        trigger: "threshold",
        severity: "high",
      },
      mutedAt: null,
      deletedAt: null,
    })
    expect(monitors).toHaveLength(1)
    expect(monitors[0]).toEqual(result)
  })

  it("rejects match monitors with conditions", async () => {
    const { repo } = createFakeMonitorRepository()

    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Match",
        target: { type: "user", id: null },
        rule: {
          trigger: "match",
          severity: "medium",
          config: {
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 1 },
            },
          },
        },
      }),
      repo,
    )

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Match monitors cannot define a condition")
  })

  it("rejects conditions whose trigger does not match the monitor rule", async () => {
    const { repo } = createFakeMonitorRepository()

    const error = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Threshold",
        target: { type: "user", id: null },
        rule: {
          trigger: "threshold",
          severity: "medium",
          config: {
            condition: {
              trigger: "escalating",
              metric: { kind: "count" },
            },
          },
        },
      }),
      repo,
    )

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Condition trigger must match monitor trigger")
  })

  it("rejects unsupported escalating metric and threshold shapes", async () => {
    const { repo } = createFakeMonitorRepository()

    const metricError = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Escalating average",
        target: { type: "user", id: null },
        rule: {
          trigger: "escalating",
          severity: "high",
          config: {
            metric: { kind: "avg", field: "duration" },
            condition: { trigger: "escalating", metric: { kind: "avg", field: "duration" } },
          },
        },
      }),
      repo,
    )
    expect(metricError).toBeInstanceOf(ValidationError)
    expect(metricError.message).toBe("Escalating monitors only support count metrics")

    const thresholdError = await runError(
      createMonitorUseCase({
        organizationId,
        projectId,
        name: "Escalating absolute",
        target: { type: "user", id: null },
        rule: {
          trigger: "escalating",
          severity: "high",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "escalating",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 10 },
            },
          },
        },
      }),
      repo,
    )
    expect(thresholdError).toBeInstanceOf(ValidationError)
    expect(thresholdError.message).toBe("Escalating monitors only support expected thresholds")
  })
})
