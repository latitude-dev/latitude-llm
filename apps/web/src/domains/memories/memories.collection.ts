import { useQuery } from "@tanstack/react-query"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import { getSessionMemorySummary, type SessionMemorySummaryRecord } from "./memories.functions.ts"

/**
 * Memory footprint for a session's summary chip; pass `traceId` to restrict it
 * to a single trace's contribution (the trace-drawer chip).
 */
export function useMemorySummary({
  projectId,
  sessionId,
  traceId,
  enabled = true,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceId?: string
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "memory-summary", projectId, sessionId, traceId ?? ""],
    queryFn: async () => {
      const result = await getSessionMemorySummary({
        data: { ...projectScopeData(scope), projectId, sessionId, ...(traceId ? { traceId } : {}) },
      })
      return result as SessionMemorySummaryRecord
    },
    enabled: enabled && projectId.length > 0 && sessionId.length > 0,
  })
}
