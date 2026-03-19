import type { Dataset, DatasetListCursor, DatasetListPage, DatasetVersion } from "@domain/datasets"
import { type DATASET_LIST_SORT_COLUMNS, DatasetNotFoundError, DatasetRepository } from "@domain/datasets"
import {
  DatasetId,
  DatasetVersionId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
  type SqlClientShape,
} from "@domain/shared"
import { and, asc, desc, eq, getColumns, gt, isNull, lt, ne, or, sql } from "drizzle-orm"
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
  actorId: row.actorId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

type DatasetListRow = typeof datasets.$inferSelect & {
  latestVersionId: string | null
}

interface DatasetSortColumn {
  readonly orderBy: (dir: "asc" | "desc") => [ReturnType<typeof asc>, ReturnType<typeof asc>]
  readonly cursorCondition: (cursor: DatasetListCursor, dir: "asc" | "desc") => ReturnType<typeof or>
  readonly getSortValue: (row: DatasetListRow) => string
}

const SORT_COLUMNS: Record<(typeof DATASET_LIST_SORT_COLUMNS)[number], DatasetSortColumn> = {
  name: {
    orderBy: (dir) =>
      dir === "asc" ? [asc(datasets.name), asc(datasets.id)] : [desc(datasets.name), desc(datasets.id)],
    cursorCondition: (cursor, dir) =>
      dir === "desc"
        ? or(lt(datasets.name, cursor.sortValue), and(eq(datasets.name, cursor.sortValue), lt(datasets.id, cursor.id)))
        : or(gt(datasets.name, cursor.sortValue), and(eq(datasets.name, cursor.sortValue), gt(datasets.id, cursor.id))),
    getSortValue: (row) => row.name,
  },
  updatedAt: {
    orderBy: (dir) =>
      dir === "asc" ? [asc(datasets.updatedAt), asc(datasets.id)] : [desc(datasets.updatedAt), desc(datasets.id)],
    cursorCondition: (cursor, dir) => {
      const value = new Date(cursor.sortValue)
      return dir === "desc"
        ? or(lt(datasets.updatedAt, value), and(eq(datasets.updatedAt, value), lt(datasets.id, cursor.id)))
        : or(gt(datasets.updatedAt, value), and(eq(datasets.updatedAt, value), gt(datasets.id, cursor.id)))
    },
    getSortValue: (row) => row.updatedAt.toISOString(),
  },
}

const DEFAULT_SORT: DatasetSortColumn = SORT_COLUMNS.updatedAt

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
                organizationId: sqlClient.organizationId,
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
          const options = args.options ?? {}
          const limit = options.limit ?? 50
          const cursor = options.cursor
          const sortBy = options.sortBy === "name" ? "name" : "updatedAt"
          const sortDirection = options.sortDirection === "asc" ? "asc" : "desc"
          const sort = SORT_COLUMNS[sortBy] ?? DEFAULT_SORT
          const datasetCols = getColumns(datasets)
          const projectFilter = and(
            eq(datasets.organizationId, sqlClient.organizationId),
            eq(datasets.projectId, args.projectId),
            isNull(datasets.deletedAt),
          )

          const orderBy = sort.orderBy(sortDirection)
          const cursorCondition = cursor ? sort.cursorCondition(cursor, sortDirection) : undefined
          const whereClause = cursorCondition ? and(projectFilter, cursorCondition) : projectFilter

          const rows = yield* sqlClient.query((db) =>
            db
              .select({ ...datasetCols, latestVersionId: datasetVersions.id })
              .from(datasets)
              .leftJoin(
                datasetVersions,
                and(eq(datasetVersions.datasetId, datasets.id), eq(datasetVersions.version, datasets.currentVersion)),
              )
              .where(whereClause)
              .orderBy(...orderBy)
              .limit(limit + 1),
          )

          const hasMore = rows.length > limit
          const pageRows = hasMore ? rows.slice(0, limit) : rows
          const items = pageRows.map((r) => toDomainDataset(r, r.latestVersionId))
          const last = hasMore ? pageRows[pageRows.length - 1] : undefined
          const nextCursor: DatasetListCursor | undefined = last
            ? { sortValue: sort.getSortValue(last), id: last.id }
            : undefined

          const page: DatasetListPage = nextCursor
            ? { datasets: items, hasMore, nextCursor }
            : { datasets: items, hasMore }
          return page
        }),

      existsByNameInProject: (args) =>
        Effect.gen(function* () {
          const conditions = and(
            eq(datasets.organizationId, sqlClient.organizationId),
            eq(datasets.projectId, args.projectId),
            eq(datasets.name, args.name),
            isNull(datasets.deletedAt),
            ...(args.excludeDatasetId ? [ne(datasets.id, args.excludeDatasetId)] : []),
          )
          const [row] = yield* sqlClient.query((db) =>
            db.select({ one: sql<number>`1` }).from(datasets).where(conditions).limit(1),
          )
          return row !== undefined
        }),

      updateName: (args) =>
        Effect.gen(function* () {
          const [updated] = yield* sqlClient.query((db) =>
            db
              .update(datasets)
              .set({ name: args.name })
              .where(and(eq(datasets.id, args.id), isNull(datasets.deletedAt)))
              .returning(),
          )

          if (!updated) {
            return yield* new DatasetNotFoundError({ datasetId: args.id })
          }

          return toDomainDataset(updated)
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
            return yield* new RepositoryError({
              cause: new Error("Update affected no rows"),
              operation: "updateFileKey",
            })
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
            return yield* new RepositoryError({
              cause: new Error("Update affected no rows"),
              operation: "softDelete",
            })
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
            return yield* new RepositoryError({
              cause: new Error("Update affected no rows"),
              operation: "incrementVersion",
            })
          }

          const newVersion = Number(updated.currentVersion)

          const [versionRow] = yield* sqlClient.query((db) =>
            db
              .insert(datasetVersions)
              .values({
                organizationId: sqlClient.organizationId,
                datasetId: args.id,
                version: newVersion,
                rowsInserted: args.rowsInserted,
                source: args.source ?? "api",
                actorId: args.actorId ?? null,
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
              .set({
                currentVersion: sql`GREATEST(${datasets.currentVersion} - 1, 0)`,
              })
              .where(and(eq(datasets.id, args.id), isNull(datasets.deletedAt)))
              .returning({ id: datasets.id }),
          )

          if (!updated) {
            return yield* new RepositoryError({
              cause: new Error("Update affected no rows"),
              operation: "decrementVersion",
            })
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
            return yield* new DatasetNotFoundError({
              datasetId: args.datasetId,
            })
          }

          return Number(row.version)
        }),
    }
  }),
)
