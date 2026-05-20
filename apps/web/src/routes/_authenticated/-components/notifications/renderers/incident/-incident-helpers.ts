import { eq } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import {
  getIssueLifecycleSummary,
  type IssueLifecycleSummaryRecord,
} from "../../../../../../domains/issues/issues.functions.ts"
import {
  getIncidentNotificationDeepLink,
  getIssueNotificationDeepLink,
} from "../../../../../../domains/notifications/notifications.functions.ts"
import { useProjectsCollection } from "../../../../../../domains/projects/projects.collection.ts"

interface IncidentTarget {
  readonly projectId: string | null | undefined
  readonly sourceId: string
}

interface UseIssueUrlOptions {
  readonly alertIncidentId?: string | null
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

function buildIssueUrlFromSlug(projectSlug: string, sourceId: string): string {
  return `/projects/${projectSlug}/issues?issueId=${encodeURIComponent(sourceId)}`
}

/**
 * Build the `/projects/<slug>/issues?issueId=<id>` deep link. Prefers the
 * live projects collection (no round-trip when it's warm), then falls back to
 * a server lookup by `(projectId, sourceId)`, and finally by
 * `alertIncidentId` when the notification row has no project anchor.
 */
export function useIssueUrl(target: IncidentTarget, options?: UseIssueUrlOptions): string | undefined {
  const { data: project } = useProjectsCollection(
    (projects) => projects.where(({ project: p }) => eq(p.id, target.projectId ?? "")).findOne(),
    [target.projectId ?? null],
  )
  const collectionUrl =
    target.projectId && project?.slug ? buildIssueUrlFromSlug(project.slug, target.sourceId) : undefined

  const { data: issueDeepLink, isFetched: issueLinkFetched } = useQuery({
    queryKey: ["notifications", "issue-deep-link", target.projectId, target.sourceId],
    queryFn: () =>
      getIssueNotificationDeepLink({
        data: { projectId: target.projectId ?? "", issueId: target.sourceId },
      }),
    enabled: Boolean(target.projectId) && collectionUrl === undefined,
    staleTime: 60_000,
  })

  const alertIncidentId = options?.alertIncidentId ?? null
  const needsIncidentFallback =
    collectionUrl === undefined &&
    alertIncidentId !== null &&
    (!target.projectId || (issueLinkFetched && issueDeepLink == null))
  const { data: incidentDeepLink } = useQuery({
    queryKey: ["notifications", "incident-deep-link", alertIncidentId],
    queryFn: () => getIncidentNotificationDeepLink({ data: { alertIncidentId: alertIncidentId ?? "" } }),
    enabled: needsIncidentFallback,
    staleTime: 60_000,
  })

  return collectionUrl ?? issueDeepLink ?? incidentDeepLink ?? undefined
}
