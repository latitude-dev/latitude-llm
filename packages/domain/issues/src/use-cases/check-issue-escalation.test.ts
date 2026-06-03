import {
  type AlertIncident,
  AlertIncidentRepository,
  type AlertIncidentRepositoryShape,
  type EntrySignalsSnapshot,
  type UpdateAlertIncidentExitDwellInput,
} from "@domain/alerts"
import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type IssueEscalationSignals, ScoreAnalyticsRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository } from "@domain/scores/testing"
import {
  AlertIncidentId,
  ChSqlClient,
  IssueId,
  OrganizationId,
  ProjectId as ProjectIdValue,
  type ProjectSettings,
  SettingsReader,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { createFakeChSqlClient } from "@domain/shared/testing"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ESCALATION_EXIT_DWELL_MS, ESCALATION_MAX_DURATION_MS } from "../constants.ts"
import type { Issue } from "../entities/issue.ts"
import { createIssueCentroid } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { createFakeIssueRepository } from "../testing/fake-issue-repository.ts"
import { checkIssueEscalationUseCase } from "./check-issue-escalation.ts"

const organizationId = "oooooooooooooooooooooooo"
const projectId = "pppppppppppppppppppppppp"
const issueId = "iiiiiiiiiiiiiiiiiiiiiiii"

const makeIssue = (overrides?: Partial<Issue>): Issue => ({
  id: IssueId(issueId),
  slug: "test-issue",
  organizationId,
  projectId,
  name: "Token leakage in responses",
  description: "The assistant leaks API tokens in its response.",
  source: "annotation",
  centroid: createIssueCentroid(),
  clusteredAt: new Date("2026-04-29T10:00:00.000Z"),
  escalatedAt: null,
  resolvedAt: null,
  ignoredAt: null,
  createdAt: new Date("2026-04-29T10:00:00.000Z"),
  updatedAt: new Date("2026-04-29T10:00:00.000Z"),
  ...overrides,
})

const makeSignals = (overrides: Partial<IssueEscalationSignals> = {}): IssueEscalationSignals => ({
  issueId: IssueId(issueId),
  recent1h: 0,
  recent6h: 0,
  recent24h: 0,
  expected1h: 10,
  expected6hPerHour: 10,
  stddev1h: 2,
  stddev6hPerHour: 2,
  samplesCount: 4,
  ...overrides,
})

const makeOpenIncident = (overrides: Partial<AlertIncident> = {}): AlertIncident => ({
  id: AlertIncidentId("aaaaaaaaaaaaaaaaaaaaaaaa"),
  organizationId: OrganizationId(organizationId),
  projectId: ProjectIdValue(projectId),
  sourceType: "issue",
  sourceId: issueId,
  kind: "issue.escalating",
  severity: "high",
  startedAt: new Date("2026-05-07T10:00:00.000Z"),
  endedAt: null,
  createdAt: new Date("2026-05-07T10:00:00.000Z"),
  entrySignals: null,
  exitEligibleSince: null,
  monitorAlertId: null,
  condition: null,
  ...overrides,
})

const createPassthroughSqlClient = (id: string): SqlClientShape => {
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId(id),
    transaction: (effect) => effect.pipe(Effect.provideService(SqlClient, sqlClient)),
    query: () => Effect.die("Unexpected direct SQL query in unit test"),
  }
  return sqlClient
}

const provideTestLayers = (params: {
  readonly issue: Issue
  readonly isEscalating?: boolean
  readonly signals: IssueEscalationSignals
  readonly events: OutboxWriteEvent[]
  readonly openIncident?: AlertIncident | null
  readonly dwellWrites?: UpdateAlertIncidentExitDwellInput[]
  readonly projectSettings?: ProjectSettings | null
  /** Per-bucket occurrence counts + seasonal thresholds for the `startedAt` backtrack on the enter transition. */
  readonly occurrenceBuckets?: readonly { bucket: string; count: number }[]
  readonly thresholdBuckets?: readonly { bucket: string; thresholdCount: number }[]
  readonly escalationSensitivity?: number
}) => {
  const { repository: issueRepository, issues } = createFakeIssueRepository([params.issue], undefined, {
    lifecycle: new Map([[params.issue.id, { isEscalating: params.isEscalating ?? false, isRegressed: false }]]),
  })
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    escalationSignalsByIssues: () => Effect.succeed([params.signals]),
    histogramByIssues: () => Effect.succeed(params.occurrenceBuckets ?? []),
    escalationThresholdHistogramByIssues: () =>
      Effect.succeed([{ issueId: IssueId(issueId), buckets: params.thresholdBuckets ?? [] }]),
  })

  const dwellWrites = params.dwellWrites ?? []
  const alertIncidentRepository: AlertIncidentRepositoryShape = {
    insert: () => Effect.die("insert not used"),
    findById: () => Effect.die("findById not used"),
    findOpen: () => Effect.succeed(params.openIncident ?? null),
    closeOpen: () => Effect.die("closeOpen not used"),
    listByProjectId: () => Effect.die("listByProjectId not used"),
    listOpenByKind: () => Effect.die("listOpenByKind not used"),
    listByMonitorId: () => Effect.die("listByMonitorId not used"),
    statsByMonitorId: () => Effect.die("statsByMonitorId not used"),
    listByMonitorAlertId: () => Effect.die("listByMonitorAlertId not used"),
    updateExitDwell: (input) =>
      Effect.sync(() => {
        dwellWrites.push(input)
      }),
  }

  return {
    dwellWrites,
    issues,
    apply: <A, E>(
      effect: Effect.Effect<
        A,
        E,
        | ScoreAnalyticsRepository
        | IssueRepository
        | OutboxEventWriter
        | SqlClient
        | ChSqlClient
        | AlertIncidentRepository
        | SettingsReader
      >,
    ) =>
      effect.pipe(
        Effect.provideService(ScoreAnalyticsRepository, scoreAnalyticsRepository),
        Effect.provideService(IssueRepository, issueRepository),
        Effect.provideService(AlertIncidentRepository, alertIncidentRepository),
        Effect.provideService(SettingsReader, {
          getOrganizationSettings: () => Effect.succeed(null),
          getProjectSettings: () => Effect.succeed(params.projectSettings ?? null),
        }),
        Effect.provideService(OutboxEventWriter, {
          write: (event) =>
            Effect.sync(() => {
              params.events.push(event)
            }),
        }),
        Effect.provideService(SqlClient, createPassthroughSqlClient(organizationId)),
        Effect.provideService(ChSqlClient, createFakeChSqlClient({ organizationId: OrganizationId(organizationId) })),
      ),
  }
}

describe("checkIssueEscalationUseCase", () => {
  it("emits IssueEscalated with the entry snapshot when both windows cross their bands", async () => {
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 25, recent6h: 150, recent24h: 600 }),
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("entered")
    expect(result.currentlyEscalating).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IssueEscalated",
      aggregateType: "issue",
      aggregateId: issueId,
      payload: { organizationId, projectId, issueId },
    })
    const escalated = events[0]?.payload as { entrySignals: EntrySignalsSnapshot | null }
    expect(escalated.entrySignals).toMatchObject({ entryCount24h: 600, kShort: 3, kLong: 2 })
  })

  it("clears resolvedAt when a resolved issue enters escalation", async () => {
    const resolvedAt = new Date("2026-05-01T10:00:00.000Z")
    const issue = makeIssue({
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      resolvedAt,
    })
    const events: OutboxWriteEvent[] = []
    const { apply, issues } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 25, recent6h: 150, recent24h: 600 }),
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("entered")
    expect(issues.get(issue.id)?.resolvedAt).toBeNull()
    expect(issues.get(issue.id)?.updatedAt.getTime()).toBeGreaterThan(resolvedAt.getTime())
    expect(events).toHaveLength(1)
    expect(events[0]?.eventName).toBe("IssueEscalated")
  })

  it("backtracks escalatedAt to the first bucket that crossed the seasonal threshold", async () => {
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 25, recent6h: 150, recent24h: 600 }),
      events,
      occurrenceBuckets: [
        { bucket: "2026-05-07T07:00:00.000Z", count: 2 }, // below threshold
        { bucket: "2026-05-07T08:00:00.000Z", count: 9 }, // first crossing
        { bucket: "2026-05-07T09:00:00.000Z", count: 12 },
      ],
      thresholdBuckets: [
        { bucket: "2026-05-07T07:00:00.000Z", thresholdCount: 5 },
        { bucket: "2026-05-07T08:00:00.000Z", thresholdCount: 5 },
        { bucket: "2026-05-07T09:00:00.000Z", thresholdCount: 5 },
      ],
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("entered")
    const payload = events[0]?.payload as { escalatedAt: string }
    expect(payload.escalatedAt).toBe("2026-05-07T08:00:00.000Z")
  })

  it("falls back to the event time when no bucket crossed the threshold", async () => {
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const before = Date.now()
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 25, recent6h: 150, recent24h: 600 }),
      events,
      occurrenceBuckets: [
        { bucket: "2026-05-07T08:00:00.000Z", count: 2 },
        { bucket: "2026-05-07T09:00:00.000Z", count: 3 },
      ],
      thresholdBuckets: [
        { bucket: "2026-05-07T08:00:00.000Z", thresholdCount: 5 },
        { bucket: "2026-05-07T09:00:00.000Z", thresholdCount: 5 },
      ],
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("entered")
    const payload = events[0]?.payload as { escalatedAt: string }
    // No crossing → the detection time (now), well after the historical buckets.
    expect(new Date(payload.escalatedAt).getTime()).toBeGreaterThanOrEqual(before)
  })

  it("uses the supplied escalationSensitivity (system-monitor override) for the entry snapshot", async () => {
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      // Strong, mature signal so it clears the band even at the wider k=5 sensitivity.
      signals: makeSignals({ recent1h: 100, recent6h: 600, recent24h: 2000, samplesCount: 50 }),
      events,
    })

    await Effect.runPromise(
      apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId, escalationSensitivity: 5 })),
    )

    const escalated = events[0]?.payload as { entrySignals: EntrySignalsSnapshot | null }
    expect(escalated.entrySignals).toMatchObject({ kShort: 5, kLong: 4 })
  })

  it("does not transition ignored issues into escalation", async () => {
    const ignoredAt = new Date("2026-05-01T10:00:00.000Z")
    const issue = makeIssue({
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      ignoredAt,
    })
    const events: OutboxWriteEvent[] = []
    const { apply, issues } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 100, recent6h: 600, recent24h: 2400 }),
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(false)
    expect(issues.get(issue.id)?.ignoredAt?.getTime()).toBe(ignoredAt.getTime())
    expect(events).toHaveLength(0)
  })

  it("does not emit IssueEscalated while the issue is still new", async () => {
    const issue = makeIssue({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 100, recent6h: 600, recent24h: 2400 }),
      events,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(false)
    expect(events).toHaveLength(0)
  })

  it("starts the dwell tracker and writes it on no-op when the exit shape first holds", async () => {
    const issue = makeIssue()
    const events: OutboxWriteEvent[] = []
    const openIncident = makeOpenIncident({
      entrySignals: {
        expected1h: 10,
        expected6hPerHour: 10,
        stddev1h: 2,
        stddev6hPerHour: 2,
        kShort: 3,
        kLong: 2,
        entryThreshold1h: 16,
        entryThreshold6hPerHour: 14,
        entryCount24h: 600,
      },
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      exitEligibleSince: null,
    })
    const { apply, dwellWrites } = provideTestLayers({
      issue,
      isEscalating: true,
      signals: makeSignals({ recent1h: 5, recent6h: 30, recent24h: 400 }),
      events,
      openIncident,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(events).toHaveLength(0)
    expect(dwellWrites).toHaveLength(1)
    expect(dwellWrites[0]?.exitEligibleSince).toBeInstanceOf(Date)
  })

  it("emits IssueEscalationEnded with reason='threshold' once the dwell duration is met", async () => {
    const issue = makeIssue()
    const events: OutboxWriteEvent[] = []
    const dwellStart = new Date(Date.now() - ESCALATION_EXIT_DWELL_MS - 1000)
    const openIncident = makeOpenIncident({
      entrySignals: {
        expected1h: 10,
        expected6hPerHour: 10,
        stddev1h: 2,
        stddev6hPerHour: 2,
        kShort: 3,
        kLong: 2,
        entryThreshold1h: 16,
        entryThreshold6hPerHour: 14,
        entryCount24h: 600,
      },
      startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      exitEligibleSince: dwellStart,
    })
    const { apply } = provideTestLayers({
      issue,
      isEscalating: true,
      signals: makeSignals({ recent1h: 5, recent6h: 30, recent24h: 400 }),
      events,
      openIncident,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("exited")
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "IssueEscalationEnded",
      payload: { reason: "threshold" },
    })
  })

  it("forwards reason='absolute-rate-drop' when the 24h backstop trips", async () => {
    const issue = makeIssue()
    const events: OutboxWriteEvent[] = []
    const openIncident = makeOpenIncident({
      entrySignals: {
        expected1h: 10,
        expected6hPerHour: 10,
        stddev1h: 2,
        stddev6hPerHour: 2,
        kShort: 3,
        kLong: 2,
        entryThreshold1h: 16,
        entryThreshold6hPerHour: 14,
        entryCount24h: 600,
      },
      startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    })
    const { apply } = provideTestLayers({
      issue,
      isEscalating: true,
      // 24h count well below entryCount24h * 0.5 = 300; bands still elevated.
      signals: makeSignals({ recent1h: 20, recent6h: 120, recent24h: 100 }),
      events,
      openIncident,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("exited")
    expect(events[0]).toMatchObject({
      eventName: "IssueEscalationEnded",
      payload: { reason: "absolute-rate-drop" },
    })
  })

  it("forwards reason='timeout' once the 72h ceiling is reached", async () => {
    const issue = makeIssue()
    const events: OutboxWriteEvent[] = []
    const openIncident = makeOpenIncident({
      startedAt: new Date(Date.now() - ESCALATION_MAX_DURATION_MS - 60 * 1000),
    })
    const { apply } = provideTestLayers({
      issue,
      isEscalating: true,
      signals: makeSignals({ recent1h: 100, recent6h: 600, recent24h: 2400 }),
      events,
      openIncident,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("exited")
    expect(events[0]).toMatchObject({
      eventName: "IssueEscalationEnded",
      payload: { reason: "timeout" },
    })
  })

  it("uses projectSettings.escalation.sensitivity to widen the band", async () => {
    // Signals trip the default k=3 (band1h ≈ 19.5) but should not trip k=6 (band1h ≈ 29).
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 25, recent6h: 120, recent24h: 240 }),
      events,
      projectSettings: { escalation: { sensitivity: 6 } },
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(events).toHaveLength(0)
  })

  it("does not re-emit IssueEscalated when already escalating and bands are still crossed", async () => {
    const issue = makeIssue()
    const events: OutboxWriteEvent[] = []
    const openIncident = makeOpenIncident({
      entrySignals: {
        expected1h: 10,
        expected6hPerHour: 10,
        stddev1h: 2,
        stddev6hPerHour: 2,
        kShort: 3,
        kLong: 2,
        entryThreshold1h: 16,
        entryThreshold6hPerHour: 14,
        entryCount24h: 600,
      },
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    const { apply } = provideTestLayers({
      issue,
      isEscalating: true,
      signals: makeSignals({ recent1h: 25, recent6h: 150, recent24h: 600 }),
      events,
      openIncident,
    })

    const result = await Effect.runPromise(apply(checkIssueEscalationUseCase({ organizationId, projectId, issueId })))

    expect(result.transition).toBe("none")
    expect(result.currentlyEscalating).toBe(true)
    expect(events).toHaveLength(0)
  })
})
