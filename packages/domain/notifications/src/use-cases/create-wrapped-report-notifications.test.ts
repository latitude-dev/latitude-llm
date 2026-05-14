import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { NotificationRepository } from "../ports/notification-repository.ts"
import { createFakeNotificationRepository } from "../testing/fake-notification-repository.ts"
import { createWrappedReportNotificationsUseCase } from "./create-wrapped-report-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")
const ORG_ID = OrganizationId(cuid("o"))

const setup = (memberUserIds: readonly string[] = [cuid("u1"), cuid("u2")]) => {
  const memberships = MembershipRepository.of({
    findById: () => Effect.die("not used"),
    listByOrganizationId: () =>
      Effect.succeed(
        memberUserIds.map(
          (uid, i): Membership => ({
            id: cuid(`m${i}`) as Membership["id"],
            organizationId: ORG_ID,
            userId: UserId(uid),
            role: "member" as MembershipRole,
            createdAt: new Date(),
          }),
        ),
      ),
    listByUserId: () => Effect.succeed([]),
    findByOrganizationAndUser: () => Effect.die("not used"),
    listMembersWithUser: () => Effect.die("not used"),
    findByIdWithUser: () => Effect.die("not used"),
    findMemberByEmail: () => Effect.succeed(false),
    isMember: () => Effect.succeed(true),
    isAdmin: () => Effect.succeed(false),
    save: () => Effect.die("not used"),
    delete: () => Effect.die("not used"),
  })

  const { repo: notificationRepo, rows } = createFakeNotificationRepository()
  const sqlClient = createFakeSqlClient({ organizationId: ORG_ID })

  return {
    layer: Layer.mergeAll(
      Layer.succeed(MembershipRepository, memberships),
      Layer.succeed(NotificationRepository, notificationRepo),
      Layer.succeed(SqlClient, sqlClient),
    ),
    rows,
  }
}

describe("createWrappedReportNotificationsUseCase", () => {
  it("creates one wrapped_report notification per org member with the right payload + sourceId", async () => {
    const { layer, rows } = setup([cuid("u1"), cuid("u2"), cuid("u3")])

    const result = await Effect.runPromise(
      createWrappedReportNotificationsUseCase({
        organizationId: ORG_ID,
        wrappedReportId: cuid("wr1"),
        projectName: "poncho-ios",
        link: "https://example.com/wrapped/abc",
      }).pipe(Effect.provide(layer)),
    )

    expect(result.inserted).toBe(3)
    expect(rows).toHaveLength(3)
    for (const n of rows) {
      expect(n.type).toBe("wrapped_report")
      expect(n.sourceId).toBe(cuid("wr1"))
      expect(n.organizationId).toBe(ORG_ID)
      expect(n.payload).toEqual({
        projectName: "poncho-ios",
        link: "https://example.com/wrapped/abc",
      })
      expect(n.seenAt).toBeNull()
    }
    expect(rows.map((n) => n.userId).sort()).toEqual([cuid("u1"), cuid("u2"), cuid("u3")].sort())
  })

  it("returns inserted=0 when the org has no members", async () => {
    const { layer, rows } = setup([])

    const result = await Effect.runPromise(
      createWrappedReportNotificationsUseCase({
        organizationId: ORG_ID,
        wrappedReportId: cuid("wr2"),
        projectName: "p",
        link: "https://example.com/wrapped/xyz",
      }).pipe(Effect.provide(layer)),
    )

    expect(result.inserted).toBe(0)
    expect(rows).toHaveLength(0)
  })
})
