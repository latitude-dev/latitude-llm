import { type SlackIntegration, SlackIntegrationRepository, slackIntegrationSchema } from "@domain/integrations"
import type { NotificationGroup } from "@domain/shared"
import {
  OrganizationId,
  type RepositoryError,
  SlackIntegrationId,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
  UserId,
} from "@domain/shared"
import { and, eq, isNull, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator, PostgresDb } from "../client.ts"
import { decryptField, encryptField, getEncryptionKey } from "../encryption-key.ts"
import { integrations } from "../schema/integrations.ts"
import { slackIntegrationDetails } from "../schema/slack-integration-details.ts"

const SLACK_KIND = "slack" as const

type IntegrationRow = typeof integrations.$inferSelect
type SlackDetailsRow = typeof slackIntegrationDetails.$inferSelect

const toDomainSlackIntegration = (parent: IntegrationRow, details: SlackDetailsRow, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const botAccessToken = yield* decryptField(details.botAccessToken, encryptionKey, "decryptSlackIntegrationToken")
    const refreshToken =
      details.refreshToken === null
        ? null
        : yield* decryptField(details.refreshToken, encryptionKey, "decryptSlackIntegrationRefreshToken")

    const integration: SlackIntegration = slackIntegrationSchema.parse({
      id: SlackIntegrationId(parent.id),
      organizationId: OrganizationId(parent.organizationId),
      teamId: parent.vendorAccountId,
      teamName: details.teamName,
      appId: details.appId,
      botUserId: details.botUserId,
      botAccessToken,
      botTokenScopes: details.botTokenScopes,
      refreshToken,
      tokenExpiresAt: details.tokenExpiresAt,
      reconnectRequiredAt: details.reconnectRequiredAt,
      installedByUserId: UserId(parent.installedByUserId),
      installedAt: parent.installedAt,
      revokedAt: parent.revokedAt,
      routes: details.routes ?? {},
      createdAt: parent.createdAt,
      updatedAt: parent.updatedAt,
    })
    return integration
  })

const buildInsertRows = (integration: SlackIntegration, organizationId: string, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const botAccessToken = yield* encryptField(
      integration.botAccessToken,
      encryptionKey,
      "encryptSlackIntegrationToken",
    )
    const refreshToken =
      integration.refreshToken === null
        ? null
        : yield* encryptField(integration.refreshToken, encryptionKey, "encryptSlackIntegrationRefreshToken")

    const parentRow = {
      id: integration.id,
      organizationId,
      kind: SLACK_KIND,
      vendorAccountId: integration.teamId,
      installedByUserId: integration.installedByUserId,
      installedAt: integration.installedAt,
      revokedAt: integration.revokedAt,
    }

    const detailsRow = {
      integrationId: integration.id,
      organizationId,
      teamName: integration.teamName,
      appId: integration.appId,
      botUserId: integration.botUserId,
      botAccessToken,
      botTokenScopes: integration.botTokenScopes,
      refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
      reconnectRequiredAt: integration.reconnectRequiredAt,
      routes: integration.routes,
    }

    return { parentRow, detailsRow } as const
  })

export const SlackIntegrationRepositoryLive = Layer.effect(
  SlackIntegrationRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    return {
      findActiveByOrganizationId: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select({ parent: integrations, details: slackIntegrationDetails })
                .from(integrations)
                .innerJoin(slackIntegrationDetails, eq(slackIntegrationDetails.integrationId, integrations.id))
                .where(
                  and(
                    eq(integrations.organizationId, organizationId),
                    eq(integrations.kind, SLACK_KIND),
                    isNull(integrations.revokedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findActiveSlackIntegrationByOrganizationId")))

          if (!row) return null
          return yield* toDomainSlackIntegration(row.parent, row.details, encryptionKey)
        }),

      save: (integration) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const orgFromRls = sqlClient.organizationId
          const { parentRow, detailsRow } = yield* buildInsertRows(integration, orgFromRls, encryptionKey)

          // Two-row insert. Atomicity comes from the caller wrapping the
          // call in `sqlClient.transaction(...)` (see `installSlackIntegrationUseCase`).
          // The repo intentionally does not open its own transaction here:
          // that would leak `ConcurrentSqlTransactionError` into the port,
          // and the codebase convention is for use cases to own transaction
          // boundaries (mirrors `revokeApiKeyUseCase` etc.).
          yield* sqlClient.query((db) => db.insert(integrations).values(parentRow))
          yield* sqlClient.query((db) => db.insert(slackIntegrationDetails).values(detailsRow))

          return integration
        }),

      softRevokeById: (id, revokedAt) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(integrations)
                .set({ revokedAt, updatedAt: new Date() })
                .where(
                  and(
                    eq(integrations.id, id),
                    eq(integrations.organizationId, organizationId),
                    eq(integrations.kind, SLACK_KIND),
                    isNull(integrations.revokedAt),
                  ),
                )
                .returning({ id: integrations.id }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "softRevokeSlackIntegration")))

          return rows.length > 0
        }),

      updateRoutes: (integrationId, group: NotificationGroup, routes) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Use `jsonb_set` so we only mutate the one group key —
          // concurrent writes to different groups stay independent.
          // Bind the path through a parameter so the group name can't
          // be SQL-injected (NotificationGroup is a typed enum, but
          // belt-and-suspenders).
          const jsonValue = JSON.stringify(routes)
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(slackIntegrationDetails)
                .set({
                  routes: sql`jsonb_set(coalesce(${slackIntegrationDetails.routes}, '{}'::jsonb), ARRAY[${group}::text], ${jsonValue}::jsonb, true)`,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(slackIntegrationDetails.integrationId, integrationId),
                    eq(slackIntegrationDetails.organizationId, organizationId),
                  ),
                )
                .returning({ id: slackIntegrationDetails.integrationId }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateSlackIntegrationRoutes")))

          return rows.length > 0
        }),

      updateTokens: (integrationId, tokens) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const botAccessToken = yield* encryptField(
            tokens.botAccessToken,
            encryptionKey,
            "encryptSlackIntegrationToken",
          )
          const refreshToken = yield* encryptField(
            tokens.refreshToken,
            encryptionKey,
            "encryptSlackIntegrationRefreshToken",
          )

          // Single atomic UPDATE — re-encrypts the rotated triple and writes
          // it on the active details row scoped to the RLS org. No transaction
          // needed (mirrors `updateRoutes`).
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(slackIntegrationDetails)
                .set({
                  botAccessToken,
                  refreshToken,
                  tokenExpiresAt: tokens.tokenExpiresAt,
                  // A successful refresh clears any prior dead-chain stamp.
                  reconnectRequiredAt: null,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(slackIntegrationDetails.integrationId, integrationId),
                    eq(slackIntegrationDetails.organizationId, organizationId),
                  ),
                )
                .returning({ id: slackIntegrationDetails.integrationId }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "updateSlackIntegrationTokens")))

          return rows.length > 0
        }),

      markReconnectRequired: (id, at) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(slackIntegrationDetails)
                .set({ reconnectRequiredAt: at, updatedAt: new Date() })
                .where(
                  and(
                    eq(slackIntegrationDetails.integrationId, id),
                    eq(slackIntegrationDetails.organizationId, organizationId),
                  ),
                )
                .returning({ id: slackIntegrationDetails.integrationId }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "markSlackIntegrationReconnectRequired")))

          return rows.length > 0
        }),
    }
  }),
)

/**
 * Whether any organization still has an active install for the Slack
 * workspace. Bypasses the per-org RLS predicate by not filtering on
 * `organization_id`; the connecting role must therefore be one that is
 * not subject to forced RLS.
 */
export const hasActiveSlackIntegrationForTeamAcrossOrgs = (
  db: PostgresDb,
  teamId: string,
): Effect.Effect<boolean, RepositoryError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ id: integrations.id })
        .from(integrations)
        .where(
          and(
            eq(integrations.kind, SLACK_KIND),
            eq(integrations.vendorAccountId, teamId),
            isNull(integrations.revokedAt),
          ),
        )
        .limit(1)
      return rows.length > 0
    },
    catch: (cause) => toRepositoryError(cause, "hasActiveSlackIntegrationForTeamAcrossOrgs"),
  })
