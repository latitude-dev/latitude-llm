import { cn, Icon, ProviderIcon, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatPercentage, formatPrice } from "@repo/utils"
import { InfoIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { CostOverviewRecord } from "../../../../../../domains/cost/cost.functions.ts"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import { bucketUnitLabel, microcentsToUsd } from "./cost-formatters.ts"
import { SplitValue } from "./split-value.tsx"
import { useGoToModelSessions } from "./use-go-to-model-sessions.ts"

const DASH = "—"

function KpiTile({
  label,
  value,
  detail,
  hint,
  isLoading,
}: {
  readonly label: string
  readonly value: ReactNode
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
  projectSlug,
  isLoading,
}: {
  readonly overview: CostOverviewRecord | undefined
  readonly dailyAverageMicrocents: number | null
  readonly bucketSeconds: number
  readonly projectSlug: string
  readonly isLoading: boolean
}): ReactNode {
  const topSpend = overview?.topSpendModel
  const goToModelSessions = useGoToModelSessions(projectSlug)
  const topSpendShare =
    topSpend && overview && overview.totalMicrocents > 0 ? topSpend.costMicrocents / overview.totalMicrocents : null
  const perTrace = overview?.avgPerTraceMicrocents ?? 0
  const unit = bucketUnitLabel(bucketSeconds)
  // The same rollup vocabulary the traces and sessions tables use, so a total of
  // zero reads as "not known" rather than as free.
  const total = rollupCostDisplay({
    costTotalMicrocents: overview?.totalMicrocents ?? 0,
    unpricedSpanCount: (overview?.confidence.unpricedCalls ?? 0) + (overview?.confidence.unknownCalls ?? 0),
    tokensTotal: overview?.confidence.billableTokens ?? 0,
  })

  return (
    <div className="flex flex-row flex-wrap gap-3 rounded-lg bg-secondary p-4">
      <KpiTile
        label="Total spend"
        value={<SplitValue formatted={total.label} />}
        hint={`Cost recorded on billable LLM calls in this window. Excludes tool and wrapper spans, which carry no usage.${total.note ? ` ${total.note}` : ""}`}
        isLoading={isLoading}
      />
      <KpiTile
        label="Avg per day"
        value={
          dailyAverageMicrocents === null ? (
            DASH
          ) : (
            <SplitValue formatted={formatPrice(microcentsToUsd(dailyAverageMicrocents))} />
          )
        }
        {...(dailyAverageMicrocents === null ? {} : { detail: `over completed ${unit}s` })}
        hint={`Spend divided by the ${unit}s that have fully elapsed. The current ${unit} is still filling, so counting it would drag the figure down all day.`}
        isLoading={isLoading}
      />
      <KpiTile
        label="Avg per trace"
        value={<SplitValue formatted={formatPrice(microcentsToUsd(perTrace))} />}
        detail={`${formatCount(overview?.tracesWithUsage ?? 0)} traces with usage`}
        hint="Total spend divided by traces containing at least one billable LLM call. Traces made up only of tool or wrapper spans are excluded — they would dilute the average."
        isLoading={isLoading}
      />
      <KpiTile
        label="Top spend model"
        value={
          topSpend ? (
            <button
              type="button"
              disabled={!topSpend.model}
              onClick={() => goToModelSessions(topSpend.model)}
              aria-label={topSpend.model ? `View sessions for ${topSpend.model}` : "Unknown model"}
              className={cn("inline-flex min-w-0 items-center gap-1.5 text-left transition-colors", {
                "cursor-pointer hover:text-primary": topSpend.model,
                "cursor-default": !topSpend.model,
              })}
            >
              <ProviderIcon provider={topSpend.provider || "unknown"} size="sm" />
              <span className="truncate">{topSpend.model || "unknown"}</span>
            </button>
          ) : (
            DASH
          )
        }
        {...(topSpend
          ? {
              detail: `${formatPrice(microcentsToUsd(topSpend.costMicrocents))}${
                topSpendShare === null ? "" : ` · ${formatPercentage(topSpendShare)} of spend`
              }`,
            }
          : {})}
        hint="The model with the highest total spend in this window — not the highest unit price."
        isLoading={isLoading}
      />
    </div>
  )
}
