import { NotFoundError, OrganizationId, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { AdminOrganizationRepository } from "./organization-repository.ts"
import { setOrganizationShowcaseUseCase } from "./set-organization-showcase.ts"

const ORG_ID = OrganizationId("o".repeat(24))
const ADMIN_ID = UserId("u".repeat(24))

const fakeRepo = (calls: Array<{ organizationId: string; enabled: boolean }>, exists = true) =>
  Layer.succeed(AdminOrganizationRepository, {
    findById: () => Effect.die("findById not used"),
    findManySummariesByIds: () => Effect.die("findManySummariesByIds not used"),
    listByConsumedCredits: () => Effect.die("listByConsumedCredits not used"),
    findFirstApiKeyId: () => Effect.die("findFirstApiKeyId not used"),
    setWantsShowcase: (organizationId, enabled) =>
      exists
        ? Effect.sync(() => {
            calls.push({ organizationId, enabled })
          })
        : Effect.fail(new NotFoundError({ entity: "Organization", id: organizationId })),
  })

describe("setOrganizationShowcaseUseCase", () => {
  it("enables the showcase for the target org", async () => {
    const calls: Array<{ organizationId: string; enabled: boolean }> = []
    await Effect.runPromise(
      setOrganizationShowcaseUseCase({ organizationId: ORG_ID, enabled: true, actorAdminUserId: ADMIN_ID }).pipe(
        Effect.provide(fakeRepo(calls)),
      ),
    )
    expect(calls).toEqual([{ organizationId: ORG_ID, enabled: true }])
  })

  it("disables the showcase for the target org", async () => {
    const calls: Array<{ organizationId: string; enabled: boolean }> = []
    await Effect.runPromise(
      setOrganizationShowcaseUseCase({ organizationId: ORG_ID, enabled: false, actorAdminUserId: ADMIN_ID }).pipe(
        Effect.provide(fakeRepo(calls)),
      ),
    )
    expect(calls).toEqual([{ organizationId: ORG_ID, enabled: false }])
  })

  it("propagates NotFoundError for a missing org", async () => {
    const exit = await Effect.runPromiseExit(
      setOrganizationShowcaseUseCase({ organizationId: ORG_ID, enabled: true, actorAdminUserId: ADMIN_ID }).pipe(
        Effect.provide(fakeRepo([], false)),
      ),
    )
    expect(exit._tag).toBe("Failure")
  })
})
