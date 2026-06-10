import type { ToolContextBreakdownRow, ToolContextDimension } from "@domain/spans"
import { ProviderIcon, Skeleton, TagBadge, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { WrenchIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  type ToolsTimeRange,
  useToolContextBreakdown,
  useToolCoOccurrence,
} from "../../../../../../../domains/tools/tools.collection.ts"
import { formatPercent } from "../../-components/tool-formatters.ts"

const MAX_ROWS_PER_SECTION = 5

function CoverageBar({ fraction }: { readonly fraction: number }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded bg-muted">
      <div
        className="absolute inset-y-0 left-0 rounded bg-primary/70"
        style={{ width: `${Math.min(100, Math.max(2, fraction * 100))}%` }}
      />
    </div>
  )
}

function BreakdownRow({
  identity,
  fraction,
  tooltip,
}: {
  readonly identity: ReactNode
  readonly fraction: number
  readonly tooltip: ReactNode
}) {
  return (
    <Tooltip
      asChild
      trigger={
        <div className="flex cursor-default flex-col gap-1">
          <div className="flex min-w-0 flex-row items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-row items-center">{identity}</div>
            <Text.H6 color="foreground" className="shrink-0 font-semibold tabular-nums">
              {formatPercent(fraction)}
            </Text.H6>
          </div>
          <CoverageBar fraction={fraction} />
        </div>
      }
    >
      {tooltip}
    </Tooltip>
  )
}

function DimensionSection({
  projectId,
  toolName,
  range,
  dimension,
  title,
  totalTraces,
  renderIdentity,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly dimension: ToolContextDimension
  readonly title: string
  readonly totalTraces: number
  readonly renderIdentity: (row: ToolContextBreakdownRow) => ReactNode
}) {
  const { data: rows = [], isLoading } = useToolContextBreakdown({ projectId, toolName, dimension, range })
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Text.H6 color="foregroundMuted">{title}</Text.H6>
        <Skeleton className="h-5 w-full" />
      </div>
    )
  }
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <Text.H6 color="foregroundMuted">{title}</Text.H6>
      {rows.slice(0, MAX_ROWS_PER_SECTION).map((row) => {
        const fraction = totalTraces > 0 ? row.traces / totalTraces : 0
        return (
          <BreakdownRow
            key={row.value}
            identity={renderIdentity(row)}
            fraction={fraction}
            tooltip={
              <span>
                {formatCount(row.traces)} of the {formatCount(totalTraces)} traces calling{" "}
                <span className="font-mono">{toolName}</span> involve {row.value}.
              </span>
            }
          />
        )
      })}
    </div>
  )
}

/**
 * "Where it's used": model / provider / tag breakdowns over the tool's
 * traces, plus the tools it most often appears with — each co-occurring
 * tool links to its own page.
 */
export function ToolContextPanel({
  projectId,
  projectSlug,
  toolName,
  range,
  toolTracesUsed,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly toolTracesUsed: number
}) {
  const { data: coOccurrence = [], isLoading: coOccurrenceLoading } = useToolCoOccurrence({
    projectId,
    toolName,
    range,
  })

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-y-auto rounded-lg bg-secondary p-4 xl:max-h-[420px] xl:w-[340px]">
      <Text.H6 color="foregroundMuted">Where it's used</Text.H6>
      <DimensionSection
        projectId={projectId}
        toolName={toolName}
        range={range}
        dimension="model"
        title="Models"
        totalTraces={toolTracesUsed}
        renderIdentity={(row) => (
          <Text.H6 color="foreground" className="truncate">
            {row.value}
          </Text.H6>
        )}
      />
      <DimensionSection
        projectId={projectId}
        toolName={toolName}
        range={range}
        dimension="provider"
        title="Providers"
        totalTraces={toolTracesUsed}
        renderIdentity={(row) => (
          <div className="flex min-w-0 flex-row items-center gap-1.5">
            <ProviderIcon provider={row.value} size="sm" />
            <Text.H6 color="foreground" className="truncate">
              {row.value}
            </Text.H6>
          </div>
        )}
      />
      <DimensionSection
        projectId={projectId}
        toolName={toolName}
        range={range}
        dimension="tag"
        title="Tags"
        totalTraces={toolTracesUsed}
        renderIdentity={(row) => <TagBadge tag={row.value} />}
      />
      {coOccurrenceLoading ? (
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted">Often used with</Text.H6>
          <Skeleton className="h-5 w-full" />
        </div>
      ) : coOccurrence.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text.H6 color="foregroundMuted">Often used with</Text.H6>
          {coOccurrence.map((row) => {
            const fraction = toolTracesUsed > 0 ? row.sharedTraces / toolTracesUsed : 0
            return (
              <Link
                key={row.otherTool}
                to="/projects/$projectSlug/tools/$toolName"
                params={{ projectSlug, toolName: row.otherTool }}
                className="rounded-md transition-colors hover:bg-background/60"
              >
                <BreakdownRow
                  identity={
                    <div className="flex min-w-0 flex-row items-center gap-1.5">
                      <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <Text.H6 color="foreground" className="truncate font-mono">
                        {row.otherTool}
                      </Text.H6>
                    </div>
                  }
                  fraction={fraction}
                  tooltip={
                    <span>
                      {formatCount(row.sharedTraces)} of {formatCount(toolTracesUsed)} traces calling{" "}
                      <span className="font-mono">{toolName}</span> also call{" "}
                      <span className="font-mono">{row.otherTool}</span>.
                    </span>
                  }
                />
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
