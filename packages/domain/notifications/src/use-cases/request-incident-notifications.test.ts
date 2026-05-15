import {
  type AlertIncident,
  AlertIncidentRepository,
  type AlertIncidentRepositoryShape,
  alertIncidentSchema,
} from "@domain/alerts"
import { type Issue, IssueRepository, type IssueWithLifecycle, issueSchema } from "@domain/issues"
import { type Membership, MembershipRepository, type MembershipRole, type MemberWithUser } from "@domain/organizations"
import { type Project, ProjectRepository } from "@domain/projects"
import {
  AlertIncidentId,
  IssueId,
  NotFoundError,
  OrganizationId,
  type ProjectId,
  ProjectId as ProjectIdConst,
  type ProjectSettings,
  SettingsReader,
  SqlClient,
  UserId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestIncidentNotificationsUseCase } from "./request-incident-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

interface SetupOpts {
  readonly incident?: Partial<AlertIncident>
  readonly memberUserIds?: readonly string[]
  readonly projectSettings?: ProjectSettings | null
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
    endedAt: null,
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
    listByProjectInRange: () => Effect.die("listByProjectInRange not used"),
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

  const issue: Issue = issueSchema.parse({
    id: IssueId(cuid("i")),
    uuid: "11111111-1111-4111-8111-111111111111",
    organizationId: orgId,
    projectId,
    slug: "sample-issue",
    name: "Sample issue",
    description: "Sample description",
    source: "annotation",
    centroid: {
      base: [],
      mass: 0,
      model: "test",
      decay: 60,
      weights: { evaluation: 0, annotation: 0, custom: 0 },
    },
    clusteredAt: new Date("2026-05-01T00:00:00Z"),
    escalatedAt: null,
    resolvedAt: null,
    ignoredAt: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  })

  const issueWithLifecycle: IssueWithLifecycle = {
    ...issue,
    lifecycle: { isEscalating: false, isRegressed: false },
  }

  const issueRepo = IssueRepository.of({
    findById: () => Effect.succeed(issueWithLifecycle),
    findByIdForUpdate: () => Effect.die("not used"),
    findByIds: () => Effect.die("not used"),
    findByUuid: () => Effect.die("not used"),
    save: () => Effect.die("not used"),
    list: () => Effect.die("not used"),
    countBySlug: () => Effect.die("not used"),
  })

  const project: Project = {
    id: projectId,
    organizationId: orgId,
    name: "Sample project",
    slug: "sample-project",
    settings: null,
    firstTraceAt: null,
    lastEditedAt: new Date("2026-05-01T00:00:00Z"),
    deletedAt: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  }

  const projectRepo = ProjectRepository.of({
    findById: () => Effect.succeed(project),
    findBySlug: () => Effect.die("not used"),
    list: () => Effect.die("not used"),
    listIncludingDeleted: () => Effect.die("not used"),
    save: () => Effect.die("not used"),
    softDelete: () => Effect.die("not used"),
    hardDelete: () => Effect.die("not used"),
    existsByName: () => Effect.die("not used"),
    countBySlug: () => Effect.die("not used"),
  })

  const layer = Layer.mergeAll(
    Layer.succeed(AlertIncidentRepository, incidentRepo),
    Layer.succeed(IssueRepository, issueRepo),
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(ProjectRepository, projectRepo),
    Layer.succeed(SettingsReader, settings),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectId, incidentId, incident, layer }
}

describe("requestIncidentNotificationsUseCase", () => {
  it("emits one request per org member with the right payload + idempotency key", async () => {
    const { incidentId, layer } = setup({ memberUserIds: [cuid("ua"), cuid("ub"), cuid("uc")] })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, kind: "incident.opened" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests).toHaveLength(3)
    for (const req of result.requests) {
      expect(req.kind).toBe("incident.opened")
      expect(req.idempotencyKey).toBe(`incident.opened:${incidentId}`)
      expect(req.projectId).toBe(cuid("p"))
      expect(req.payload.incidentKind).toBe("issue.new")
      expect(req.payload.alertIncidentId).toBe(incidentId)
      expect(req.payload.issueId).toBe(cuid("i"))
      expect(req.payload.issueName).toBe("Sample issue")
      expect(req.payload.projectSlug).toBe("sample-project")
    }
    // Each recipient gets a distinct notificationId
    const ids = new Set(result.requests.map((r) => r.notificationId))
    expect(ids.size).toBe(3)
  })

  it("emits a distinct idempotency key for opened vs closed of the same incident", async () => {
    const { incidentId, layer } = setup({
      incident: { kind: "issue.escalating", severity: "high" },
      memberUserIds: [cuid("ua")],
    })

    const opened = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, kind: "incident.opened" }).pipe(
        Effect.provide(layer),
      ),
    )
    const closed = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, kind: "incident.closed" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(opened.status).toBe("ok")
    expect(closed.status).toBe("ok")
    if (opened.status !== "ok" || closed.status !== "ok") throw new Error("unreachable")
    expect(opened.requests[0]?.idempotencyKey).toBe(`incident.opened:${incidentId}`)
    expect(closed.requests[0]?.idempotencyKey).toBe(`incident.closed:${incidentId}`)
    expect(opened.requests[0]?.kind).toBe("incident.opened")
    expect(closed.requests[0]?.kind).toBe("incident.closed")
  })

  it("skips when project settings disable the matching alert kind", async () => {
    const { incidentId, layer } = setup({
      projectSettings: { notifications: { incidents: { "issue.new": false } } },
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, kind: "incident.opened" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("skipped")
    if (result.status !== "skipped") throw new Error("unreachable")
    expect(result.reason).toBe("kind-disabled")
  })

  it("does not skip when settings disable a different kind", async () => {
    const { incidentId, layer } = setup({
      projectSettings: { notifications: { incidents: { "issue.escalating": false } } },
    })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, kind: "incident.opened" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests.length).toBeGreaterThan(0)
  })

  it("skips with reason 'no-recipients' when the org has no members", async () => {
    const { incidentId, layer } = setup({ memberUserIds: [] })

    const result = await Effect.runPromise(
      requestIncidentNotificationsUseCase({ alertIncidentId: incidentId, kind: "incident.opened" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(result.status).toBe("skipped")
    if (result.status !== "skipped") throw new Error("unreachable")
    expect(result.reason).toBe("no-recipients")
  })
})
