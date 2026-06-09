import { OrganizationId, SqlClient, type SqlClientShape, SsoProviderId, UserId } from "@domain/shared"
import { createSsoProvider, type SsoProvider, SsoProviderRepository } from "@domain/sso"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { ssoProviders } from "../schema/better-auth.ts"

/**
 * Maps a `sso_providers` row to the non-secret domain projection. The
 * `saml_config` / `oidc_config` blobs are read only to derive `kind` —
 * their contents (IdP certs, SP keys, OIDC client secret) never leave
 * this layer.
 *
 * Rows without an organization binding are skipped by the queries below:
 * our server fns always register providers with an `organizationId`, so an
 * unbound row is either hand-inserted or from a future BA flow we don't use.
 */
const toSsoProvider = (row: typeof ssoProviders.$inferSelect): SsoProvider =>
  createSsoProvider({
    id: SsoProviderId(row.id),
    // Callers filter on organizationId IS NOT NULL; assert for the mapper.
    organizationId: OrganizationId(row.organizationId as string),
    providerId: row.providerId,
    issuer: row.issuer,
    domain: row.domain,
    kind: row.samlConfig != null ? "saml" : "oidc",
    domainVerified: row.domainVerified,
    enforced: row.enforced,
    registeredByUserId: row.userId ? UserId(row.userId) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const SsoProviderRepositoryLive = Layer.effect(
  SsoProviderRepository,
  Effect.gen(function* () {
    return {
      findForOrganization: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db.select().from(ssoProviders).where(eq(ssoProviders.organizationId, organizationId)).limit(1),
          )
          return row ? toSsoProvider(row) : null
        }),

      findVerifiedByDomain: (domain) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Cross-org by design (pre-auth login lookup): only works through
          // the admin client — the tenant role sees nothing here under RLS.
          const [row] = yield* sqlClient.query((db) =>
            db
              .select()
              .from(ssoProviders)
              .where(and(eq(ssoProviders.domain, domain.toLowerCase()), eq(ssoProviders.domainVerified, true)))
              .limit(1),
          )
          return row?.organizationId ? toSsoProvider(row) : null
        }),

      setEnforced: (enforced) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db.update(ssoProviders).set({ enforced }).where(eq(ssoProviders.organizationId, organizationId)),
          )
        }),

      deleteForOrganization: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db.delete(ssoProviders).where(eq(ssoProviders.organizationId, organizationId)),
          )
        }),
    }
  }),
)
