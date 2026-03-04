import type { Dataset, DatasetVersion } from "@domain/datasets"
import { DatasetNotFoundError } from "@domain/datasets"
import { DatasetId, DatasetVersionId, OrganizationId, ProjectId, toRepositoryError } from "@domain/shared"
import { and, count, eq, getTableColumns, isNull, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import { datasetVersions, datasets } from "../schema/index.ts"

const toDomainDataset = (row: typeof datasets.$inferSelect, latestVersionId?: string | null): Dataset => ({
  id: DatasetId(row.id),
  organizationId: OrganizationId(row.organizationId),
  projectId: ProjectId(row.projectId),
  name: row.name,
  description: row.description ?? null,
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

export const createDatasetPostgresRepository = (db: PostgresDb) => ({
  create: (args: { organizationId: string; projectId: string; name: string; description?: string }) =>
    Effect.gen(function* () {
      const rows = yield* Effect.tryPromise({
        try: () =>
          db
            .insert(datasets)
            .values({
              organizationId: args.organizationId,
              projectId: args.projectId,
              name: args.name,
              description: args.description ?? null,
            })
            .returning(),
        catch: (error) => toRepositoryError(error, "create"),
      })
      return toDomainDataset(rows[0] as typeof datasets.$inferSelect)
    }),

  findById: (id: string) =>
    Effect.gen(function* () {
      const datasetCols = getTableColumns(datasets)
      const [row] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ ...datasetCols, latestVersionId: datasetVersions.id })
            .from(datasets)
            .leftJoin(
              datasetVersions,
              and(eq(datasetVersions.datasetId, datasets.id), eq(datasetVersions.version, datasets.currentVersion)),
            )
            .where(and(eq(datasets.id, id), isNull(datasets.deletedAt)))
            .limit(1),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      if (!row) {
        return yield* new DatasetNotFoundError({ datasetId: id })
      }

      return toDomainDataset(row, row.latestVersionId)
    }),

  listByProject: (args: { organizationId: string; projectId: string; limit?: number; offset?: number }) =>
    Effect.gen(function* () {
      const limit = args.limit ?? 50
      const offset = args.offset ?? 0
      const datasetCols = getTableColumns(datasets)

      const projectFilter = and(
        eq(datasets.organizationId, args.organizationId),
        eq(datasets.projectId, args.projectId),
        isNull(datasets.deletedAt),
      )

      const [rows, totalResult] = yield* Effect.tryPromise({
        try: () =>
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
        catch: (error) => toRepositoryError(error, "listByProject"),
      })

      return {
        datasets: rows.map((r) => toDomainDataset(r, r.latestVersionId)),
        total: totalResult[0]?.total ?? 0,
      } as const
    }),

  softDelete: (id: string) =>
    Effect.gen(function* () {
      const [updated] = yield* Effect.tryPromise({
        try: () =>
          db
            .update(datasets)
            .set({ deletedAt: new Date() })
            .where(and(eq(datasets.id, id), isNull(datasets.deletedAt)))
            .returning({ id: datasets.id }),
        catch: (error) => toRepositoryError(error, "softDelete"),
      })

      if (!updated) {
        return yield* new DatasetNotFoundError({ datasetId: id })
      }
    }),

  incrementVersion: (args: { organizationId: string; id: string; rowsInserted: number; source?: string }) =>
    Effect.gen(function* () {
      const [updated] = yield* Effect.tryPromise({
        try: () =>
          db
            .update(datasets)
            .set({ currentVersion: sql`${datasets.currentVersion} + 1` })
            .where(and(eq(datasets.id, args.id), isNull(datasets.deletedAt)))
            .returning({ currentVersion: datasets.currentVersion }),
        catch: (error) => toRepositoryError(error, "incrementVersion"),
      })

      if (!updated) {
        return yield* new DatasetNotFoundError({ datasetId: args.id })
      }

      const newVersion = Number(updated.currentVersion)

      const [versionRow] = yield* Effect.tryPromise({
        try: () =>
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
        catch: (error) => toRepositoryError(error, "incrementVersion:insertVersion"),
      })

      return toDomainVersion(versionRow as typeof datasetVersions.$inferSelect)
    }),

  resolveVersion: (args: { datasetId: string; versionId: string }) =>
    Effect.gen(function* () {
      const [row] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ version: datasetVersions.version })
            .from(datasetVersions)
            .where(and(eq(datasetVersions.id, args.versionId), eq(datasetVersions.datasetId, args.datasetId)))
            .limit(1),
        catch: (error) => toRepositoryError(error, "resolveVersion"),
      })

      if (!row) {
        return yield* new DatasetNotFoundError({ datasetId: args.datasetId })
      }

      return Number(row.version)
    }),
})
