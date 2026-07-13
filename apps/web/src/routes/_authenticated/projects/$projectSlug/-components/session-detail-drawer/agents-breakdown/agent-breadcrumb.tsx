import type { AgentGraph, AgentNode } from "@domain/spans"
import { Icon, Text } from "@repo/ui"
import { BotIcon, ChevronLeftIcon } from "lucide-react"

/**
 * Header for the subagent conversation view: a full-width, clickable "back" bar
 * that steps one level up — to the parent subagent, or to the main conversation
 * when there is none. Its height matches the main conversation's search header.
 */
export function AgentBreadcrumb({
  node,
  graph,
  onSelect,
}: {
  readonly node: AgentNode
  readonly graph: AgentGraph
  readonly onSelect: (node: AgentNode | null) => void
}) {
  const parent = node.parentId ? graph.nodesById.get(node.parentId) : undefined

  return (
    <button
      type="button"
      onClick={() => onSelect(parent && parent.kind === "subagent" ? parent : null)}
      className="flex w-full shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2 text-left transition-colors hover:bg-muted cursor-pointer"
    >
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2">
        <Icon icon={ChevronLeftIcon} size="sm" color="foregroundMuted" />
        <Text.H6 color="foregroundMuted" noWrap>
          Back
        </Text.H6>
        <span className="min-w-0 flex-1" />
        <Icon icon={BotIcon} size="sm" color="foregroundMuted" />
        <Text.H5M noWrap ellipsis>
          {node.label}
        </Text.H5M>
      </div>
    </button>
  )
}
