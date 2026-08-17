import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type Incident, IncidentRepository, type IncidentRepositoryShape } from "@domain/incidents"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import {
  ChSqlClient,
  OrganizationId,
  ProjectId,
  type ProjectSettings,
  SettingsReader,
  SignalId,
  SqlClient,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Signal } from "../entities/signal.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { createFakeSignalRepository } from "../testing/fake-signal-repository.ts"
import { checkSignalEscalationUseCase } from "./check-signal-escalation.ts"

const organizationId = OrganizationId("oooooooooooooooooooooooo")
const projectId = ProjectId("pppppppppppppppppppppppp")
const signalId = SignalId("ssssssssssssssssssssssss")

const makeSignal = (overrides: Partial<Signal> = {}): Signal => {
  const now = new Date("2026-05-07T10:00:00.000Z")
  return {
    id: signalId,
    organizationId,
    projectId,
    slug: "api-token-leak",
    name: "API token leak",
    description: "The assistant leaks API tokens.",
    source: "annotation",
    origin: "system",
    filters: null,
    assigneeId: null,
    priority: null,
    centroid: {
      base: [1, 0],
      mass: 1,
      model: "test",
      decay: 1,
      weights: { annotation: 1, custom: 0, evaluation: 0 },
    },
    clusteredAt: now,
    promotedAt: now,
    resolvedAt: null,
    ignoredAt: null,
    regressedAt: null,
    mutedAt: null,
    deletedAt: null,
    createdAt: new Date("2026-04-01T10:00:00.000Z"),
    updatedAt: now,
    ...overrides,
  }
}

const createFakeOutboxEventWriter = () => {
  const events: OutboxWriteEvent[] = []
  const service = OutboxEventWriter.of({
    write: (event) =>
      Effect.sync(() => {
        events.push(event)
      }),
  })
  return { events, service }
}

const createFakeIncidentRepository = (seed: readonly Incident[] = []) => {
  const incidents: Incident[] = [...seed]
  const repository: IncidentRepositoryShape = {
    insert: (incident) =>
      Effect.sync(() => {
        incidents.push(incident)
      }),
    findOpen: ({ sourceType, sourceId }) =>
      Effect.sync(
        () =>
          incidents.find(
            (incident) =>
              incident.sourceType === sourceType && incident.sourceId === sourceId && incident.endedAt === null,
          ) ?? null,
      ),
    updateExitDwell: ({ id, exitEligibleSince }) =>
      Effect.sync(() => {
        const index = incidents.findIndex((incident) => incident.id === id)
        const current = incidents[index]
        if (current) incidents[index] = { ...current, exitEligibleSince }
      }),
    closeOpen: () => Effect.succeed(null),
    setEndedAt: () => Effect.succeed(null),
    findById: () => Effect.die("findById not used"),
    closeById: () => Effect.die("closeById not used"),
    listByProjectId: () => Effect.die("listByProjectId not used"),
    listOpenBySourceType: () => Effect.die("listOpenBySourceType not used"),
    listByMonitorId: () => Effect.die("listByMonitorId not used"),
    statsByMonitorId: () => Effect.die("statsByMonitorId not used"),
  }
  return { incidents, repository }
}

const ENTRY_SERIES = {
  escalationSignalsBySignals: () =>
    Effect.succeed([
      {
        signalId,
        recent1h: 80,
        recent6h: 360,
        recent24h: 900,
        expected1h: 5,
        expected6hPerHour: 5,
        stddev1h: 1,
        stddev6hPerHour: 1,
        samplesCount: 8,
      },
    ]),
}

const runUseCase = async (input: {
  readonly signal: Signal
  readonly isEscalating?: boolean
  readonly projectSettings?: ProjectSettings | null
  readonly series?: Parameters<typeof createFakeScoreAnalyticsRepository>[0]
}) => {
  const outbox = createFakeOutboxEventWriter()
  const signals = createFakeSignalRepository(
    [input.signal],
    {},
    { lifecycle: new Map([[input.signal.id, { isEscalating: input.isEscalating ?? false }]]) },
  )
  const scoreAnalytics = createFakeScoreAnalyticsRepository(input.series)
  const incidents = createFakeIncidentRepository()
  const settingsReader = SettingsReader.of({
    getProjectSettings: () => Effect.succeed(input.projectSettings ?? null),
    getOrganizationSettings: () => Effect.succeed(null),
  })

  const layer = Layer.mergeAll(
    Layer.succeed(SignalRepository, signals.repository),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalytics.repository),
    Layer.succeed(OutboxEventWriter, outbox.service),
    Layer.succeed(IncidentRepository, incidents.repository),
    Layer.succeed(SettingsReader, settingsReader),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId })),
  )

  const result = await Effect.runPromise(
    checkSignalEscalationUseCase({ organizationId, projectId, signalId }).pipe(Effect.provide(layer)),
  )

  return { result, events: outbox.events, incidents: incidents.incidents, issues: signals.issues }
}

describe("checkSignalEscalationUseCase", () => {
  it("does not read series or emit events for ignored signals", async () => {
    const { result, events } = await runUseCase({
      signal: makeSignal({ ignoredAt: new Date("2026-05-07T09:00:00.000Z") }),
      series: {
        escalationSignalsBySignals: () => Effect.die("ignored signal should not read analytics"),
      },
    })

    expect(result).toEqual({ transition: "none", currentlyEscalating: false })
    expect(events).toEqual([])
  })

  it("does not read series or open an incident for an unpromoted signal", async () => {
    const { result, events } = await runUseCase({
      // Entry-tripping series on purpose: an incident here would announce a
      // signal the promotion gate has not released yet.
      signal: makeSignal({ promotedAt: null }),
      series: {
        escalationSignalsBySignals: () => Effect.die("candidate should not read analytics"),
      },
    })

    expect(result).toEqual({ transition: "none", currentlyEscalating: false })
    expect(events).toEqual([])
  })

  it("still evaluates an unpromoted signal that is already escalating, so its incident can close", async () => {
    // Should be unreachable, and that is exactly why it is not an early return:
    // the duration timeout exits from inside the engine, so skipping here would
    // strand the incident forever.
    // Entry-shaped series, so if the fall-through could announce, it would.
    const { result, events } = await runUseCase({
      signal: makeSignal({ promotedAt: null }),
      isEscalating: true,
      series: ENTRY_SERIES,
    })

    expect(result.transition).not.toBe("entered")
    expect(events.map((event) => event.eventName)).not.toContain("SignalEscalated")
  })

  it("still checks muted signals — mute gates notification fan-out, not incidents", async () => {
    const { result, events } = await runUseCase({
      signal: makeSignal({ mutedAt: new Date("2026-05-07T09:00:00.000Z") }),
      series: ENTRY_SERIES,
    })

    expect(result).toEqual({ transition: "entered", currentlyEscalating: true })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventName: "SignalEscalated" })
  })

  it("reopens a resolved signal when escalation enters", async () => {
    const resolvedAt = new Date("2026-05-01T00:00:00.000Z")
    const { result, events, issues } = await runUseCase({
      signal: makeSignal({ resolvedAt }),
      series: ENTRY_SERIES,
    })

    expect(result).toEqual({ transition: "entered", currentlyEscalating: true })
    expect(issues.get(signalId)?.resolvedAt).toBeNull()
    expect(issues.get(signalId)?.regressedAt).not.toBeNull()
    // The escalation notification announces the recurrence; no separate
    // SignalRegressed event on this path.
    expect(events.map((event) => event.eventName)).toEqual(["SignalEscalated"])
  })

  it("enters escalation through the shared engine using project sensitivity", async () => {
    const { result, events } = await runUseCase({
      signal: makeSignal(),
      projectSettings: { escalation: { sensitivity: 2 } },
      series: ENTRY_SERIES,
    })

    expect(result).toEqual({ transition: "entered", currentlyEscalating: true })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "SignalEscalated",
      aggregateType: "issue",
      aggregateId: signalId,
      organizationId,
      payload: {
        organizationId,
        projectId,
        signalId,
      },
    })
    expect(events[0]?.payload).toMatchObject({
      entrySignals: {
        kShort: 2,
        kLong: 1,
        entryCount24h: 900,
      },
    })
  })
})
