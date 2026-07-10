import type { AgentGraph, AgentNode } from "@domain/spans"
import { formatPrice } from "@repo/utils"

/** True when any node in the graph is a subagent — the gate for showing the Agents section. */
export function hasSubagents(graph: AgentGraph): boolean {
  for (const node of graph.nodesById.values()) {
    if (node.kind === "subagent") return true
  }
  return false
}

/** True when a node has any subagent in its subtree (all non-root nodes are subagents). */
export function subtreeHasSubagents(node: AgentNode): boolean {
  return node.children.some((child) => child.kind === "subagent" || subtreeHasSubagents(child))
}

/** Pre-order flatten of a node's subtree for row rendering (depth carried on each node). */
export function flattenAgentTree(root: AgentNode): AgentNode[] {
  const out: AgentNode[] = []
  const walk = (node: AgentNode) => {
    out.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

/** Microcents → a human price string (`$0`, `$0.0012`, `$1.23`). */
export function formatAgentCost(microcents: number): string {
  return formatPrice(microcents / 100_000_000)
}
