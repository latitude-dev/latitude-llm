import { Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import { useIssueImpact } from "../../../../../../../domains/issues/issues.collection.ts"

const MICROCENTS_PER_DOLLAR = 100_000_000

function ImpactTile({
  label,
  value,
  hint,
  isLoading,
}: {
  readonly label: string
  readonly value: string
  readonly hint?: string
  readonly isLoading?: boolean
}) {
  const labelNode = <Text.H6 color="foregroundMuted">{label}</Text.H6>
  return (
    <div className="flex basis-[160px] min-w-[160px] shrink-0 flex-col gap-2">
      {hint ? (
        <Tooltip asChild trigger={<span className="w-fit cursor-default">{labelNode}</span>}>
          {hint}
        </Tooltip>
      ) : (
        labelNode
      )}
      {isLoading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <Text.H4M color="foreground" className="tabular-nums">
          {value}
        </Text.H4M>
      )}
    </div>
  )
}

/**
 * Headline impact metrics for an issue: how much traffic it touches and who it
 * affects. Backed by `getIssueImpact` (ClickHouse). Lifetime figures — not
 * scoped to any page-level time range.
 */
export function IssueImpactStrip({ projectId, issueId }: { readonly projectId: string; readonly issueId: string }) {
  const { data: impact, isLoading } = useIssueImpact({ projectId, issueId })

  const affectedTracesValue =
    impact === undefined
      ? "-"
      : `${formatCount(impact.affectedTraces)} (${Math.round(impact.affectedTracesPercent * 100)}%)`

  return (
    <div className="flex flex-row flex-wrap gap-x-8 gap-y-4 rounded-lg bg-secondary p-4">
      <ImpactTile label="Occurrences" isLoading={isLoading} value={impact ? formatCount(impact.occurrences) : "-"} />
      <ImpactTile
        label="Affected traces"
        hint="Share of all project traces touched by this issue."
        isLoading={isLoading}
        value={affectedTracesValue}
      />
      <ImpactTile
        label="Affected sessions"
        isLoading={isLoading}
        value={impact ? formatCount(impact.affectedSessions) : "-"}
      />
      {/* Hidden once loaded with no user attribution — showing "0 users" would
          read as "nobody affected" when it really means "no user id on these traces". */}
      {isLoading || (impact !== undefined && impact.affectedUsers > 0) ? (
        <ImpactTile
          label="Affected users"
          hint="Distinct users across the sessions where this issue occurred."
          isLoading={isLoading}
          value={impact ? formatCount(impact.affectedUsers) : "-"}
        />
      ) : null}
      <ImpactTile
        label="Cost impact"
        hint="Total cost of the traces affected by this issue."
        isLoading={isLoading}
        value={impact ? formatPrice(impact.costMicrocents / MICROCENTS_PER_DOLLAR) : "-"}
      />
    </div>
  )
}
