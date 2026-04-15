import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import {
  getSpanDetail,
  listSpansByTrace,
  listTracesByProject,
  type SpanDetailRecord,
  type SpanRecord,
  type TraceRecord,
} from "./spans.functions.ts"

const queryClient = getQueryClient()

const makeSpansByTraceCollection = (traceId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["spans", "trace", traceId],
      queryFn: () => listSpansByTrace({ data: { traceId } }),
      getKey: (item: SpanRecord): string => `${item.traceId}-${item.spanId}`,
    }),
  )

type SpansByTraceCollection = ReturnType<typeof makeSpansByTraceCollection>
const traceCollectionsCache: Record<string, SpansByTraceCollection> = {}

const getSpansByTraceCollection = (traceId: string): SpansByTraceCollection => {
  if (!traceCollectionsCache[traceId]) {
    traceCollectionsCache[traceId] = makeSpansByTraceCollection(traceId)
  }
  return traceCollectionsCache[traceId]
}

export const useSpansByTraceCollection = (traceId: string) => {
  const collection = getSpansByTraceCollection(traceId)
  return useLiveQuery((q) => q.from({ span: collection }))
}

export const useSpanDetail = ({ traceId, spanId }: { traceId: string; spanId: string }) => {
  return useQuery<SpanDetailRecord>({
    queryKey: ["spanDetail", traceId, spanId],
    queryFn: () => getSpanDetail({ data: { traceId, spanId } }),
  })
}

interface TracesFilter {
  readonly traceId?: string
}

const makeTracesCollection = ({ projectId, filter }: { projectId: string; filter?: TracesFilter }) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["traces", projectId, filter?.traceId ?? ""],
      queryFn: () => listTracesByProject({ data: { projectId, traceId: filter?.traceId } }),
      getKey: (item: TraceRecord): string => item.traceId,
    }),
  )

type TracesCollection = ReturnType<typeof makeTracesCollection>
const projectCollectionsCache: Record<string, TracesCollection> = {}

const getTracesCollection = (projectId: string, filter: TracesFilter): TracesCollection => {
  const cacheKey = `${projectId}:${filter.traceId ?? ""}`
  if (!projectCollectionsCache[cacheKey]) {
    projectCollectionsCache[cacheKey] = makeTracesCollection({ projectId, filter })
  }
  return projectCollectionsCache[cacheKey]
}

export const useTracesCollection = ({ projectId, filter }: { projectId: string; filter?: TracesFilter }) => {
  const resolved = filter ?? {}
  const collection = getTracesCollection(projectId, resolved)
  return useLiveQuery((q) => q.from({ trace: collection }))
}
