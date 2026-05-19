import {
  type AlertIncident,
  AlertIncidentRepository,
  type AlertIncidentRepositoryShape,
  alertIncidentSchema,
} from "@domain/alerts"
import { type Membership, MembershipRepository, type MembershipRole, type MemberWithUser } from "@domain/organizations"
import type { AnnotationScore, EvaluationScore } from "@domain/scores"
import {
  type IssueEscalationThresholdSeries,
  type IssueOccurrenceBucket,
  type IssueTagsAggregate,
  ScoreAnalyticsRepository,
  ScoreRepository,
} from "@domain/scores"
import { createFakeScoreAnalyticsRepository, createFakeScoreRepository } from "@domain/scores/testing"
import {
  AlertIncidentId,
  ChSqlClient,
  NotFoundError,
  OrganizationId,
  type ProjectId,
  ProjectId as ProjectIdConst,
  type ProjectSettings,
  SettingsReader,
  SqlClient,
  UserId,
} from "@domain/shared"
import { createFakeChSqlClient, createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { IncidentEventPayload } from "../entities/notification.ts"
import { requestIncidentNotificationsUseCase } from "./request-incident-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

interface SetupOpts {
  readonly incident?: Partial<AlertIncident>
  readonly memberUserIds?: readonly string[]
  readonly projectSettings?: ProjectSettings | null
  readonly thresholdBuckets?: readonly { bucket: string; thresholdCount: number }[]
  readonly occurrenceBuckets?: readonly IssueOccurrenceBucket[]
  readonly tags?: readonly string[]
  readonly latestAnnotation?: AnnotationScore | null
  readonly latestEvaluation?: EvaluationScore | null
}

function setup(opts: SetupOpts = {}) {
  const orgId = OrganizationId(cuid("o"))
  const projectId = ProjectIdConst(cuid("p"))
  const incidentId = AlertIncidentId(cuid("ai"))

  const incident = alertIncidentSchema.parse({
    id: incidentId,
    organizationId: orgId,
    projectId,
    sourceType: "issue",
    sourceId: cuid("i"),
    kind: "issue.new",
    severity: "medium",
    startedAt: new Date("2026-05-07T10:00:00Z"),
    endedAt: new Date("2026-05-07T10:00:00Z"), // event default: endedAt = startedAt
    createdAt: new Date("2026-05-07T10:00:00Z"),
    entrySignals: null,
    exitEligibleSince: null,
    ...opts.incident,
  })

  const incidentRepo: AlertIncidentRepositoryShape = {
    insert: () => Effect.die("insert not used"),
    findOpen: () => Effect.die("findOpen not used"),
    closeOpen: () => Effect.die("closeOpen not used"),
    updateExitDwell: () => Effect.die("updateExitDwell not used"),
    findById: (id) =>
      id === incidentId ? Effect.succeed(incident) : Effect.fail(new NotFoundError({ entity: "AlertIncident", id })),
    listByProjectId: () => Effect.die("listByProjectId not used"),
    listOpenByKind: () => Effect.die("listOpenByKind not used"),
  }

  const members: MemberWithUser[] = (opts.memberUserIds ?? [cuid("u1"), cuid("u2")]).map((uid, i) => ({
    id: cuid(`m${i}`) as Membership["id"],
    organizationId: orgId,
    userId: uid,
    role: "member",
    createdAt: new Date(),
    name: null,
    email: `${uid}@test.com`,
    emailVerified: true,
    image: null,
  }))

  const memberships = MembershipRepository.of({
    findById: () => Effect.die("not used"),
    listByOrganizationId: () =>
      Effect.succeed(
        members.map(
          (m): Membership => ({
            id: m.id as Membership["id"],
            organizationId: m.organizationId as Membership["organizationId"],
            userId: UserId(m.userId),
            role: m.role as MembershipRole,
            createdAt: m.createdAt,
          }),
        ),
      ),
    listByUserId: () => Effect.succeed([]),
    findByOrganizationAndUser: () => Effect.die("not used"),
    listMembersWithUser: () => Effect.succeed(members),
    findByIdWithUser: () => Effect.die("not used"),
    findMemberByEmail: () => Effect.succeed(false),
    isMember: () => Effect.succeed(true),
    isAdmin: () => Effect.succeed(false),
    save: () => Effect.die("not used"),
    delete: () => Effect.die("not used"),
  })

  const settings = SettingsReader.of({
    getOrganizationSettings: () => Effect.succeed(null),
    getProjectSettings: (_pid: ProjectId) => Effect.succeed(opts.projectSettings ?? null),
  })

  const occurrenceBuckets = opts.occurrenceBuckets ?? [
    { bucket: "2026-05-07T07:10:00.000Z", count: 1 },
    { bucket: "2026-05-07T08:10:00.000Z", count: 4 },
    { bucket: "2026-05-07T09:10:00.000Z", count: 9 },
  ]
  const thresholdBuckets = opts.thresholdBuckets ?? [
    { bucket: "2026-05-07T07:10:00.000Z", thresholdCount: 5 },
    { bucket: "2026-05-07T08:10:00.000Z", thresholdCount: Number.NaN },
    { bucket: "2026-05-07T09:10:00.000Z", thresholdCount: 7 },
  ]

  // Stub only the methods the producer calls; the rest stay as the
  // default `Effect.die` placeholders from the fake factory.
  const { repository: analytics } = createFakeScoreAnalyticsRepository({
    histogramByIssues: () => Effect.succeed(occurrenceBuckets),
    escalationThresholdHistogramByIssues: () =>
      Effect.succeed([
        { issueId: incident.sourceId as IssueEscalationThresholdSeries["issueId"], buckets: thresholdBuckets },
      ]),
    aggregateTagsByIssues: () =>
      Effect.succeed([
        {
          issueId: incident.sourceId as IssueTagsAggregate["issueId"],
          tags: opts.tags ?? [],
        },
      ]),
  })

  const annotation = opts.latestAnnotation
  const evaluation = opts.latestEvaluation
  const { repository: scoreRepository } = createFakeScoreRepository({
    listByIssueId: ({ source }) => {
      const pick = source === "annotation" ? annotation : source === "evaluation" ? evaluation : null
      return Effect.succeed({
        items: pick ? [pick] : [],
        hasMore: false,
        limit: 1,
        offset: 0,
      })
    },
  })

  const layer = Layer.mergeAll(
    Layer.succeed(AlertIncidentRepository, incidentRepo),
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(ScoreAnalyticsRepository, analytics),
    Layer.succeed(ScoreRepository, scoreRepository),
    Layer.succeed(SettingsReader, settings),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
    Layer.succeed(ChSqlClient, createFakeChSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectId, incidentId, incident, layer }
}

describe("requestIncidentNotificationsUseCase", () => {
  it("derives incident.event when the incident has endedAt = startedAt (issue.new)", async () => {
    const startedAt = new Date("2026-05-07T10:00:00Z")
    const { incidentId, layer } = setup({
      incident: { kind: "issue.new", startedAt, endedAt: startedAt },
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests[0]?.kind).toBe("incident.event")
    expect(result.requests[0]?.idempotencyKey).toBe(`incident.event:${incidentId}`)
    // Eventful kinds don't snapshot a trend.
    expect(result.requests[0]?.payload).not.toHaveProperty("trend")
    expect(result.requests[0]?.payload.sourceType).toBe("issue")
    expect(result.requests[0]?.payload.sourceId).toBe(cuid("i"))
  })

  it("derives incident.opened when the incident has endedAt = null (issue.escalating, sustained)", async () => {
    const startedAt = new Date("2026-05-07T10:00:00Z")
    const { incidentId, layer } = setup({
      incident: { kind: "issue.escalating", severity: "high", startedAt, endedAt: null },
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests[0]?.kind).toBe("incident.opened")
    expect(result.requests[0]?.idempotencyKey).toBe(`incident.opened:${incidentId}`)
    const payload = result.requests[0]?.payload
    if (!payload || !("trend" in payload)) throw new Error("expected trend on opened payload")
    expect(payload.trend.bucketDurationMs).toBe(10 * 60 * 1000)
    // NaN thresholds round-trip through the producer as null.
    expect(payload.trend.points.some((p) => p.threshold === null)).toBe(true)
    expect(payload.trend.points.some((p) => typeof p.threshold === "number")).toBe(true)
  })

  it("derives incident.closed regardless of endedAt shape when transition='closed'", async () => {
    const { incidentId, layer } = setup({
      incident: {
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-05-07T10:00:00Z"),
        endedAt: new Date("2026-05-07T10:30:00Z"),
      },
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "closed" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests[0]?.kind).toBe("incident.closed")
    expect(result.requests[0]?.idempotencyKey).toBe(`incident.closed:${incidentId}`)
    const payload = result.requests[0]?.payload
    if (!payload || !("trend" in payload)) throw new Error("expected trend on closed payload")
    expect(payload.trend.points.length).toBeGreaterThan(0)
  })

  it("emits one request per org member with a stable idempotency key", async () => {
    const { incidentId, layer } = setup({ memberUserIds: [cuid("ua"), cuid("ub"), cuid("uc")] })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests).toHaveLength(3)
    for (const req of result.requests) {
      expect(req.idempotencyKey).toBe(`incident.event:${incidentId}`)
      expect(req.projectId).toBe(cuid("p"))
    }
    const ids = new Set(result.requests.map((r) => r.notificationId))
    expect(ids.size).toBe(3)
  })

  it("skips when project settings disable the matching alert kind", async () => {
    const { incidentId, layer } = setup({
      projectSettings: { notifications: { incidents: { "issue.new": false } } },
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("skipped")
    if (result.status !== "skipped") throw new Error("unreachable")
    expect(result.reason).toBe("kind-disabled")
  })

  it("skips with reason 'no-recipients' when the org has no members", async () => {
    const { incidentId, layer } = setup({ memberUserIds: [] })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("skipped")
    if (result.status !== "skipped") throw new Error("unreachable")
    expect(result.reason).toBe("no-recipients")
  })

  it("snapshots top-5 tags alphabetically on incident.event", async () => {
    const { incidentId, layer } = setup({
      tags: ["zebra", "alpha", "Charlie", "bravo", "delta", "echo", "foxtrot"],
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload as IncidentEventPayload
    expect(payload.tags).toEqual(["alpha", "bravo", "Charlie", "delta", "echo"])
  })

  it("omits tags when the issue has none", async () => {
    const { incidentId, layer } = setup({ tags: [], memberUserIds: [cuid("ua")] })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload as IncidentEventPayload
    expect(payload.tags).toBeUndefined()
  })

  it("skips tags on incident.closed (recovery emails don't show source context)", async () => {
    const { incidentId, layer } = setup({
      incident: {
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-05-07T10:00:00Z"),
        endedAt: new Date("2026-05-07T10:30:00Z"),
      },
      tags: ["env:prod", "service:agents"],
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "closed" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload
    expect(payload).toBeDefined()
    if (!payload) throw new Error("unreachable")
    expect((payload as { tags?: unknown }).tags).toBeUndefined()
  })

  it("snapshots sampleExcerpt from the latest annotation when available", async () => {
    const annotation = {
      id: cuid("score-a"),
      organizationId: cuid("o"),
      projectId: cuid("p"),
      sessionId: null,
      traceId: null,
      spanId: null,
      simulationId: null,
      issueId: cuid("i"),
      value: 0,
      passed: false,
      feedback: "clusterable",
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt: new Date("2026-05-07T09:50:00Z"),
      updatedAt: new Date("2026-05-07T09:50:00Z"),
      source: "annotation" as const,
      sourceId: "UI" as const,
      metadata: { rawFeedback: "Reviewer flagged a tool-call loop." },
    } as unknown as AnnotationScore

    const { incidentId, layer } = setup({
      latestAnnotation: annotation,
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload as IncidentEventPayload
    expect(payload.sampleExcerpt).toEqual({
      source: "annotation",
      text: "Reviewer flagged a tool-call loop.",
      truncated: false,
    })
  })

  it("falls back to the latest evaluation when no annotation exists", async () => {
    const evaluation = {
      id: cuid("score-e"),
      organizationId: cuid("o"),
      projectId: cuid("p"),
      sessionId: null,
      traceId: null,
      spanId: null,
      simulationId: null,
      issueId: cuid("i"),
      value: 0,
      passed: false,
      feedback: "Output mentioned the customer's competitor.",
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt: new Date("2026-05-07T09:55:00Z"),
      updatedAt: new Date("2026-05-07T09:55:00Z"),
      source: "evaluation" as const,
      sourceId: cuid("eval"),
      metadata: { evaluationHash: "abc" },
    } as unknown as EvaluationScore

    const { incidentId, layer } = setup({
      latestAnnotation: null,
      latestEvaluation: evaluation,
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload as IncidentEventPayload
    expect(payload.sampleExcerpt).toEqual({
      source: "evaluation",
      text: "Output mentioned the customer's competitor.",
      truncated: false,
    })
  })

  it("truncates a long annotation excerpt to 200 chars and flags truncated", async () => {
    const longText = "x".repeat(500)
    const annotation = {
      id: cuid("score-a"),
      organizationId: cuid("o"),
      projectId: cuid("p"),
      sessionId: null,
      traceId: null,
      spanId: null,
      simulationId: null,
      issueId: cuid("i"),
      value: 0,
      passed: false,
      feedback: "f",
      error: null,
      errored: false,
      duration: 0,
      tokens: 0,
      cost: 0,
      draftedAt: null,
      annotatorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      source: "annotation" as const,
      sourceId: "UI" as const,
      metadata: { rawFeedback: longText },
    } as unknown as AnnotationScore

    const { incidentId, layer } = setup({
      latestAnnotation: annotation,
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const truncatedPayload = result.requests[0]?.payload as IncidentEventPayload
    expect(truncatedPayload.sampleExcerpt?.truncated).toBe(true)
    expect(truncatedPayload.sampleExcerpt?.text.length).toBe(200)
  })

  it("snapshots breach scalars on incident.opened when entrySignals are present", async () => {
    const { incidentId, layer } = setup({
      incident: {
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-05-07T10:00:00Z"),
        endedAt: null,
        entrySignals: {
          expected1h: 4.2,
          expected6hPerHour: 4,
          stddev1h: 1.1,
          stddev6hPerHour: 1,
          kShort: 3,
          kLong: 2,
          entryThreshold1h: 7.5,
          entryThreshold6hPerHour: 7,
          entryCount24h: 50,
        },
      },
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "created" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload
    if (!payload || !("breach" in payload)) throw new Error("expected breach on opened payload")
    expect(payload.breach?.baselineRate).toBe(4.2)
    expect(payload.breach?.threshold).toBe(7.5)
    // triggerRate is derived from peak trend count × per-hour scale; verify it's a positive number.
    expect(payload.breach?.triggerRate).toBeGreaterThan(0)
  })

  it("snapshots recovery durationMs on incident.closed", async () => {
    const { incidentId, layer } = setup({
      incident: {
        kind: "issue.escalating",
        severity: "high",
        startedAt: new Date("2026-05-07T10:00:00Z"),
        endedAt: new Date("2026-05-07T10:32:00Z"),
      },
      memberUserIds: [cuid("ua")],
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, transition: "closed" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    const payload = result.requests[0]?.payload
    if (!payload || !("recovery" in payload)) throw new Error("expected recovery on closed payload")
    expect(payload.recovery.durationMs).toBe(32 * 60 * 1000)
  })
})
