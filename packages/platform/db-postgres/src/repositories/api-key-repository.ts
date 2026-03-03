import type { ApiKey, ApiKeyRepository } from "@domain/api-keys"
import { type ApiKeyId, type OrganizationId, toRepositoryError } from "@domain/shared-kernel"
import { decrypt, encrypt } from "@repo/utils"
import { eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { apiKeys } from "../schema/index.ts"

/**
 * Maps a database API key row to a domain ApiKey entity.
 * Decrypts the token from its stored encrypted form.
 */
const toDomainApiKey = (row: typeof apiKeys.$inferSelect, encryptionKey: Buffer): ApiKey => ({
  id: row.id as ApiKey["id"],
  organizationId: row.organizationId as ApiKey["organizationId"],
  token: decrypt(row.token, encryptionKey),
  tokenHash: row.tokenHash,
  name: row.name ?? "",
  lastUsedAt: row.lastUsedAt,
  deletedAt: row.deletedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Maps a domain ApiKey entity to a database insert row.
 * Encrypts the plaintext token before storage.
 */
const toInsertRow = (apiKey: ApiKey, encryptionKey: Buffer): typeof apiKeys.$inferInsert => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  token: encrypt(apiKey.token, encryptionKey),
  tokenHash: apiKey.tokenHash,
  name: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt,
  deletedAt: apiKey.deletedAt,
})

/**
 * Creates a Postgres implementation of the ApiKeyRepository port.
 *
 * @param db - Drizzle database instance
 * @param encryptionKey - 32-byte AES-256 key for token encryption/decryption
 */
export const createApiKeyPostgresRepository = (db: PostgresDb, encryptionKey: Buffer): ApiKeyRepository => ({
  findById: (id: ApiKeyId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () => db.query.apiKeys.findFirst({ where: { id } }),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return result ? toDomainApiKey(result, encryptionKey) : null
    }),

  findByTokenHash: (tokenHash: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findFirst({
            where: {
              tokenHash,
              deletedAt: { isNull: true },
            },
          }),
        catch: (error) => toRepositoryError(error, "findByTokenHash"),
      })

      return result ? toDomainApiKey(result, encryptionKey) : null
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findMany({
            where: {
              organizationId,
              deletedAt: { isNull: true },
            },
          }),
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      })

      return results.map((row) => toDomainApiKey(row, encryptionKey))
    }),

  save: (apiKey: ApiKey) =>
    Effect.gen(function* () {
      const row = toInsertRow(apiKey, encryptionKey)

      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(apiKeys)
            .values(row)
            .onConflictDoUpdate({
              target: apiKeys.id,
              set: {
                name: row.name,
                lastUsedAt: row.lastUsedAt,
                deletedAt: row.deletedAt,
                updatedAt: new Date(),
              },
            }),
        catch: (error) => toRepositoryError(error, "save"),
      })
    }),

  delete: (id: ApiKeyId) =>
    Effect.tryPromise({
      try: () => db.delete(apiKeys).where(eq(apiKeys.id, id)),
      catch: (error) => toRepositoryError(error, "delete"),
    }),

  touch: (id: ApiKeyId) =>
    Effect.tryPromise({
      try: () =>
        db
          .update(apiKeys)
          .set({
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(apiKeys.id, id)),
      catch: (error) => toRepositoryError(error, "touch"),
    }),

  touchBatch: (ids: readonly ApiKeyId[]) =>
    Effect.gen(function* () {
      if (ids.length === 0) {
        return
      }

      const now = new Date()
      const idStrings = ids.map((id) => id as string)

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
})
