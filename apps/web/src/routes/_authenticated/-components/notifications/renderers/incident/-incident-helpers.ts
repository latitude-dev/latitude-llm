import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"
import {
  getSignalLifecycleSummary,
  type SignalLifecycleSummaryRecord,
} from "../../../../../../domains/signals/signals.functions.ts"

interface IncidentTarget {
  readonly projectId: string | null | undefined
  readonly sourceId: string
}

/**
 * Live-resolve the source issue's name + lifecycle states. The payload
 * snapshot dropped `signalName` in favor of `sourceId`, so every render
 * does a live lookup (cached for 30s). Returns `null` while the query is
 * in flight or when the issue can't be resolved.
 */
export function useLiveSignalSummary(target: IncidentTarget): SignalLifecycleSummaryRecord | null {
  const enabled = Boolean(target.projectId)
  const { data } = useQuery({
    queryKey: ["notifications", "issue-summary", target.projectId, target.sourceId],
    queryFn: () =>
      getSignalLifecycleSummary({ data: { projectId: target.projectId ?? "", signalId: target.sourceId } }),
    enabled,
    staleTime: 30_000,
  })
  return data ?? null
}

/**
 * Build the `/projects/<slug>/issues/<id>` deep link by looking
 * up the project slug from the live projects collection (same source the
 * `BaseNotification` footer uses for the project name). Returns
 * `undefined` while the collection is loading or when the project has
 * been deleted between notification create and view.
 */
export function useSignalUrl(target: IncidentTarget): string | undefined {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, target.projectId ?? " ")).findOne(),
    [target.projectId ?? null],
  )
  if (!project) return undefined
  return `/projects/${project.slug}/issues/${encodeURIComponent(target.sourceId)}`
}

/**
 * Live-resolve the source saved search's name (the incident's `sourceId`), mirroring
 * `useLiveSignalSummary`. `null` while loading or when the saved search was deleted.
 */
export function useLiveSavedSearchName(target: {
  readonly projectId: string | null | undefined
  readonly savedSearchId: string
}): string | null {
  const { data } = useSavedSearchesList(target.projectId ?? "", { enabled: Boolean(target.projectId) })
  return data.find((s) => s.id === target.savedSearchId)?.name ?? null
}

/** `/projects/<slug>/monitors/<monitorSlug>` deep link for saved-search incidents. Undefined without a slug or while the project loads. */
export function useMonitorUrl(target: {
  readonly projectId: string | null | undefined
  readonly monitorSlug: string | undefined
}): string | undefined {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, target.projectId ?? " ")).findOne(),
    [target.projectId ?? null],
  )
  if (!project || !target.monitorSlug) return undefined
  return `/projects/${project.slug}/monitors/${encodeURIComponent(target.monitorSlug)}`
}
