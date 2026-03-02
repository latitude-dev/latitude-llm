import type { ApiKey, ApiKeyRepository } from "@domain/api-keys";
import { type ApiKeyId, type OrganizationId, toRepositoryError } from "@domain/shared-kernel";
import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { PostgresDb } from "../client.ts";
import * as schema from "../schema/index.ts";

/**
 * Maps a database API key row to a domain ApiKey entity.
 */
const toDomainApiKey = (row: typeof schema.apiKeys.$inferSelect): ApiKey => ({
  id: row.id as ApiKey["id"],
  organizationId: row.organizationId as ApiKey["organizationId"],
  token: row.token,
  name: row.name ?? "",
  lastUsedAt: row.lastUsedAt,
  deletedAt: row.deletedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * Maps a domain ApiKey entity to a database insert row.
 */
const toInsertRow = (apiKey: ApiKey): typeof schema.apiKeys.$inferInsert => ({
  id: apiKey.id,
  organizationId: apiKey.organizationId,
  token: apiKey.token,
  name: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt,
  deletedAt: apiKey.deletedAt,
  // createdAt and updatedAt are set by defaultNow()
});

/**
 * Creates a Postgres implementation of the ApiKeyRepository port.
 */
export const createApiKeyPostgresRepository = (db: PostgresDb): ApiKeyRepository => ({
  findById: (id: ApiKeyId) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findFirst({
            where: eq(schema.apiKeys.id, id as string),
          }),
        catch: (error) => toRepositoryError(error, "findById"),
      });

      return result ? toDomainApiKey(result) : null;
    }),

  findByToken: (token: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findFirst({
            where: and(eq(schema.apiKeys.token, token), isNull(schema.apiKeys.deletedAt)),
          }),
        catch: (error) => toRepositoryError(error, "findByToken"),
      });

      return result ? toDomainApiKey(result) : null;
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: () =>
          db.query.apiKeys.findMany({
            where: and(
              eq(schema.apiKeys.organizationId, organizationId as string),
              isNull(schema.apiKeys.deletedAt),
            ),
          }),
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      });

      return results.map(toDomainApiKey);
    }),

  save: (apiKey: ApiKey) =>
    Effect.gen(function* () {
      const row = toInsertRow(apiKey);

      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(schema.apiKeys)
            .values(row)
            .onConflictDoUpdate({
              target: schema.apiKeys.id,
              set: {
                name: row.name,
                lastUsedAt: row.lastUsedAt,
                deletedAt: row.deletedAt,
                updatedAt: new Date(),
              },
            }),
        catch: (error) => toRepositoryError(error, "save"),
      });
    }),

  delete: (id: ApiKeyId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id as string)),
        catch: (error) => toRepositoryError(error, "delete"),
      });
    }),

  touch: (id: ApiKeyId) =>
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () =>
          db
            .update(schema.apiKeys)
            .set({
              lastUsedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.apiKeys.id, id as string)),
        catch: (error) => toRepositoryError(error, "touch"),
      });
    }),
});
