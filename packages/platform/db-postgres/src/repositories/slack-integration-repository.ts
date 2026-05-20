import {
  type SlackIntegration,
  SlackIntegrationConflictError,
  SlackIntegrationRepository,
  slackIntegrationSchema,
} from "@domain/slack"
import {
  causesIncludePostgresUniqueViolation,
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
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator, PostgresDb } from "../client.ts"
import { slackIntegrations } from "../schema/slack-integrations.ts"

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
 * Mirrors the {@link admin-feature-flag-repository.mapIdentifierViolation}
 * helper. `Effect.catchTag` only narrows the typed return when the handler's
 * return type is annotated explicitly — inline ternaries inferred as a
 * union of two `Effect.fail` branches refuse to unify under
 * `exactOptionalPropertyTypes`.
 */
const mapTeamIdConflict = (
  error: RepositoryError,
  teamId: string,
): Effect.Effect<never, RepositoryError | SlackIntegrationConflictError> =>
  causesIncludePostgresUniqueViolation(error.cause)
    ? Effect.fail(new SlackIntegrationConflictError({ teamId }))
    : Effect.fail(error)

type SlackIntegrationRow = typeof slackIntegrations.$inferSelect

const toDomainSlackIntegration = (row: SlackIntegrationRow, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const botAccessToken = yield* decrypt(row.botAccessToken, encryptionKey).pipe(
      Effect.mapError((e) => toRepositoryError(e, "decryptSlackIntegrationToken")),
    )
    const refreshToken =
      row.refreshToken === null
        ? null
        : yield* decrypt(row.refreshToken, encryptionKey).pipe(
            Effect.mapError((e) => toRepositoryError(e, "decryptSlackIntegrationRefreshToken")),
          )

    const integration: SlackIntegration = slackIntegrationSchema.parse({
      id: SlackIntegrationId(row.id),
      organizationId: OrganizationId(row.organizationId),
      teamId: row.teamId,
      teamName: row.teamName,
      appId: row.appId,
      botUserId: row.botUserId,
      botAccessToken,
      botTokenScopes: row.botTokenScopes,
      refreshToken,
      tokenExpiresAt: row.tokenExpiresAt,
      installedByUserId: UserId(row.installedByUserId),
      installedAt: row.installedAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
    return integration
  })

const toInsertRow = (integration: SlackIntegration, organizationId: string, encryptionKey: Buffer) =>
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

    return {
      id: integration.id,
      organizationId,
      teamId: integration.teamId,
      teamName: integration.teamName,
      appId: integration.appId,
      botUserId: integration.botUserId,
      botAccessToken,
      botTokenScopes: integration.botTokenScopes,
      refreshToken,
      tokenExpiresAt: integration.tokenExpiresAt,
      installedByUserId: integration.installedByUserId,
      installedAt: integration.installedAt,
      revokedAt: integration.revokedAt,
    }
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
                .select()
                .from(slackIntegrations)
                .where(
                  and(eq(slackIntegrations.organizationId, organizationId), isNull(slackIntegrations.revokedAt)),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findActiveSlackIntegrationByOrganizationId")))

          if (!row) return null
          return yield* toDomainSlackIntegration(row, encryptionKey)
        }),

      save: (integration) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const orgFromRls = sqlClient.organizationId
          const row = yield* toInsertRow(integration, orgFromRls, encryptionKey)
          yield* sqlClient
            .query((db) => db.insert(slackIntegrations).values(row))
            .pipe(Effect.catchTag("RepositoryError", (error) => mapTeamIdConflict(error, integration.teamId)))
          return integration
        }),

      softRevokeById: (id, revokedAt) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(slackIntegrations)
                .set({ revokedAt, updatedAt: new Date() })
                .where(
                  and(
                    eq(slackIntegrations.id, id),
                    eq(slackIntegrations.organizationId, organizationId),
                    isNull(slackIntegrations.revokedAt),
                  ),
                )
                .returning({ id: slackIntegrations.id }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "softRevokeSlackIntegration")))

          return rows.length > 0
        }),
    }
  }),
)

/**
 * Cross-organization lookup for the dev CLI's `--force` flow. Bypasses
 * the per-org RLS predicate by not filtering on `organization_id`; the
 * connecting role must therefore be one that is not subject to forced
 * RLS (mirrors the api-key `findByTokenHash` pattern).
 */
export const findActiveSlackIntegrationByTeamIdAcrossOrgs = (
  db: PostgresDb,
  teamId: string,
): Effect.Effect<{ readonly id: SlackIntegrationIdType; readonly organizationId: OrganizationId } | null, RepositoryError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ id: slackIntegrations.id, organizationId: slackIntegrations.organizationId })
        .from(slackIntegrations)
        .where(and(eq(slackIntegrations.teamId, teamId), isNull(slackIntegrations.revokedAt)))
        .limit(1)
      const row = rows[0]
      if (!row) return null
      return { id: SlackIntegrationId(row.id), organizationId: OrganizationId(row.organizationId) }
    },
    catch: (cause) => toRepositoryError(cause, "findActiveSlackIntegrationByTeamIdAcrossOrgs"),
  })

/**
 * Cross-organization soft-revoke for the dev CLI's `--force` flow.
 * Stamps `revoked_at` without any `organization_id` predicate.
 */
export const softRevokeSlackIntegrationAcrossOrgs = (
  db: PostgresDb,
  id: SlackIntegrationIdType,
  revokedAt: Date,
): Effect.Effect<boolean, RepositoryError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .update(slackIntegrations)
        .set({ revokedAt, updatedAt: new Date() })
        .where(and(eq(slackIntegrations.id, id), isNull(slackIntegrations.revokedAt)))
        .returning({ id: slackIntegrations.id })
      return rows.length > 0
    },
    catch: (cause) => toRepositoryError(cause, "softRevokeSlackIntegrationAcrossOrgs"),
  })
