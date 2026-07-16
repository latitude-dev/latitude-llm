import type { AgentGraph, AgentNode } from "@domain/spans"
import type { SubagentToolCallInfo } from "@repo/ui"
import type { SubagentPreview } from "./use-subagent-previews.ts"

/**
 * Decorates the conversation tool calls that spawned a subagent, keyed by the
 * spawning tool-call id (the conversation matches against `part.id`). Derived
 * straight from the graph's `nodeByToolCallId`, so a session-wide graph
 * decorates tool calls from every trace in the accumulated conversation — not
 * just the latest one. OpenClaw's spawning tool_call is a different span than
 * the child's invoke_agent boundary, so it carries no `trigger.toolCallId` and
 * isn't inline-decorated (still reachable in the Agents section) — a known
 * limitation.
 *
 * The graph's `nodeByToolCallId` is trace-scoped, but the conversation matches
 * on the bare `part.id` with no trace context, so two subagents in different
 * traces that share a tool-call id can't be told apart here. Decorating either
 * would risk routing "open conversation" to the wrong subagent, so ambiguous
 * ids are left undecorated (still reachable via the Agents section).
 */
export function buildSubagentToolCalls({
  graph,
  onOpenConversation,
  previews,
}: {
  readonly graph: AgentGraph
  readonly onOpenConversation?: ((node: AgentNode) => void) | undefined
  readonly previews?: ReadonlyMap<string, SubagentPreview> | undefined
}): Map<string, SubagentToolCallInfo> {
  const out = new Map<string, SubagentToolCallInfo>()
  const ambiguous = new Set<string>()
  for (const node of graph.nodeByToolCallId.values()) {
    if (node.kind !== "subagent" || node.trigger.type !== "tool" || !node.trigger.toolCallId) continue
    const toolCallId = node.trigger.toolCallId
    if (ambiguous.has(toolCallId)) continue
    if (out.has(toolCallId)) {
      out.delete(toolCallId)
      ambiguous.add(toolCallId)
      continue
    }
    const preview = previews?.get(toolCallId)
    out.set(toolCallId, {
      label: node.label,
      ...(preview?.taskPreview ? { taskPreview: preview.taskPreview } : {}),
      ...(preview?.resultPreview ? { resultPreview: preview.resultPreview } : {}),
      ...(onOpenConversation ? { onOpenConversation: () => onOpenConversation(node) } : {}),
    })
  }
  return out
}
