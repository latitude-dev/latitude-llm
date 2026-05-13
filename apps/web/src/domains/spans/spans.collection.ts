import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import {
  getSpanDetail,
  listSpansByTrace,
  mapConversationToSpans,
  type SpanDetailRecord,
  type SpanRecord,
} from "./spans.functions.ts"

const queryClient = getQueryClient()

const makeSpansByTraceCollection = (
  projectId: string,
  traceId: string,
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["spans", "trace", projectId, traceId, startTimeFrom, startTimeTo],
      queryFn: () => listSpansByTrace({ data: { projectId, traceId, startTimeFrom, startTimeTo } }),
      getKey: (item: SpanRecord): string => `${item.traceId}-${item.spanId}`,
    }),
  )

type SpansByTraceCollection = ReturnType<typeof makeSpansByTraceCollection>
const traceCollectionsCache: Record<string, SpansByTraceCollection> = {}

const getSpansByTraceCollection = (
  projectId: string,
  traceId: string,
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
): SpansByTraceCollection => {
  const cacheKey = `${projectId}:${traceId}:${startTimeFrom ?? ""}:${startTimeTo ?? ""}`
  if (!traceCollectionsCache[cacheKey]) {
    traceCollectionsCache[cacheKey] = makeSpansByTraceCollection(projectId, traceId, startTimeFrom, startTimeTo)
  }
  return traceCollectionsCache[cacheKey]
}

export const useSpansByTraceCollection = ({
  projectId,
  traceId,
  startTimeFrom,
  startTimeTo,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
}) => {
  const collection = getSpansByTraceCollection(projectId, traceId, startTimeFrom, startTimeTo)
  return useLiveQuery((q) => q.from({ span: collection }))
}

export const useSpanDetail = ({
  projectId,
  traceId,
  spanId,
  startTimeFrom,
  startTimeTo,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly spanId: string
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
}) => {
  return useQuery<SpanDetailRecord>({
    queryKey: ["spanDetail", projectId, traceId, spanId, startTimeFrom, startTimeTo],
    queryFn: () => getSpanDetail({ data: { projectId, traceId, spanId, startTimeFrom, startTimeTo } }),
    staleTime: Infinity, // Span data is immutable once ingested
  })
}

export function useConversationSpanMaps({
  projectId,
  traceId,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: ["conversationSpanMaps", projectId, traceId],
    queryFn: () => mapConversationToSpans({ data: { projectId, traceId } }),
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}
