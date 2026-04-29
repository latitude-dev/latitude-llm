import {
  FLAGGER_DEFAULT_ENABLED,
  FLAGGER_DEFAULT_SAMPLING,
  type Flagger,
  FlaggerRepository,
  type FlaggerRepositoryShape,
  flaggerSchema,
} from "@domain/flaggers"
import { RepositoryError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { flaggers } from "../schema/flaggers.ts"

const toDomainFlagger = (row: typeof flaggers.$inferSelect): Flagger =>
  flaggerSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    enabled: row.enabled,
    sampling: row.sampling,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const FlaggerRepositoryLive = Layer.effect(
  FlaggerRepository,
  Effect.gen(function* () {
    return {
      listByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(flaggers)
                .where(and(eq(flaggers.organizationId, organizationId), eq(flaggers.projectId, projectId)))
                .orderBy(asc(flaggers.slug)),
            )
            .pipe(
              Effect.map((rows) => rows.map(toDomainFlagger)),
              Effect.mapError((cause) => new RepositoryError({ operation: "listByProject", cause })),
            )
        }),

      findByProjectAndSlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(flaggers)
                .where(
                  and(
                    eq(flaggers.organizationId, organizationId),
                    eq(flaggers.projectId, projectId),
                    eq(flaggers.slug, slug),
                  ),
                )
                .limit(1),
            )
            .pipe(
              Effect.map((rows) => {
                const row = rows[0]
                return row !== undefined ? toDomainFlagger(row) : null
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "findByProjectAndSlug", cause })),
            )
        }),

      saveManyForProject: ({ projectId, slugs }) =>
        Effect.gen(function* () {
          if (slugs.length === 0) {
            return [] as readonly Flagger[]
          }
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .insert(flaggers)
                .values(
                  slugs.map((slug) => ({
                    organizationId,
                    projectId,
                    slug,
                    enabled: FLAGGER_DEFAULT_ENABLED,
                    sampling: FLAGGER_DEFAULT_SAMPLING,
                  })),
                )
                .onConflictDoNothing({
                  target: [flaggers.organizationId, flaggers.projectId, flaggers.slug],
                })
                .returning(),
            )
            .pipe(
              Effect.map((rows) =>
                rows
                  .map(toDomainFlagger)
                  .slice()
                  .sort((a, b) => a.slug.localeCompare(b.slug)),
              ),
              Effect.mapError((cause) => new RepositoryError({ operation: "saveManyForProject", cause })),
            )
        }),

      update: ({ projectId, slug, enabled }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()

          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(flaggers)
                .set({ enabled, updatedAt: now })
                .where(
                  and(
                    eq(flaggers.organizationId, organizationId),
                    eq(flaggers.projectId, projectId),
                    eq(flaggers.slug, slug),
                  ),
                )
                .returning(),
            )
            .pipe(
              Effect.map((rows) => {
                const row = rows[0]
                return row !== undefined ? toDomainFlagger(row) : null
              }),
              Effect.mapError((cause) => new RepositoryError({ operation: "update", cause })),
            )
        }),
    } satisfies FlaggerRepositoryShape
  }),
)
