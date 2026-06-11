import { CopyableText, Skeleton, Status, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { type ToolsTimeRange, useToolErrorBreakdown } from "../../../../../../../domains/tools/tools.collection.ts"
import { TOOL_DETAIL_PANEL_MAX_HEIGHT } from "../../-components/tool-formatters.ts"
import { ValueBar } from "./value-bar.tsx"

export function ToolErrorBreakdown({
  projectId,
  toolName,
  range,
  failedCalls,
}: {
  readonly projectId: string
  readonly toolName: string
  readonly range: ToolsTimeRange
  readonly failedCalls: number
}) {
  const { data: rows = [], isLoading } = useToolErrorBreakdown({ projectId, toolName, range })
  const counted = rows.reduce((sum, row) => sum + row.calls, 0)
  const total = Math.max(failedCalls, counted)
  const other = total - counted

  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4 ${TOOL_DETAIL_PANEL_MAX_HEIGHT}`}>
      <Text.H6 color="foregroundMuted">Common errors</Text.H6>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Text.H6 color="foregroundMuted">No failed calls in this time window</Text.H6>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex min-w-0 flex-row items-center gap-2">
                {row.sample ? (
                  <div className="min-w-0 flex-1">
                    <CopyableText value={row.sample} size="sm" ellipsis tooltip="Copy error output" />
                  </div>
                ) : (
                  <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate italic">
                    No error output
                  </Text.H6>
                )}
                {row.errorType ? <Status variant="destructive" label={row.errorType} indicator={false} /> : null}
                <Text.H6 color="foreground" className="shrink-0 tabular-nums">
                  {formatCount(row.calls)}
                </Text.H6>
              </div>
              <ValueBar fraction={total > 0 ? row.calls / total : 0} tone="destructive" />
            </div>
          ))}
          {other > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="flex min-w-0 flex-row items-center gap-2">
                <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate italic">
                  Other
                </Text.H6>
                <Text.H6 color="foregroundMuted" className="shrink-0 tabular-nums">
                  {formatCount(other)}
                </Text.H6>
              </div>
              <ValueBar fraction={total > 0 ? other / total : 0} muted />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
