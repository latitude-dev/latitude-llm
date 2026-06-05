import { OrganizationId, type SqlClient } from "@domain/shared"
import { SsoProviderRepository } from "@domain/sso"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { organizations, ssoProviders } from "../schema/better-auth.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { SsoProviderRepositoryLive } from "./sso-provider-repository.ts"

const ORG_ID = OrganizationId("org-sso-providers-test".padEnd(24, "x").slice(0, 24))
const OTHER_ORG_ID = OrganizationId("org-sso-providers-othe".padEnd(24, "x").slice(0, 24))

const pg = setupTestPostgres()

const runAsAdmin = <A, E>(effect: Effect.Effect<A, E, SsoProviderRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(SsoProviderRepositoryLive, pg.adminPostgresClient, ORG_ID)))

const runAsTenant = <A, E>(effect: Effect.Effect<A, E, SsoProviderRepository | SqlClient>, orgId = ORG_ID) =>
  Effect.runPromise(effect.pipe(withPostgres(SsoProviderRepositoryLive, pg.appPostgresClient, orgId)))

const insertProvider = async (params: {
  id: string
  organizationId: string | null
  providerId: string
  domain: string
  domainVerified?: boolean
  enforced?: boolean
  samlConfig?: string | null
  oidcConfig?: string | null
}) => {
  await pg.db.insert(ssoProviders).values({
    id: params.id.padEnd(24, "x").slice(0, 24),
    issuer: "https://idp.example.com",
    domain: params.domain,
    providerId: params.providerId,
    organizationId: params.organizationId,
    domainVerified: params.domainVerified ?? false,
    enforced: params.enforced ?? false,
    samlConfig: params.samlConfig !== undefined ? params.samlConfig : '{"entryPoint":"https://idp.example.com/sso"}',
    oidcConfig: params.oidcConfig !== undefined ? params.oidcConfig : null,
  })
}

describe("SsoProviderRepositoryLive", () => {
  beforeEach(async () => {
    await pg.db.delete(ssoProviders)
    await pg.db.delete(organizations)
    // `sso_providers.organization_id` carries an FK (BA table family idiom).
    await pg.db.insert(organizations).values([
      { id: ORG_ID, name: "SSO Test Org", slug: "sso-test-org" },
      { id: OTHER_ORG_ID, name: "SSO Other Org", slug: "sso-other-org" },
    ])
  })

  describe("findForOrganization", () => {
    it("returns the active org's provider through the tenant client", async () => {
      await insertProvider({ id: "sso-own", organizationId: ORG_ID, providerId: "acme-saml", domain: "acme.com" })
      await insertProvider({ id: "sso-other", organizationId: OTHER_ORG_ID, providerId: "other", domain: "other.com" })

      const provider = await runAsTenant(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findForOrganization()
        }),
      )

      expect(provider?.providerId).toBe("acme-saml")
      expect(provider?.kind).toBe("saml")
    })

    it("does not leak another org's provider under RLS", async () => {
      await insertProvider({ id: "sso-other", organizationId: OTHER_ORG_ID, providerId: "other", domain: "other.com" })

      const provider = await runAsTenant(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findForOrganization()
        }),
      )

      expect(provider).toBeNull()
    })

    it("derives kind=oidc when only oidc_config is set", async () => {
      await insertProvider({
        id: "sso-oidc",
        organizationId: ORG_ID,
        providerId: "acme-oidc",
        domain: "acme.com",
        samlConfig: null,
        oidcConfig: '{"clientId":"abc"}',
      })

      const provider = await runAsAdmin(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findForOrganization()
        }),
      )

      expect(provider?.kind).toBe("oidc")
    })
  })

  describe("findVerifiedByDomain", () => {
    it("finds a verified provider cross-org through the admin client", async () => {
      await insertProvider({
        id: "sso-other",
        organizationId: OTHER_ORG_ID,
        providerId: "other-saml",
        domain: "other.com",
        domainVerified: true,
      })

      const provider = await runAsAdmin(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findVerifiedByDomain("other.com")
        }),
      )

      expect(provider?.providerId).toBe("other-saml")
    })

    it("normalizes the domain to lowercase", async () => {
      await insertProvider({
        id: "sso-own",
        organizationId: ORG_ID,
        providerId: "acme-saml",
        domain: "acme.com",
        domainVerified: true,
      })

      const provider = await runAsAdmin(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findVerifiedByDomain("ACME.COM")
        }),
      )

      expect(provider?.providerId).toBe("acme-saml")
    })

    it("ignores unverified providers", async () => {
      await insertProvider({
        id: "sso-own",
        organizationId: ORG_ID,
        providerId: "acme-saml",
        domain: "acme.com",
        domainVerified: false,
      })

      const provider = await runAsAdmin(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findVerifiedByDomain("acme.com")
        }),
      )

      expect(provider).toBeNull()
    })

    it("ignores rows without an organization binding", async () => {
      await insertProvider({
        id: "sso-unbound",
        organizationId: null,
        providerId: "unbound",
        domain: "acme.com",
        domainVerified: true,
      })

      const provider = await runAsAdmin(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findVerifiedByDomain("acme.com")
        }),
      )

      expect(provider).toBeNull()
    })

    it("sees nothing through the tenant client (RLS) — login lookups must use the admin client", async () => {
      await insertProvider({
        id: "sso-other",
        organizationId: OTHER_ORG_ID,
        providerId: "other-saml",
        domain: "other.com",
        domainVerified: true,
      })

      const provider = await runAsTenant(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          return yield* repo.findVerifiedByDomain("other.com")
        }),
      )

      expect(provider).toBeNull()
    })
  })

  describe("setEnforced / deleteForOrganization", () => {
    it("toggles enforcement only for the active org's provider", async () => {
      await insertProvider({ id: "sso-own", organizationId: ORG_ID, providerId: "acme-saml", domain: "acme.com" })
      await insertProvider({ id: "sso-other", organizationId: OTHER_ORG_ID, providerId: "other", domain: "other.com" })

      await runAsTenant(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          yield* repo.setEnforced(true)
        }),
      )

      const rows = await pg.db.select().from(ssoProviders)
      expect(rows.find((r) => r.providerId === "acme-saml")?.enforced).toBe(true)
      expect(rows.find((r) => r.providerId === "other")?.enforced).toBe(false)
    })

    it("deletes only the active org's provider", async () => {
      await insertProvider({ id: "sso-own", organizationId: ORG_ID, providerId: "acme-saml", domain: "acme.com" })
      await insertProvider({ id: "sso-other", organizationId: OTHER_ORG_ID, providerId: "other", domain: "other.com" })

      await runAsTenant(
        Effect.gen(function* () {
          const repo = yield* SsoProviderRepository
          yield* repo.deleteForOrganization()
        }),
      )

      const rows = await pg.db.select().from(ssoProviders)
      expect(rows.map((r) => r.providerId)).toEqual(["other"])
    })
  })
})
