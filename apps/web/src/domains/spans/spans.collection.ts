import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { use } from "react"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { TraceScopeContext } from "../traces/trace-scope.tsx"
import {
  getSpanDetail,
  listSpansBySession,
  listSpansByTrace,
  mapConversationToSpans,
  mapSessionConversationToSpans,
  type SpanDetailRecord,
  type SpanRecord,
} from "./spans.functions.ts"

const queryClient = getQueryClient()

const makeSpansByTraceCollection = (
  projectId: string,
  traceId: string,
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
  sandboxOrgId: string | undefined,
) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["spans", "trace", sandboxOrgId, projectId, traceId, startTimeFrom, startTimeTo],
      queryFn: () =>
        listSpansByTrace({
          data: { ...(sandboxOrgId ? { sandboxOrgId } : {}), projectId, traceId, startTimeFrom, startTimeTo },
        }),
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
  sandboxOrgId: string | undefined,
): SpansByTraceCollection => {
  const cacheKey = `${sandboxOrgId ?? ""}:${projectId}:${traceId}:${startTimeFrom ?? ""}:${startTimeTo ?? ""}`
  if (!traceCollectionsCache[cacheKey]) {
    traceCollectionsCache[cacheKey] = makeSpansByTraceCollection(
      projectId,
      traceId,
      startTimeFrom,
      startTimeTo,
      sandboxOrgId,
    )
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
  const scope = use(TraceScopeContext)
  const collection = getSpansByTraceCollection(projectId, traceId, startTimeFrom, startTimeTo, scope?.sandboxOrgId)
  return useLiveQuery((q) => q.from({ span: collection }))
}

const makeSpansBySessionCollection = (
  projectId: string,
  sessionId: string,
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
  sandboxOrgId: string | undefined,
) =>
  createCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: ["spans", "session", sandboxOrgId, projectId, sessionId, startTimeFrom, startTimeTo],
      queryFn: () =>
        listSpansBySession({
          data: { ...(sandboxOrgId ? { sandboxOrgId } : {}), projectId, sessionId, startTimeFrom, startTimeTo },
        }),
      getKey: (item: SpanRecord): string => `${item.traceId}-${item.spanId}`,
    }),
  )

type SpansBySessionCollection = ReturnType<typeof makeSpansBySessionCollection>
const sessionCollectionsCache: Record<string, SpansBySessionCollection> = {}

const getSpansBySessionCollection = (
  projectId: string,
  sessionId: string,
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
  sandboxOrgId: string | undefined,
): SpansBySessionCollection => {
  const cacheKey = `${sandboxOrgId ?? ""}:${projectId}:${sessionId}:${startTimeFrom ?? ""}:${startTimeTo ?? ""}`
  if (!sessionCollectionsCache[cacheKey]) {
    sessionCollectionsCache[cacheKey] = makeSpansBySessionCollection(
      projectId,
      sessionId,
      startTimeFrom,
      startTimeTo,
      sandboxOrgId,
    )
  }
  return sessionCollectionsCache[cacheKey]
}

export const useSpansBySessionCollection = ({
  projectId,
  sessionId,
  startTimeFrom,
  startTimeTo,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
}) => {
  const scope = use(TraceScopeContext)
  const collection = getSpansBySessionCollection(projectId, sessionId, startTimeFrom, startTimeTo, scope?.sandboxOrgId)
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
  const scope = use(TraceScopeContext)
  return useQuery<SpanDetailRecord>({
    queryKey: ["spanDetail", scope?.sandboxOrgId, projectId, traceId, spanId, startTimeFrom, startTimeTo],
    queryFn: () =>
      getSpanDetail({
        data: {
          ...(scope ? { sandboxOrgId: scope.sandboxOrgId } : {}),
          projectId,
          traceId,
          spanId,
          startTimeFrom,
          startTimeTo,
        },
      }),
    staleTime: Infinity, // Span data is immutable once ingested
  })
}

export function useSessionConversationSpanMaps({
  projectId,
  sessionId,
  latestTraceId,
  sessionStartTime,
  sessionEndTime,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly latestTraceId: string
  readonly sessionStartTime: string
  readonly sessionEndTime: string
  readonly enabled?: boolean
}) {
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: [
      "sessionConversationSpanMaps",
      scope?.sandboxOrgId,
      projectId,
      sessionId,
      latestTraceId,
      sessionStartTime,
      sessionEndTime,
    ],
    queryFn: () =>
      mapSessionConversationToSpans({
        data: {
          ...(scope ? { sandboxOrgId: scope.sandboxOrgId } : {}),
          projectId,
          sessionId,
          latestTraceId,
          sessionStartTime,
          sessionEndTime,
        },
      }),
    enabled: enabled && projectId.length > 0 && sessionId.length > 0 && latestTraceId.length > 0,
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
  const scope = use(TraceScopeContext)
  return useQuery({
    queryKey: ["conversationSpanMaps", scope?.sandboxOrgId, projectId, traceId],
    queryFn: () =>
      mapConversationToSpans({ data: { ...(scope ? { sandboxOrgId: scope.sandboxOrgId } : {}), projectId, traceId } }),
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}
