import { AdminFeatureFlagRepository, type AdminFeatureFlagSummary } from "@domain/admin"
import { FEATURE_FLAG_IDS, FEATURE_FLAGS, type FeatureFlagId } from "@domain/feature-flags"
import { NotFoundError, OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { featureFlags, organizationFeatureFlags } from "../schema/feature-flags.ts"

const toSummary = (
  identifier: FeatureFlagId,
  enabledForAll: boolean,
  enabledOrganizations: AdminFeatureFlagSummary["enabledOrganizations"],
): AdminFeatureFlagSummary => ({
  identifier,
  emoji: FEATURE_FLAGS[identifier].emoji,
  name: FEATURE_FLAGS[identifier].name,
  description: FEATURE_FLAGS[identifier].description,
  enabledForAll,
  enabledOrganizations,
})

/**
 * Live layer for Backoffice feature flag management.
 *
 * The catalog comes from the code-side registry; the DB only stores
 * enablement state. Identifiers present in the DB but missing from the
 * registry are ignored (orphans from deleted code-side entries).
 *
 * SECURITY: queries intentionally cross organization boundaries and must only
 * be wired behind `adminMiddleware` with `getAdminPostgresClient()`.
 */
export const AdminFeatureFlagRepositoryLive = Layer.effect(
  AdminFeatureFlagRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const ensureOrganizationExists = (organizationId: OrganizationId) =>
      Effect.gen(function* () {
        const [row] = yield* sqlClient.query((db) =>
          db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
        )
        if (!row) return yield* new NotFoundError({ entity: "Organization", id: organizationId })
      })

    return {
      list: () =>
        Effect.gen(function* () {
          const flagRows = yield* sqlClient.query((db) =>
            db
              .select({ identifier: featureFlags.identifier, enabledForAll: featureFlags.enabledForAll })
              .from(featureFlags),
          )
          const enabledForAllByIdentifier = new Map(flagRows.map((row) => [row.identifier, row.enabledForAll]))

          const enabledRows = yield* sqlClient.query((db) =>
            db
              .select({
                identifier: organizationFeatureFlags.identifier,
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
              })
              .from(organizationFeatureFlags)
              .innerJoin(organizations, eq(organizations.id, organizationFeatureFlags.organizationId))
              .orderBy(organizations.name),
          )

          const enabledByIdentifier = new Map<string, AdminFeatureFlagSummary["enabledOrganizations"]>()
          for (const row of enabledRows) {
            const enabled = enabledByIdentifier.get(row.identifier) ?? []
            enabled.push({
              id: OrganizationId(row.organizationId),
              name: row.organizationName,
              slug: row.organizationSlug,
            })
            enabledByIdentifier.set(row.identifier, enabled)
          }

          return FEATURE_FLAG_IDS.map((identifier) =>
            toSummary(
              identifier,
              enabledForAllByIdentifier.get(identifier) ?? false,
              enabledByIdentifier.get(identifier) ?? [],
            ),
          )
        }),

      findEligibilityForFlag: (identifier) =>
        Effect.gen(function* () {
          const [flagRow] = yield* sqlClient.query((db) =>
            db
              .select({ enabledForAll: featureFlags.enabledForAll })
              .from(featureFlags)
              .where(eq(featureFlags.identifier, identifier))
              .limit(1),
          )

          if (flagRow?.enabledForAll) {
            // The flag is on for every org — no need to enumerate.
            return { enabledForAll: true, organizationIds: [] }
          }

          const rows = yield* sqlClient.query((db) =>
            db
              .select({ organizationId: organizationFeatureFlags.organizationId })
              .from(organizationFeatureFlags)
              .where(eq(organizationFeatureFlags.identifier, identifier)),
          )
          return {
            enabledForAll: false,
            organizationIds: rows.map((row) => OrganizationId(row.organizationId)),
          }
        }),

      enableForAll: (identifier) =>
        Effect.gen(function* () {
          // Upsert: the catalog row may not exist yet.
          yield* sqlClient.query((db) =>
            db
              .insert(featureFlags)
              .values({ identifier, enabledForAll: true })
              .onConflictDoUpdate({
                target: featureFlags.identifier,
                set: { enabledForAll: true, updatedAt: new Date() },
              }),
          )
        }),

      disableForAll: (identifier) =>
        Effect.gen(function* () {
          yield* sqlClient.query((db) =>
            db
              .update(featureFlags)
              .set({ enabledForAll: false, updatedAt: new Date() })
              .where(eq(featureFlags.identifier, identifier)),
          )
        }),

      listForOrganization: (organizationId) =>
        Effect.gen(function* () {
          yield* ensureOrganizationExists(organizationId)

          const flagRows = yield* sqlClient.query((db) =>
            db
              .select({ identifier: featureFlags.identifier, enabledForAll: featureFlags.enabledForAll })
              .from(featureFlags),
          )
          const enabledForAllByIdentifier = new Map(flagRows.map((row) => [row.identifier, row.enabledForAll]))

          const orgRows = yield* sqlClient.query((db) =>
            db
              .select({ identifier: organizationFeatureFlags.identifier })
              .from(organizationFeatureFlags)
              .where(eq(organizationFeatureFlags.organizationId, organizationId))
              .orderBy(asc(organizationFeatureFlags.identifier)),
          )
          const enabledOrgIdentifiers = new Set(orgRows.map((row) => row.identifier))

          const enabled: AdminFeatureFlagSummary[] = []
          const available: AdminFeatureFlagSummary[] = []
          for (const identifier of FEATURE_FLAG_IDS) {
            const enabledForAll = enabledForAllByIdentifier.get(identifier) ?? false
            const summary = toSummary(identifier, enabledForAll, [])
            if (enabledForAll || enabledOrgIdentifiers.has(identifier)) {
              enabled.push(summary)
            } else {
              available.push(summary)
            }
          }
          return {
            enabled: enabled.map(({ enabledOrganizations: _enabled, ...rest }) => rest),
            available: available.map(({ enabledOrganizations: _enabled, ...rest }) => rest),
          }
        }),

      enableForOrganization: (input) =>
        Effect.gen(function* () {
          yield* ensureOrganizationExists(input.organizationId)

          yield* sqlClient.query((db) =>
            db
              .insert(organizationFeatureFlags)
              .values({
                organizationId: input.organizationId,
                identifier: input.identifier,
                enabledByAdminUserId: input.enabledByAdminUserId,
              })
              .onConflictDoNothing({
                target: [organizationFeatureFlags.organizationId, organizationFeatureFlags.identifier],
              }),
          )
        }),

      disableForOrganization: (input) =>
        Effect.gen(function* () {
          yield* sqlClient.query((db) =>
            db
              .delete(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, input.organizationId),
                  eq(organizationFeatureFlags.identifier, input.identifier),
                ),
              ),
          )
        }),
    }
  }),
)
