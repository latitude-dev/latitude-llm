import type { ApiKey } from "@domain/api-keys"
import {
  ApiKeyId,
  type ApiKeyId as ApiKeyIdType,
  NotFoundError,
  OrganizationId,
  type RepositoryError,
  toRepositoryError,
} from "@domain/shared"
import { parseEnv } from "@platform/env"
import { decrypt, encrypt } from "@repo/utils"
import { eq, inArray, isNull } from "drizzle-orm"
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
  Effect.gen(function* () {
    const token = yield* decrypt(row.token, encryptionKey).pipe(Effect.mapError((e) => toRepositoryError(e, "decrypt")))
    return {
      id: ApiKeyId(row.id),
      organizationId: OrganizationId(row.organizationId),
      token,
      tokenHash: row.tokenHash,
      name: row.name ?? "",
      lastUsedAt: row.lastUsedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  })

/**
 * Maps a domain ApiKey entity to a database insert row.
 * Encrypts the plaintext token before storage.
 */
const toInsertRow = (
  apiKey: ApiKey,
  encryptionKey: Buffer,
): Effect.Effect<typeof apiKeys.$inferInsert, RepositoryError> =>
  Effect.gen(function* () {
    const token = yield* encrypt(apiKey.token, encryptionKey).pipe(
      Effect.mapError((e) => toRepositoryError(e, "encrypt")),
    )
    return {
      id: apiKey.id,
      organizationId: apiKey.organizationId,
      token,
      tokenHash: apiKey.tokenHash,
      name: apiKey.name,
      lastUsedAt: apiKey.lastUsedAt,
      deletedAt: apiKey.deletedAt,
    }
  })

/**
 * Creates a Postgres implementation of the ApiKeyRepository port.
 * Org-level isolation is enforced by the RLS context set via runCommand.
 */
export const createApiKeyPostgresRepository = (db: PostgresDb) => {
  const encryptionKey = getEncryptionKey()

  return {
    findById: (id: ApiKeyIdType) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () => db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1),
          catch: (error) => toRepositoryError(error, "findById"),
        })

        if (!result) {
          return yield* new NotFoundError({ entity: "ApiKey", id })
        }

        return yield* toDomainApiKey(result, encryptionKey)
      }),

    findAll: () =>
      Effect.gen(function* () {
        const results = yield* Effect.tryPromise({
          try: () => db.select().from(apiKeys).where(isNull(apiKeys.deletedAt)),
          catch: (error) => toRepositoryError(error, "findAll"),
        })

        return yield* Effect.all(results.map((row) => toDomainApiKey(row, encryptionKey)))
      }),

    save: (apiKey: ApiKey) =>
      Effect.gen(function* () {
        const row = yield* toInsertRow(apiKey, encryptionKey)

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
        try: () => db.delete(apiKeys).where(eq(apiKeys.id, id)),
        catch: (error) => toRepositoryError(error, "delete"),
      }),

    touch: (id: ApiKeyIdType) =>
      Effect.tryPromise({
        try: () => db.update(apiKeys).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, id)),
        catch: (error) => toRepositoryError(error, "touch"),
      }),

    // Cross-org lookup — only safe when the underlying connection bypasses RLS
    // (i.e. use the admin database connection, not the runtime one).
    findByTokenHash: (tokenHash: string) =>
      Effect.gen(function* () {
        const [result] = yield* Effect.tryPromise({
          try: () => db.select().from(apiKeys).where(eq(apiKeys.tokenHash, tokenHash)).limit(1),
          catch: (error) => toRepositoryError(error, "findByTokenHash"),
        })

        if (!result) {
          return yield* new NotFoundError({ entity: "ApiKey", id: tokenHash })
        }

        return yield* toDomainApiKey(result, encryptionKey)
      }),

    // Cross-org batch update — only safe when the underlying connection bypasses RLS.
    touchBatch: (ids: readonly ApiKeyIdType[]) =>
      Effect.tryPromise({
        try: () =>
          db
            .update(apiKeys)
            .set({ lastUsedAt: new Date(), updatedAt: new Date() })
            .where(inArray(apiKeys.id, ids as ApiKeyIdType[])),
        catch: (error) => toRepositoryError(error, "touchBatch"),
      }),
  }
}
