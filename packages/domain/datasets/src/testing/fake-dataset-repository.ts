import {
  DatasetId,
  type DatasetVersionId,
  type DatasetVersionId as DatasetVersionIdType,
  generateId,
  OrganizationId,
  type ProjectId,
  RepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Dataset, DatasetVersion } from "../entities/dataset.ts"
import { DatasetNotFoundError } from "../errors.ts"
import type {
  DatasetListCursor,
  DatasetListOptions,
  DatasetListPage,
  DatasetRepository,
} from "../ports/dataset-repository.ts"

const DEFAULT_ORG_ID = OrganizationId("fake-organization".padEnd(24, "0"))

interface FakeDataset extends Dataset {
  readonly deletedAt: Date | null
}

const toPublic = (row: FakeDataset): Dataset => ({
  id: row.id,
  organizationId: row.organizationId,
  projectId: row.projectId,
  name: row.name,
  description: row.description,
  fileKey: row.fileKey,
  currentVersion: row.currentVersion,
  latestVersionId: row.latestVersionId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const cmpStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export interface FakeDatasetRepository {
  readonly repository: (typeof DatasetRepository)["Service"]
  readonly datasets: Map<DatasetId, FakeDataset>
  readonly versions: Map<DatasetVersionId, DatasetVersion>
}

/**
 * In-memory DatasetRepository fake. Mirrors the Drizzle-backed live layer:
 * `findById` and friends ignore soft-deleted rows; `incrementVersion`
 * bumps `currentVersion` and records a `DatasetVersion`; `softDelete` makes
 * subsequent `findById` calls throw `DatasetNotFoundError`.
 */
export const createFakeDatasetRepository = (
  seedOrOverrides?: readonly Dataset[] | Partial<(typeof DatasetRepository)["Service"]>,
  maybeOverrides?: Partial<(typeof DatasetRepository)["Service"]>,
  options?: { readonly organizationId?: OrganizationId },
): FakeDatasetRepository => {
  const seed = Array.isArray(seedOrOverrides) ? seedOrOverrides : []
  const overrides = Array.isArray(seedOrOverrides) ? maybeOverrides : seedOrOverrides
  const organizationId = options?.organizationId ?? DEFAULT_ORG_ID

  const datasets = new Map<DatasetId, FakeDataset>(seed.map((d) => [d.id, { ...d, deletedAt: null }] as const))
  const versions = new Map<DatasetVersionId, DatasetVersion>()

  const liveById = (id: DatasetId): FakeDataset | undefined => {
    const row = datasets.get(id)
    if (!row || row.deletedAt) return undefined
    return row
  }

  const repository: (typeof DatasetRepository)["Service"] = {
    create: (args) =>
      Effect.sync(() => {
        const now = new Date()
        const id = args.id ?? DatasetId(generateId())
        const row: FakeDataset = {
          id,
          organizationId,
          projectId: args.projectId,
          name: args.name,
          description: args.description ?? null,
          fileKey: args.fileKey ?? null,
          currentVersion: 0,
          latestVersionId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
        datasets.set(id, row)
        return toPublic(row)
      }),

    findById: (id) =>
      Effect.gen(function* () {
        const row = liveById(id)
        if (!row) return yield* new DatasetNotFoundError({ datasetId: id })
        return toPublic(row)
      }),

    listByProject: (args: { readonly projectId: ProjectId; readonly options?: DatasetListOptions }) =>
      Effect.sync(() => {
        const limit = args.options?.limit ?? 50
        const sortBy = args.options?.sortBy === "name" ? "name" : "updatedAt"
        const sortDirection = args.options?.sortDirection === "asc" ? "asc" : "desc"
        const cursor: DatasetListCursor | undefined = args.options?.cursor

        const all = [...datasets.values()].filter((d) => d.projectId === args.projectId && !d.deletedAt)
        const sorted = all.sort((a, b) => {
          const lhs = sortBy === "name" ? cmpStrings(a.name, b.name) : a.updatedAt.getTime() - b.updatedAt.getTime()
          if (lhs !== 0) return sortDirection === "asc" ? lhs : -lhs
          const idCmp = cmpStrings(a.id, b.id)
          return sortDirection === "asc" ? idCmp : -idCmp
        })

        const sortValueOf = (row: FakeDataset) => (sortBy === "name" ? row.name : row.updatedAt.toISOString())
        const startIndex = cursor
          ? sorted.findIndex((row) => sortValueOf(row) === cursor.sortValue && row.id === cursor.id) + 1
          : 0
        const window = sorted.slice(startIndex, startIndex + limit + 1)
        const hasMore = window.length > limit
        const items = (hasMore ? window.slice(0, limit) : window).map(toPublic)
        const last = hasMore ? window[limit - 1] : undefined
        const nextCursor: DatasetListCursor | undefined = last
          ? { sortValue: sortValueOf(last), id: last.id }
          : undefined

        const page: DatasetListPage = nextCursor
          ? { datasets: items, hasMore, nextCursor }
          : { datasets: items, hasMore }
        return page
      }),

    existsByNameInProject: (args) =>
      Effect.sync(() =>
        [...datasets.values()].some(
          (d) =>
            d.projectId === args.projectId &&
            d.name === args.name &&
            !d.deletedAt &&
            (!args.excludeDatasetId || d.id !== args.excludeDatasetId),
        ),
      ),

    updateName: (args) =>
      Effect.gen(function* () {
        const row = liveById(args.id)
        if (!row) return yield* new DatasetNotFoundError({ datasetId: args.id })
        const updated: FakeDataset = { ...row, name: args.name, updatedAt: new Date() }
        datasets.set(args.id, updated)
        return toPublic(updated)
      }),

    updateDetails: (args) =>
      Effect.gen(function* () {
        const row = liveById(args.id)
        if (!row) return yield* new DatasetNotFoundError({ datasetId: args.id })
        const updated: FakeDataset = { ...row, name: args.name, description: args.description, updatedAt: new Date() }
        datasets.set(args.id, updated)
        return toPublic(updated)
      }),

    updateFileKey: (args) =>
      Effect.gen(function* () {
        const row = liveById(args.id)
        if (!row) {
          return yield* new RepositoryError({
            cause: new Error("Update affected no rows"),
            operation: "updateFileKey",
          })
        }
        const updated: FakeDataset = { ...row, fileKey: args.fileKey, updatedAt: new Date() }
        datasets.set(args.id, updated)
        return toPublic(updated)
      }),

    softDelete: (id) =>
      Effect.gen(function* () {
        const row = liveById(id)
        if (!row) {
          return yield* new RepositoryError({
            cause: new Error("Update affected no rows"),
            operation: "softDelete",
          })
        }
        datasets.set(id, { ...row, deletedAt: new Date() })
      }),

    incrementVersion: (args) =>
      Effect.gen(function* () {
        const row = liveById(args.id)
        if (!row) {
          return yield* new RepositoryError({
            cause: new Error("Update affected no rows"),
            operation: "incrementVersion",
          })
        }
        const newVersion = row.currentVersion + 1
        const versionId = generateId<"DatasetVersionId">() as DatasetVersionIdType
        const now = new Date()
        const version: DatasetVersion = {
          id: versionId,
          datasetId: args.id,
          version: newVersion,
          rowsInserted: args.rowsInserted ?? 0,
          rowsUpdated: args.rowsUpdated ?? 0,
          rowsDeleted: args.rowsDeleted ?? 0,
          source: args.source ?? "api",
          actorId: args.actorId ?? null,
          createdAt: now,
          updatedAt: now,
        }
        versions.set(versionId, version)
        datasets.set(args.id, { ...row, currentVersion: newVersion, latestVersionId: versionId, updatedAt: now })
        return version
      }),

    decrementVersion: (args) =>
      Effect.gen(function* () {
        versions.delete(args.versionId)
        const row = liveById(args.id)
        if (!row) {
          return yield* new RepositoryError({
            cause: new Error("Update affected no rows"),
            operation: "decrementVersion",
          })
        }
        datasets.set(args.id, {
          ...row,
          currentVersion: Math.max(0, row.currentVersion - 1),
          updatedAt: new Date(),
        })
      }),

    resolveVersion: (args) =>
      Effect.gen(function* () {
        const version = versions.get(args.versionId)
        if (!version || version.datasetId !== args.datasetId) {
          return yield* new DatasetNotFoundError({ datasetId: args.datasetId })
        }
        return version.version
      }),

    ...overrides,
  }

  return { repository, datasets, versions }
}
