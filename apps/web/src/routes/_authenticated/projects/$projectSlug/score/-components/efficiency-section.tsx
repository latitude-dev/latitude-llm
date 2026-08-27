import { cn, Icon, Text } from "@repo/ui"
import { ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import type { EfficiencyDimension, EfficiencyMetric } from "./agent-score-mock.ts"
import { GrowingMarker, TextWithCode } from "./cause-row.tsx"
import { DestinationLink, MonitorLink } from "./destination-link.tsx"
import { dimensionAnchorId } from "./dimension-anchors.ts"
import { ScoreChip } from "./score-chip.tsx"
import { BAR_TRACK, formatPoints, ROW_HOVER } from "./score-formatters.ts"

/** Where the raw value sits between the two control points, good end on the left. */
function CurveScale({ metric }: { readonly metric: EfficiencyMetric }) {
  if (metric.curve === null) return <div className="w-20 shrink-0" />

  return (
    <div className={cn("relative h-1.5 w-20 shrink-0 rounded-full", BAR_TRACK)}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-600 to-rose-600 dark:from-green-500 dark:to-rose-500" />
      <span
        className="absolute top-1/2 h-3.5 w-1.5 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-secondary"
        style={{ left: `calc(${(1 - metric.curve) * 100}% - 3px)` }}
        aria-hidden
      />
    </div>
  )
}

function MetricRow({ metric, projectSlug }: { readonly metric: EfficiencyMetric; readonly projectSlug: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
        className={cn(
          "flex min-w-0 cursor-pointer flex-row items-center gap-3 rounded-md p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          ROW_HOVER,
        )}
      >
        <Icon
          icon={ChevronRightIcon}
          size="sm"
          color="foregroundMuted"
          className={cn("shrink-0 transition-transform", { "rotate-90": expanded })}
        />
        <Text.H5 className="min-w-0 flex-1" ellipsis noWrap>
          {metric.label}
        </Text.H5>
        <Text.H5 className="shrink-0 tabular-nums" color={metric.notMeasured ? "foregroundMuted" : "foreground"}>
          {metric.value}
        </Text.H5>
        <CurveScale metric={metric} />
        <GrowingMarker trend={metric.notMeasured ? "flat" : metric.trend} />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3">
          <TextWithCode text={metric.notMeasured ?? metric.detail} size="h6" />
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-row items-center gap-3">
              <Text.H6 color="foregroundMuted" className="w-20 shrink-0" noWrap>
                Costs
              </Text.H6>
              <Text.H6 className="tabular-nums" noWrap>
                {metric.deficit === null ? "nothing, it is not scored here" : `${formatPoints(metric.deficit)} points`}
              </Text.H6>
            </div>
            <div className="flex flex-row items-center gap-3">
              <Text.H6 color="foregroundMuted" className="w-20 shrink-0" noWrap>
                Scale
              </Text.H6>
              <Text.H6 color="foregroundMuted">
                {`${metric.good} or better scores full marks, ${metric.poor} or worse scores nothing. Both ends are placeholders until we set them from real traffic.`}
              </Text.H6>
            </div>
          </div>
          <div className="flex flex-row flex-wrap items-center gap-4 border-t border-border pt-3">
            <DestinationLink projectSlug={projectSlug} destination={metric.destination} />
            <MonitorLink projectSlug={projectSlug} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function EfficiencySection({
  dimension,
  projectSlug,
}: {
  readonly dimension: EfficiencyDimension
  readonly projectSlug: string
}) {
  const applicable = dimension.metrics.filter((metric) => metric.notMeasured === null).length

  return (
    <div id={dimensionAnchorId(dimension.key)} className="flex scroll-mt-14 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex min-w-0 flex-row items-center gap-3">
        <ScoreChip size="lg" score={dimension.subScore} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Text.H4M>{dimension.label}</Text.H4M>
          <Text.H6 color="foregroundMuted">{dimension.description}</Text.H6>
        </div>
      </div>
      <Text.H6 color="foregroundMuted">
        {`${applicable} of ${dimension.metrics.length} metrics apply here, each weighted the same. They measure project totals rather than single sessions, which is why no row opens a session list.`}
      </Text.H6>
      <div className="flex flex-col">
        {dimension.metrics.map((metric) => (
          <MetricRow key={metric.key} metric={metric} projectSlug={projectSlug} />
        ))}
      </div>
    </div>
  )
}
