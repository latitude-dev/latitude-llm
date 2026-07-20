import { Badge, Icon, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { BotIcon } from "lucide-react"
import { formatDuration } from "../../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"
import { type AgentSummary, formatAgentCost } from "./agent-breakdown-helpers.ts"

export function AgentSummaryRow({ summary }: { readonly summary: AgentSummary }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md py-1.5 pr-1 hover:bg-muted/40">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon icon={BotIcon} size="sm" color={summary.hasError ? "destructive" : "foregroundMuted"} />
        <Text.H6B noWrap ellipsis>
          {summary.label}
        </Text.H6B>
        {summary.models.map((model) => (
          <Badge key={model} variant="muted" size="small" noWrap>
            {model}
          </Badge>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Text.H6 color="foregroundMuted" noWrap>
          {formatAgentCost(summary.totalCostMicrocents)}
        </Text.H6>
        <Text.H6 color="foregroundMuted" noWrap>
          {formatDuration(summary.totalDurationMs)}
        </Text.H6>
        <Text.H6 color="foregroundMuted" noWrap>
          {formatCount(summary.instanceCount)} {summary.instanceCount === 1 ? "run" : "runs"}
        </Text.H6>
      </div>
    </div>
  )
}
