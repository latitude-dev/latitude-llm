import { SpanId, TraceId } from "@domain/shared"
import type { ConversationSpanRef, SpanMessagesData } from "@domain/spans"
import { buildConversationSpanMaps } from "@domain/spans"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { useLiveQuery } from "@tanstack/react-db"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { GenAIMessage } from "rosetta-ai"
import { createAppCollection } from "../../lib/data/create-app-collection.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"
import { projectScopeData, sandboxOrgIdForScope, useProjectScope } from "../projects/project-scope.tsx"
import { selectTracesForLoadedConversation, type TraceTimeRef } from "./select-traces-for-loaded-conversation.ts"
import {
  getSpanDetail,
  listConversationMessageSpans,
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

const conversationMessageSpansQueryKey = (sandboxOrgId: string | undefined, projectId: string, traceId: string) =>
  ["conversationMessageSpans", sandboxOrgId, projectId, traceId] as const

function toolCallSpanRefsFromSpans(spans: readonly SpanRecord[] | undefined): Record<string, ConversationSpanRef> {
  const map: Record<string, ConversationSpanRef> = {}
  for (const span of spans ?? []) {
    if (!span.toolCallId) continue
    map[span.toolCallId] = { traceId: span.traceId, spanId: span.spanId }
  }
  return map
}

/**
 * Session conversation → span attribution for the *loaded* message prefix.
 * Fetches per-trace message spans (same cache as the single-trace path) for an
 * oldest-first window that grows with pagination — never the full-session
 * findMessagesForSession payload. Tool-call links also come from lightweight
 * session spans so execute_tool navigation works before message spans arrive.
 */
export function useSessionConversationSpanMaps({
  projectId,
  traces,
  loadedMessages,
  totalMessages,
  sessionSpans,
  enabled = true,
}: {
  readonly projectId: string
  readonly traces: readonly TraceTimeRef[]
  readonly loadedMessages: readonly GenAIMessage[] | undefined
  readonly totalMessages: number
  readonly sessionSpans?: readonly SpanRecord[] | undefined
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  const sandboxOrgId = sandboxOrgIdForScope(scope)
  const selectedTraces = useMemo(
    () =>
      selectTracesForLoadedConversation({
        traces,
        loadedMessageCount: loadedMessages?.length ?? 0,
        totalMessages,
      }),
    [traces, loadedMessages?.length, totalMessages],
  )

  const spanQueries = useQueries({
    queries: selectedTraces.map((trace) => ({
      queryKey: conversationMessageSpansQueryKey(sandboxOrgId, projectId, trace.traceId),
      queryFn: () =>
        listConversationMessageSpans({
          data: {
            ...projectScopeData(scope),
            projectId,
            traceId: trace.traceId,
            startTime: trace.startTime,
          },
        }),
      enabled:
        enabled &&
        projectId.length > 0 &&
        trace.traceId.length > 0 &&
        trace.startTime.length > 0 &&
        loadedMessages !== undefined,
      staleTime: Number.POSITIVE_INFINITY,
    })),
  })

  const messageSpanPages = spanQueries.map((query) => query.data)
  const isPending = spanQueries.some((query) => query.isPending)
  const isFetching = spanQueries.some((query) => query.isFetching)

  const data = useMemo(() => {
    if (loadedMessages === undefined) return undefined
    const spans = messageSpanPages.flatMap((page) => (page ? asMessageSpans(page) : []))
    const maps = buildConversationSpanMaps(loadedMessages, spans)
    return {
      messageSpanMap: maps.messageSpanMap,
      toolCallSpanMap: { ...toolCallSpanRefsFromSpans(sessionSpans), ...maps.toolCallSpanMap },
    }
  }, [loadedMessages, messageSpanPages, sessionSpans])

  return { data, isPending, isFetching, isLoading: isPending }
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
  const spansQuery = useQuery({
    queryKey: conversationMessageSpansQueryKey(sandboxOrgIdForScope(scope), projectId, traceId),
    queryFn: () =>
      listConversationMessageSpans({
        data: {
          ...projectScopeData(scope),
          projectId,
          traceId,
          startTime: startTime ?? "",
        },
      }),
    enabled:
      enabled && projectId.length > 0 && traceId.length > 0 && startTime !== undefined && allMessages !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const data = useMemo(() => {
    if (!spansQuery.data || allMessages === undefined) return undefined
    return buildConversationSpanMaps(allMessages, asMessageSpans(spansQuery.data))
  }, [spansQuery.data, allMessages])

  return { ...spansQuery, data }
}
