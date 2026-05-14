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
  uuid: "11111111-1111-4111-8111-111111111111",
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
}) => {
  const { repository: issueRepository } = createFakeIssueRepository([params.issue], undefined, {
    lifecycle: new Map([[params.issue.id, { isEscalating: params.isEscalating ?? false, isRegressed: false }]]),
  })
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository({
    escalationSignalsByIssues: () => Effect.succeed([params.signals]),
  })

  const dwellWrites = params.dwellWrites ?? []
  const alertIncidentRepository: AlertIncidentRepositoryShape = {
    insert: () => Effect.die("insert not used"),
    findById: () => Effect.die("findById not used"),
    findOpen: () => Effect.succeed(params.openIncident ?? null),
    closeOpen: () => Effect.die("closeOpen not used"),
    listByProjectInRange: () => Effect.die("listByProjectInRange not used"),
    updateExitDwell: (input) =>
      Effect.sync(() => {
        dwellWrites.push(input)
      }),
  }

  return {
    dwellWrites,
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

  it("does not emit IssueEscalated while the issue is still new", async () => {
    const issue = makeIssue({ createdAt: new Date("2026-05-08T10:00:00.000Z") })
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

  it("uses projectSettings.alertNotifications.escalationSensitivity to widen the band", async () => {
    // Signals trip the default k=3 (band1h ≈ 19.5) but should not trip k=6 (band1h ≈ 29).
    const issue = makeIssue({ createdAt: new Date("2026-04-01T10:00:00.000Z") })
    const events: OutboxWriteEvent[] = []
    const { apply } = provideTestLayers({
      issue,
      isEscalating: false,
      signals: makeSignals({ recent1h: 25, recent6h: 120, recent24h: 240 }),
      events,
      projectSettings: { alertNotifications: { escalationSensitivity: 6 } },
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
