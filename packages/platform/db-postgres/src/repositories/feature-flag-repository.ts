import {
  createFeatureFlag,
  createOrganizationFeatureFlag,
  DuplicateFeatureFlagIdentifierError,
  type FeatureFlag,
  FeatureFlagNotFoundError,
  FeatureFlagRepository,
  type OrganizationFeatureFlag,
} from "@domain/feature-flags"
import {
  FeatureFlagId,
  OrganizationFeatureFlagId,
  OrganizationId,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  UserId,
} from "@domain/shared"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
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

const toFeatureFlag = (row: typeof featureFlags.$inferSelect): FeatureFlag =>
  createFeatureFlag({
    id: FeatureFlagId(row.id),
    identifier: row.identifier,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toOrganizationFeatureFlag = (row: typeof organizationFeatureFlags.$inferSelect): OrganizationFeatureFlag =>
  createOrganizationFeatureFlag({
    id: OrganizationFeatureFlagId(row.id),
    organizationId: OrganizationId(row.organizationId),
    featureFlagId: FeatureFlagId(row.featureFlagId),
    enabledByAdminUserId: UserId(row.enabledByAdminUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const FeatureFlagRepositoryLive = Layer.effect(
  FeatureFlagRepository,
  Effect.gen(function* () {
    return {
      findByIdentifier: (identifier) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db.select().from(featureFlags).where(eq(featureFlags.identifier, identifier)).limit(1),
          )

          if (!row) return yield* new FeatureFlagNotFoundError({ identifier })
          return toFeatureFlag(row)
        }),

      list: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db.select().from(featureFlags).orderBy(asc(featureFlags.identifier)),
          )
          return rows.map(toFeatureFlag)
        }),

      listEnabledForOrganization: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ featureFlag: featureFlags })
              .from(organizationFeatureFlags)
              .innerJoin(featureFlags, eq(featureFlags.id, organizationFeatureFlags.featureFlagId))
              .where(eq(organizationFeatureFlags.organizationId, organizationId))
              .orderBy(asc(featureFlags.identifier)),
          )

          return rows.map((row) => toFeatureFlag(row.featureFlag))
        }),

      isEnabledForOrganization: (identifier) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ id: organizationFeatureFlags.id })
              .from(organizationFeatureFlags)
              .innerJoin(featureFlags, eq(featureFlags.id, organizationFeatureFlags.featureFlagId))
              .where(
                and(
                  eq(featureFlags.identifier, identifier),
                  eq(organizationFeatureFlags.organizationId, organizationId),
                ),
              )
              .limit(1),
          )

          return row !== undefined
        }),

      createFeatureFlag: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
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
                })
                .returning(),
            )
            .pipe(Effect.catchTag("RepositoryError", (error) => mapIdentifierViolation(error, input.identifier)))

          return toFeatureFlag(row)
        }),

      enableForOrganization: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [featureFlagRow] = yield* sqlClient.query((db) =>
            db.select().from(featureFlags).where(eq(featureFlags.identifier, input.identifier)).limit(1),
          )
          if (!featureFlagRow) return yield* new FeatureFlagNotFoundError({ identifier: input.identifier })

          const [existingRow] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, organizationId),
                  eq(organizationFeatureFlags.featureFlagId, featureFlagRow.id),
                ),
              )
              .limit(1),
          )
          if (existingRow) return toOrganizationFeatureFlag(existingRow)

          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .insert(organizationFeatureFlags)
              .values({
                organizationId,
                featureFlagId: featureFlagRow.id,
                enabledByAdminUserId: input.enabledByAdminUserId,
              })
              .returning(),
          )

          return toOrganizationFeatureFlag(row)
        }),

      disableForOrganization: (identifier) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [featureFlagRow] = yield* sqlClient.query((db) =>
            db
              .select({ id: featureFlags.id })
              .from(featureFlags)
              .where(eq(featureFlags.identifier, identifier))
              .limit(1),
          )
          if (!featureFlagRow) return

          yield* sqlClient.query((db, organizationId) =>
            db
              .delete(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, organizationId),
                  eq(organizationFeatureFlags.featureFlagId, featureFlagRow.id),
                ),
              ),
          )
        }),
    }
  }),
)
