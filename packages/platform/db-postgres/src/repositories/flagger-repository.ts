import {
  FLAGGER_DEFAULT_ENABLED,
  FLAGGER_DEFAULT_SAMPLING,
  type Flagger,
  FlaggerRepository,
  type FlaggerRepositoryShape,
  flaggerSchema,
} from "@domain/flaggers"
import { RepositoryError, SqlClient, type SqlClientShape } from "@domain/shared"
import { createLogger } from "@repo/observability"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { flaggers } from "../schema/flaggers.ts"

const logger = createLogger("db-postgres/flagger-repository")

// A row's slug can be ahead of this build's FLAGGER_STRATEGY_SLUGS during a rollout — e.g. a
// backfill migration provisions a newly added strategy before the app code that recognizes it
// deploys. Skip such rows instead of failing the whole batch so unrelated flaggers keep working.
const toDomainFlagger = (row: typeof flaggers.$inferSelect): Flagger | null => {
  const parsed = flaggerSchema.safeParse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    enabled: row.enabled,
    sampling: row.sampling,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

  if (!parsed.success) {
    logger.warn("Skipping unrecognized flagger row", {
      flaggerId: row.id,
      projectId: row.projectId,
      slug: row.slug,
    })
    return null
  }

  return parsed.data
}

const toDomainFlaggers = (rows: readonly (typeof flaggers.$inferSelect)[]): Flagger[] =>
  rows.map(toDomainFlagger).filter((flagger): flagger is Flagger => flagger !== null)

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
              Effect.map(toDomainFlaggers),
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
              Effect.map((rows) => toDomainFlaggers(rows).sort((a, b) => a.slug.localeCompare(b.slug))),
              Effect.mapError((cause) => new RepositoryError({ operation: "saveManyForProject", cause })),
            )
        }),

      updateEnabledForProject: ({ projectId, enabledSlugs, slugs }) =>
        Effect.gen(function* () {
          if (slugs.length === 0) {
            return [] as readonly Flagger[]
          }

          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()
          const enabledExpression =
            enabledSlugs.length === 0
              ? sql<boolean>`false`
              : sql<boolean>`case when ${flaggers.slug} in (${sql.join(
                  enabledSlugs.map((slug) => sql`${slug}`),
                  sql`, `,
                )}) then true else false end`

          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(flaggers)
                .set({
                  enabled: enabledExpression,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(flaggers.organizationId, organizationId),
                    eq(flaggers.projectId, projectId),
                    inArray(flaggers.slug, slugs),
                    sql`${flaggers.enabled} is distinct from ${enabledExpression}`,
                  ),
                )
                .returning(),
            )
            .pipe(
              Effect.map((rows) => toDomainFlaggers(rows).sort((a, b) => a.slug.localeCompare(b.slug))),
              Effect.mapError((cause) => new RepositoryError({ operation: "updateEnabledForProject", cause })),
            )
        }),

      update: ({ projectId, slug, enabled, sampling }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()

          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(flaggers)
                .set({
                  ...(enabled !== undefined ? { enabled } : {}),
                  ...(sampling !== undefined ? { sampling } : {}),
                  updatedAt: now,
                })
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
