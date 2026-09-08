import {
  BILLING_USAGE_CATEGORY_LABELS,
  type BillingUsageCategory,
  summarizeBillingUsageByCategory,
  summarizeBillingUsageByProject,
} from "@domain/billing"
import { SegmentBar, type SegmentBarItem, Skeleton, Text } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { getBillingUsageBreakdown } from "../../../domains/billing/billing.functions.ts"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"

const CATEGORY_COLORS: Record<BillingUsageCategory, string> = {
  traces: "hsl(var(--viz-blue))",
  flaggers: "hsl(var(--viz-gold))",
  signals: "hsl(var(--viz-violet))",
  behaviors: "hsl(var(--viz-green))",
  annotations: "hsl(var(--viz-gold-faint))",
  other: "hsl(var(--viz-gray))",
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
})

const formatShare = (credits: number, total: number) => {
  if (total <= 0) return ""
  const share = credits / total
  return share > 0 && share < 0.01 ? "<1%" : percentFormatter.format(share)
}

function BreakdownRow({
  swatchColor,
  label,
  credits,
  total,
  emphasized,
}: {
  readonly swatchColor?: string
  readonly label: string
  readonly credits: number
  readonly total: number
  readonly emphasized?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {swatchColor ? (
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: swatchColor }} aria-hidden="true" />
        ) : null}
        <Text.H6
          color={emphasized ? "foreground" : "foregroundMuted"}
          weight={emphasized ? "medium" : "normal"}
          ellipsis
        >
          {label}
        </Text.H6>
      </div>
      <div className="flex shrink-0 items-baseline gap-1.5">
        <Text.H6 color="foreground" weight="medium">
          {numberFormatter.format(credits)}
        </Text.H6>
        <Text.H7 color="foregroundMuted" className="w-8 text-right">
          {formatShare(credits, total)}
        </Text.H7>
      </div>
    </div>
  )
}

function BreakdownSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      <Skeleton className="h-2 w-full rounded" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

export function BillingUsageBreakdown({
  organizationId,
  currentProjectId,
  consumedCredits,
}: {
  readonly organizationId: string
  readonly currentProjectId: string
  readonly consumedCredits: number
}) {
  const { data: breakdown, isError } = useQuery({
    queryKey: ["billing", "usage-breakdown", organizationId],
    queryFn: () => getBillingUsageBreakdown(),
    staleTime: 30_000,
  })
  const { data: projects } = useProjectsCollection()

  if (isError) {
    return <Text.H6 color="foregroundMuted">Usage breakdown is unavailable right now.</Text.H6>
  }

  if (!breakdown) return <BreakdownSkeleton />

  const byCategory = summarizeBillingUsageByCategory(breakdown.rows, consumedCredits)
  const byProject = summarizeBillingUsageByProject(breakdown.rows)
  const total = byCategory.reduce((sum, entry) => sum + entry.credits, 0)

  if (total <= 0) {
    return <Text.H6 color="foregroundMuted">No credits used yet this period.</Text.H6>
  }

  const segments: SegmentBarItem[] = byCategory.map((entry) => ({
    label: BILLING_USAGE_CATEGORY_LABELS[entry.category],
    value: entry.credits,
    color: CATEGORY_COLORS[entry.category],
  }))
  const projectNames = new Map<string, string>((projects ?? []).map((project) => [project.id, project.name]))
  const showProjects = byProject.length > 1

  return (
    <div className="flex flex-col gap-3">
      <SegmentBar segments={segments} />

      <div className="flex flex-col gap-1.5">
        {byCategory.map((entry) => (
          <BreakdownRow
            key={entry.category}
            swatchColor={CATEGORY_COLORS[entry.category]}
            label={BILLING_USAGE_CATEGORY_LABELS[entry.category]}
            credits={entry.credits}
            total={total}
          />
        ))}
      </div>

      {showProjects ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <Text.H7 color="foregroundMuted" weight="medium">
            By project
          </Text.H7>
          {byProject.map((entry) => (
            <BreakdownRow
              key={entry.projectId}
              label={projectNames.get(entry.projectId) ?? "Deleted project"}
              credits={entry.credits}
              total={total}
              emphasized={entry.projectId === currentProjectId}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
