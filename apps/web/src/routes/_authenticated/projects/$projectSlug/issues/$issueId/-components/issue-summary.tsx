import { Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import type { ReactNode } from "react"
import { useIssueDetail, useIssueImpact } from "../../../../../../../domains/issues/issues.collection.ts"
import { formatSeenAgeParts } from "../../-components/issue-formatters.ts"
import { IssueLifecycleStatuses } from "../../-components/issue-lifecycle-statuses.tsx"
import { IssueTriageControls } from "./issue-triage-controls.tsx"

const MICROCENTS_PER_DOLLAR = 100_000_000

/** Issue's share of all project traces, with `<1%` for a tiny-but-present rate. */
const formatPercent = (fraction: number) => {
  if (fraction <= 0) return "0%"
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

function SummaryField({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      {children}
    </div>
  )
}

function SeenField({
  label,
  iso,
  relative,
}: {
  readonly label: string
  readonly iso: string
  readonly relative: string
}) {
  return (
    <SummaryField label={label}>
      <Tooltip asChild trigger={<Text.H5 color="foreground">{relative}</Text.H5>}>
        {new Date(iso).toLocaleString()}
      </Tooltip>
    </SummaryField>
  )
}

/**
 * Compact, non-scrolling summary row for the Issue page: triage controls
 * (assignee / priority) plus status and the headline impact metrics. Kept out
 * of the page header so it doesn't shrink the scrollable body. "Affected users"
 * is hidden when there's no user attribution (count 0).
 */
export function IssueSummary({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  const { data: issue, isLoading } = useIssueDetail({ projectId, issueId })
  const { data: impact, isLoading: impactLoading } = useIssueImpact({ projectId, issueId })
  const seen = issue ? formatSeenAgeParts(issue.lastSeenAt, issue.firstSeenAt) : null
  const showUsers = impactLoading || (impact !== undefined && impact.affectedUsers > 0)

  return (
    <div className="flex flex-row flex-wrap items-start gap-x-8 gap-y-4 rounded-lg bg-secondary p-4">
      <IssueTriageControls projectId={projectId} issueId={issueId} />

      <SummaryField label="Status">
        {isLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : issue && issue.states.length > 0 ? (
          <IssueLifecycleStatuses states={issue.states} wrap />
        ) : (
          <Text.H5 color="foreground">-</Text.H5>
        )}
      </SummaryField>

      {isLoading || !issue || !seen ? (
        <>
          <SummaryField label="First seen">
            <Skeleton className="h-5 w-20" />
          </SummaryField>
          <SummaryField label="Last seen">
            <Skeleton className="h-5 w-20" />
          </SummaryField>
        </>
      ) : (
        <>
          <SeenField label="First seen" iso={issue.firstSeenAt} relative={seen.firstSeenLabel} />
          <SeenField label="Last seen" iso={issue.lastSeenAt} relative={seen.lastSeenLabel} />
        </>
      )}

      <SummaryField label="Occurrences">
        {isLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <Text.H5 color="foreground">{issue ? formatCount(issue.totalOccurrences) : "-"}</Text.H5>
        )}
      </SummaryField>

      <SummaryField label="Affected traces">
        {impactLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : impact ? (
          <Tooltip
            asChild
            trigger={
              <div className="flex cursor-default flex-row items-baseline gap-1">
                <Text.H5 color="foreground">{formatCount(impact.affectedTraces)}</Text.H5>
                <Text.H6 color="foregroundMuted">· {formatPercent(impact.affectedTracesPercent)}</Text.H6>
              </div>
            }
          >
            {formatPercent(impact.affectedTracesPercent)} of all project traces are part of this issue — the baseline
            the Patterns section compares against.
          </Tooltip>
        ) : (
          <Text.H5 color="foreground">-</Text.H5>
        )}
      </SummaryField>

      <SummaryField label="Affected sessions">
        {impactLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <Text.H5 color="foreground">{impact ? formatCount(impact.affectedSessions) : "-"}</Text.H5>
        )}
      </SummaryField>

      {showUsers ? (
        <SummaryField label="Affected users">
          {impactLoading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <Text.H5 color="foreground">{impact ? formatCount(impact.affectedUsers) : "-"}</Text.H5>
          )}
        </SummaryField>
      ) : null}

      <SummaryField label="Cost impact">
        {impactLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <Text.H5 color="foreground">
            {impact ? formatPrice(impact.costMicrocents / MICROCENTS_PER_DOLLAR) : "-"}
          </Text.H5>
        )}
      </SummaryField>
    </div>
  )
}
