import type { AgentNode } from "@domain/spans"
import { Badge, Icon, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { BotIcon, ScanSearchIcon, SparklesIcon } from "lucide-react"
import { formatDuration } from "../../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"
import { formatAgentCost } from "./agent-breakdown-helpers.ts"

const INDENT_PER_DEPTH_PX = 16

export function AgentNodeRow({
  node,
  onViewExecutionSpan,
  onSelectAgent,
}: {
  readonly node: AgentNode
  readonly onViewExecutionSpan?: ((ref: { traceId: string; spanId: string | null }) => void) | undefined
  readonly onSelectAgent?: ((node: AgentNode) => void) | undefined
}) {
  const isSubagent = node.kind === "subagent"
  const clickable = onSelectAgent !== undefined
  const showViewSpan = onViewExecutionSpan !== undefined && node.ref.spanId !== null

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md py-1.5 pr-1 hover:bg-muted/40"
      style={{ paddingLeft: node.depth * INDENT_PER_DEPTH_PX }}
    >
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onSelectAgent?.(node)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <Icon
          icon={isSubagent ? BotIcon : SparklesIcon}
          size="sm"
          color={node.hasError ? "destructive" : "foregroundMuted"}
        />
        <Text.H6B noWrap ellipsis>
          {node.label}
        </Text.H6B>
        {node.models.map((model) => (
          <Badge key={model} variant="muted" size="small" noWrap>
            {model}
          </Badge>
        ))}
      </button>

      <div className="flex shrink-0 items-center gap-3">
        <Tooltip
          asChild
          trigger={
            <div className="flex items-center gap-3">
              <Text.H6 color="foregroundMuted" noWrap>
                {formatAgentCost(node.own.costMicrocents)}
              </Text.H6>
              <Text.H6 color="foregroundMuted" noWrap>
                {formatDuration(node.own.durationMs)}
              </Text.H6>
              <Text.H6 color="foregroundMuted" noWrap>
                {formatCount(node.ownGenerationCount)} gen
              </Text.H6>
            </div>
          }
        >
          <div className="flex flex-col gap-0.5">
            <Text.H6 color="white">Own: {formatAgentCost(node.own.costMicrocents)}</Text.H6>
            <Text.H6 color="white">
              Total (with subagents): {formatAgentCost(node.total.costMicrocents)} ·{" "}
              {formatCount(node.total.tokensInput + node.total.tokensOutput)} tokens
            </Text.H6>
          </div>
        </Tooltip>

        {showViewSpan && (
          <Tooltip
            asChild
            trigger={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewExecutionSpan?.(node.ref)
                }}
                className="flex items-center text-muted-foreground hover:text-foreground"
              >
                <ScanSearchIcon className="h-4 w-4" />
              </button>
            }
          >
            <Text.H6>View execution span</Text.H6>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
