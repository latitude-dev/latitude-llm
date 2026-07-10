import type { AgentGraph, AgentNode } from "@domain/spans"
import { Badge, Text } from "@repo/ui"
import { BotIcon } from "lucide-react"

/** Direct subagents of every main root in the graph, in chronological order. */
function directSubagents(graph: AgentGraph): AgentNode[] {
  return graph.roots.flatMap((root) => root.children.filter((child) => child.kind === "subagent"))
}

/**
 * A compact footer listing the conversation's direct subagents for quick jump.
 * Renders nothing when there are none. Clicking a chip opens that subagent's
 * conversation in place.
 */
export function SubagentFooterNav({
  graph,
  onSelectAgent,
}: {
  readonly graph: AgentGraph
  readonly onSelectAgent: (node: AgentNode) => void
}) {
  const subagents = directSubagents(graph)
  if (subagents.length === 0) return null

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-background px-4 py-2">
      <Text.H6 color="foregroundMuted" noWrap>
        Subagents
      </Text.H6>
      {subagents.map((node) => (
        <button key={node.id} type="button" onClick={() => onSelectAgent(node)}>
          <Badge variant="outlineMuted" size="small" noWrap iconProps={{ icon: BotIcon, placement: "start" }}>
            {node.label}
          </Badge>
        </button>
      ))}
    </div>
  )
}
