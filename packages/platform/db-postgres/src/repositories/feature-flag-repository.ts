import {
  createFeatureFlag,
  createOrganizationFeatureFlag,
  FEATURE_FLAGS,
  type FeatureFlag,
  type FeatureFlagId,
  FeatureFlagRepository,
  type OrganizationFeatureFlag,
} from "@domain/feature-flags"
import { OrganizationFeatureFlagId, OrganizationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { featureFlags, organizationFeatureFlags } from "../schema/feature-flags.ts"

/**
 * Identifiers that exist in the DB but not in the code registry are inert.
 * Orphans typically appear after a flag is deleted from `FEATURE_FLAGS`
 * but stale rows linger in `feature_flags` / `organization_feature_flags`.
 */
const isRegisteredIdentifier = (value: string): value is FeatureFlagId => value in FEATURE_FLAGS

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
          // Either source may be present without the other — a per-org row
          // can exist with no catalog row, and a global row can exist with
          // no per-org row. Collect both sides and merge.
          const [globalRows, orgRows] = yield* Effect.all([
            sqlClient.query((db) => db.select().from(featureFlags).where(eq(featureFlags.enabledForAll, true))),
            sqlClient.query((db, organizationId) =>
              db
                .select({
                  featureFlag: featureFlags,
                  organizationFeatureFlag: organizationFeatureFlags,
                })
                .from(organizationFeatureFlags)
                .leftJoin(featureFlags, eq(featureFlags.identifier, organizationFeatureFlags.identifier))
                .where(eq(organizationFeatureFlags.organizationId, organizationId)),
            ),
          ])

          const flagsByIdentifier = new Map<FeatureFlagId, FeatureFlag>()
          for (const row of globalRows) {
            if (!isRegisteredIdentifier(row.identifier)) continue
            flagsByIdentifier.set(row.identifier, toFeatureFlag(row))
          }
          for (const row of orgRows) {
            const identifier = row.organizationFeatureFlag.identifier
            if (!isRegisteredIdentifier(identifier)) continue
            if (flagsByIdentifier.has(identifier)) continue
            flagsByIdentifier.set(
              identifier,
              row.featureFlag
                ? toFeatureFlag(row.featureFlag)
                : createFeatureFlag({
                    identifier,
                    createdAt: row.organizationFeatureFlag.createdAt,
                    updatedAt: row.organizationFeatureFlag.updatedAt,
                  }),
            )
          }
          return [...flagsByIdentifier.values()].sort((a, b) => a.identifier.localeCompare(b.identifier))
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
