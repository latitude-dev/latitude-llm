import { CopyableText, Skeleton, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useMemo, useState } from "react"
import { type ToolsTimeRange, useToolParameterStats } from "../../../../../../../domains/tools/tools.collection.ts"
import { formatPercent } from "../../-components/tool-formatters.ts"

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

/**
 * "How it's called": top-level tool_input keys ranked by usage (left), and
 * the most common values of the selected key (right). Computed over a recent
 * sample — `sampleSize` is surfaced in the footer.
 */
export function ToolParametersExplorer({
  projectId,
  toolName,
  range,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
}) {
  const { data, isLoading } = useToolParameterStats({ projectId, toolName, range })
  const stats = useMemo(() => data?.stats ?? [], [data])
  const sampleSize = data?.sampleSize ?? 0
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const activeKey = selectedKey !== null && stats.some((stat) => stat.key === selectedKey) ? selectedKey : stats[0]?.key
  const activeStat = stats.find((stat) => stat.key === activeKey)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex items-center justify-between">
        <Text.H6 color="foregroundMuted">How it's called</Text.H6>
        {sampleSize > 0 ? (
          <Text.H6 color="foregroundMuted">based on the most recent {formatCount(sampleSize)} calls</Text.H6>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : stats.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center">
          <Text.H6 color="foregroundMuted">Tool inputs are not recorded for this tool</Text.H6>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-4 sm:flex-row">
          {/* Keys, ranked by share of sampled calls. */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto sm:max-h-[280px]">
            {stats.map((stat) => {
              const fraction = sampleSize > 0 ? stat.occurrences / sampleSize : 0
              const isActive = stat.key === activeKey
              return (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => setSelectedKey(stat.key)}
                  className={`flex flex-col gap-1 rounded-md p-2 text-left transition-colors ${
                    isActive ? "bg-background" : "hover:bg-background/60"
                  }`}
                >
                  <div className="flex min-w-0 flex-row items-center gap-2">
                    <Text.H6 color="foreground" className="min-w-0 flex-1 truncate font-mono">
                      {stat.key}
                    </Text.H6>
                    <Text.H6 color="foreground" className="shrink-0 font-semibold tabular-nums">
                      {formatPercent(fraction)}
                    </Text.H6>
                  </div>
                  <CoverageBar fraction={fraction} />
                </button>
              )
            })}
          </div>
          {/* Top values of the selected key. */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto border-t pt-3 sm:max-h-[280px] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            {activeStat ? (
              <>
                <Text.H6 color="foregroundMuted">
                  Top values of <span className="font-mono">{activeStat.key}</span>
                </Text.H6>
                {activeStat.topValues.map((value) => (
                  <div key={value.value} className="flex flex-col gap-1">
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <CopyableText value={value.value} size="sm" ellipsis tooltip="Copy value" />
                      </div>
                      <Text.H6 color="foreground" className="shrink-0 tabular-nums">
                        {formatCount(value.count)}
                      </Text.H6>
                    </div>
                    <CoverageBar fraction={activeStat.occurrences > 0 ? value.count / activeStat.occurrences : 0} />
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
