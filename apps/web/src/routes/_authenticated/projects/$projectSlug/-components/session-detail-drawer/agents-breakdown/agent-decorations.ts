import type { AgentGraph, AgentNode, ConversationSpanRef } from "@domain/spans"
import type { SubagentToolCallInfo } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { formatAgentCost } from "./agent-breakdown-helpers.ts"

/**
 * Intersects a conversation's tool-call → span map with the agent graph to
 * decorate the tool calls that spawned a subagent. Only decorates a tool call
 * when its execute span *is* the subagent's boundary (the Vercel collapse
 * case); OpenClaw's spawning tool_call is a different span than the child's
 * invoke_agent boundary, so those aren't inline-decorated (still in the Agents
 * section) — a known limitation.
 */
export function buildSubagentToolCalls({
  graph,
  toolCallSpanMap,
  onOpenConversation,
}: {
  readonly graph: AgentGraph
  readonly toolCallSpanMap: Readonly<Record<string, ConversationSpanRef>>
  readonly onOpenConversation?: ((node: AgentNode) => void) | undefined
}): Map<string, SubagentToolCallInfo> {
  const out = new Map<string, SubagentToolCallInfo>()
  for (const [toolCallId, ref] of Object.entries(toolCallSpanMap)) {
    const node = graph.nodeByToolCallId.get(toolCallId) ?? graph.nodeForSpanId.get(ref.spanId)
    if (!node || node.kind !== "subagent" || node.ref.spanId !== ref.spanId) continue
    out.set(toolCallId, {
      label: node.label,
      model: node.models[0],
      statsLabel: `${formatAgentCost(node.total.costMicrocents)} · ${formatCount(node.ownGenerationCount)} gen`,
      ...(onOpenConversation ? { onOpenConversation: () => onOpenConversation(node) } : {}),
    })
  }
  return out
}
