import {
  generateId,
  NotificationId,
  type NotificationPreferences,
  OrganizationId,
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
}

function setup(opts: SetupOpts = {}) {
  const orgId = OrganizationId(cuid("o"))
  const userId = UserId(cuid("u"))

  const { repository: userRepo, users } = createFakeUserRepository()
  users.set(userId, {
    id: userId,
    email: "user@test.com",
    name: "User",
    jobTitle: null,
    emailVerified: true,
    image: null,
    role: "user",
    notificationPreferences: null,
    createdAt: new Date(),
    ...opts.user,
  } satisfies User)

  const { repo: notificationRepo, rows } = createFakeNotificationRepository()

  const layer = Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(NotificationRepository, notificationRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, userId, rows, layer }
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
        payload: incidentPayload(alertIncidentId),
      }).pipe(Effect.provide(layer)),
    )

    expect(second.notification).toBeNull()
    expect(second.emailEligible).toBe(false)
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
        payload: { wrappedReportId: cuid("wr"), projectName: "X", link: "https://example/x" },
      }).pipe(Effect.provide(layer)),
    )

    expect(result.emailEligible).toBe(true)
  })
})
