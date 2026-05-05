import {
  AdminFeatureFlagRepository,
  type AdminFeatureFlagSummary,
  type AdminOrganizationFeatureFlag,
  type AdminOrganizationFeatureFlags,
} from "@domain/admin"
import { createFeatureFlag, DuplicateFeatureFlagIdentifierError, FeatureFlagNotFoundError } from "@domain/feature-flags"
import {
  FeatureFlagId,
  NotFoundError,
  OrganizationId,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { featureFlags, organizationFeatureFlags } from "../schema/feature-flags.ts"

const isUniqueViolation = (cause: unknown): boolean => {
  let current: unknown = cause
  const seen = new Set<unknown>()
  while (current !== null && current !== undefined && typeof current === "object" && !seen.has(current)) {
    seen.add(current)
    const code = (current as { code?: unknown }).code
    if (code === "23505") return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

const mapIdentifierViolation = (
  error: RepositoryError,
  identifier: string,
): Effect.Effect<never, DuplicateFeatureFlagIdentifierError | RepositoryError> =>
  isUniqueViolation(error.cause)
    ? Effect.fail(new DuplicateFeatureFlagIdentifierError({ identifier }))
    : Effect.fail(error)

const toOrganizationFeatureFlag = (row: typeof featureFlags.$inferSelect): AdminOrganizationFeatureFlag => ({
  id: FeatureFlagId(row.id),
  identifier: row.identifier,
  name: row.name ?? null,
  description: row.description ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toFeatureFlagSummary = (
  row: typeof featureFlags.$inferSelect,
  enabledOrganizations: AdminFeatureFlagSummary["enabledOrganizations"],
): AdminFeatureFlagSummary => ({
  ...toOrganizationFeatureFlag(row),
  enabledOrganizations,
})

/**
 * Live layer for Backoffice feature flag management.
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

    const listActiveFlags = () =>
      sqlClient.query((db) =>
        db.select().from(featureFlags).where(isNull(featureFlags.archivedAt)).orderBy(asc(featureFlags.identifier)),
      )

    return {
      list: () =>
        Effect.gen(function* () {
          const flagRows = yield* listActiveFlags()
          if (flagRows.length === 0) return []

          const enabledRows = yield* sqlClient.query((db) =>
            db
              .select({
                featureFlagId: organizationFeatureFlags.featureFlagId,
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
              })
              .from(organizationFeatureFlags)
              .innerJoin(featureFlags, eq(featureFlags.id, organizationFeatureFlags.featureFlagId))
              .innerJoin(organizations, eq(organizations.id, organizationFeatureFlags.organizationId))
              .where(
                and(
                  inArray(
                    organizationFeatureFlags.featureFlagId,
                    flagRows.map((row) => row.id),
                  ),
                  isNull(featureFlags.archivedAt),
                ),
              )
              .orderBy(organizations.name),
          )

          const enabledByFlagId = new Map<string, AdminFeatureFlagSummary["enabledOrganizations"]>()
          for (const row of enabledRows) {
            const enabled = enabledByFlagId.get(row.featureFlagId) ?? []
            enabled.push({
              id: OrganizationId(row.organizationId),
              name: row.organizationName,
              slug: row.organizationSlug,
            })
            enabledByFlagId.set(row.featureFlagId, enabled)
          }

          return flagRows.map((row) => toFeatureFlagSummary(row, enabledByFlagId.get(row.id) ?? []))
        }),

      create: (input) =>
        Effect.gen(function* () {
          const featureFlag = createFeatureFlag(input)
          const [row] = yield* sqlClient
            .query((db) =>
              db
                .insert(featureFlags)
                .values({
                  id: featureFlag.id,
                  identifier: featureFlag.identifier,
                  name: featureFlag.name,
                  description: featureFlag.description,
                  archivedAt: null,
                })
                .returning(),
            )
            .pipe(Effect.catchTag("RepositoryError", (error) => mapIdentifierViolation(error, input.identifier)))

          return toFeatureFlagSummary(row, [])
        }),

      archive: (identifier) =>
        Effect.gen(function* () {
          const [row] = yield* sqlClient.query((db) =>
            db
              .update(featureFlags)
              .set({ archivedAt: new Date(), updatedAt: new Date() })
              .where(and(eq(featureFlags.identifier, identifier), isNull(featureFlags.archivedAt)))
              .returning({ id: featureFlags.id }),
          )
          if (!row) return yield* new FeatureFlagNotFoundError({ identifier })
        }),

      listForOrganization: (organizationId) =>
        Effect.gen(function* () {
          yield* ensureOrganizationExists(organizationId)

          const flagRows = yield* listActiveFlags()
          const enabledRows = yield* sqlClient.query((db) =>
            db
              .select({ featureFlag: featureFlags })
              .from(organizationFeatureFlags)
              .innerJoin(featureFlags, eq(featureFlags.id, organizationFeatureFlags.featureFlagId))
              .where(and(eq(organizationFeatureFlags.organizationId, organizationId), isNull(featureFlags.archivedAt)))
              .orderBy(asc(featureFlags.identifier)),
          )

          const enabledIds = new Set(enabledRows.map((row) => row.featureFlag.id))
          const result: AdminOrganizationFeatureFlags = {
            enabled: enabledRows.map((row) => toOrganizationFeatureFlag(row.featureFlag)),
            available: flagRows.filter((row) => !enabledIds.has(row.id)).map((row) => toOrganizationFeatureFlag(row)),
          }
          return result
        }),

      enableForOrganization: (input) =>
        Effect.gen(function* () {
          yield* ensureOrganizationExists(input.organizationId)

          const [featureFlagRow] = yield* sqlClient.query((db) =>
            db
              .select({ id: featureFlags.id })
              .from(featureFlags)
              .where(and(eq(featureFlags.identifier, input.identifier), isNull(featureFlags.archivedAt)))
              .limit(1),
          )
          if (!featureFlagRow) return yield* new FeatureFlagNotFoundError({ identifier: input.identifier })

          const [existingRow] = yield* sqlClient.query((db) =>
            db
              .select({ id: organizationFeatureFlags.id })
              .from(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, input.organizationId),
                  eq(organizationFeatureFlags.featureFlagId, featureFlagRow.id),
                ),
              )
              .limit(1),
          )
          if (existingRow) return

          yield* sqlClient.query((db) =>
            db.insert(organizationFeatureFlags).values({
              organizationId: input.organizationId,
              featureFlagId: featureFlagRow.id,
              enabledByAdminUserId: input.enabledByAdminUserId,
            }),
          )
        }),

      disableForOrganization: (input) =>
        Effect.gen(function* () {
          const [featureFlagRow] = yield* sqlClient.query((db) =>
            db.select({ id: featureFlags.id }).from(featureFlags).where(eq(featureFlags.identifier, input.identifier)),
          )
          if (!featureFlagRow) return

          yield* sqlClient.query((db) =>
            db
              .delete(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, input.organizationId),
                  eq(organizationFeatureFlags.featureFlagId, featureFlagRow.id),
                ),
              ),
          )
        }),
    }
  }),
)
