import type { IncidentNotificationPayload } from "@domain/notifications"
import { useQuery } from "@tanstack/react-query"
import {
  getIssueLifecycleSummary,
  type IssueLifecycleSummaryRecord,
} from "../../../../../../domains/issues/issues.functions.ts"

/**
 * Live "name + status" refresh for the snapshot baked into the notification
 * payload at creation time. Returns `null` until the request resolves; the
 * caller falls back to the snapshot fields in the payload.
 */
export function useLiveIssueSummary(payload: IncidentNotificationPayload): IssueLifecycleSummaryRecord | null {
  const enabled = Boolean(payload.projectId && payload.issueId)
  const { data } = useQuery({
    queryKey: ["notifications", "issue-summary", payload.projectId, payload.issueId],
    queryFn: () =>
      getIssueLifecycleSummary({ data: { projectId: payload.projectId ?? "", issueId: payload.issueId ?? "" } }),
    enabled,
    staleTime: 30_000,
  })
  return data ?? null
}

/**
 * Deep-link to the issues route with the given issue's drawer pre-opened.
 * Returns `undefined` when the payload didn't snapshot the navigation
 * targets — the renderer should drop the `url` prop in that case so the
 * card stays non-interactive.
 */
export function buildIssueUrl(payload: IncidentNotificationPayload): string | undefined {
  if (!payload.projectSlug || !payload.issueId) return undefined
  return `/projects/${payload.projectSlug}/issues?issueId=${encodeURIComponent(payload.issueId)}`
}
