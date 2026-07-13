import type { AgentGraph, AgentNode } from "@domain/spans"
import type { SubagentToolCallInfo } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { formatAgentCost } from "./agent-breakdown-helpers.ts"

/**
 * Decorates the conversation tool calls that spawned a subagent, keyed by the
 * spawning tool-call id (the conversation matches against `part.id`). Derived
 * straight from the graph's `nodeByToolCallId`, so a session-wide graph
 * decorates tool calls from every trace in the accumulated conversation — not
 * just the latest one. OpenClaw's spawning tool_call is a different span than
 * the child's invoke_agent boundary, so it carries no `trigger.toolCallId` and
 * isn't inline-decorated (still reachable in the Agents section) — a known
 * limitation.
 */
export function buildSubagentToolCalls({
  graph,
  onOpenConversation,
}: {
  readonly graph: AgentGraph
  readonly onOpenConversation?: ((node: AgentNode) => void) | undefined
}): Map<string, SubagentToolCallInfo> {
  const out = new Map<string, SubagentToolCallInfo>()
  for (const node of graph.nodeByToolCallId.values()) {
    if (node.kind !== "subagent" || node.trigger.type !== "tool" || !node.trigger.toolCallId) continue
    out.set(node.trigger.toolCallId, {
      label: node.label,
      model: node.models[0],
      statsLabel: `${formatAgentCost(node.total.costMicrocents)} · ${formatCount(node.ownGenerationCount)} gen`,
      ...(onOpenConversation ? { onOpenConversation: () => onOpenConversation(node) } : {}),
    })
  }
  return out
}
