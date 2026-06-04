import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import {
  getIssueLifecycleSummary,
  type IssueLifecycleSummaryRecord,
} from "../../../../../../domains/issues/issues.functions.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"
import { useSavedSearchesList } from "../../../../../../domains/saved-searches/saved-searches.collection.ts"

interface IncidentTarget {
  readonly projectId: string | null | undefined
  readonly sourceId: string
}

/**
 * Live-resolve the source issue's name + lifecycle states. The payload
 * snapshot dropped `issueName` in favor of `sourceId`, so every render
 * does a live lookup (cached for 30s). Returns `null` while the query is
 * in flight or when the issue can't be resolved.
 */
export function useLiveIssueSummary(target: IncidentTarget): IssueLifecycleSummaryRecord | null {
  const enabled = Boolean(target.projectId)
  const { data } = useQuery({
    queryKey: ["notifications", "issue-summary", target.projectId, target.sourceId],
    queryFn: () => getIssueLifecycleSummary({ data: { projectId: target.projectId ?? "", issueId: target.sourceId } }),
    enabled,
    staleTime: 30_000,
  })
  return data ?? null
}

/**
 * Build the `/projects/<slug>/issues?issueId=<id>` deep link by looking
 * up the project slug from the live projects collection (same source the
 * `BaseNotification` footer uses for the project name). Returns
 * `undefined` while the collection is loading or when the project has
 * been deleted between notification create and view.
 */
export function useIssueUrl(target: IncidentTarget): string | undefined {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, target.projectId ?? " ")).findOne(),
    [target.projectId ?? null],
  )
  if (!project) return undefined
  return `/projects/${project.slug}/issues?issueId=${encodeURIComponent(target.sourceId)}`
}

/**
 * Live-resolve the source saved search's name (the incident's `sourceId`), mirroring
 * `useLiveIssueSummary`. `null` while loading or when the saved search was deleted.
 */
export function useLiveSavedSearchName(target: {
  readonly projectId: string | null | undefined
  readonly savedSearchId: string
}): string | null {
  const { data } = useSavedSearchesList(target.projectId ?? "", { enabled: Boolean(target.projectId) })
  return data.find((s) => s.id === target.savedSearchId)?.name ?? null
}

/** `/projects/<slug>/monitors?monitorSlug=<slug>` deep link for saved-search incidents. Undefined without a slug or while the project loads. */
export function useMonitorUrl(target: {
  readonly projectId: string | null | undefined
  readonly monitorSlug: string | undefined
}): string | undefined {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, target.projectId ?? " ")).findOne(),
    [target.projectId ?? null],
  )
  if (!project || !target.monitorSlug) return undefined
  return `/projects/${project.slug}/monitors?monitorSlug=${encodeURIComponent(target.monitorSlug)}`
}
