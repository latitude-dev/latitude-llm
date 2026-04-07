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
