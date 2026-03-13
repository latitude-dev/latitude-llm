import type { Dataset, DatasetVersion } from "@domain/datasets"
import { DatasetNotFoundError, DatasetRepository } from "@domain/datasets"
import { DatasetId, DatasetVersionId, OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, count, eq, getColumns, isNull, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { datasets, datasetVersions } from "../schema/index.ts"

const toDomainDataset = (row: typeof datasets.$inferSelect, latestVersionId?: string | null): Dataset => ({
  id: DatasetId(row.id),
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  name: row.name,
  description: row.description ?? null,
  fileKey: row.fileKey ?? null,
  currentVersion: Number(row.currentVersion),
  latestVersionId: latestVersionId ? DatasetVersionId(latestVersionId) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toDomainVersion = (row: typeof datasetVersions.$inferSelect): DatasetVersion => ({
  id: DatasetVersionId(row.id),
  datasetId: DatasetId(row.datasetId),
  version: Number(row.version),
  rowsInserted: row.rowsInserted,
  rowsUpdated: row.rowsUpdated,
  rowsDeleted: row.rowsDeleted,
  source: row.source,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Live layer that pulls db from SqlClient
 */
export const DatasetRepositoryLive = Layer.effect(
  DatasetRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      create: (args) =>
        Effect.gen(function* () {
          const rows = yield* sqlClient.query((db) =>
            db
              .insert(datasets)
              .values({
                organizationId: args.organizationId,
                projectId: args.projectId,
                name: args.name,
                description: args.description ?? null,
                fileKey: args.fileKey ?? null,
              })
              .returning(),
          )
          return toDomainDataset(rows[0] as typeof datasets.$inferSelect)
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const datasetCols = getColumns(datasets)
          const [row] = yield* sqlClient.query((db) =>
            db
              .select({ ...datasetCols, latestVersionId: datasetVersions.id })
              .from(datasets)
              .leftJoin(
                datasetVersions,
                and(eq(datasetVersions.datasetId, datasets.id), eq(datasetVersions.version, datasets.currentVersion)),
              )
              .where(and(eq(datasets.id, id), isNull(datasets.deletedAt)))
              .limit(1),
          )

          if (!row) {
            return yield* new DatasetNotFoundError({ datasetId: id })
          }

          return toDomainDataset(row, row.latestVersionId)
        }),

      listByProject: (args) =>
        Effect.gen(function* () {
          const limit = args.limit ?? 50
          const offset = args.offset ?? 0
          const datasetCols = getColumns(datasets)

          const projectFilter = and(
            eq(datasets.organizationId, args.organizationId),
            eq(datasets.projectId, args.projectId),
            isNull(datasets.deletedAt),
          )

          const [rows, totalResult] = yield* sqlClient.query((db) =>
            Promise.all([
              db
                .select({ ...datasetCols, latestVersionId: datasetVersions.id })
                .from(datasets)
                .leftJoin(
                  datasetVersions,
                  and(eq(datasetVersions.datasetId, datasets.id), eq(datasetVersions.version, datasets.currentVersion)),
                )
                .where(projectFilter)
                .orderBy(datasets.createdAt)
                .limit(limit)
                .offset(offset),
              db.select({ total: count() }).from(datasets).where(projectFilter),
            ]),
          )

          return {
            datasets: rows.map((r) => toDomainDataset(r, r.latestVersionId)),
            total: totalResult[0]?.total ?? 0,
          } as const
        }),

      updateFileKey: (args) =>
        Effect.gen(function* () {
          const [updated] = yield* sqlClient.query((db) =>
            db
              .update(datasets)
              .set({ fileKey: args.fileKey })
              .where(and(eq(datasets.id, args.id), isNull(datasets.deletedAt)))
              .returning(),
          )

          if (!updated) {
            return yield* new DatasetNotFoundError({ datasetId: args.id })
          }

          return toDomainDataset(updated)
        }),

      softDelete: (id) =>
        Effect.gen(function* () {
          const [updated] = yield* sqlClient.query((db) =>
            db
              .update(datasets)
              .set({ deletedAt: new Date() })
              .where(and(eq(datasets.id, id), isNull(datasets.deletedAt)))
              .returning({ id: datasets.id }),
          )

          if (!updated) {
            return yield* new DatasetNotFoundError({ datasetId: id })
          }
        }),

      incrementVersion: (args) =>
        Effect.gen(function* () {
          const [updated] = yield* sqlClient.query((db) =>
            db
              .update(datasets)
              .set({ currentVersion: sql`${datasets.currentVersion} + 1` })
              .where(and(eq(datasets.id, args.id), isNull(datasets.deletedAt)))
              .returning({ currentVersion: datasets.currentVersion }),
          )

          if (!updated) {
            return yield* new DatasetNotFoundError({ datasetId: args.id })
          }

          const newVersion = Number(updated.currentVersion)

          const [versionRow] = yield* sqlClient.query((db) =>
            db
              .insert(datasetVersions)
              .values({
                organizationId: args.organizationId,
                datasetId: args.id,
                version: newVersion,
                rowsInserted: args.rowsInserted,
                source: args.source ?? "api",
              })
              .returning(),
          )

          return toDomainVersion(versionRow as typeof datasetVersions.$inferSelect)
        }),

      decrementVersion: (args) =>
        Effect.gen(function* () {
          yield* sqlClient.query((db) => db.delete(datasetVersions).where(eq(datasetVersions.id, args.versionId)))

          const [updated] = yield* sqlClient.query((db) =>
            db
              .update(datasets)
              .set({ currentVersion: sql`GREATEST(${datasets.currentVersion} - 1, 0)` })
              .where(and(eq(datasets.id, args.id), isNull(datasets.deletedAt)))
              .returning({ id: datasets.id }),
          )

          if (!updated) {
            return yield* new DatasetNotFoundError({ datasetId: args.id })
          }
        }),

      resolveVersion: (args) =>
        Effect.gen(function* () {
          const [row] = yield* sqlClient.query((db) =>
            db
              .select({ version: datasetVersions.version })
              .from(datasetVersions)
              .where(and(eq(datasetVersions.id, args.versionId), eq(datasetVersions.datasetId, args.datasetId)))
              .limit(1),
          )

          if (!row) {
            return yield* new DatasetNotFoundError({ datasetId: args.datasetId })
          }

          return Number(row.version)
        }),
    }
  }),
)
