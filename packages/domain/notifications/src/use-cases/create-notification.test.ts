import { createProject, ProjectRepository } from "@domain/projects"
import { createFakeProjectRepository } from "@domain/projects/testing"
import {
  generateId,
  NotificationId,
  type NotificationPreferences,
  OrganizationId,
  ProjectId,
  SqlClient,
  UserId,
} from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type User, UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import { createNotificationUseCase } from "./create-notification.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

interface SetupOpts {
  readonly user?: Partial<User>
  readonly sampleProject?: boolean
}

function setup(opts: SetupOpts = {}) {
  const orgId = OrganizationId(cuid("o"))
  const userId = UserId(cuid("u"))
  const projectId = ProjectId(cuid("p"))

  const { repository: userRepo, users } = createFakeUserRepository()
  users.set(userId, {
    id: userId,
    email: "user@test.com",
    name: "User",
    jobTitle: null,
    phoneNumber: null,
    emailVerified: true,
    image: null,
    role: "user",
    notificationPreferences: null,
    createdAt: new Date(),
    ...opts.user,
  } satisfies User)

  const { repo: notificationRepo, rows } = createFakeNotificationRepository()
  const { repository: projectRepo } = createFakeProjectRepository([
    createProject({
      id: projectId,
      organizationId: orgId,
      name: opts.sampleProject ? "Sample project" : "Project",
      slug: opts.sampleProject ? "sample-project" : "project",
      settings: opts.sampleProject ? { isSample: true } : null,
    }),
  ])

  const layer = Layer.mergeAll(
    Layer.succeed(ProjectRepository, projectRepo),
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(NotificationRepository, notificationRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectId, userId, rows, layer }
}

const incidentPayload = (alertIncidentId: string) => ({
  incidentKind: "issue.new" as const,
  alertIncidentId,
})

describe("createNotificationUseCase", () => {
  it("inserts a row and returns emailEligible=true with default prefs", async () => {
    const { orgId, userId, rows, layer } = setup()
    const alertIncidentId = cuid("ai")

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey: `incident.opened:${alertIncidentId}`,
        projectId: null,
        payload: incidentPayload(alertIncidentId),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.notification).not.toBeNull()
    expect(result.emailEligible).toBe(true)
    expect(rows).toHaveLength(1)
  })

  it("returns notification=null and emailEligible=false on duplicate insert", async () => {
    const { orgId, userId, rows, layer } = setup()
    const alertIncidentId = cuid("ai")
    const idempotencyKey = `incident.opened:${alertIncidentId}`

    await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey,
        projectId: null,
        payload: incidentPayload(alertIncidentId),
      }).pipe(Effect.provide(layer)),
    )

    const second = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey,
        projectId: null,
        payload: incidentPayload(alertIncidentId),
      }).pipe(Effect.provide(layer)),
    )

    expect(second.notification).toBeNull()
    expect(second.emailEligible).toBe(false)
    expect(rows).toHaveLength(1)
  })

  it("suppresses email for sample-project notifications while keeping the in-app row", async () => {
    const { orgId, projectId, userId, rows, layer } = setup({ sampleProject: true })
    const alertIncidentId = cuid("ai")

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey: `incident.opened:${alertIncidentId}`,
        projectId,
        payload: incidentPayload(alertIncidentId),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.notification).not.toBeNull()
    expect(result.emailEligible).toBe(false)
    expect(rows).toHaveLength(1)
  })

  it("respects per-group user email preferences", async () => {
    const prefs: NotificationPreferences = { incidents: { email: false } }
    const { orgId, userId, layer } = setup({ user: { notificationPreferences: prefs } })

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey: `incident.opened:${cuid("ai")}`,
        projectId: null,
        payload: incidentPayload(cuid("ai")),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.notification).not.toBeNull()
    expect(result.emailEligible).toBe(false)
  })

  it("turning email off for one group leaves other groups eligible", async () => {
    const prefs: NotificationPreferences = { incidents: { email: false } }
    const { orgId, userId, layer } = setup({ user: { notificationPreferences: prefs } })

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "wrapped.report",
        idempotencyKey: `wrapped.report:${cuid("wr")}`,
        projectId: null,
        payload: { wrappedReportId: cuid("wr"), link: "https://example/x" },
      }).pipe(Effect.provide(layer)),
    )

    expect(result.emailEligible).toBe(true)
  })

  it("dedupes a redelivered issue.assigned but inserts a fresh row for a new assignedAt", async () => {
    const { orgId, userId, layer, rows } = setup()
    const signalAssigned = (assignedAt: string) => ({
      organizationId: orgId,
      userId,
      kind: "issue.assigned" as const,
      idempotencyKey: `issue.assigned:${cuid("i")}:${assignedAt}`,
      projectId: null,
      payload: { signalId: cuid("i"), actorUserId: cuid("a"), assignedAt },
    })

    const first = await Effect.runPromise(
      createNotificationUseCase({
        ...signalAssigned("2026-05-07T10:00:00.000Z"),
        notificationId: NotificationId(generateId()),
      }).pipe(Effect.provide(layer)),
    )
    // Outbox/queue redelivery: identical key → silently absorbed.
    const redelivered = await Effect.runPromise(
      createNotificationUseCase({
        ...signalAssigned("2026-05-07T10:00:00.000Z"),
        notificationId: NotificationId(generateId()),
      }).pipe(Effect.provide(layer)),
    )
    // A later re-assignment back to the same user: new assignedAt → new row.
    const reassigned = await Effect.runPromise(
      createNotificationUseCase({
        ...signalAssigned("2026-05-08T09:00:00.000Z"),
        notificationId: NotificationId(generateId()),
      }).pipe(Effect.provide(layer)),
    )

    expect(first.notification).not.toBeNull()
    expect(redelivered.notification).toBeNull()
    expect(reassigned.notification).not.toBeNull()
    expect(rows).toHaveLength(2)
  })

  it("treats the personal group as email-eligible by default", async () => {
    const { orgId, userId, layer } = setup()

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "issue.assigned",
        idempotencyKey: `issue.assigned:${cuid("i")}:2026-05-07T10:00:00.000Z`,
        projectId: null,
        payload: { signalId: cuid("i"), actorUserId: cuid("a"), assignedAt: "2026-05-07T10:00:00.000Z" },
      }).pipe(Effect.provide(layer)),
    )

    expect(result.notification).not.toBeNull()
    expect(result.emailEligible).toBe(true)
  })

  it("gates email on the group's minimum severity (progressive: medium admits medium and high)", async () => {
    const prefs: NotificationPreferences = { incidents: { email: true, emailMinSeverity: "medium" } }
    const { orgId, userId, layer } = setup({ user: { notificationPreferences: prefs } })

    const eligibilityFor = async (severity: "low" | "medium" | "high") => {
      const result = await Effect.runPromise(
        createNotificationUseCase({
          organizationId: orgId,
          userId,
          notificationId: NotificationId(generateId()),
          kind: "incident.opened",
          idempotencyKey: `incident.opened:${cuid(severity)}`,
          projectId: null,
          payload: { ...incidentPayload(cuid(severity)), severity },
        }).pipe(Effect.provide(layer)),
      )
      return result.emailEligible
    }

    expect(await eligibilityFor("low")).toBe(false)
    expect(await eligibilityFor("medium")).toBe(true)
    expect(await eligibilityFor("high")).toBe(true)
  })

  it("still creates the in-app row when minimum severity suppresses the email", async () => {
    const prefs: NotificationPreferences = { incidents: { email: true, emailMinSeverity: "high" } }
    const { orgId, userId, rows, layer } = setup({ user: { notificationPreferences: prefs } })

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey: `incident.opened:${cuid("ai")}`,
        projectId: null,
        payload: { ...incidentPayload(cuid("ai")), severity: "low" },
      }).pipe(Effect.provide(layer)),
    )

    expect(result.notification).not.toBeNull()
    expect(rows).toHaveLength(1)
    expect(result.emailEligible).toBe(false)
  })

  it("ignores the minimum severity for payloads without a severity", async () => {
    const prefs: NotificationPreferences = { incidents: { email: true, emailMinSeverity: "high" } }
    const { orgId, userId, layer } = setup({ user: { notificationPreferences: prefs } })

    const result = await Effect.runPromise(
      createNotificationUseCase({
        organizationId: orgId,
        userId,
        notificationId: NotificationId(generateId()),
        kind: "incident.opened",
        idempotencyKey: `incident.opened:${cuid("ai")}`,
        projectId: null,
        payload: incidentPayload(cuid("ai")),
      }).pipe(Effect.provide(layer)),
    )

    expect(result.emailEligible).toBe(true)
  })
})
