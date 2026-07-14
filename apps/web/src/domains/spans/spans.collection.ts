import { SpanId, TraceId } from "@domain/shared"
import type { SpanMessagesData } from "@domain/spans"
import { buildConversationSpanMaps } from "@domain/spans"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import type { GenAIMessage } from "rosetta-ai"
import { createAppCollection } from "../../lib/data/create-app-collection.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { projectScopeData, sandboxOrgIdForScope, useProjectScope } from "../projects/project-scope.tsx"
import {
  getSpanDetail,
  listConversationMessageSpans,
  listSessionConversationMessageSpans,
  listSpansBySession,
  listSpansByTrace,
  type SpanDetailRecord,
  type SpanMessagesRecord,
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
  createAppCollection(
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
  const scope = useProjectScope()
  const collection = getSpansByTraceCollection(
    projectId,
    traceId,
    startTimeFrom,
    startTimeTo,
    sandboxOrgIdForScope(scope),
  )
  return useLiveQuery(
    (q) => q.from({ span: collection }),
    [projectId, traceId, startTimeFrom, startTimeTo, sandboxOrgIdForScope(scope)],
  )
}

// Order-independent signature of the session's trace set, so the collection
// cache/query refresh when a live session gains a trace (traceIds changes) but
// stay stable across reorderings of the same set.
const traceIdsSignature = (traceIds: readonly string[]): string => [...traceIds].sort().join(",")

const makeSpansBySessionCollection = (
  projectId: string,
  sessionId: string,
  traceIds: readonly string[],
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
  sandboxOrgId: string | undefined,
) =>
  createAppCollection(
    queryCollectionOptions({
      queryClient,
      queryKey: [
        "spans",
        "session",
        sandboxOrgId,
        projectId,
        sessionId,
        traceIdsSignature(traceIds),
        startTimeFrom,
        startTimeTo,
      ],
      queryFn: () =>
        listSpansBySession({
          data: {
            ...(sandboxOrgId ? { sandboxOrgId } : {}),
            projectId,
            traceIds: [...traceIds],
            startTimeFrom,
            startTimeTo,
          },
        }),
      getKey: (item: SpanRecord): string => `${item.traceId}-${item.spanId}`,
    }),
  )

type SpansBySessionCollection = ReturnType<typeof makeSpansBySessionCollection>
const sessionCollectionsCache: Record<string, SpansBySessionCollection> = {}

const getSpansBySessionCollection = (
  projectId: string,
  sessionId: string,
  traceIds: readonly string[],
  startTimeFrom: string | undefined,
  startTimeTo: string | undefined,
  sandboxOrgId: string | undefined,
): SpansBySessionCollection => {
  const cacheKey = `${sandboxOrgId ?? ""}:${projectId}:${sessionId}:${traceIdsSignature(traceIds)}:${startTimeFrom ?? ""}:${startTimeTo ?? ""}`
  if (!sessionCollectionsCache[cacheKey]) {
    sessionCollectionsCache[cacheKey] = makeSpansBySessionCollection(
      projectId,
      sessionId,
      traceIds,
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
  traceIds,
  startTimeFrom,
  startTimeTo,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceIds: readonly string[]
  readonly startTimeFrom?: string | undefined
  readonly startTimeTo?: string | undefined
}) => {
  const scope = useProjectScope()
  const collection = getSpansBySessionCollection(
    projectId,
    sessionId,
    traceIds,
    startTimeFrom,
    startTimeTo,
    sandboxOrgIdForScope(scope),
  )
  return useLiveQuery(
    (q) => q.from({ span: collection }),
    [projectId, sessionId, traceIdsSignature(traceIds), startTimeFrom, startTimeTo, sandboxOrgIdForScope(scope)],
  )
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
  const scope = useProjectScope()
  return useQuery<SpanDetailRecord>({
    queryKey: ["spanDetail", sandboxOrgIdForScope(scope), projectId, traceId, spanId, startTimeFrom, startTimeTo],
    queryFn: () =>
      getSpanDetail({
        data: {
          ...projectScopeData(scope),
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

const asMessageSpans = (records: readonly SpanMessagesRecord[]): readonly SpanMessagesData[] =>
  records.map((record) => ({
    ...record,
    traceId: TraceId(record.traceId),
    spanId: SpanId(record.spanId),
    inputMessages: record.inputMessages as readonly GenAIMessage[],
    outputMessages: record.outputMessages as readonly GenAIMessage[],
  }))

export function useSessionConversationSpanMaps({
  projectId,
  sessionId,
  latestTraceId,
  sessionStartTime,
  sessionEndTime,
  allMessages,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly latestTraceId: string
  readonly sessionStartTime: string
  readonly sessionEndTime: string
  readonly allMessages: readonly GenAIMessage[] | undefined
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [
      "sessionConversationSpanMaps",
      sandboxOrgIdForScope(scope),
      projectId,
      sessionId,
      latestTraceId,
      sessionStartTime,
      sessionEndTime,
    ],
    queryFn: async () => {
      const spans = await listSessionConversationMessageSpans({
        data: {
          ...projectScopeData(scope),
          projectId,
          sessionId,
          sessionStartTime,
          sessionEndTime,
        },
      })
      return buildConversationSpanMaps(allMessages ?? [], asMessageSpans(spans))
    },
    enabled:
      enabled && projectId.length > 0 && sessionId.length > 0 && latestTraceId.length > 0 && allMessages !== undefined,
  })
}

export function useConversationSpanMaps({
  projectId,
  traceId,
  startTime,
  allMessages,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly startTime: string | undefined
  readonly allMessages: readonly GenAIMessage[] | undefined
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: ["conversationSpanMaps", sandboxOrgIdForScope(scope), projectId, traceId],
    queryFn: async () => {
      const spans = await listConversationMessageSpans({
        data: {
          ...projectScopeData(scope),
          projectId,
          traceId,
          startTime: startTime ?? "",
        },
      })
      return buildConversationSpanMaps(allMessages ?? [], asMessageSpans(spans))
    },
    enabled:
      enabled && projectId.length > 0 && traceId.length > 0 && startTime !== undefined && allMessages !== undefined,
  })
}
