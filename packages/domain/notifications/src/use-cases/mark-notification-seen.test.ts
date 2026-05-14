import { NotificationId, OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Notification } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import { markNotificationSeenUseCase } from "./mark-notification-seen.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function setup() {
  const orgA = OrganizationId(cuid("oa"))
  const orgB = OrganizationId(cuid("ob"))
  const userA = UserId(cuid("ua"))
  const userB = UserId(cuid("ub"))

  const baseRow = {
    type: "custom_message" as const,
    sourceId: null,
    payload: { title: "hi" },
    createdAt: new Date("2026-05-10T00:00:00Z"),
    seenAt: null,
  }

  const { repo, rows } = createFakeNotificationRepository()
  // Seed four rows: org/user combinations to exercise tenancy + ownership scoping.
  rows.push(
    { id: NotificationId(cuid("n1")), organizationId: orgA, userId: userA, ...baseRow },
    {
      id: NotificationId(cuid("n2")),
      organizationId: orgA,
      userId: userA,
      ...baseRow,
      seenAt: new Date("2026-05-10T01:00:00Z"),
    },
    { id: NotificationId(cuid("n3")), organizationId: orgA, userId: userB, ...baseRow },
    { id: NotificationId(cuid("n4")), organizationId: orgB, userId: userA, ...baseRow },
  )

  const layer = Layer.mergeAll(
    Layer.succeed(NotificationRepository, repo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgA })),
  )

  const rowById = (id: string): Notification | undefined => rows.find((r) => r.id === id)

  return { orgA, orgB, userA, userB, rows, rowById, layer }
}

describe("markNotificationSeenUseCase", () => {
  it("marks an unread row as seen", async () => {
    const { orgA, userA, rowById, layer } = setup()

    await Effect.runPromise(
      markNotificationSeenUseCase({ organizationId: orgA, userId: userA, notificationId: cuid("n1") }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(rowById(cuid("n1"))?.seenAt).toBeInstanceOf(Date)
  })

  it("is a no-op on an already-seen row (does not overwrite seenAt)", async () => {
    const { orgA, userA, rowById, layer } = setup()
    const before = rowById(cuid("n2"))?.seenAt

    await Effect.runPromise(
      markNotificationSeenUseCase({ organizationId: orgA, userId: userA, notificationId: cuid("n2") }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(rowById(cuid("n2"))?.seenAt).toBe(before)
  })

  it("is a no-op when the notification belongs to a different user", async () => {
    const { orgA, userA, rowById, layer } = setup()

    await Effect.runPromise(
      // n3 belongs to userB, not userA
      markNotificationSeenUseCase({ organizationId: orgA, userId: userA, notificationId: cuid("n3") }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(rowById(cuid("n3"))?.seenAt).toBeNull()
  })

  it("is a no-op when the notification belongs to a different org", async () => {
    const { orgA, userA, rowById, layer } = setup()

    await Effect.runPromise(
      // n4 lives in orgB
      markNotificationSeenUseCase({ organizationId: orgA, userId: userA, notificationId: cuid("n4") }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(rowById(cuid("n4"))?.seenAt).toBeNull()
  })
})
