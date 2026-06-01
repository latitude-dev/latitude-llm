import {
  type SlackIntegration,
  SlackIntegrationConflictError,
  SlackIntegrationRepository,
  slackIntegrationSchema,
} from "@domain/integrations"
import type { NotificationGroup } from "@domain/shared"
import {
  findPostgresUniqueViolationConstraint,
  OrganizationId,
  type RepositoryError,
  SlackIntegrationId,
  type SlackIntegrationId as SlackIntegrationIdType,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
  UserId,
} from "@domain/shared"
import { parseEnv } from "@platform/env"
import { type CryptoError, decrypt, encrypt, hash } from "@repo/utils"
import { and, eq, isNull, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator, PostgresDb } from "../client.ts"
import { integrations } from "../schema/integrations.ts"
import { slackIntegrationDetails } from "../schema/slack-integration-details.ts"

const SLACK_KIND = "slack" as const

let encryptionKeyCache: Buffer | undefined

const VALID_HEX_32_BYTE_KEY = /^[0-9a-f]{64}$/i

/**
 * Slack tokens share `LAT_MASTER_ENCRYPTION_KEY` with the api-key
 * repository — same AES-256-GCM scheme, same resolution rules
 * (accept 32-byte hex directly, otherwise derive via SHA-256 of the
 * provided secret). The two repositories own private caches; the key
 * derivation is identical.
 */
const resolveEncryptionKey = (rawSecret: string): Effect.Effect<Buffer, CryptoError> => {
  const secret = rawSecret.trim()
  if (VALID_HEX_32_BYTE_KEY.test(secret)) {
    return Effect.succeed(Buffer.from(secret, "hex"))
  }
  return hash(secret).pipe(Effect.map((hashed) => Buffer.from(hashed, "hex")))
}

const getEncryptionKey = () =>
  Effect.gen(function* () {
    if (encryptionKeyCache) return encryptionKeyCache
    const encryptionKeySecret = yield* parseEnv("LAT_MASTER_ENCRYPTION_KEY", "string")
    const key = yield* resolveEncryptionKey(encryptionKeySecret)
    encryptionKeyCache = key
    return key
  })

/**
 * Name of the partial unique index that enforces "one active Slack
 * workspace claim across all Latitude orgs". Must stay in sync with
 * the index name declared in `schema/integrations.ts`. Hardcoded as a
 * string because Drizzle exposes the index identifier as a runtime
 * value, not a type-level constant.
 */
const VENDOR_ACCOUNT_UNIQUE_INDEX = "integrations_active_kind_vendor_account_idx"

/**
 * Conflict translation lives in a dedicated helper because `Effect.catchTag`
 * only narrows the typed return when the handler's return type is annotated
 * explicitly — inline ternaries inferred as a union of two `Effect.fail`
 * branches refuse to unify under `exactOptionalPropertyTypes`. Mirrors
 * `mapIdentifierViolation` in admin-feature-flag-repository.
 *
 * Only the cross-vendor `(kind, vendor_account_id)` partial unique index
 * is translated to {@link SlackIntegrationConflictError}. Other unique
 * violations on this table — the per-org `(organization_id, kind)`
 * partial unique, or a (cryptographically impossible) primary-key
 * collision — are rethrown as `RepositoryError` so they aren't
 * misreported as cross-org workspace conflicts.
 */
const mapVendorAccountConflict = (
  error: RepositoryError,
  teamId: string,
): Effect.Effect<never, RepositoryError | SlackIntegrationConflictError> => {
  const constraint = findPostgresUniqueViolationConstraint(error.cause)
  if (constraint === VENDOR_ACCOUNT_UNIQUE_INDEX) {
    return Effect.fail(new SlackIntegrationConflictError({ teamId }))
  }
  return Effect.fail(error)
}

type IntegrationRow = typeof integrations.$inferSelect
type SlackDetailsRow = typeof slackIntegrationDetails.$inferSelect

const toDomainSlackIntegration = (parent: IntegrationRow, details: SlackDetailsRow, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const botAccessToken = yield* decrypt(details.botAccessToken, encryptionKey).pipe(
      Effect.mapError((e) => toRepositoryError(e, "decryptSlackIntegrationToken")),
    )
    const refreshToken =
      details.refreshToken === null
        ? null
        : yield* decrypt(details.refreshToken, encryptionKey).pipe(
            Effect.mapError((e) => toRepositoryError(e, "decryptSlackIntegrationRefreshToken")),
          )

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
    const botAccessToken = yield* encrypt(integration.botAccessToken, encryptionKey).pipe(
      Effect.mapError((e) => toRepositoryError(e, "encryptSlackIntegrationToken")),
    )
    const refreshToken =
      integration.refreshToken === null
        ? null
        : yield* encrypt(integration.refreshToken, encryptionKey).pipe(
            Effect.mapError((e) => toRepositoryError(e, "encryptSlackIntegrationRefreshToken")),
          )

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
          yield* sqlClient
            .query((db) => db.insert(integrations).values(parentRow))
            .pipe(Effect.catchTag("RepositoryError", (error) => mapVendorAccountConflict(error, integration.teamId)))
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
          const botAccessToken = yield* encrypt(tokens.botAccessToken, encryptionKey).pipe(
            Effect.mapError((e) => toRepositoryError(e, "encryptSlackIntegrationToken")),
          )
          const refreshToken = yield* encrypt(tokens.refreshToken, encryptionKey).pipe(
            Effect.mapError((e) => toRepositoryError(e, "encryptSlackIntegrationRefreshToken")),
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
 * Cross-organization lookup for the dev CLI's `--force` flow. With
 * `vendor_account_id` lifted onto the parent `integrations` table, this
 * is now a single-table query — no join with `slack_integration_details`
 * is needed for the conflict-resolution path. Bypasses the per-org RLS
 * predicate by not filtering on `organization_id`; the connecting role
 * must therefore be one that is not subject to forced RLS.
 */
export const findActiveSlackIntegrationByTeamIdAcrossOrgs = (
  db: PostgresDb,
  teamId: string,
): Effect.Effect<
  { readonly id: SlackIntegrationIdType; readonly organizationId: OrganizationId } | null,
  RepositoryError
> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ id: integrations.id, organizationId: integrations.organizationId })
        .from(integrations)
        .where(
          and(
            eq(integrations.kind, SLACK_KIND),
            eq(integrations.vendorAccountId, teamId),
            isNull(integrations.revokedAt),
          ),
        )
        .limit(1)
      const row = rows[0]
      if (!row) return null
      return { id: SlackIntegrationId(row.id), organizationId: OrganizationId(row.organizationId) }
    },
    catch: (cause) => toRepositoryError(cause, "findActiveSlackIntegrationByTeamIdAcrossOrgs"),
  })

/**
 * Cross-organization soft-revoke for the dev CLI's `--force` flow.
 * Stamps `revoked_at` on the parent row only — the details row is
 * retained for audit (one-to-one, never orphaned by design).
 */
export const softRevokeSlackIntegrationAcrossOrgs = (
  db: PostgresDb,
  id: SlackIntegrationIdType,
  revokedAt: Date,
): Effect.Effect<boolean, RepositoryError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .update(integrations)
        .set({ revokedAt, updatedAt: new Date() })
        .where(and(eq(integrations.id, id), eq(integrations.kind, SLACK_KIND), isNull(integrations.revokedAt)))
        .returning({ id: integrations.id })
      return rows.length > 0
    },
    catch: (cause) => toRepositoryError(cause, "softRevokeSlackIntegrationAcrossOrgs"),
  })
