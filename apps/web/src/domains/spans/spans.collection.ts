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

const makeTracesCollection = (projectId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["traces", projectId],
      queryFn: () => listTracesByProject({ data: { projectId } }),
      getKey: (item: TraceRecord): string => item.traceId,
    }),
  )

type TracesCollection = ReturnType<typeof makeTracesCollection>
const projectCollectionsCache: Record<string, TracesCollection> = {}

const getTracesCollection = (projectId: string): TracesCollection => {
  if (!projectCollectionsCache[projectId]) {
    projectCollectionsCache[projectId] = makeTracesCollection(projectId)
  }
  return projectCollectionsCache[projectId]
}

export const useTracesCollection = (projectId: string) => {
  const collection = getTracesCollection(projectId)
  return useLiveQuery((q) => q.from({ trace: collection }))
}
