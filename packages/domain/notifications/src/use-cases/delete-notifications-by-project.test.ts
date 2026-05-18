import { generateId, NotificationId, OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Notification } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import { deleteNotificationsByProjectUseCase } from "./delete-notifications-by-project.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function setup() {
  const orgId = OrganizationId(cuid("o"))
  const projectA = ProjectId(cuid("pa"))
  const projectB = ProjectId(cuid("pb"))
  const userId = UserId(cuid("u"))

  const { repo, rows } = createFakeNotificationRepository()

  const seed = (notification: Notification) => rows.push(notification)
  const layer = Layer.mergeAll(
    Layer.succeed(NotificationRepository, repo),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectA, projectB, userId, rows, seed, layer }
}

const stored = (orgId: string, userId: string, projectId: string | null, key: string): Notification => ({
  id: NotificationId(generateId()),
  organizationId: orgId as Notification["organizationId"],
  userId: userId as Notification["userId"],
  kind: "incident.opened",
  idempotencyKey: key,
  projectId: projectId === null ? null : (projectId as Notification["projectId"]),
  payload: { incidentKind: "issue.new", alertIncidentId: cuid("ai") },
  createdAt: new Date(),
  seenAt: null,
  emailedAt: null,
})

describe("deleteNotificationsByProjectUseCase", () => {
  it("removes only notifications anchored to the target project", async () => {
    const ctx = setup()
    ctx.seed(stored(ctx.orgId, ctx.userId, ctx.projectA, "a:1"))
    ctx.seed(stored(ctx.orgId, ctx.userId, ctx.projectA, "a:2"))
    ctx.seed(stored(ctx.orgId, ctx.userId, ctx.projectB, "b:1"))
    ctx.seed(stored(ctx.orgId, ctx.userId, null, "x:1"))

    const result = await Effect.runPromise(
      deleteNotificationsByProjectUseCase({ organizationId: ctx.orgId, projectId: ctx.projectA }).pipe(
        Effect.provide(ctx.layer),
      ),
    )

    expect(result.deleted).toBe(2)
    const remaining = ctx.rows.map((r) => r.projectId)
    expect(remaining).toEqual([ctx.projectB, null])
  })

  it("is idempotent — re-running deletes zero rows", async () => {
    const ctx = setup()
    ctx.seed(stored(ctx.orgId, ctx.userId, ctx.projectA, "a:1"))

    await Effect.runPromise(
      deleteNotificationsByProjectUseCase({ organizationId: ctx.orgId, projectId: ctx.projectA }).pipe(
        Effect.provide(ctx.layer),
      ),
    )
    const second = await Effect.runPromise(
      deleteNotificationsByProjectUseCase({ organizationId: ctx.orgId, projectId: ctx.projectA }).pipe(
        Effect.provide(ctx.layer),
      ),
    )

    expect(second.deleted).toBe(0)
  })
})
