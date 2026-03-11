import { queryCollectionOptions } from "@tanstack/query-db-collection"
import type { Context, QueryBuilder, SchemaFromSource } from "@tanstack/react-db"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import type { DatasetRecord, DatasetRowRecord } from "./datasets.functions.ts"
import { listDatasetsQuery, listRowsQuery } from "./datasets.functions.ts"

const queryClient = getQueryClient()

const makeDatasetsCollection = (projectId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["datasets", projectId],
      queryFn: async () => {
        const result = await listDatasetsQuery({ data: { projectId } })
        return result.datasets
      },
      getKey: (item: DatasetRecord) => item.id,
    }),
  )

type DatasetsCollection = ReturnType<typeof makeDatasetsCollection>
const datasetsCollectionsCache = new Map<string, DatasetsCollection>()

const getDatasetsCollection = (projectId: string): DatasetsCollection => {
  const cached = datasetsCollectionsCache.get(projectId)
  if (cached) return cached
  const collection = makeDatasetsCollection(projectId)
  datasetsCollectionsCache.set(projectId, collection)
  return collection
}

type DatasetsSource = { dataset: DatasetsCollection }
type DatasetsContext = {
  baseSchema: SchemaFromSource<DatasetsSource>
  schema: SchemaFromSource<DatasetsSource>
  fromSourceName: "dataset"
  hasJoins: false
}

export const useDatasetsCollection = <TContext extends Context = DatasetsContext>(
  projectId: string,
  queryFn?: (datasets: QueryBuilder<DatasetsContext>) => QueryBuilder<TContext>,
  deps?: Array<unknown>,
) => {
  const collection = getDatasetsCollection(projectId)
  return useLiveQuery<TContext>(
    (q) => {
      const datasets = q.from({ dataset: collection })
      if (queryFn) return queryFn(datasets)
      return datasets as unknown as QueryBuilder<TContext>
    },
    [projectId, ...(deps ?? [])],
  )
}

const makeDatasetRowsCollection = (datasetId: string, search?: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["datasetRows", datasetId, search ?? ""],
      queryFn: async () => {
        const result = await listRowsQuery({
          data: {
            datasetId,
            ...(search ? { search } : {}),
            limit: 50,
            offset: 0,
          },
        })
        return result.rows as DatasetRowRecord[]
      },
      getKey: (item: DatasetRowRecord) => item.rowId,
    }),
  )

type DatasetRowsCollection = ReturnType<typeof makeDatasetRowsCollection>
const MAX_ROW_COLLECTIONS = 10
const rowsCollectionsCache = new Map<string, DatasetRowsCollection>()

const getDatasetRowsCollection = (datasetId: string, search?: string): DatasetRowsCollection => {
  const cacheKey = `${datasetId}:${search ?? ""}`
  const cached = rowsCollectionsCache.get(cacheKey)
  if (cached) {
    rowsCollectionsCache.delete(cacheKey)
    rowsCollectionsCache.set(cacheKey, cached)
    return cached
  }

  const collection = makeDatasetRowsCollection(datasetId, search)
  rowsCollectionsCache.set(cacheKey, collection)

  if (rowsCollectionsCache.size > MAX_ROW_COLLECTIONS) {
    const oldest = rowsCollectionsCache.keys().next().value
    if (oldest) {
      rowsCollectionsCache.delete(oldest)
    }
  }

  return collection
}

export const useDatasetRowsCollection = (datasetId: string, search?: string) => {
  const collection = getDatasetRowsCollection(datasetId, search)
  return useLiveQuery((q) => q.from({ row: collection }), [datasetId, search])
}
