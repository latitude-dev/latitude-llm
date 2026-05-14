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

/**
 * Live "name + status" refresh for the snapshot baked into the notification
 * payload at creation time. Returns `null` until the request resolves; the
 * caller falls back to the snapshot fields in the payload.
 *
 * Accepts an optional `fallback` (from `useIncidentLinkFallback`) so legacy
 * notifications without payload snapshots can still hydrate their summary
 * once the alert_incident → issue lookup resolves.
 */
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

/**
 * Resolves issueId / projectSlug / etc. from the underlying alert_incident
 * row when the notification payload doesn't carry them. Used for legacy rows
 * (created before payload snapshotting landed) and for rows where the
 * fan-out lookup failed. Returns `null` until resolved — the renderer falls
 * back to payload-only behavior in the meantime (non-interactive card).
 *
 * Only fires the network call when the payload is actually missing either
 * `issueId` or `projectSlug`. Healthy rows never trigger this lookup.
 */
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

/**
 * Deep-link to the issues route with the given issue's drawer pre-opened.
 * Returns `undefined` when neither the payload snapshot nor the live
 * fallback provides navigation targets — the renderer should drop the
 * `url` prop in that case so the card stays non-interactive.
 */
export function buildIssueUrl(
  payload: IncidentNotificationPayload,
  fallback: IncidentTargetResult | null = null,
): string | undefined {
  const issueId = payload.issueId ?? fallback?.issueId
  const projectSlug = payload.projectSlug ?? fallback?.projectSlug
  if (!projectSlug || !issueId) return undefined
  return `/projects/${projectSlug}/issues?issueId=${encodeURIComponent(issueId)}`
}
