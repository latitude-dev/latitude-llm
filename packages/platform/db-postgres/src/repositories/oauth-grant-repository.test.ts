import { OAuthGrantRepository } from "@domain/oauth-keys"
import {
  generateOAuthClientString,
  PARTNER_ACCESS_TOKEN_TTL_SECONDS,
  PARTNER_GRANT_SCOPES,
  PARTNER_REFRESH_TOKEN_TTL_SECONDS,
} from "@domain/partners"
import { generateId, OrganizationId, type SqlClient, UserId } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import {
  members,
  oauthAccessTokens,
  oauthApplications,
  oauthConsents,
  organizations,
  users,
} from "../schema/better-auth.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { OAuthGrantRepositoryLive } from "./oauth-grant-repository.ts"

const ORG = OrganizationId("o".repeat(24))
const OTHER_ORG = OrganizationId("p".repeat(24))
const USER = UserId("u".repeat(24))
const OUTSIDER = UserId("w".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(effect: Effect.Effect<A, E, OAuthGrantRepository | SqlClient>, org: OrganizationId = ORG) =>
  Effect.runPromise(effect.pipe(withPostgres(OAuthGrantRepositoryLive, pg.adminPostgresClient, org)))

const runExit = <A, E>(effect: Effect.Effect<A, E, OAuthGrantRepository | SqlClient>) =>
  Effect.runPromiseExit(effect.pipe(withPostgres(OAuthGrantRepositoryLive, pg.adminPostgresClient, ORG)))

const seedTenant = async () => {
  await pg.db.insert(organizations).values([
    { id: ORG, name: "Provisioned", slug: "provisioned" },
    { id: OTHER_ORG, name: "Other", slug: "other" },
  ])
  await pg.db.insert(users).values([
    { id: USER, name: "", email: "owner@longitude.example", emailVerified: false },
    { id: OUTSIDER, name: "", email: "outsider@longitude.example", emailVerified: false },
  ])
  await pg.db.insert(members).values({ id: generateId(), organizationId: ORG, userId: USER, role: "owner" })
}

const makeGrant = (overrides: { readonly icon?: string | null; readonly userId?: UserId } = {}) => {
  const now = new Date()
  const clientId = generateOAuthClientString()
  const userId = overrides.userId ?? USER
  return {
    application: {
      id: generateId(),
      name: "Longitude",
      icon: overrides.icon === undefined ? "https://longitude.example/icon.png" : overrides.icon,
      metadata: JSON.stringify({ partnerId: "a".repeat(24), provisioned: true }),
      clientId,
      clientSecret: "",
      redirectUrls: "https://longitude.example/oauth/callback",
      type: "public",
      userId,
      organizationId: ORG,
    },
    token: {
      id: generateId(),
      accessToken: generateOAuthClientString(),
      refreshToken: generateOAuthClientString(),
      accessTokenExpiresAt: new Date(now.getTime() + PARTNER_ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenExpiresAt: new Date(now.getTime() + PARTNER_REFRESH_TOKEN_TTL_SECONDS * 1000),
      clientId,
      userId,
      scopes: PARTNER_GRANT_SCOPES,
    },
    consent: { id: generateId(), clientId, userId, scopes: PARTNER_GRANT_SCOPES },
  }
}

/** Mirrors `validate-oauth-token.ts`'s single lookup: token ⋈ application ⋈ live membership. */
const validationJoin = (accessToken: string) =>
  pg.db
    .select({
      userId: oauthAccessTokens.userId,
      organizationId: oauthApplications.organizationId,
      disabled: oauthApplications.disabled,
      scopes: oauthAccessTokens.scopes,
    })
    .from(oauthAccessTokens)
    .innerJoin(oauthApplications, eq(oauthApplications.clientId, oauthAccessTokens.clientId))
    .innerJoin(
      members,
      and(eq(members.organizationId, oauthApplications.organizationId), eq(members.userId, oauthAccessTokens.userId)),
    )
    .where(eq(oauthAccessTokens.accessToken, accessToken))
    .limit(1)

describe("OAuthGrantRepositoryLive", () => {
  afterEach(async () => {
    await pg.db.delete(oauthConsents)
    await pg.db.delete(oauthAccessTokens)
    await pg.db.delete(oauthApplications)
    await pg.db.delete(members)
    await pg.db.delete(users)
    await pg.db.delete(organizations)
  })

  it("inserts application, token and consent rows that satisfy both CHECK constraints", async () => {
    await seedTenant()
    const grant = makeGrant()

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant(grant)
      }),
    )

    const [app] = await pg.db
      .select()
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, grant.application.clientId))
    expect(app).toMatchObject({
      name: "Longitude",
      icon: "https://longitude.example/icon.png",
      clientSecret: "",
      type: "public",
      redirectUrls: "https://longitude.example/oauth/callback",
      disabled: false,
      userId: USER,
      organizationId: ORG,
    })
    expect(JSON.parse(app?.metadata ?? "{}")).toMatchObject({ provisioned: true })

    const [token] = await pg.db
      .select()
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.clientId, grant.application.clientId))
    expect(token?.scopes).toBe("openid offline_access")
    expect(token?.accessToken).toMatch(/^[a-zA-Z]{32}$/)
    expect(token?.refreshToken).toMatch(/^[a-zA-Z]{32}$/)

    const [consent] = await pg.db
      .select()
      .from(oauthConsents)
      .where(eq(oauthConsents.clientId, grant.application.clientId))
    expect(consent?.consentGiven).toBe(true)
  })

  it("accepts a null icon for partners without one", async () => {
    await seedTenant()

    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant(makeGrant({ icon: null }))
      }),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("rejects an icon the oauth_applications CHECK forbids", async () => {
    await seedTenant()

    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant(makeGrant({ icon: "javascript:alert(1)" }))
      }),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("binds the application to the RLS-context organization, not the one on the input", async () => {
    await seedTenant()
    const grant = makeGrant()

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant({ ...grant, application: { ...grant.application, organizationId: OTHER_ORG } })
      }),
      ORG,
    )

    const [app] = await pg.db
      .select({ organizationId: oauthApplications.organizationId })
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, grant.application.clientId))
    expect(app?.organizationId).toBe(ORG)
  })

  it("produces a grant the token validator's join resolves for a user with a membership", async () => {
    await seedTenant()
    const grant = makeGrant()

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant(grant)
      }),
    )

    const [row] = await validationJoin(grant.token.accessToken)
    expect(row).toMatchObject({
      userId: USER,
      organizationId: ORG,
      disabled: false,
      scopes: "openid offline_access",
    })
  })

  it("rolls all three inserts back when one fails, with no ambient transaction", async () => {
    await seedTenant()
    const grant = makeGrant()

    // A decoy consent already holding the PK the grant will use, so the third insert fails.
    // (`oauth_consents.client_id` is an FK, so the decoy needs a real application to point at.)
    const decoyClientId = generateOAuthClientString()
    await pg.db
      .insert(oauthApplications)
      .values({ id: generateId(), clientId: decoyClientId, userId: USER, organizationId: ORG })
    await pg.db
      .insert(oauthConsents)
      .values({ id: grant.consent.id, clientId: decoyClientId, userId: USER, scopes: "openid" })

    const exit = await runExit(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant(grant)
      }),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    const applications = await pg.db
      .select()
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, grant.application.clientId))
    const tokens = await pg.db
      .select()
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.clientId, grant.application.clientId))
    expect(applications).toHaveLength(0)
    expect(tokens).toHaveLength(0)
  })

  it("yields nothing from that join for a user with no membership in the bound org", async () => {
    await seedTenant()
    const grant = makeGrant({ userId: OUTSIDER })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* OAuthGrantRepository
        yield* repo.createGrant(grant)
      }),
    )

    expect(await validationJoin(grant.token.accessToken)).toHaveLength(0)
  })
})
