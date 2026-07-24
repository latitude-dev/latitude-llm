import { type Membership, MembershipRepository, type MembershipRole } from "@domain/organizations"
import { createFakeMembershipRepository } from "@domain/organizations/testing"
import { OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { requestBillingLimitNotificationsUseCase } from "./request-billing-limit-notifications.ts"

const cuid = (seed: string) => seed.padEnd(24, "0")

const orgId = OrganizationId(cuid("o"))
const periodStart = "2026-01-01T00:00:00.000Z"
const periodEnd = "2026-02-01T00:00:00.000Z"

const membership = (uid: string, role: MembershipRole): Membership => ({
  id: cuid(`m${uid}`) as Membership["id"],
  organizationId: orgId as Membership["organizationId"],
  userId: UserId(cuid(uid)),
  role,
  createdAt: new Date("2026-01-01T00:00:00Z"),
})

const makeLayer = (members: readonly Membership[]) => {
  const { repository } = createFakeMembershipRepository({
    listByOrganizationId: () => Effect.succeed([...members]),
  })
  return Layer.mergeAll(
    Layer.succeed(MembershipRepository, repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: orgId })),
  )
}

const input = {
  organizationId: orgId,
  periodStart,
  periodEnd,
  limitKind: "included-credits" as const,
  includedCredits: 20_000,
  consumedCredits: 20_000,
  overageCredits: 0,
}

describe("requestBillingLimitNotificationsUseCase", () => {
  it("fans out only to owners and admins", async () => {
    const result = await Effect.runPromise(
      requestBillingLimitNotificationsUseCase(input).pipe(
        Effect.provide(
          makeLayer([membership("owner", "owner"), membership("admin", "admin"), membership("member", "member")]),
        ),
      ),
    )

    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("unreachable")

    expect(result.requests).toHaveLength(2)
    expect(result.requests.map((r) => r.userId).sort()).toEqual([UserId(cuid("admin")), UserId(cuid("owner"))].sort())
    expect(result.requests[0]).toMatchObject({
      kind: "billing.limit-reached",
      projectId: null,
      idempotencyKey: `billing.limit-reached:${periodStart}:included-credits`,
      payload: {
        limitKind: "included-credits",
        includedCredits: 20_000,
        consumedCredits: 20_000,
      },
    })
  })

  it("skips when the organization has no owners or admins", async () => {
    const result = await Effect.runPromise(
      requestBillingLimitNotificationsUseCase(input).pipe(Effect.provide(makeLayer([membership("member", "member")]))),
    )

    expect(result).toEqual({ status: "skipped", reason: "no-recipients" })
  })

  it("keys idempotency per period and limit kind", async () => {
    const layer = makeLayer([membership("owner", "owner")])
    const included = await Effect.runPromise(requestBillingLimitNotificationsUseCase(input).pipe(Effect.provide(layer)))
    const spendCap = await Effect.runPromise(
      requestBillingLimitNotificationsUseCase({ ...input, limitKind: "spend-cap" }).pipe(Effect.provide(layer)),
    )

    expect(included.status).toBe("ok")
    expect(spendCap.status).toBe("ok")
    if (included.status !== "ok" || spendCap.status !== "ok") throw new Error("unreachable")

    expect(included.requests[0]?.idempotencyKey).toBe(`billing.limit-reached:${periodStart}:included-credits`)
    expect(spendCap.requests[0]?.idempotencyKey).toBe(`billing.limit-reached:${periodStart}:spend-cap`)
  })
})
