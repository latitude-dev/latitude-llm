import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { type SpanDetailRecord, type SpanRecord, getSpanDetail, listSpansByProject } from "./spans.functions.ts"

const queryClient = getQueryClient()

const makeSpansCollection = (projectId: string) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["spans", projectId],
      queryFn: () => listSpansByProject({ data: { projectId } }),
      getKey: (item: SpanRecord): string => `${item.traceId}-${item.spanId}`,
    }),
  )

type SpansCollection = ReturnType<typeof makeSpansCollection>
const collectionsCache: Record<string, SpansCollection> = {}

const getSpansCollection = (projectId: string): SpansCollection => {
  if (!collectionsCache[projectId]) {
    collectionsCache[projectId] = makeSpansCollection(projectId)
  }
  return collectionsCache[projectId]
}

export const useSpansCollection = (projectId: string) => {
  const collection = getSpansCollection(projectId)
  return useLiveQuery((q) => q.from({ span: collection }))
}

export const useSpanDetail = ({ traceId, spanId }: { traceId: string; spanId: string }) => {
  return useQuery<SpanDetailRecord>({
    queryKey: ["spanDetail", traceId, spanId],
    queryFn: () => getSpanDetail({ data: { traceId, spanId } }),
  })
}
