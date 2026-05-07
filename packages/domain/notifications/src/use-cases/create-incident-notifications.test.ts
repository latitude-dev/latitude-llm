import {
  type AlertIncident,
  AlertIncidentRepository,
  type AlertIncidentRepositoryShape,
  alertIncidentSchema,
} from "@domain/alerts"
import { type Membership, MembershipRepository, type MemberWithUser } from "@domain/organizations"
import {
  AlertIncidentId,
  NotFoundError,
  OrganizationId,
  type ProjectId,
  ProjectId as ProjectIdConst,
  type ProjectSettings,
  SettingsReader,
  SqlClient,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import { createIncidentNotificationsUseCase } from "./create-incident-notifications.ts"

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
    ...opts.incident,
  })

  const incidentRepo: AlertIncidentRepositoryShape = {
    insert: () => Effect.die("insert not used"),
    closeOpen: () => Effect.die("closeOpen not used"),
    findById: (id) =>
      id === incidentId ? Effect.succeed(incident) : Effect.fail(new NotFoundError({ entity: "AlertIncident", id })),
  }

  const members: MemberWithUser[] = (opts.memberUserIds ?? [cuid("u1"), cuid("u2")]).map((uid, i) => ({
    id: cuid(`m${i}`) as Membership["id"],
    organizationId: orgId,
    userId: uid,
    role: "member",
    createdAt: new Date(),
    name: null,
    email: `${uid}@test.com`,
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
            userId: m.userId,
            role: m.role,
            createdAt: m.createdAt,
          }),
        ),
      ),
    listByUserId: () => Effect.succeed([]),
    findByOrganizationAndUser: () => Effect.die("not used"),
    listMembersWithUser: () => Effect.succeed(members),
    isMember: () => Effect.succeed(true),
    isAdmin: () => Effect.succeed(false),
    save: () => Effect.die("not used"),
    delete: () => Effect.die("not used"),
  })

  const settings = SettingsReader.of({
    getOrganizationSettings: () => Effect.succeed(null),
    getProjectSettings: (_pid: ProjectId) => Effect.succeed(opts.projectSettings ?? null),
  })

  const { repo: notificationRepo, rows } = createFakeNotificationRepository()

  const layer = Layer.mergeAll(
    Layer.succeed(AlertIncidentRepository, incidentRepo),
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(SettingsReader, settings),
    Layer.succeed(NotificationRepository, notificationRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectId, incidentId, incident, rows, layer }
}

describe("createIncidentNotificationsUseCase", () => {
  it("inserts one notification per org member with the right payload", async () => {
    const { incidentId, rows, layer } = setup({ memberUserIds: [cuid("ua"), cuid("ub"), cuid("uc")] })

    const result = await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "opened" }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ inserted: 3, skipped: false })
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.type).toBe("incident")
      // source_id points at the incident itself, not the underlying issue —
      // see notification entity / schema design.
      expect(row.sourceId).toBe(incidentId)
      expect(row.payload).toEqual({ event: "opened", incidentKind: "issue.new" })
    }
  })

  it("differentiates opened vs closed payloads on the same incident", async () => {
    const { incidentId, rows, layer } = setup({
      incident: { kind: "issue.escalating", severity: "high" },
      memberUserIds: [cuid("ua")],
    })

    await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "opened" }).pipe(Effect.provide(layer)),
    )
    await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "closed" }).pipe(Effect.provide(layer)),
    )

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => (r.payload as { event: string }).event)).toEqual(["opened", "closed"])
  })

  it("is idempotent under re-run for the same (incident, event) pair", async () => {
    const { incidentId, rows, layer } = setup({ memberUserIds: [cuid("ua"), cuid("ub")] })

    await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "opened" }).pipe(Effect.provide(layer)),
    )
    await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "opened" }).pipe(Effect.provide(layer)),
    )

    expect(rows).toHaveLength(2) // still just one per user, second run dedupes
  })

  it("skips when project settings disable the matching alert kind", async () => {
    const { incidentId, rows, layer } = setup({
      projectSettings: { alertNotifications: { "issue.new": false } },
    })

    const result = await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "opened" }).pipe(Effect.provide(layer)),
    )

    expect(result).toEqual({ inserted: 0, skipped: true })
    expect(rows).toHaveLength(0)
  })

  it("does not skip when settings disable a different kind", async () => {
    const { incidentId, rows, layer } = setup({
      projectSettings: { alertNotifications: { "issue.escalating": false } },
    })

    await Effect.runPromise(
      createIncidentNotificationsUseCase({ alertIncidentId: incidentId, event: "opened" }).pipe(Effect.provide(layer)),
    )

    expect(rows.length).toBeGreaterThan(0)
  })
})
