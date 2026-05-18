import { type Membership, MembershipRepository, type MembershipRole, type MemberWithUser } from "@domain/organizations"
import { OrganizationId, ProjectId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestWrappedReportNotificationsUseCase } from "./request-wrapped-report-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

function setup(memberUserIds: readonly string[] = [cuid("ua"), cuid("ub")]) {
  const orgId = OrganizationId(cuid("o"))
  const projectId = ProjectId(cuid("p"))
  const wrappedReportId = cuid("wr")

  const members: MemberWithUser[] = memberUserIds.map((uid, i) => ({
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

  const layer = Layer.mergeAll(
    Layer.succeed(MembershipRepository, memberships),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )

  return { orgId, projectId, wrappedReportId, layer }
}

describe("requestWrappedReportNotificationsUseCase", () => {
  it("emits one request per org member with a kind-anchored idempotency key", async () => {
    const { orgId, projectId, wrappedReportId, layer } = setup([cuid("ua"), cuid("ub"), cuid("uc")])

    const result = await Effect.runPromise(
      requestWrappedReportNotificationsUseCase({
        organizationId: orgId,
        projectId,
        wrappedReportId,
        link: `https://app.example/wrapped/${wrappedReportId}`,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")
    expect(result.requests).toHaveLength(3)
    for (const req of result.requests) {
      expect(req.kind).toBe("wrapped.report")
      expect(req.idempotencyKey).toBe(`wrapped.report:${wrappedReportId}`)
      expect(req.projectId).toBe(projectId)
      expect(req.payload.wrappedReportId).toBe(wrappedReportId)
      expect(req.payload.link).toBe(`https://app.example/wrapped/${wrappedReportId}`)
    }
  })

  it("skips with reason 'no-recipients' when the org has no members", async () => {
    const { orgId, projectId, wrappedReportId, layer } = setup([])

    const result = await Effect.runPromise(
      requestWrappedReportNotificationsUseCase({
        organizationId: orgId,
        projectId,
        wrappedReportId,
        link: `https://app.example/wrapped/${wrappedReportId}`,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.status).toBe("skipped")
    if (result.status !== "skipped") throw new Error("unreachable")
    expect(result.reason).toBe("no-recipients")
  })
})
