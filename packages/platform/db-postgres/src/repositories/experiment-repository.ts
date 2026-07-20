import {
  type Experiment,
  ExperimentRepository,
  type ExperimentSearchResult,
  experimentSchema,
} from "@domain/experiments"
import { type ExperimentId, NotFoundError, type ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, asc, count, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { experiments } from "../schema/experiments.ts"
import { projects } from "../schema/projects.ts"
import { nameMatchScore, preferProjectFirst } from "./org-search.ts"

const toExperiment = (row: typeof experiments.$inferSelect): Experiment =>
  experimentSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    variants: row.variants,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toExperimentRow = (experiment: Experiment): typeof experiments.$inferInsert => ({
  id: experiment.id,
  organizationId: experiment.organizationId,
  projectId: experiment.projectId,
  slug: experiment.slug,
  name: experiment.name,
  description: experiment.description,
  variants: experiment.variants,
  deletedAt: experiment.deletedAt,
  createdAt: experiment.createdAt,
  updatedAt: experiment.updatedAt,
})

export const ExperimentRepositoryLive = Layer.effect(
  ExperimentRepository,
  Effect.succeed(
    ExperimentRepository.of({
      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(experiments)
              .where(
                and(
                  eq(experiments.organizationId, sqlClient.organizationId),
                  eq(experiments.id, id),
                  isNull(experiments.deletedAt),
                ),
              )
              .limit(1),
          )
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "Experiment", id })
          return toExperiment(row)
        }),
      findBySlug: ({ projectId, slug }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select()
              .from(experiments)
              .where(
                and(
                  eq(experiments.organizationId, sqlClient.organizationId),
                  eq(experiments.projectId, projectId),
                  eq(experiments.slug, slug),
                  isNull(experiments.deletedAt),
                ),
              )
              .limit(1),
          )
          const row = rows[0]
          if (!row) return yield* new NotFoundError({ entity: "Experiment", id: slug })
          return toExperiment(row)
        }),
      list: ({ projectId, limit, offset, searchQuery }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const where = and(
            eq(experiments.organizationId, sqlClient.organizationId),
            eq(experiments.projectId, projectId),
            isNull(experiments.deletedAt),
            searchQuery ? ilike(experiments.name, `%${searchQuery}%`) : undefined,
          )
          const [rows, totals] = yield* sqlClient.query((db) =>
            Promise.all([
              db
                .select()
                .from(experiments)
                .where(where)
                .orderBy(desc(experiments.updatedAt), asc(experiments.id))
                .limit(limit)
                .offset(offset),
              db.select({ value: count() }).from(experiments).where(where),
            ]),
          )
          const totalCount = Number(totals[0]?.value ?? 0)
          return {
            items: rows.map(toExperiment),
            totalCount,
            hasMore: offset + rows.length < totalCount,
            limit,
            offset,
          }
        }),
      searchOrgWide: ({ searchQuery, preferProjectId, limit }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const trimmed = searchQuery?.trim()
          const where = and(
            eq(experiments.organizationId, sqlClient.organizationId),
            isNull(experiments.deletedAt),
            isNull(projects.deletedAt),
            trimmed ? ilike(experiments.name, `%${trimmed}%`) : undefined,
          )
          const orderBy = [
            ...preferProjectFirst(experiments.projectId, preferProjectId),
            ...(trimmed
              ? [desc(nameMatchScore(experiments.name, trimmed)), desc(experiments.updatedAt), asc(experiments.id)]
              : [desc(experiments.updatedAt), asc(experiments.id)]),
          ]
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: experiments.id,
                projectId: experiments.projectId,
                projectSlug: projects.slug,
                projectName: projects.name,
                slug: experiments.slug,
                name: experiments.name,
                variantCount: sql<number>`coalesce(jsonb_array_length(${experiments.variants}), 0)`,
              })
              .from(experiments)
              .innerJoin(projects, eq(projects.id, experiments.projectId))
              .where(where)
              .orderBy(...orderBy)
              .limit(limit),
          )
          return rows.map(
            (row): ExperimentSearchResult => ({
              id: row.id as ExperimentId,
              projectId: row.projectId as ProjectId,
              projectSlug: row.projectSlug,
              projectName: row.projectName,
              slug: row.slug,
              name: row.name,
              variantCount: Number(row.variantCount),
            }),
          )
        }),
      create: (experiment) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) => db.insert(experiments).values(toExperimentRow(experiment)))
        }),
      save: (experiment) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const updated = yield* sqlClient.query((db) =>
            db
              .update(experiments)
              .set(toExperimentRow(experiment))
              .where(
                and(
                  eq(experiments.organizationId, sqlClient.organizationId),
                  eq(experiments.id, experiment.id),
                  isNull(experiments.deletedAt),
                ),
              )
              .returning({ id: experiments.id }),
          )
          if (updated.length === 0) return yield* new NotFoundError({ entity: "Experiment", id: experiment.id })
        }),
      softDelete: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()
          const deleted = yield* sqlClient.query((db) =>
            db
              .update(experiments)
              .set({ deletedAt: now, updatedAt: now })
              .where(
                and(
                  eq(experiments.organizationId, sqlClient.organizationId),
                  eq(experiments.id, id),
                  isNull(experiments.deletedAt),
                ),
              )
              .returning({ id: experiments.id }),
          )
          if (deleted.length === 0) return yield* new NotFoundError({ entity: "Experiment", id })
        }),
      countActiveBySlug: ({ projectId, slug, excludeId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient.query((db) =>
            db
              .select({ value: count() })
              .from(experiments)
              .where(
                and(
                  eq(experiments.organizationId, sqlClient.organizationId),
                  eq(experiments.projectId, projectId),
                  eq(experiments.slug, slug),
                  ne(experiments.id, excludeId),
                  isNull(experiments.deletedAt),
                ),
              ),
          )
          return Number(rows[0]?.value ?? 0)
        }),
    }),
  ),
)
