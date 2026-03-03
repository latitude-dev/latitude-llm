import { timingSafeEqual } from "node:crypto"
import type { ApiKey, ApiKeyRepository } from "@domain/api-keys"
import { type ApiKeyId, type OrganizationId, toRepositoryError } from "@domain/shared-kernel"
import type { ValueCrypto } from "@platform/env"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

const decryptToken = (token: string, tokenCrypto: ValueCrypto): string => tokenCrypto.decrypt(token)

const toDomainApiKey = (row: typeof schema.apiKeys.$inferSelect, tokenCrypto: ValueCrypto): ApiKey => {
  const token = decryptToken(row.token, tokenCrypto)

  return {
    id: row.id as ApiKey["id"],
    organizationId: row.organizationId as ApiKey["organizationId"],
    token,
    name: row.name ?? "",
    lastUsedAt: row.lastUsedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const toInsertRow = (apiKey: ApiKey, tokenCrypto: ValueCrypto): typeof schema.apiKeys.$inferInsert => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  token: tokenCrypto.encrypt(apiKey.token),
  tokenHash: tokenCrypto.hash(apiKey.token),
  name: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt,
  deletedAt: apiKey.deletedAt,
})

export const createApiKeyPostgresRepository = (db: PostgresDb, tokenCrypto: ValueCrypto): ApiKeyRepository => ({
  findById: (id: ApiKeyId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findFirst({
            where: eq(schema.apiKeys.id, id as string),
          }),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return result ? toDomainApiKey(result, tokenCrypto) : null
    }),

  findByToken: (token: string) =>
    Effect.gen(function* () {
      const tokenHash = tokenCrypto.hash(token)

      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findFirst({
            where: and(eq(schema.apiKeys.tokenHash, tokenHash), isNull(schema.apiKeys.deletedAt)),
          }),
        catch: (error) => toRepositoryError(error, "findByToken"),
      })

      if (result) {
        const decryptedToken = decryptToken(result.token, tokenCrypto)
        if (constantTimeEquals(decryptedToken, token)) {
          return toDomainApiKey(result, tokenCrypto)
        }
      }

      return null
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findMany({
            where: and(eq(schema.apiKeys.organizationId, organizationId as string), isNull(schema.apiKeys.deletedAt)),
          }),
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      })

      return results.map((row) => toDomainApiKey(row, tokenCrypto))
    }),

  save: (apiKey: ApiKey) =>
    Effect.gen(function* () {
      const row = toInsertRow(apiKey, tokenCrypto)

      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(schema.apiKeys)
            .values(row)
            .onConflictDoUpdate({
              target: schema.apiKeys.id,
              set: {
                token: row.token,
                tokenHash: row.tokenHash,
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
      try: () => db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id as string)),
      catch: (error) => toRepositoryError(error, "delete"),
    }),

  touch: (id: ApiKeyId) =>
    Effect.tryPromise({
      try: () =>
        db
          .update(schema.apiKeys)
          .set({
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.apiKeys.id, id as string)),
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
            .update(schema.apiKeys)
            .set({
              lastUsedAt: now,
              updatedAt: now,
            })
            .where(inArray(schema.apiKeys.id, idStrings)),
        catch: (error) => toRepositoryError(error, "touchBatch"),
      })
    }),
})
