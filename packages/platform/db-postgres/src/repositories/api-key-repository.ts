import type { ApiKey } from "@domain/api-keys"
import { ApiKeyRepository } from "@domain/api-keys"
import {
  ApiKeyId,
  type ApiKeyId as ApiKeyIdType,
  NotFoundError,
  OrganizationId,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { parseEnv } from "@platform/env"
import { type CryptoError, decrypt, encrypt, hash } from "@repo/utils"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { apiKeys } from "../schema/api-keys.ts"

let encryptionKeyCache: Buffer | undefined

const VALID_HEX_32_BYTE_KEY = /^[0-9a-f]{64}$/i

// Enforce strict 32-byte key material while allowing any secret format.
export const resolveApiKeyEncryptionKey = (rawSecret: string): Effect.Effect<Buffer, CryptoError> => {
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
    const key = yield* resolveApiKeyEncryptionKey(encryptionKeySecret)
    encryptionKeyCache = key
    return key
  })

const toDomainApiKey = (row: typeof apiKeys.$inferSelect, encryptionKey: Buffer) =>
  Effect.gen(function* () {
    const token = yield* decrypt(row.token, encryptionKey).pipe(Effect.mapError((e) => toRepositoryError(e, "decrypt")))
    const apiKey: ApiKey = {
      id: ApiKeyId(row.id),
      organizationId: OrganizationId(row.organizationId),
      token,
      tokenHash: row.tokenHash,
      name: row.name,
      lastUsedAt: row.lastUsedAt,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return apiKey
  })

const toInsertRow = (apiKey: ApiKey, encryptionKey: Buffer) =>
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

export const ApiKeyRepositoryLive = Layer.effect(
  ApiKeyRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
    const encryptionKey = yield* getEncryptionKey()

    const list = () =>
      Effect.gen(function* () {
        const results = yield* sqlClient.query((db, organizationId) =>
          db
            .select()
            .from(apiKeys)
            .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.deletedAt))),
        )

        return yield* Effect.all(results.map((row) => toDomainApiKey(row, encryptionKey)))
      })

    return {
      findById: (id: ApiKeyIdType) =>
        Effect.gen(function* () {
          const [result] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(apiKeys)
              .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId)))
              .limit(1),
          )

          if (!result) return yield* new NotFoundError({ entity: "ApiKey", id })

          return yield* toDomainApiKey(result, encryptionKey)
        }),

      list,

      delete: (id: ApiKeyIdType) =>
        sqlClient.query((db, organizationId) =>
          db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))),
        ),

      touch: (id: ApiKeyIdType) =>
        sqlClient.query((db, organizationId) =>
          db
            .update(apiKeys)
            .set({ lastUsedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))),
        ),

      // Cross-org lookup — uses direct db access (bypasses RLS)
      save: (apiKey: ApiKey) =>
        Effect.gen(function* () {
          const row = yield* toInsertRow(apiKey, encryptionKey)

          yield* sqlClient.query((db) =>
            db
              .insert(apiKeys)
              .values(row)
              .onConflictDoUpdate({
                target: apiKeys.id,
                set: { name: row.name, lastUsedAt: row.lastUsedAt, deletedAt: row.deletedAt, updatedAt: new Date() },
              }),
          )
        }),

      // Cross-org lookup — uses direct db access (bypasses RLS)
      findByTokenHash: (tokenHash: string) =>
        Effect.gen(function* () {
          const [result] = yield* sqlClient.query((db) =>
            db.select().from(apiKeys).where(eq(apiKeys.tokenHash, tokenHash)).limit(1),
          )

          if (!result) return yield* new NotFoundError({ entity: "ApiKey", id: tokenHash })

          return yield* toDomainApiKey(result, encryptionKey)
        }),

      // Cross-org batch update — uses direct db access (bypasses RLS)
      touchBatch: (ids: readonly ApiKeyIdType[]) =>
        sqlClient
          .query((db) =>
            db
              .update(apiKeys)
              .set({ lastUsedAt: new Date(), updatedAt: new Date() })
              .where(inArray(apiKeys.id, ids as ApiKeyIdType[])),
          )
          .pipe(Effect.mapError((e) => toRepositoryError(e, "touchBatch"))),
    }
  }),
)
