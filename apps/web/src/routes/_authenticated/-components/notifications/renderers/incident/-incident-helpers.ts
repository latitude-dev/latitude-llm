import type { IncidentNotificationPayload } from "@domain/notifications"
import { useQuery } from "@tanstack/react-query"
import {
  getIssueLifecycleSummary,
  type IssueLifecycleSummaryRecord,
} from "../../../../../../domains/issues/issues.functions.ts"
import {
  getIncidentNotificationTarget,
  type IncidentTargetResult,
} from "../../../../../../domains/notifications/notifications.functions.ts"

export function useLiveIssueSummary(
  payload: IncidentNotificationPayload,
  fallback: IncidentTargetResult | null = null,
): IssueLifecycleSummaryRecord | null {
  const projectId = payload.projectId ?? fallback?.projectId ?? undefined
  const issueId = payload.issueId ?? fallback?.issueId ?? undefined
  const enabled = Boolean(projectId && issueId)
  const { data } = useQuery({
    queryKey: ["notifications", "issue-summary", projectId, issueId],
    queryFn: () => getIssueLifecycleSummary({ data: { projectId: projectId ?? "", issueId: issueId ?? "" } }),
    enabled,
    staleTime: 30_000,
  })
  return data ?? null
}

// Only fires when the payload snapshot is missing fields — healthy rows skip the network call.
export function useIncidentLinkFallback(
  payload: IncidentNotificationPayload,
  alertIncidentId: string | null,
): IncidentTargetResult | null {
  const needsFallback = !payload.issueId || !payload.projectSlug
  const enabled = needsFallback && alertIncidentId !== null
  const { data } = useQuery({
    queryKey: ["notifications", "incident-target", alertIncidentId],
    queryFn: () => getIncidentNotificationTarget({ data: { alertIncidentId: alertIncidentId ?? "" } }),
    enabled,
    staleTime: 60_000,
  })
  return data ?? null
}

// Returns `undefined` when neither the payload nor the fallback can produce a target.
export function buildIssueUrl(
  payload: IncidentNotificationPayload,
  fallback: IncidentTargetResult | null = null,
): string | undefined {
  const issueId = payload.issueId ?? fallback?.issueId
  const projectSlug = payload.projectSlug ?? fallback?.projectSlug
  if (!projectSlug || !issueId) return undefined
  return `/projects/${projectSlug}/issues?issueId=${encodeURIComponent(issueId)}`
}
