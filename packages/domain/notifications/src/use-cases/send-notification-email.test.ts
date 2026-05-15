import { generateId, NotificationId, OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { type User, UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Notification } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import {
  type NotificationEmailRenderer,
  type NotificationEmailSender,
  sendNotificationEmailUseCase,
} from "./send-notification-email.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function setup() {
  const orgId = OrganizationId(cuid("o"))
  const userId = UserId(cuid("u"))

  const { repository: userRepo, users } = createFakeUserRepository()
  users.set(userId, {
    id: userId,
    email: "user@test.com",
    name: "Alice",
    jobTitle: null,
    emailVerified: true,
    image: null,
    role: "user",
    notificationPreferences: null,
    createdAt: new Date(),
  } satisfies User)

  const { repo: notificationRepo, rows } = createFakeNotificationRepository()

  const sentMessages: { to: string; subject: string; html: string; text?: string }[] = []
  const renderedCalls: { kind: string; payload: Record<string, unknown> }[] = []

  const renderEmail: NotificationEmailRenderer = ({ kind, payload }) =>
    Effect.sync(() => {
      renderedCalls.push({ kind, payload })
      return { subject: `[Test] ${kind}`, html: "<p>hi</p>", text: "hi" }
    })

  const sendEmail: NotificationEmailSender = (message) =>
    Effect.sync(() => {
      sentMessages.push(message)
    })

  const layer = Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(NotificationRepository, notificationRepo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, userId, rows, layer, sentMessages, renderedCalls, renderEmail, sendEmail }
}

const makeStoredNotification = (params: {
  readonly userId: Notification["userId"]
  readonly organizationId: Notification["organizationId"]
}): Notification => ({
  id: NotificationId(generateId()),
  organizationId: params.organizationId,
  userId: params.userId,
  kind: "incident.opened",
  idempotencyKey: `incident.opened:${cuid("ai")}`,
  projectId: null,
  payload: { incidentKind: "issue.new", alertIncidentId: cuid("ai") },
  createdAt: new Date(),
  seenAt: null,
  emailedAt: null,
})

describe("sendNotificationEmailUseCase", () => {
  it("claims the row, renders, and sends — and is idempotent on the second call", async () => {
    const ctx = setup()
    const stored = makeStoredNotification({ organizationId: ctx.orgId, userId: ctx.userId })
    await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* NotificationRepository
        yield* repo.insertIfAbsent(stored)
      }).pipe(Effect.provide(ctx.layer)),
    )

    const send = sendNotificationEmailUseCase({ renderEmail: ctx.renderEmail, sendEmail: ctx.sendEmail })

    const first = await Effect.runPromise(send({ notificationId: stored.id }).pipe(Effect.provide(ctx.layer)))
    expect(first.sent).toBe(true)
    expect(ctx.sentMessages).toHaveLength(1)
    expect(ctx.sentMessages[0]?.to).toBe("user@test.com")
    expect(ctx.renderedCalls[0]?.kind).toBe("incident.opened")

    const second = await Effect.runPromise(send({ notificationId: stored.id }).pipe(Effect.provide(ctx.layer)))
    expect(second.sent).toBe(false)
    // Second run must not have rendered or sent again.
    expect(ctx.sentMessages).toHaveLength(1)
    expect(ctx.renderedCalls).toHaveLength(1)
  })

  it("fails with NotFoundError when the row is missing", async () => {
    const ctx = setup()
    const send = sendNotificationEmailUseCase({ renderEmail: ctx.renderEmail, sendEmail: ctx.sendEmail })

    const result = await Effect.runPromiseExit(
      send({ notificationId: NotificationId(generateId()) }).pipe(Effect.provide(ctx.layer)),
    )

    expect(result._tag).toBe("Failure")
  })
})
