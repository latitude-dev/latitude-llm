import { OutboxEventWriter, type OutboxEventWriterShape, type OutboxWriteEvent } from "@domain/events"
import { IncidentRepository, type IncidentRepositoryShape } from "@domain/incidents"
import { type Monitor, MonitorRepository, updateMonitorUseCase } from "@domain/monitors"
import { createFakeMonitorRepository } from "@domain/monitors/testing"
import { SavedSearchRepository } from "@domain/saved-searches"
import { createFakeSavedSearchRepository } from "@domain/saved-searches/testing"
import { AlertIncidentId, MonitorId, OrganizationId, ProjectId, SqlClient, ValidationError } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { MonitorRepositoryShape } from "../ports/monitor-repository.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))
const monitorId = MonitorId("m".repeat(24))
const at = new Date("2026-06-01T10:00:00.000Z")
const target = {
  type: "user",
  id: null,
  kind: "user",
  stream: "traces",
  query: null,
  savedSearchId: null,
  metric: { kind: "count" },
} as const

const makeMonitor = (overrides: Partial<Monitor> = {}): Monitor => ({
  id: monitorId,
  organizationId,
  projectId,
  slug: overrides.slug ?? "my-monitor",
  name: overrides.name ?? "My monitor",
  description: overrides.description ?? "",
  system: overrides.system ?? false,
  target: overrides.target ?? target,
  rule: overrides.rule ?? { trigger: "match", config: {}, severity: "low" },
  mutedAt: null,
  deletedAt: null,
  createdAt: at,
  updatedAt: at,
})

const createIncidentRepo = (openIncidentId: AlertIncidentId | null = null) => {
  const closeOpenCalls: Parameters<IncidentRepositoryShape["closeOpen"]>[0][] = []
  const repo: IncidentRepositoryShape = {
    insert: () => Effect.void,
    findById: () => Effect.die("findById not used"),
    findOpen: () => Effect.succeed(null),
    closeOpen: (input) =>
      Effect.sync(() => {
        closeOpenCalls.push(input)
        return openIncidentId
      }),
    updateExitDwell: () => Effect.void,
    setEndedAt: () => Effect.void,
    closeById: () => Effect.succeed(null),
    listByProjectId: () => Effect.succeed([]),
    listOpenBySourceType: () => Effect.succeed([]),
    listByMonitorId: () => Effect.die("listByMonitorId not used"),
    statsByMonitorId: () => Effect.die("statsByMonitorId not used"),
  }
  return { repo, closeOpenCalls }
}

const createOutbox = () => {
  const events: OutboxWriteEvent[] = []
  return {
    events,
    writer: OutboxEventWriter.of({
      write: (event) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
  }
}

const provide = (
  repo: MonitorRepositoryShape,
  incidentRepo: IncidentRepositoryShape = createIncidentRepo().repo,
  outbox = createOutbox().writer,
) =>
  Layer.mergeAll(
    Layer.succeed(MonitorRepository, MonitorRepository.of(repo)),
    Layer.succeed(SavedSearchRepository, SavedSearchRepository.of(createFakeSavedSearchRepository().repository)),
    Layer.succeed(IncidentRepository, IncidentRepository.of(incidentRepo)),
    Layer.succeed(OutboxEventWriter, outbox),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
  )

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    SqlClient | MonitorRepository | SavedSearchRepository | IncidentRepository | OutboxEventWriter
  >,
  repo: MonitorRepositoryShape,
  incidentRepo?: IncidentRepositoryShape,
  outbox?: OutboxEventWriterShape,
) => Effect.runPromise(effect.pipe(Effect.provide(provide(repo, incidentRepo, outbox))))

const runError = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    SqlClient | MonitorRepository | SavedSearchRepository | IncidentRepository | OutboxEventWriter
  >,
  repo: MonitorRepositoryShape,
) => Effect.runPromise(effect.pipe(Effect.flip, Effect.provide(provide(repo))))

describe("updateMonitorUseCase", () => {
  it("rejects editing a system monitor name", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ system: true })])
    const error = await runError(updateMonitorUseCase({ id: monitorId, name: "New" }), repo)
    expect(error._tag).toBe("SystemMonitorForbiddenError")
  })

  it("allows editing severity on a system monitor", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ system: true, rule: { trigger: "match", config: {}, severity: "low" } })])
    const result = await run(updateMonitorUseCase({ id: monitorId, rule: { trigger: "match", config: {}, severity: "high" } }), repo)
    expect(result.rule.severity).toBe("high")
  })

  it("rejects editing monitor conditions on a system monitor", async () => {
    const escalatingRule = {
      trigger: "escalating" as const,
      severity: "high" as const,
      config: {
        metric: { kind: "count" as const },
        condition: {
          trigger: "escalating" as const,
          metric: { kind: "count" as const },
          threshold: { mode: "expected" as const, sensitivity: 3 },
        },
      },
    }
    const { repo } = createFakeMonitorRepository([makeMonitor({ system: true, rule: escalatingRule })])
    const error = await runError(
      updateMonitorUseCase({
        id: monitorId,
        rule: {
          ...escalatingRule,
          config: {
            ...escalatingRule.config,
            condition: {
              ...escalatingRule.config.condition,
              threshold: { mode: "expected" as const, sensitivity: 5 },
            },
          },
        },
      }),
      repo,
    )
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

  it("rejects unsupported escalating metric and threshold shapes on create-like payloads", async () => {
    const escalatingRule = {
      trigger: "escalating" as const,
      severity: "high" as const,
      config: {
        metric: { kind: "count" as const },
        condition: { trigger: "escalating" as const, metric: { kind: "count" as const } },
      },
    }
    const { repo } = createFakeMonitorRepository([makeMonitor({ rule: escalatingRule })])

    const metricError = await runError(
      updateMonitorUseCase({
        id: monitorId,
        target: { ...target, metric: { kind: "avg", field: "duration" } },
      }),
      repo,
    )
    expect(metricError).toBeInstanceOf(ValidationError)
    expect(metricError.message).toBe("Monitor target cannot be changed after creation")

    const thresholdError = await runError(
      updateMonitorUseCase({
        id: monitorId,
        rule: {
          ...escalatingRule,
          config: {
            ...escalatingRule.config,
            condition: {
              trigger: "escalating" as const,
              metric: { kind: "count" as const },
              threshold: { mode: "absolute" as const, value: 10 },
            },
          },
        },
      }),
      repo,
    )
    expect(thresholdError).toBeInstanceOf(ValidationError)
    expect(thresholdError.message).toBe("Monitor conditions cannot be changed after creation")
  })

  it("rejects target metric edits that would make an escalating monitor inert", async () => {
    const escalatingRule = {
      trigger: "escalating" as const,
      severity: "high" as const,
      config: {
        metric: { kind: "count" as const },
        condition: { trigger: "escalating" as const, metric: { kind: "count" as const } },
      },
    }
    const { repo } = createFakeMonitorRepository([makeMonitor({ rule: escalatingRule })])

    const error = await runError(
      updateMonitorUseCase({
        id: monitorId,
        target: { ...target, metric: { kind: "avg", field: "duration" } },
      }),
      repo,
    )

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Monitor target cannot be changed after creation")
  })

  it("rejects trigger changes after creation", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor()])
    const error = await runError(
      updateMonitorUseCase({
        id: monitorId,
        rule: {
          trigger: "threshold",
          severity: "medium",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 2 },
            },
          },
        },
      }),
      repo,
    )
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Monitor trigger cannot be changed after creation")
  })

  it("rejects condition changes after creation", async () => {
    const { repo } = createFakeMonitorRepository([
      makeMonitor({
        rule: {
          trigger: "threshold",
          severity: "medium",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 2 },
            },
          },
        },
      }),
    ])
    const error = await runError(
      updateMonitorUseCase({
        id: monitorId,
        rule: {
          trigger: "threshold",
          severity: "medium",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 5 },
            },
          },
        },
      }),
      repo,
    )
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Monitor conditions cannot be changed after creation")
  })

  it("allows severity changes without touching target query", async () => {
    const { repo } = createFakeMonitorRepository([
      makeMonitor({
        target: { ...target, query: "payment failed", filterSet: { userId: [{ op: "eq", value: "user-1" }] } },
        rule: {
          trigger: "threshold",
          severity: "low",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 2 },
            },
          },
        },
      }),
    ])

    const result = await run(
      updateMonitorUseCase({
        id: monitorId,
        rule: {
          trigger: "threshold",
          severity: "medium",
          config: {
            metric: { kind: "count" },
            condition: {
              trigger: "threshold",
              metric: { kind: "count" },
              threshold: { mode: "absolute", value: 2 },
            },
          },
        },
      }),
      repo,
    )

    expect(result.rule.severity).toBe("medium")
    expect(result.target.query).toBe("payment failed")
  })

  it("rejects target edits after creation", async () => {
    const { repo } = createFakeMonitorRepository([makeMonitor({ target: { ...target, query: "old query" } })])

    const error = await runError(
      updateMonitorUseCase({
        id: monitorId,
        target: { ...target, query: "new query", filterSet: { userId: [{ op: "eq", value: "user-2" }] } },
      }),
      repo,
    )

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.message).toBe("Monitor target cannot be changed after creation")
  })
})
