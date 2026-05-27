import { NotFoundError, RepositoryError, SqlClient, type SqlClientShape } from "@domain/shared"
import {
  TAXONOMY_EMBEDDING_DIMENSIONS,
  type TaxonomyCategory,
  TaxonomyCategoryRepository,
  taxonomyCategorySchema,
} from "@domain/taxonomy"
import { and, asc, desc, eq, getTableColumns, isNotNull, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { taxonomyCategories } from "../schema/taxonomy-categories.ts"

const toDomainCategory = (row: typeof taxonomyCategories.$inferSelect): TaxonomyCategory =>
  taxonomyCategorySchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    centroidEmbedding: row.centroidEmbedding ?? [],
    clusterCount: row.clusterCount,
    observationCount: row.observationCount,
    state: row.state,
    clusteredAt: row.clusteredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const validateVector = (
  vector: readonly number[],
  operation: string,
): Effect.Effect<readonly number[], RepositoryError> => {
  if (vector.length !== TAXONOMY_EMBEDDING_DIMENSIONS) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Expected ${TAXONOMY_EMBEDDING_DIMENSIONS} dimensions, received ${vector.length}`),
      }),
    )
  }

  const nonFiniteIndex = vector.findIndex((value) => !Number.isFinite(value))
  if (nonFiniteIndex !== -1) {
    return Effect.fail(
      new RepositoryError({
        operation,
        cause: new Error(`Vector contains non-finite value at index ${nonFiniteIndex}`),
      }),
    )
  }

  return Effect.succeed(vector)
}

const toVectorLiteral = (vector: readonly number[], operation: string) =>
  validateVector(vector, operation).pipe(Effect.map((validated) => sql.raw(`'[${validated.join(",")}]'::vector`)))

const toInsertRow = (category: TaxonomyCategory): typeof taxonomyCategories.$inferInsert => ({
  id: category.id,
  organizationId: category.organizationId,
  projectId: category.projectId,
  name: category.name,
  description: category.description,
  centroidEmbedding: category.centroidEmbedding.length === 0 ? null : [...category.centroidEmbedding],
  clusterCount: category.clusterCount,
  observationCount: category.observationCount,
  state: category.state,
  clusteredAt: category.clusteredAt,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
})

export const TaxonomyCategoryRepositoryLive = Layer.effect(
  TaxonomyCategoryRepository,
  Effect.gen(function* () {
    return {
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(taxonomyCategories)
                .where(and(eq(taxonomyCategories.organizationId, organizationId), eq(taxonomyCategories.id, id)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((rows) => {
                const row = rows[0]
                if (!row) return Effect.fail(new NotFoundError({ entity: "TaxonomyCategory", id }))
                return Effect.succeed(toDomainCategory(row))
              }),
            )
        }),

      listByProject: ({ projectId, state }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db, organizationId) => {
            const conditions = [
              eq(taxonomyCategories.organizationId, organizationId),
              eq(taxonomyCategories.projectId, projectId),
            ]
            if (state) conditions.push(eq(taxonomyCategories.state, state))

            return db
              .select()
              .from(taxonomyCategories)
              .where(and(...conditions))
              .orderBy(desc(taxonomyCategories.observationCount), asc(taxonomyCategories.id))
          })
          return rows.map(toDomainCategory)
        }),

      findBestMatchByVector: ({ projectId, queryVector }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const vector = yield* toVectorLiteral(queryVector, "TaxonomyCategoryRepository.findBestMatchByVector")
          const cosine = sql<number>`(1::double precision - (${taxonomyCategories.centroidEmbedding} <=> ${vector}))`
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({ ...getTableColumns(taxonomyCategories), cosine })
              .from(taxonomyCategories)
              .where(
                and(
                  eq(taxonomyCategories.organizationId, organizationId),
                  eq(taxonomyCategories.projectId, projectId),
                  eq(taxonomyCategories.state, "active"),
                  isNotNull(taxonomyCategories.centroidEmbedding),
                ),
              )
              .orderBy(desc(cosine), asc(taxonomyCategories.id))
              .limit(1),
          )
          const row = rows[0]
          return row ? { category: toDomainCategory(row), cosine: row.cosine } : null
        }),

      save: (category) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = toInsertRow(category)
          if (category.centroidEmbedding.length > 0) {
            yield* validateVector(category.centroidEmbedding, "TaxonomyCategoryRepository.save")
          }

          yield* sqlClient.query((db, organizationId) =>
            db
              .insert(taxonomyCategories)
              .values({ ...row, organizationId })
              .onConflictDoUpdate({
                target: taxonomyCategories.id,
                set: {
                  projectId: row.projectId,
                  name: row.name,
                  description: row.description,
                  centroidEmbedding: row.centroidEmbedding,
                  clusterCount: row.clusterCount,
                  observationCount: row.observationCount,
                  state: row.state,
                  clusteredAt: row.clusteredAt,
                  updatedAt: row.updatedAt,
                },
              }),
          )
        }),

      markDeprecated: ({ categoryId, timestamp }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(taxonomyCategories)
              .set({ state: "deprecated", updatedAt: timestamp })
              .where(and(eq(taxonomyCategories.organizationId, organizationId), eq(taxonomyCategories.id, categoryId))),
          )
        }),
    }
  }),
)
