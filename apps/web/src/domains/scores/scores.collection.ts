import { useQuery } from "@tanstack/react-query"
import { listScoresBySession, listScoresByTrace } from "./scores.functions.ts"

const DEFAULT_TRACE_DRAFT_MODE = "include" as const

const scoresByTraceQueryKey = (
  projectId: string,
  traceId: string,
  limit?: number,
  offset?: number,
  draftMode: "exclude" | "include" | "only" = DEFAULT_TRACE_DRAFT_MODE,
) => ["scores", "trace", projectId, traceId, limit, offset, draftMode] as const

const scoresBySessionQueryKey = (
  projectId: string,
  traceIds: readonly string[],
  limit?: number,
  offset?: number,
  draftMode: "exclude" | "include" | "only" = DEFAULT_TRACE_DRAFT_MODE,
) => ["scores", "session", projectId, [...traceIds].sort(), limit, offset, draftMode] as const

export function useScoresByTrace({
  projectId,
  traceId,
  limit,
  offset,
  draftMode,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: "exclude" | "include" | "only"
  readonly enabled?: boolean
}) {
  const effectiveDraftMode = draftMode ?? DEFAULT_TRACE_DRAFT_MODE

  return useQuery({
    queryKey: scoresByTraceQueryKey(projectId, traceId, limit, offset, effectiveDraftMode),
    queryFn: () =>
      listScoresByTrace({
        data: { projectId, traceId, limit, offset, draftMode: effectiveDraftMode },
      }),
    enabled: enabled && projectId.length > 0 && traceId.length > 0,
  })
}

export function useScoresBySession({
  projectId,
  traceIds,
  limit,
  offset,
  draftMode,
  enabled = true,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly limit?: number
  readonly offset?: number
  readonly draftMode?: "exclude" | "include" | "only"
  readonly enabled?: boolean
}) {
  const effectiveDraftMode = draftMode ?? DEFAULT_TRACE_DRAFT_MODE

  return useQuery({
    queryKey: scoresBySessionQueryKey(projectId, traceIds, limit, offset, effectiveDraftMode),
    queryFn: () =>
      listScoresBySession({
        data: { projectId, traceIds: [...traceIds], limit, offset, draftMode: effectiveDraftMode },
      }),
    enabled: enabled && projectId.length > 0 && traceIds.length > 0,
  })
}
