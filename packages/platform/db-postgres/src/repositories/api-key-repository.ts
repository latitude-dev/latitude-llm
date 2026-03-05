import type { ApiKey, ApiKeyRepository } from "@domain/api-keys"
import {
  ApiKeyId,
  type ApiKeyId as ApiKeyIdType,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  toRepositoryError,
} from "@domain/shared"
import { parseEnv } from "@platform/env"
import { decrypt, encrypt } from "@repo/utils"
import { and, eq, isNull } from "drizzle-orm"
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
const toDomainApiKey = async (row: typeof apiKeys.$inferSelect, encryptionKey: Buffer): Promise<ApiKey> => ({
  id: ApiKeyId(row.id),
  organizationId: OrganizationId(row.organizationId),
  token: await decrypt(row.token, encryptionKey),
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
const toInsertRow = async (apiKey: ApiKey, encryptionKey: Buffer): Promise<typeof apiKeys.$inferInsert> => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  token: await encrypt(apiKey.token, encryptionKey),
  tokenHash: apiKey.tokenHash,
  name: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt,
  deletedAt: apiKey.deletedAt,
})

/**
 * Creates a Postgres implementation of the ApiKeyRepository port.
 * All operations are scoped to the provided organization ID.
 *
 * @param db - Drizzle database instance
 * @param organizationId - The organization ID this repository is scoped to
 */
export const createApiKeyPostgresRepository = (
  db: PostgresDb,
  organizationId: OrganizationIdType,
): ApiKeyRepository => {
  const encryptionKey = getEncryptionKey()

  return {
    organizationId,

    findById: (id: ApiKeyIdType) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(apiKeys)
              .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId)))
              .limit(1),
          catch: (error) => toRepositoryError(error, "findById"),
        })

        return result ? yield* Effect.promise(() => toDomainApiKey(result, encryptionKey)) : null
      }),

    findAll: () =>
      Effect.gen(function* () {
        const results = yield* Effect.tryPromise({
          try: () =>
            db
              .select()
              .from(apiKeys)
              .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.deletedAt))),
          catch: (error) => toRepositoryError(error, "findAll"),
        })

        return yield* Effect.promise(() => Promise.all(results.map((row) => toDomainApiKey(row, encryptionKey))))
      }),

    save: (apiKey: ApiKey) =>
      Effect.gen(function* () {
        const row = yield* Effect.promise(() => toInsertRow(apiKey, encryptionKey))

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

    delete: (id: ApiKeyIdType) =>
      Effect.tryPromise({
        try: () => db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))),
        catch: (error) => toRepositoryError(error, "delete"),
      }),

    touch: (id: ApiKeyIdType) =>
      Effect.tryPromise({
        try: () =>
          db
            .update(apiKeys)
            .set({
              lastUsedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))),
        catch: (error) => toRepositoryError(error, "touch"),
      }),
  }
}
