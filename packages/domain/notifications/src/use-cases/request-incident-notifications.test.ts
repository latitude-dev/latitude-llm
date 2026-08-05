import { EvaluationRepository, type EvaluationRepositoryShape } from "@domain/evaluations"
import { type Incident, IncidentRepository, type IncidentRepositoryShape } from "@domain/incidents"
import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { ScoreAnalyticsRepository, ScoreRepository } from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  type AlertIncidentCondition,
  AlertIncidentId,
  ChSqlClient,
  type IncidentNotificationKey,
  MonitorId,
  NotFoundError,
  OrganizationId,
  ProjectId,
  type ProjectSettings,
  SettingsReader,
  SignalId,
  SqlClient,
  UserId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { type Signal, SignalRepository } from "@domain/signals"
import { createFakeSignalRepository } from "@domain/signals/testing"
import { UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { IncidentMonitorReader } from "../ports/incident-monitor-reader.ts"
import { createFakeIncidentMonitorReader } from "../testing/fake-incident-monitor-reader.ts"
import { requestIncidentNotificationsUseCase } from "./request-incident-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const projectId = ProjectId(cuid("p"))
const signalId = SignalId(cuid("s"))
const monitorId = MonitorId(cuid("m"))
const startedAt = new Date("2026-06-18T10:00:00.000Z")

const member = (uid: string): Membership => ({
  id: cuid(`mem${uid}`) as Membership["id"],
  organizationId: orgId as Membership["organizationId"],
  userId: UserId(cuid(uid)),
  role: "member" as MembershipRole,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
})

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: signalId,
  organizationId: orgId,
  projectId,
  slug: "bad-json-output",
  name: "Bad JSON output",
  description: "The model returns malformed JSON.",
  source: "annotation",
  origin: "system",
  assigneeId: null,
  priority: "high",
  centroid: {
    base: [1, 0],
    mass: 1,
    model: "test",
    decay: 1,
    weights: { annotation: 1, custom: 0, evaluation: 0 },
  },
  clusteredAt: startedAt,
  resolvedAt: null,
  ignoredAt: null,
  regressedAt: null,
  mutedAt: null,
  createdAt: startedAt,
  updatedAt: startedAt,
  ...overrides,
})

const thresholdCondition: AlertIncidentCondition = {
  trigger: "threshold",
  metric: { kind: "count" },
  threshold: { mode: "absolute", value: 10 },
}

const escalatingCondition: AlertIncidentCondition = {
  trigger: "escalating",
  metric: { kind: "count" },
  threshold: { mode: "expected", sensitivity: 4 },
  sensitivity: 4,
}

const makeIncident = (overrides: Partial<Incident> = {}): Incident => ({
  id: AlertIncidentId(cuid("ai")),
  organizationId: orgId,
  projectId,
  sourceType: "signal",
  sourceId: signalId,
  severity: "high",
  startedAt,
  endedAt: null,
  createdAt: startedAt,
  entrySignals: null,
  exitEligibleSince: null,
  condition: escalatingCondition,
  ...overrides,
})

const createIncidentRepository = (incident: Incident): IncidentRepositoryShape => ({
  insert: () => Effect.void,
  findById: (id) =>
    id === incident.id ? Effect.succeed(incident) : Effect.fail(new NotFoundError({ entity: "Incident", id })),
  findOpen: () => Effect.succeed(null),
  closeOpen: () => Effect.succeed(null),
  updateExitDwell: () => Effect.void,
  setEndedAt: () => Effect.void,
  closeById: () => Effect.succeed(null),
  listByProjectId: () => Effect.succeed([]),
  listOpenBySourceType: () => Effect.succeed([]),
  listByMonitorId: () => Effect.succeed({ items: [], nextCursor: null, hasMore: false }),
  statsByMonitorId: () =>
    Effect.succeed({
      total: 0,
      firstStartedAt: null,
      lastIncidentId: null,
      lastStartedAt: null,
      lastEndedAt: null,
    }),
})

const evaluationRepository: EvaluationRepositoryShape = {
  findById: (id) => Effect.fail(new NotFoundError({ entity: "Evaluation", id })),
  save: () => Effect.void,
  listByProjectId: () => Effect.succeed({ items: [], hasMore: false, limit: 0, offset: 0 }),
  listBySignalId: () => Effect.succeed({ items: [], hasMore: false, limit: 0, offset: 0 }),
  listBySignalIds: () => Effect.succeed({ items: [], hasMore: false, limit: 0, offset: 0 }),
  archive: () => Effect.void,
  unarchive: () => Effect.void,
  softDelete: () => Effect.void,
  softDeleteBySignalId: () => Effect.void,
}

const makeLayer = (opts: {
  readonly incident: Incident
  readonly signal?: Signal | null
  readonly monitorMutedAt?: Date | null
  readonly projectSettings?: ProjectSettings | null
  readonly members?: readonly Membership[]
}) => {
  const { repository: membershipRepository } = createFakeMembershipRepository({
    listByOrganizationId: () => Effect.succeed([...(opts.members ?? [member("u1"), member("u2")])]),
  })
  const { repository: scoreAnalyticsRepository } = createFakeScoreAnalyticsRepository()
  const { repository: scoreRepository } = createFakeScoreRepository()
  const { repository: signalRepository } = createFakeSignalRepository(opts.signal ? [opts.signal] : [])
  const { repository: userRepository } = createFakeUserRepository()
  const { reader: monitorReader } = createFakeIncidentMonitorReader(
    new Map([
      [
        monitorId,
        {
          monitorId,
          slug: "checkout-errors",
          name: "Checkout errors",
          mutedAt: opts.monitorMutedAt ?? null,
        },
      ],
    ]),
  )
  const settings = SettingsReader.of({
    getOrganizationSettings: () => Effect.succeed(null),
    getProjectSettings: () => Effect.succeed(opts.projectSettings ?? null),
  })

  return Layer.mergeAll(
    Layer.succeed(IncidentRepository, createIncidentRepository(opts.incident)),
    Layer.succeed(IncidentMonitorReader, monitorReader),
    Layer.succeed(MembershipRepository, membershipRepository),
    Layer.succeed(ScoreAnalyticsRepository, scoreAnalyticsRepository),
    Layer.succeed(ScoreRepository, scoreRepository),
    Layer.succeed(SignalRepository, signalRepository),
    Layer.succeed(EvaluationRepository, evaluationRepository),
    Layer.succeed(UserRepository, userRepository),
    Layer.succeed(SettingsReader, settings),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient()),
  )
}

describe("requestIncidentNotificationsUseCase", () => {
  // 97% of production escalations come from signals nobody triaged; the rate
  // breaking its band is the judgment, so they still page.
  it("still fans out when the escalating signal has no level", async () => {
    const incident = makeIncident()
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(Effect.provide(makeLayer({ incident, signal: makeSignal({ priority: null }) }))),
    )

    expect(result.status).toBe("ok")
  })

  it("fans out signal escalation incidents when the signal is not muted", async () => {
    const incident = makeIncident()
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(Effect.provide(makeLayer({ incident, signal: makeSignal() }))),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests).toHaveLength(2)
    expect(result.requests[0]?.kind).toBe("incident.opened")
    expect(result.requests[0]?.slackEligible).toBe(true)
    expect(result.requests[0]?.idempotencyKey).toBe(`incident.opened:${incident.id}`)
    expect(result.requests[0]?.payload).toMatchObject({
      alertIncidentId: incident.id,
      sourceType: "signal",
      sourceId: signalId,
      incidentKind: "signal.escalating" satisfies IncidentNotificationKey,
      severity: "high",
      condition: escalatingCondition,
    })
  })

  it("sends signal escalation incidents only to the assignee when assigned", async () => {
    const incident = makeIncident()
    const assigneeId = UserId(cuid("u2"))
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(Effect.provide(makeLayer({ incident, signal: makeSignal({ assigneeId }) }))),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0]?.userId).toBe(assigneeId)
    expect(result.requests[0]?.slackEligible).toBe(false)
  })

  it("skips signal incidents when the signal is muted", async () => {
    const incident = makeIncident()
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident,
            signal: makeSignal({ mutedAt: new Date("2026-06-18T09:00:00.000Z") }),
          }),
        ),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "signal-muted" })
  })

  it("skips signal incidents for an ignored signal even after an unmute", async () => {
    const incident = makeIncident()
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident,
            signal: makeSignal({ ignoredAt: new Date("2026-06-18T09:00:00.000Z"), mutedAt: null }),
          }),
        ),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "signal-ignored" })
  })

  it("skips signal incidents when the signal was resolved before fan-out", async () => {
    const incident = makeIncident()
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident,
            signal: makeSignal({ resolvedAt: new Date("2026-06-18T09:00:00.000Z") }),
          }),
        ),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "signal-resolved" })
  })

  it("fans out monitor match incidents from the monitor source id", async () => {
    const incident = makeIncident({
      sourceType: "monitor",
      sourceId: monitorId,
      severity: "medium",
      endedAt: startedAt,
      condition: null,
    })
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(Effect.provide(makeLayer({ incident }))),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.requests).toHaveLength(2)
    expect(result.requests[0]?.kind).toBe("incident.event")
    expect(result.requests[0]?.payload).toMatchObject({
      alertIncidentId: incident.id,
      sourceType: "monitor",
      sourceId: monitorId,
      incidentKind: "monitor.match" satisfies IncidentNotificationKey,
      severity: "medium",
      monitorId,
      monitorName: "Checkout errors",
      monitorSlug: "checkout-errors",
    })
  })

  it("fans out monitor threshold incidents as one-shot events and applies the monitor threshold gate", async () => {
    // Threshold incidents are now sustained (open, endedAt=null) but still alert once with the
    // one-shot `incident.event` kind, not `incident.opened` — no recovery email on close.
    const incident = makeIncident({
      sourceType: "monitor",
      sourceId: monitorId,
      severity: "medium",
      endedAt: null,
      entrySignals: { evaluatedThreshold: 10 },
      condition: thresholdCondition,
    })

    const allowed = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(Effect.provide(makeLayer({ incident }))),
    )

    expect(allowed.status).toBe("ok")
    if (allowed.status !== "ok") throw new Error("expected ok")
    expect(allowed.requests[0]?.kind).toBe("incident.event")
    expect(allowed.requests[0]?.idempotencyKey).toBe(`incident.event:${incident.id}`)
    expect(allowed.requests[0]?.payload).toMatchObject({
      incidentKind: "monitor.threshold" satisfies IncidentNotificationKey,
      condition: thresholdCondition,
    })

    const disabled = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident,
            projectSettings: { notifications: { incidents: { "monitor.threshold": false } } },
          }),
        ),
      ),
    )

    expect(disabled).toEqual({ status: "skipped", reason: "kind-disabled" })
  })

  it("applies monitor match and escalating project gates", async () => {
    const matchIncident = makeIncident({
      sourceType: "monitor",
      sourceId: monitorId,
      endedAt: startedAt,
      condition: null,
    })
    const disabledMatch = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: matchIncident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident: matchIncident,
            projectSettings: { notifications: { incidents: { "monitor.match": false } } },
          }),
        ),
      ),
    )
    expect(disabledMatch).toEqual({ status: "skipped", reason: "kind-disabled" })

    const openedIncident = makeIncident({
      sourceType: "monitor",
      sourceId: monitorId,
      endedAt: null,
      condition: escalatingCondition,
    })
    const disabledOpened = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: openedIncident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident: openedIncident,
            projectSettings: { notifications: { incidents: { "monitor.escalating": false } } },
          }),
        ),
      ),
    )
    expect(disabledOpened).toEqual({ status: "skipped", reason: "kind-disabled" })

    const closedIncident = makeIncident({
      sourceType: "monitor",
      sourceId: monitorId,
      endedAt: new Date("2026-06-18T11:00:00.000Z"),
      condition: escalatingCondition,
    })
    const disabledClosed = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: closedIncident.id,
        transition: "closed",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident: closedIncident,
            projectSettings: { notifications: { incidents: { "monitor.escalating": false } } },
          }),
        ),
      ),
    )
    expect(disabledClosed).toEqual({ status: "skipped", reason: "kind-disabled" })
  })

  it("skips monitor incidents when the owning monitor is muted", async () => {
    const incident = makeIncident({
      sourceType: "monitor",
      sourceId: monitorId,
      endedAt: startedAt,
      condition: thresholdCondition,
    })
    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({
        alertIncidentId: incident.id,
        transition: "created",
      }).pipe(
        Effect.provide(
          makeLayer({
            incident,
            monitorMutedAt: new Date("2026-06-18T09:00:00.000Z"),
          }),
        ),
      ),
    )

    expect(result).toEqual({ status: "skipped", reason: "monitor-muted" })
  })
})
