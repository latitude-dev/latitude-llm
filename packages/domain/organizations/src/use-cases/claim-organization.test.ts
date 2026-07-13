import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, RepositoryError, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { hash } from "@repo/utils"
import { Effect, Exit } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { createMembership } from "../entities/membership.ts"
import { createOrganization } from "../entities/organization.ts"
import { createOrganizationClaim } from "../entities/organization-claim.ts"
import { MembershipRepository } from "../ports/membership-repository.ts"
import { OrganizationClaimRepository } from "../ports/organization-claim-repository.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeMembershipRepository } from "../testing/fake-membership-repository.ts"
import { createFakeOrganizationClaimRepository } from "../testing/fake-organization-claim-repository.ts"
import { createFakeOrganizationRepository } from "../testing/fake-organization-repository.ts"
import { claimOrganizationUseCase } from "./claim-organization.ts"

type OrganizationClaimRepositoryShape = (typeof OrganizationClaimRepository)["Service"]

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const USER_ID = UserId("uuuuuuuuuuuuuuuuuuuuuuuu")
const RAW_TOKEN = "a1b2c3d4".repeat(8)

const inOneWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
const inThePast = () => new Date(Date.now() - 60_000)

let TOKEN_HASH: string
beforeAll(async () => {
  TOKEN_HASH = await Effect.runPromise(hash(RAW_TOKEN))
})

const setup = (seed: {
  claim?: { tokenHash?: string; expiresAt: Date; claimedAt?: Date | null }
  org?: { expiresAt: Date | null }
  withMember?: boolean
  markClaimed?: OrganizationClaimRepositoryShape["markClaimed"]
  findByTokenHashForUpdate?: OrganizationClaimRepositoryShape["findByTokenHashForUpdate"]
}) => {
  let inTransaction = false
  const sqlClient: SqlClientShape = {
    organizationId: OrganizationId("system"),
    transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      inTransaction
        ? effect
        : Effect.gen(function* () {
            inTransaction = true
            try {
              return yield* effect
            } finally {
              inTransaction = false
            }
          }),
    query: () => Effect.die(new Error("unexpected query")),
  }

  const { repository: claimRepo, claims } = createFakeOrganizationClaimRepository(
    seed.markClaimed || seed.findByTokenHashForUpdate
      ? {
          ...(seed.markClaimed ? { markClaimed: seed.markClaimed } : {}),
          ...(seed.findByTokenHashForUpdate ? { findByTokenHashForUpdate: seed.findByTokenHashForUpdate } : {}),
        }
      : undefined,
  )
  const { repository: organizationRepo, organizations } = createFakeOrganizationRepository()
  const { repository: membershipRepo, memberships } = createFakeMembershipRepository()
  const writtenEvents: OutboxWriteEvent[] = []

  if (seed.claim) {
    claims.push(
      createOrganizationClaim({
        organizationId: ORG_ID,
        tokenHash: seed.claim.tokenHash ?? TOKEN_HASH,
        expiresAt: seed.claim.expiresAt,
        claimedAt: seed.claim.claimedAt ?? null,
      }),
    )
  }
  if (seed.org) {
    const org = createOrganization({
      id: ORG_ID,
      name: "Acme",
      slug: "acme",
      expiresAt: seed.org.expiresAt,
    })
    organizations.set(org.id, org)
  }
  if (seed.withMember) {
    const member = createMembership({
      organizationId: ORG_ID,
      userId: UserId("m".repeat(24)),
      role: "owner",
    })
    memberships.set(member.id, member)
  }

  const run = (token: string) =>
    Effect.runPromiseExit(
      claimOrganizationUseCase({ token, userId: USER_ID }).pipe(
        Effect.provideService(SqlClient, sqlClient),
        Effect.provideService(OrganizationClaimRepository, claimRepo),
        Effect.provideService(OrganizationRepository, organizationRepo),
        Effect.provideService(MembershipRepository, membershipRepo),
        Effect.provideService(OutboxEventWriter, {
          write: (event: OutboxWriteEvent) =>
            Effect.sync(() => {
              writtenEvents.push(event)
            }),
        }),
      ),
    )

  return { run, claims, organizations, memberships, writtenEvents }
}

const causeText = (exit: Exit.Exit<unknown, unknown>): string =>
  Exit.isFailure(exit) ? JSON.stringify(exit.cause.toJSON()) : ""

describe("claimOrganizationUseCase", () => {
  it("assigns ownership, clears the org's expiry, and consumes the claim", async () => {
    const { run, claims, organizations, memberships, writtenEvents } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: inOneWeek() },
    })

    const exit = await run(RAW_TOKEN)
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.organization).toMatchObject({ id: ORG_ID, slug: "acme" })

    expect(writtenEvents.map((e) => e.eventName)).toContain("OrganizationClaimed")

    const savedMembers = [...memberships.values()]
    expect(savedMembers).toHaveLength(1)
    expect(savedMembers[0]).toMatchObject({
      organizationId: ORG_ID,
      userId: USER_ID,
      role: "owner",
    })

    expect(organizations.get(ORG_ID)?.expiresAt).toBeNull()
    expect(claims[0]?.claimedAt).toBeInstanceOf(Date)
  })

  it("opts the claimed org into the shared showcase (wantsShowcase)", async () => {
    const { run, organizations } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: inOneWeek() },
    })
    expect(organizations.get(ORG_ID)?.settings?.wantsShowcase).not.toBe(true)

    const exit = await run(RAW_TOKEN)
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(organizations.get(ORG_ID)?.settings?.wantsShowcase).toBe(true)
  })

  it("rejects an unknown token", async () => {
    const { run } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: inOneWeek() },
    })
    expect(causeText(await run("nope".repeat(16)))).toContain("ClaimTokenInvalidError")
  })

  it("rejects an already-claimed token", async () => {
    const { run } = setup({
      claim: { expiresAt: inOneWeek(), claimedAt: new Date() },
      org: { expiresAt: inOneWeek() },
    })
    expect(causeText(await run(RAW_TOKEN))).toContain("ClaimAlreadyUsedError")
  })

  it("rejects an expired token", async () => {
    const { run } = setup({
      claim: { expiresAt: inThePast() },
      org: { expiresAt: inOneWeek() },
    })
    expect(causeText(await run(RAW_TOKEN))).toContain("ClaimExpiredError")
  })

  it("rejects when the org is already normalized (expires_at null)", async () => {
    const { run } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: null },
    })
    expect(causeText(await run(RAW_TOKEN))).toContain("OrganizationNotClaimableError")
  })

  it("rejects when the org already has a member (anti-theft)", async () => {
    const { run } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: inOneWeek() },
      withMember: true,
    })
    expect(causeText(await run(RAW_TOKEN))).toContain("OrganizationNotClaimableError")
  })

  it("rejects when markClaimed loses a concurrent redemption race", async () => {
    const { run } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: inOneWeek() },
      markClaimed: () => Effect.succeed(false),
    })
    expect(causeText(await run(RAW_TOKEN))).toContain("ClaimAlreadyUsedError")
  })

  it("rejects when the claim row lock is already held (NOWAIT)", async () => {
    const { run } = setup({
      claim: { expiresAt: inOneWeek() },
      org: { expiresAt: inOneWeek() },
      findByTokenHashForUpdate: () =>
        Effect.fail(new RepositoryError({ cause: { code: "55P03" }, operation: "query" })),
    })
    expect(causeText(await run(RAW_TOKEN))).toContain("ClaimAlreadyUsedError")
  })
})
