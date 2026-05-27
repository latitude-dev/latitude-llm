import { useQuery } from "@tanstack/react-query"
import { listTracesByProject, type TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"

const EMPTY: readonly TraceRecord[] = []

/**
 * Per-request page size when walking a session's traces. Each ClickHouse page
 * is bounded; we chain up to {@link SESSION_TRACES_HARD_CAP} traces total.
 */
const PAGE_SIZE = 250

/**
 * Upper bound on traces fetched per session. Both the session panel (which
 * needs the full ordered list for "Trace N" labels) and the inline expanded
 * row in the sessions table share this cap so a single TanStack-Query entry
 * serves both — without it the same ClickHouse query fired twice when a row
 * was expanded with the panel open.
 *
 * The cap also fixes a search-mode regression: `match.matchingTraceIds`
 * (server-side, ordered by relevance) and the per-session trace list
 * (client-side, ordered by `startTime` asc) used to disagree at the page
 * boundary — a match landing after the first page rendered as a "Show N
 * non-matching traces" toggle with no matching row above. Walking the full
 * session up to this cap removes the boundary so every match shows up.
 */
const SESSION_TRACES_HARD_CAP = 500

const sessionTracesQueryKey = (projectId: string, sessionId: string) =>
  ["session-traces", projectId, sessionId] as const

export const sessionTracesQueryOptions = (projectId: string, sessionId: string) => ({
  queryKey: sessionTracesQueryKey(projectId, sessionId),
  queryFn: async () => {
    // Child traces are always shown in chronological order — they form a
    // conversation, and reading order is what users want regardless of how
    // the parent sessions list is sorted.
    const filters = { sessionId: [{ op: "eq" as const, value: sessionId }] }
    const traces: TraceRecord[] = []
    let cursor: { sortValue: string; secondaryValue?: string; traceId: string } | undefined

    while (traces.length < SESSION_TRACES_HARD_CAP) {
      const remaining = SESSION_TRACES_HARD_CAP - traces.length
      const page = await listTracesByProject({
        data: {
          projectId,
          limit: Math.min(PAGE_SIZE, remaining),
          sortBy: "startTime",
          sortDirection: "asc",
          filters,
          ...(cursor ? { cursor } : {}),
        },
      })
      if (!page || page.traces.length === 0) break
      traces.push(...page.traces)
      if (!page.hasMore || !page.nextCursor) break
      // Re-pack the cursor: the response type has `secondaryValue?: string | undefined`
      // but the request schema (under exactOptionalPropertyTypes) wants the key
      // absent when there's no value.
      cursor = {
        sortValue: page.nextCursor.sortValue,
        traceId: page.nextCursor.traceId,
        ...(page.nextCursor.secondaryValue !== undefined ? { secondaryValue: page.nextCursor.secondaryValue } : {}),
      }
    }

    return traces
  },
  staleTime: 30_000,
})

export function useSessionTraces({
  projectId,
  sessionId,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly enabled?: boolean
}) {
  const query = useQuery({
    ...sessionTracesQueryOptions(projectId, sessionId),
    enabled: enabled && projectId.length > 0 && sessionId.length > 0,
  })

  return {
    traces: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
