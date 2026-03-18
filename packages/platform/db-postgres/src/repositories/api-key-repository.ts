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
import { decrypt, encrypt } from "@repo/utils"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { apiKeys } from "../schema/index.ts"

let encryptionKeyCache: Buffer | undefined

const getEncryptionKey = (): Buffer => {
  if (!encryptionKeyCache) {
    const encryptionKeyHex = Effect.runSync(parseEnv("LAT_MASTER_ENCRYPTION_KEY", "string"))
    encryptionKeyCache = Buffer.from(encryptionKeyHex, "hex")
  }
  return encryptionKeyCache
}

const toDomainApiKey = (row: typeof apiKeys.$inferSelect, encryptionKey: Buffer) =>
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
    } as ApiKey
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
    const encryptionKey = getEncryptionKey()

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

      findAll: () =>
        Effect.gen(function* () {
          const results = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(apiKeys)
              .where(and(eq(apiKeys.organizationId, organizationId), isNull(apiKeys.deletedAt))),
          )

          return yield* Effect.all(results.map((row) => toDomainApiKey(row, encryptionKey)))
        }),

      delete: (id: ApiKeyIdType) =>
        Effect.gen(function* () {
          yield* sqlClient.query((db, organizationId) =>
            db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))),
          )
        }),

      touch: (id: ApiKeyIdType) =>
        Effect.gen(function* () {
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(apiKeys)
              .set({ lastUsedAt: new Date(), updatedAt: new Date() })
              .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId))),
          )
        }),

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
