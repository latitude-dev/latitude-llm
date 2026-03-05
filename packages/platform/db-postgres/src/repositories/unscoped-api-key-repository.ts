import type { ApiKey, UnscopedApiKeyRepository } from "@domain/api-keys"
import {
  ApiKeyId,
  type ApiKeyId as ApiKeyIdType,
  OrganizationId,
  type RepositoryError,
  toRepositoryError,
} from "@domain/shared"
import { parseEnv } from "@platform/env"
import { decrypt } from "@repo/utils"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { apiKeys } from "../schema/index.ts"

let encryptionKeyCache: Buffer | undefined

const getEncryptionKey = (): Buffer => {
  if (!encryptionKeyCache) {
    const encryptionKeyHex = Effect.runSync(parseEnv("LAT_API_KEY_ENCRYPTION_KEY", "string"))
    encryptionKeyCache = Buffer.from(encryptionKeyHex, "hex")
  }
  return encryptionKeyCache
}

/**
 * Maps a database API key row to a domain ApiKey entity.
 * Decrypts the token from its stored encrypted form.
 */
const toDomainApiKey = (
  row: typeof apiKeys.$inferSelect,
  encryptionKey: Buffer,
): Effect.Effect<ApiKey, RepositoryError> =>
  Effect.tryPromise({
    try: async () => ({
      id: ApiKeyId(row.id),
      organizationId: OrganizationId(row.organizationId),
      token: await decrypt(row.token, encryptionKey),
      tokenHash: row.tokenHash,
      name: row.name ?? "",
      lastUsedAt: row.lastUsedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }),
    catch: (error) => toRepositoryError(error, "decrypt"),
  })

/**
 * Creates a Postgres implementation of the UnscopedApiKeyRepository port.
 *
 * This repository performs cross-organization operations. Use with caution
 * and only for legitimate cross-tenant use cases (authentication, batch ops).
 *
 * @param db - Drizzle database instance
 */
export const createUnscopedApiKeyPostgresRepository = (db: PostgresDb): UnscopedApiKeyRepository => {
  const encryptionKey = getEncryptionKey()

  return {
    _tag: "UnscopedRepository",

    findByTokenHash: (tokenHash: string) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(apiKeys)
              .where(and(eq(apiKeys.tokenHash, tokenHash), isNull(apiKeys.deletedAt)))
              .limit(1),
          catch: (error) => toRepositoryError(error, "findByTokenHash"),
        })

        return result ? yield* toDomainApiKey(result, encryptionKey) : null
      }),

    touchBatch: (ids: readonly ApiKeyIdType[]) =>
      Effect.gen(function* () {
        if (ids.length === 0) {
          return
        }

        const now = new Date()
        const idStrings = ids.map(String)

        yield* Effect.tryPromise({
          try: () =>
            db
              .update(apiKeys)
              .set({
                lastUsedAt: now,
                updatedAt: now,
              })
              .where(inArray(apiKeys.id, idStrings)),
          catch: (error) => toRepositoryError(error, "touchBatch"),
        })
      }),

    findAll: () =>
      Effect.gen(function* () {
        const results = yield* Effect.tryPromise({
          try: () => db.select().from(apiKeys).where(isNull(apiKeys.deletedAt)),
          catch: (error) => toRepositoryError(error, "findAll"),
        })

        return yield* Effect.all(results.map((row) => toDomainApiKey(row, encryptionKey)))
      }),

    existsByTokenHash: (tokenHash: string) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ count: sql<number>`count(*)` })
              .from(apiKeys)
              .where(and(eq(apiKeys.tokenHash, tokenHash), isNull(apiKeys.deletedAt)))
              .limit(1),
          catch: (error) => toRepositoryError(error, "existsByTokenHash"),
        })

        return (result?.count ?? 0) > 0
      }),
  }
}
