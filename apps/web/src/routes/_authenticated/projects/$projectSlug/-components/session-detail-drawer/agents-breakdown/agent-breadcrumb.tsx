import type { AgentGraph, AgentNode } from "@domain/spans"
import { Icon, Text } from "@repo/ui"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

/** Walks parent links from the graph root down to `node` (main first). */
function buildPath(node: AgentNode, graph: AgentGraph): AgentNode[] {
  const path: AgentNode[] = []
  const seen = new Set<string>()
  let current: AgentNode | undefined = node
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? graph.nodesById.get(current.parentId) : undefined
  }
  return path
}

/**
 * Top-left breadcrumb for the subagent conversation view: Main › … › current.
 * A segment click selects that ancestor; the root selects the main conversation
 * (`onSelect(null)`). A leading back button steps to the immediate parent.
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
  const path = buildPath(node, graph)
  const parent = node.parentId ? graph.nodesById.get(node.parentId) : undefined

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background/80 px-3 py-2">
      <button
        type="button"
        onClick={() => onSelect(parent && parent.kind === "subagent" ? parent : null)}
        className="mr-1 flex items-center text-muted-foreground hover:text-foreground"
        aria-label="Back"
      >
        <Icon icon={ChevronLeftIcon} size="sm" />
      </button>
      {path.map((segment, index) => {
        const isLast = index === path.length - 1
        return (
          <div key={segment.id} className="flex items-center gap-1">
            {index > 0 && <Icon icon={ChevronRightIcon} size="xs" color="foregroundMuted" />}
            <button
              type="button"
              disabled={isLast}
              onClick={() => onSelect(segment.kind === "main" ? null : segment)}
              className="max-w-40 disabled:cursor-default"
            >
              <Text.H6B color={isLast ? "foreground" : "foregroundMuted"} noWrap ellipsis>
                {segment.label}
              </Text.H6B>
            </button>
          </div>
        )
      })}
    </div>
  )
}
