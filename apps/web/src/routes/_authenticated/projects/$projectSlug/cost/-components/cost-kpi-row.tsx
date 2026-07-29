import { Icon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import { InfoIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { CostOverviewRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { bucketUnitLabel, microcentsToUsd } from "./cost-formatters.ts"

const DASH = "—"

function KpiTile({
  label,
  value,
  detail,
  hint,
  isLoading,
}: {
  readonly label: string
  readonly value: string
  readonly detail?: string
  readonly hint: string
  readonly isLoading: boolean
}) {
  return (
    <div className="flex basis-[200px] min-w-[200px] shrink-0 flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <Text.H6 color="foregroundMuted">{label}</Text.H6>
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex cursor-default">
              <Icon icon={InfoIcon} size="sm" color="foregroundMuted" />
            </span>
          }
        >
          {hint}
        </Tooltip>
      </div>
      {isLoading ? (
        <Skeleton className="h-5 w-20" />
      ) : (
        <div className="flex flex-col gap-0.5">
          <Text.H4 color="foreground" className="tabular-nums">
            {value}
          </Text.H4>
          {detail ? (
            <Text.H6 color="foregroundMuted" ellipsis noWrap>
              {detail}
            </Text.H6>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function CostKpiRow({
  overview,
  dailyAverageMicrocents,
  bucketSeconds,
  isLoading,
}: {
  readonly overview: CostOverviewRecord | undefined
  readonly dailyAverageMicrocents: number | null
  readonly bucketSeconds: number
  readonly isLoading: boolean
}): ReactNode {
  const topSpend = overview?.topSpendModel
  const perTrace = overview?.avgPerTraceMicrocents ?? 0
  const unit = bucketUnitLabel(bucketSeconds)

  return (
    <div className="flex flex-row flex-wrap gap-3 rounded-lg bg-secondary p-4">
      <KpiTile
        label="Total spend"
        value={formatPrice(microcentsToUsd(overview?.totalMicrocents ?? 0))}
        hint="Cost recorded on billable LLM calls in this window. Excludes tool and wrapper spans, which carry no usage."
        isLoading={isLoading}
      />
      <KpiTile
        label="Avg per day"
        value={dailyAverageMicrocents === null ? DASH : formatPrice(microcentsToUsd(dailyAverageMicrocents))}
        {...(dailyAverageMicrocents === null ? {} : { detail: `over completed ${unit}s` })}
        hint={`Spend divided by the ${unit}s that have fully elapsed. The current ${unit} is still filling, so counting it would drag the figure down all day.`}
        isLoading={isLoading}
      />
      <KpiTile
        label="Avg per trace"
        value={formatPrice(microcentsToUsd(perTrace))}
        detail={`${formatCount(overview?.tracesWithUsage ?? 0)} traces with usage`}
        hint="Total spend divided by traces containing at least one billable LLM call. Traces made up only of tool or wrapper spans are excluded — they would dilute the average."
        isLoading={isLoading}
      />
      <KpiTile
        label="Top spend model"
        value={topSpend ? topSpend.model || "unknown" : DASH}
        {...(topSpend
          ? { detail: `${formatPrice(microcentsToUsd(topSpend.costMicrocents))} · ${topSpend.provider || "unknown"}` }
          : {})}
        hint="The model with the highest total spend in this window — not the highest unit price."
        isLoading={isLoading}
      />
    </div>
  )
}
