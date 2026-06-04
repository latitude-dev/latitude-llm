import { useQuery } from "@tanstack/react-query"
import { listTracesByProject, type TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"

const EMPTY: readonly TraceRecord[] = []

/**
 * Upper bound on traces fetched per session. Both the session panel (which
 * needs the full ordered list for "Trace N" labels) and the inline expanded
 * row in the sessions table share this cap so a single TanStack-Query entry
 * serves both — without it the same ClickHouse query fired twice when a row
 * was expanded with the panel open.
 */
const SESSION_TRACES_HARD_CAP = 500

/**
 * Max ids per `traceId IN (...)` filter. `filterValueSchema` caps array filter
 * values at `MAX_ARRAY_LENGTH = 100` (packages/domain/shared/src/filter.ts), so
 * a session's trace ids are fetched in chunks of this size.
 */
const TRACE_ID_CHUNK_SIZE = 100

const sessionTracesQueryKey = (projectId: string, sessionId: string) =>
  ["session-traces", projectId, sessionId] as const

/**
 * Fetches a session's traces by its authoritative `traceIds` (from the
 * `sessions_mv` `groupUniqArray(trace_id)`), NOT by filtering the traces table
 * on `session_id`. A trace ingested without an explicit `session_id` is
 * materialized into a session whose id is `toString(trace_id)` (the MV
 * coalesces), yet the traces table keeps the raw, empty `session_id` — so a
 * `session_id = {id}` filter would miss it and single-trace sessions would show
 * no traces (and no "Spans" tab). Fetching by trace id sidesteps that mismatch.
 *
 * The query key stays `(projectId, sessionId)` only — `traceIds` is left out so
 * the session panel and the inline expanded row keep sharing one cache entry.
 */
export const sessionTracesQueryOptions = (projectId: string, sessionId: string, traceIds: readonly string[]) => ({
  queryKey: sessionTracesQueryKey(projectId, sessionId),
  queryFn: async () => {
    const ordered = traceIds.slice(0, SESSION_TRACES_HARD_CAP)
    if (ordered.length === 0) return [] as TraceRecord[]

    const traces: TraceRecord[] = []
    for (let i = 0; i < ordered.length; i += TRACE_ID_CHUNK_SIZE) {
      const chunk = ordered.slice(i, i + TRACE_ID_CHUNK_SIZE)
      const page = await listTracesByProject({
        data: {
          projectId,
          limit: chunk.length,
          sortBy: "startTime",
          sortDirection: "asc",
          filters: { traceId: [{ op: "in" as const, value: chunk }] },
        },
      })
      if (page?.traces.length) traces.push(...page.traces)
    }

    // Child traces are shown in chronological order — they form a conversation,
    // and reading order is what users want. Each chunk is fetched asc, but the
    // chunks are independent queries, so re-sort the merged set (tiebreak on
    // traceId for deterministic "Trace N" labels).
    traces.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.traceId.localeCompare(b.traceId))
    return traces
  },
  staleTime: 30_000,
})

export function useSessionTraces({
  projectId,
  sessionId,
  traceIds,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceIds: readonly string[]
  readonly enabled?: boolean
}) {
  const query = useQuery({
    ...sessionTracesQueryOptions(projectId, sessionId, traceIds),
    enabled: enabled && projectId.length > 0 && sessionId.length > 0 && traceIds.length > 0,
  })

  return {
    traces: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
