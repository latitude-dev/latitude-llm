import { DetailSection, Icon, Skeleton, Status, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { NetworkIcon } from "lucide-react"
import { useRelatedIssues } from "../../../../../../../domains/issues/issues.collection.ts"
import type { RelatedIssueRecord } from "../../../../../../../domains/issues/issues.functions.ts"
import { IssueLifecycleStatuses } from "../../-components/issue-lifecycle-statuses.tsx"

/** Integer percentage, with `<1%` for a tiny-but-present share so it never reads as 0%. */
const formatPercent = (fraction: number) => {
  if (fraction <= 0) return "0%"
  if (fraction < 0.01) return "<1%"
  return `${Math.round(fraction * 100)}%`
}

/**
 * Reason chips explain *why* a row is in the list — the raw similarity /
 * relatedness numbers are deliberately never shown (they rank, the chips
 * explain). A row carrying both chips is the "possibly the same issue" case
 * and ranks above either signal alone.
 */
function ReasonChips({ row }: { readonly row: RelatedIssueRecord }) {
  return (
    <div className="flex shrink-0 flex-row items-center gap-1.5">
      {row.semantic ? (
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex">
              <Status variant="info" label="Similar pattern" indicator={false} />
            </span>
          }
        >
          The two issues' failure patterns are semantically similar.
        </Tooltip>
      ) : null}
      {row.coOccurrence ? (
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex">
              <Status
                variant="neutral"
                label={`In ${formatPercent(row.coOccurrence.sharedSessionsPercent)} of sessions`}
                indicator={false}
              />
            </span>
          }
        >
          Both issues occur together in {formatCount(row.coOccurrence.sharedSessions)} of this issue's sessions over the
          last 30 days — more than chance would predict.
        </Tooltip>
      ) : null}
    </div>
  )
}

function RelatedIssueRow({ projectSlug, row }: { readonly projectSlug: string; readonly row: RelatedIssueRecord }) {
  return (
    <Link
      to="/projects/$projectSlug/issues/$issueId"
      params={{ projectSlug, issueId: row.issueId }}
      aria-label={`Open the ${row.name} issue`}
      className="group flex flex-row items-center gap-3 rounded-lg bg-secondary p-3 hover:bg-accent"
    >
      <div className="flex min-w-0 flex-1 flex-row items-center gap-2">
        <Text.H5 className="min-w-0 truncate group-hover:underline">{row.name}</Text.H5>
        {/* Resolved/ignored rows are included on purpose — "a similar issue was
            already resolved" is the most actionable neighbor to surface. */}
        <div className="shrink-0">
          <IssueLifecycleStatuses states={row.states} wrap={false} />
        </div>
      </div>
      <ReasonChips row={row} />
    </Link>
  )
}

/**
 * Related-issues section: one merged list combining two signals — semantic
 * similarity (centroid cosine) and session co-occurrence (NPMI) — ranked by a
 * fused relatedness score computed server-side. Rows link to the related
 * issue's page. See `specs/issue-details-page.md` (Data model #3).
 */
export function IssueRelated({
  projectId,
  projectSlug,
  issueId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly issueId: string
}) {
  const { data: related, isLoading } = useRelatedIssues({ projectId, issueId })

  return (
    <DetailSection
      icon={<Icon icon={NetworkIcon} size="sm" />}
      label="Related issues"
      defaultOpen
      contentClassName="pl-0 max-h-none overflow-visible"
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((rowIndex) => (
            <Skeleton key={rowIndex} className="h-12 w-full" />
          ))}
        </div>
      ) : !related || related.length === 0 ? (
        <Text.H6 color="foregroundMuted">
          No related issues found — nothing semantically similar and nothing co-occurring in the same sessions.
        </Text.H6>
      ) : (
        <div className="flex flex-col gap-2">
          {related.map((row) => (
            <RelatedIssueRow key={row.issueId} projectSlug={projectSlug} row={row} />
          ))}
        </div>
      )}
    </DetailSection>
  )
}
