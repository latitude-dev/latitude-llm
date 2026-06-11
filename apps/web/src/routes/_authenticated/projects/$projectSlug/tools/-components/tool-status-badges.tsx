import { Status, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import type { ToolSummaryRecord } from "../../../../../../domains/tools/tools.functions.ts"
import { formatPercent, getToolStatuses, TOOL_CRITICAL_ERROR_RATE } from "./tool-formatters.ts"

export function ToolStatusBadges({ tool }: { readonly tool: ToolSummaryRecord }) {
  const statuses = getToolStatuses(tool)
  if (statuses.length === 0) return null

  return (
    <div className="flex shrink-0 items-center gap-1">
      {statuses.includes("unused") ? (
        <Tooltip asChild trigger={<Status variant="neutral" label="Unused" />}>
          Defined and offered to the model {formatCount(tool.offeredCount)} times in this window, but never called.
        </Tooltip>
      ) : null}
      {statuses.includes("failing") && tool.metrics ? (
        <Tooltip
          asChild
          trigger={
            <Status
              variant={tool.metrics.errorRate >= TOOL_CRITICAL_ERROR_RATE ? "destructive" : "warning"}
              label="Failing"
            />
          }
        >
          {formatPercent(tool.metrics.errorRate)} of calls failed in this window ({formatCount(tool.metrics.errors)} of{" "}
          {formatCount(tool.metrics.calls)}).
        </Tooltip>
      ) : null}
      {statuses.includes("noDefinition") ? (
        <Tooltip asChild trigger={<Status variant="neutral" label="No definition" />}>
          This tool was called but no chat span in this window carried its definition.
        </Tooltip>
      ) : null}
    </div>
  )
}
