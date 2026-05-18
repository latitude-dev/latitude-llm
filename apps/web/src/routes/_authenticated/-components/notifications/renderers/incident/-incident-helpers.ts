import { useQuery } from "@tanstack/react-query"
import { eq } from "@tanstack/react-db"
import {
  getIssueLifecycleSummary,
  type IssueLifecycleSummaryRecord,
} from "../../../../../../domains/issues/issues.functions.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"

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
    queryFn: () =>
      getIssueLifecycleSummary({ data: { projectId: target.projectId ?? "", issueId: target.sourceId } }),
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
