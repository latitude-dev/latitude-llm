import { useQuery } from "@tanstack/react-query"
import { type AlertIncidentRecord, listProjectAlertIncidentsInRange } from "./alerts.functions.ts"

const EMPTY: readonly AlertIncidentRecord[] = []

export function useProjectAlertIncidentsInRange({
  projectId,
  fromIso,
  toIso,
  enabled = true,
}: {
  readonly projectId: string
  readonly fromIso: string
  readonly toIso: string
  readonly enabled?: boolean
}) {
  const query = useQuery({
    queryKey: ["alert-incidents", "in-range", projectId, fromIso, toIso] as const,
    queryFn: () => listProjectAlertIncidentsInRange({ data: { projectId, fromIso, toIso } }),
    enabled: enabled && projectId.length > 0,
    staleTime: 30_000,
  })

  return {
    ...query,
    data: query.data?.items ?? EMPTY,
  }
}
