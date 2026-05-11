import type { AlertIncidentSourceType } from "@domain/alerts"
import { useQuery } from "@tanstack/react-query"
import { type AlertIncidentRecord, listProjectAlertIncidentsInRange } from "./alerts.functions.ts"

const EMPTY: readonly AlertIncidentRecord[] = []

export function useProjectAlertIncidentsInRange({
  projectId,
  fromIso,
  toIso,
  sourceType,
  sourceId,
  enabled = true,
}: {
  readonly projectId: string
  readonly fromIso: string
  readonly toIso: string
  /** Restrict to a single source type (e.g., `"issue"`). */
  readonly sourceType?: AlertIncidentSourceType
  /** Restrict to incidents tied to a single source entity (e.g., a specific issue id). */
  readonly sourceId?: string
  readonly enabled?: boolean
}) {
  const query = useQuery({
    queryKey: ["alert-incidents", "in-range", projectId, fromIso, toIso, sourceType ?? null, sourceId ?? null] as const,
    queryFn: () =>
      listProjectAlertIncidentsInRange({
        data: {
          projectId,
          fromIso,
          toIso,
          ...(sourceType ? { sourceType } : {}),
          ...(sourceId ? { sourceId } : {}),
        },
      }),
    enabled: enabled && projectId.length > 0,
    staleTime: 30_000,
  })

  return {
    ...query,
    data: query.data?.items ?? EMPTY,
  }
}
