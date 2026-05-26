import {
  createFeatureFlag,
  createOrganizationFeatureFlag,
  type FeatureFlag,
  type FeatureFlagId,
  FeatureFlagRepository,
  type OrganizationFeatureFlag,
} from "@domain/feature-flags"
import { OrganizationFeatureFlagId, OrganizationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { and, asc, eq, or, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { featureFlags, organizationFeatureFlags } from "../schema/feature-flags.ts"

const toFeatureFlag = (row: typeof featureFlags.$inferSelect): FeatureFlag =>
  createFeatureFlag({
    identifier: row.identifier as FeatureFlagId,
    enabledForAll: row.enabledForAll,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toOrganizationFeatureFlag = (row: typeof organizationFeatureFlags.$inferSelect): OrganizationFeatureFlag =>
  createOrganizationFeatureFlag({
    id: OrganizationFeatureFlagId(row.id),
    organizationId: OrganizationId(row.organizationId),
    identifier: row.identifier as FeatureFlagId,
    enabledByAdminUserId: UserId(row.enabledByAdminUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const FeatureFlagRepositoryLive = Layer.effect(
  FeatureFlagRepository,
  Effect.gen(function* () {
    return {
      listEnabledForOrganization: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ featureFlag: featureFlags })
              .from(featureFlags)
              .leftJoin(
                organizationFeatureFlags,
                and(
                  eq(organizationFeatureFlags.identifier, featureFlags.identifier),
                  eq(organizationFeatureFlags.organizationId, organizationId),
                ),
              )
              .where(or(eq(featureFlags.enabledForAll, true), sql`${organizationFeatureFlags.id} IS NOT NULL`))
              .orderBy(asc(featureFlags.identifier)),
          )

          return rows.map((row) => toFeatureFlag(row.featureFlag))
        }),

      isEnabledForOrganization: (identifier) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Two independent lookups: a global row may exist without a per-org
          // row, and a per-org row may exist without a global row.
          const [[globalRow], [orgRow]] = yield* Effect.all([
            sqlClient.query((db) =>
              db
                .select({ enabledForAll: featureFlags.enabledForAll })
                .from(featureFlags)
                .where(eq(featureFlags.identifier, identifier))
                .limit(1),
            ),
            sqlClient.query((db, organizationId) =>
              db
                .select({ id: organizationFeatureFlags.id })
                .from(organizationFeatureFlags)
                .where(
                  and(
                    eq(organizationFeatureFlags.organizationId, organizationId),
                    eq(organizationFeatureFlags.identifier, identifier),
                  ),
                )
                .limit(1),
            ),
          ])

          return (globalRow?.enabledForAll ?? false) || orgRow !== undefined
        }),

      enableForOrganization: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [existingRow] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, organizationId),
                  eq(organizationFeatureFlags.identifier, input.identifier),
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
                identifier: input.identifier,
                enabledByAdminUserId: input.enabledByAdminUserId,
              })
              .returning(),
          )

          return toOrganizationFeatureFlag(row)
        }),

      disableForOrganization: (identifier) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .delete(organizationFeatureFlags)
              .where(
                and(
                  eq(organizationFeatureFlags.organizationId, organizationId),
                  eq(organizationFeatureFlags.identifier, identifier),
                ),
              ),
          )
        }),
    }
  }),
)
