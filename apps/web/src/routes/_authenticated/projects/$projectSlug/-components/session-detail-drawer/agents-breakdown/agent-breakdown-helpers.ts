import type { AgentGraph, AgentNodeKind } from "@domain/spans"
import { formatPrice } from "@repo/utils"

/** True when any node in the graph is a subagent — the gate for showing the Agents section. */
export function hasSubagents(graph: AgentGraph): boolean {
  for (const node of graph.nodesById.values()) {
    if (node.kind === "subagent") return true
  }
  return false
}

/** One row of the Agents breakdown: every graph node sharing an agent name, aggregated. */
export interface AgentSummary {
  readonly label: string
  readonly kind: AgentNodeKind
  readonly instanceCount: number
  readonly totalCostMicrocents: number
  /** Σ own wall-clock across instances — cumulative active time, not elapsed (instances may overlap). */
  readonly totalDurationMs: number
  readonly models: readonly string[]
  readonly hasError: boolean
}

/**
 * Aggregate every node in the graph by agent name (`node.label`), summing each node's own
 * cost/duration so parent totals never double-count their subagents. Main-agent groups sort
 * first, then by total cost descending.
 */
export function aggregateByAgentName(graph: AgentGraph): AgentSummary[] {
  const groups = new Map<
    string,
    {
      label: string
      isMain: boolean
      instanceCount: number
      totalCostMicrocents: number
      totalDurationMs: number
      models: Set<string>
      hasError: boolean
    }
  >()

  for (const node of graph.nodesById.values()) {
    let group = groups.get(node.label)
    if (!group) {
      group = {
        label: node.label,
        isMain: false,
        instanceCount: 0,
        totalCostMicrocents: 0,
        totalDurationMs: 0,
        models: new Set(),
        hasError: false,
      }
      groups.set(node.label, group)
    }
    group.instanceCount += 1
    group.totalCostMicrocents += node.own.costMicrocents
    group.totalDurationMs += node.own.durationMs
    if (node.kind === "main") group.isMain = true
    if (node.hasError) group.hasError = true
    for (const model of node.models) group.models.add(model)
  }

  return [...groups.values()]
    .map(
      (group): AgentSummary => ({
        label: group.label,
        kind: group.isMain ? "main" : "subagent",
        instanceCount: group.instanceCount,
        totalCostMicrocents: group.totalCostMicrocents,
        totalDurationMs: group.totalDurationMs,
        models: [...group.models],
        hasError: group.hasError,
      }),
    )
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "main" ? -1 : 1
      return b.totalCostMicrocents - a.totalCostMicrocents
    })
}

/** Microcents → a human price string (`$0`, `$0.0012`, `$1.23`). */
export function formatAgentCost(microcents: number): string {
  return formatPrice(microcents / 100_000_000)
}
