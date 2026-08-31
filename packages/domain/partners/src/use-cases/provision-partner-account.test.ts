import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { type OAuthGrantInput, OAuthGrantRepository } from "@domain/oauth-keys"
import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { createFakeMembershipRepository, createFakeOrganizationRepository } from "@domain/organizations/testing"
import { OrganizationId, PartnerId, RepositoryError, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { UserRepository } from "@domain/users"
import { createFakeUserRepository } from "@domain/users/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { PARTNER_ACCESS_TOKEN_TTL_SECONDS, PARTNER_REFRESH_TOKEN_TTL_SECONDS } from "../constants.ts"
import { createPartner } from "../entities/partner.ts"
import { provisionPartnerAccountUseCase } from "./provision-partner-account.ts"

const ORG_ID = OrganizationId("o".repeat(24))

const partner = createPartner({
  id: PartnerId("a".repeat(24)),
  name: "Longitude",
  iconUrl: "https://longitude.example/icon.png",
  redirectUrls: ["https://longitude.example/oauth/callback", "https://staging.longitude.example/oauth/callback"],
  scopes: ["accounts:provision"],
})

const createTestLayers = (options: { readonly userCreateFails?: RepositoryError } = {}) => {
  const { repository: orgRepo, organizations } = createFakeOrganizationRepository()
  const { repository: membershipRepo, memberships } = createFakeMembershipRepository()
  const { repository: baseUserRepo, users } = createFakeUserRepository()
  const userRepo = options.userCreateFails
    ? { ...baseUserRepo, create: () => Effect.fail(options.userCreateFails as RepositoryError) }
    : baseUserRepo

  const grants: OAuthGrantInput[] = []
  const events: OutboxWriteEvent[] = []

  const testLayers = Layer.mergeAll(
    Layer.succeed(UserRepository, userRepo),
    Layer.succeed(OrganizationRepository, orgRepo),
    Layer.succeed(MembershipRepository, membershipRepo),
    Layer.succeed(OAuthGrantRepository, {
      createGrant: (input: OAuthGrantInput) =>
        Effect.sync(() => {
          grants.push(input)
        }),
    }),
    Layer.succeed(OutboxEventWriter, {
      write: (event: OutboxWriteEvent) =>
        Effect.sync(() => {
          events.push(event)
        }),
    }),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG_ID })),
  )

  return { organizations, memberships, users, grants, events, testLayers }
}

const provision = (
  testLayers: ReturnType<typeof createTestLayers>["testLayers"],
  overrides: {
    readonly email?: string
    readonly user?: Partial<Parameters<typeof provisionPartnerAccountUseCase>[0]["user"]>
    readonly organization?: { readonly name?: string }
  } = {},
) =>
  provisionPartnerAccountUseCase({
    partner,
    organizationId: ORG_ID,
    user: { email: overrides.email ?? "founder@longitude.example", ...overrides.user },
    organization: overrides.organization ?? { name: "Courtesy" },
  }).pipe(Effect.provide(testLayers))

describe("provisionPartnerAccountUseCase", () => {
  it("creates the user, org, membership and grant, and returns an OAuth token pair", async () => {
    const { organizations, memberships, users, grants, testLayers } = createTestLayers()

    const result = await Effect.runPromise(provision(testLayers, { user: { name: "  Alex  " } }))

    const [user] = [...users.values()]
    expect(user).toMatchObject({ email: "founder@longitude.example", name: "Alex", emailVerified: false })

    const [organization] = [...organizations.values()]
    expect(organization).toMatchObject({ id: ORG_ID, name: "Courtesy", expiresAt: null })

    const [membership] = [...memberships.values()]
    expect(membership).toMatchObject({ organizationId: ORG_ID, userId: user?.id, role: "owner" })

    const [grant] = grants
    expect(grant?.application).toMatchObject({
      name: "Longitude",
      icon: "https://longitude.example/icon.png",
      clientSecret: "",
      redirectUrls: "https://longitude.example/oauth/callback,https://staging.longitude.example/oauth/callback",
      type: "public",
      userId: user?.id,
      organizationId: ORG_ID,
    })
    expect(JSON.parse(grant?.application.metadata ?? "{}")).toEqual({ partnerId: partner.id, provisioned: true })
    expect(grant?.token.scopes).toBe("openid offline_access")
    expect(grant?.consent).toMatchObject({ scopes: "openid offline_access", clientId: grant?.application.clientId })

    expect(result).toMatchObject({
      expiresIn: PARTNER_ACCESS_TOKEN_TTL_SECONDS,
      scope: "openid offline_access",
      clientId: grant?.application.clientId,
      organizationId: ORG_ID,
      organizationSlug: organization?.slug,
      userId: user?.id,
    })
    expect(result.accessToken).toMatch(/^[a-zA-Z]{32}$/)
    expect(result.refreshToken).toMatch(/^[a-zA-Z]{32}$/)
    expect(result.accessToken).not.toBe(result.refreshToken)
  })

  it("mirrors Better Auth's token TTLs on the grant rows", async () => {
    const { grants, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers))

    const token = grants[0]?.token
    const lifetimeSeconds = (expiry: Date | undefined) => Math.round(((expiry?.getTime() ?? 0) - Date.now()) / 1000)
    expect(lifetimeSeconds(token?.accessTokenExpiresAt)).toBeCloseTo(PARTNER_ACCESS_TOKEN_TTL_SECONDS, -1)
    expect(lifetimeSeconds(token?.refreshTokenExpiresAt)).toBeCloseTo(PARTNER_REFRESH_TOKEN_TTL_SECONDS, -1)
  })

  it("normalizes the email before storing it", async () => {
    const { users, events, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers, { email: "  Founder@Longitude.Example  " }))

    expect([...users.values()][0]?.email).toBe("founder@longitude.example")
    const signedUp = events.find((event) => event.eventName === "UserSignedUp")
    expect(signedUp?.payload).toMatchObject({ email: "founder@longitude.example" })
  })

  it("derives the user's name from the email when the partner omits it", async () => {
    const { users, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers, { email: "ada.lovelace@longitude.example" }))

    expect([...users.values()][0]?.name).toBe("Ada Lovelace")
  })

  it("derives the organization name from the user's when omitted", async () => {
    const { organizations, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers, { email: "ada.lovelace@longitude.example", organization: {} }))

    expect([...organizations.values()][0]?.name).toBe("Ada Lovelace's Organization")
  })

  it("records the partner as the acquisition source, since onboarding never asks", async () => {
    const { users, events, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers))

    expect([...users.values()][0]?.heardAboutUs).toBe("Longitude")
    // PostHog only sees UserSignedUp, so the partner has to ride along on it.
    expect(events.find((event) => event.eventName === "UserSignedUp")?.payload).toMatchObject({
      partnerId: partner.id,
      partnerName: "Longitude",
    })
  })

  it("stores the optional profile fields the onboarding form would have collected", async () => {
    const { users, testLayers } = createTestLayers()

    await Effect.runPromise(
      provision(testLayers, {
        user: {
          name: "Ada",
          image: "https://longitude.example/ada.png",
          phoneNumber: "+15550100",
          jobTitle: "Founder",
        },
      }),
    )

    expect([...users.values()][0]).toMatchObject({
      name: "Ada",
      image: "https://longitude.example/ada.png",
      phoneNumber: "+15550100",
      jobTitle: "Founder",
    })
  })

  it("emits the four audit events and deliberately not MemberJoined", async () => {
    const { events, grants, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers))

    expect(events.map((event) => event.eventName)).toEqual([
      "UserSignedUp",
      "OrganizationCreated",
      "OAuthKeyCreated",
      "PartnerAccountProvisioned",
    ])

    const oauthKeyCreated = events.find((event) => event.eventName === "OAuthKeyCreated")
    expect(oauthKeyCreated?.aggregateId).toBe(grants[0]?.application.id)
    expect(oauthKeyCreated?.payload).toMatchObject({
      organizationId: ORG_ID,
      clientId: grants[0]?.application.clientId,
      clientName: "Longitude",
    })

    const provisioned = events.find((event) => event.eventName === "PartnerAccountProvisioned")
    expect(provisioned?.aggregateId).toBe(partner.id)
    expect(provisioned?.payload).toMatchObject({
      partnerId: partner.id,
      partnerName: "Longitude",
      organizationId: ORG_ID,
      userEmail: "founder@longitude.example",
      clientId: grants[0]?.application.clientId,
    })
  })

  it("routes UserSignedUp through the system org, like the Better Auth hook it replaces", async () => {
    const { events, testLayers } = createTestLayers()

    await Effect.runPromise(provision(testLayers))

    expect(events.find((event) => event.eventName === "UserSignedUp")?.organizationId).toBe("system")
  })

  it("refuses an email that already belongs to a user, writing nothing", async () => {
    const { users, organizations, grants, events, testLayers } = createTestLayers()
    await Effect.runPromise(provision(testLayers))
    const afterFirst = { users: users.size, organizations: organizations.size }

    const exit = await Effect.runPromiseExit(provision(testLayers, { email: "FOUNDER@longitude.example" }))

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "ConflictError",
    )
    expect(users.size).toBe(afterFirst.users)
    expect(organizations.size).toBe(afterFirst.organizations)
    expect(grants).toHaveLength(1)
    expect(events.filter((event) => event.eventName === "PartnerAccountProvisioned")).toHaveLength(1)
  })

  it("maps a concurrent insert's unique violation to the same conflict, not a 500", async () => {
    const { testLayers } = createTestLayers({
      userCreateFails: new RepositoryError({
        cause: Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }),
        operation: "create",
      }),
    })

    const exit = await Effect.runPromiseExit(provision(testLayers))

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "ConflictError",
    )
  })

  it("lets an unrelated repository failure through untouched", async () => {
    const { testLayers } = createTestLayers({
      userCreateFails: new RepositoryError({ cause: new Error("connection reset"), operation: "create" }),
    })

    const exit = await Effect.runPromiseExit(provision(testLayers))

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "RepositoryError",
    )
  })
})
