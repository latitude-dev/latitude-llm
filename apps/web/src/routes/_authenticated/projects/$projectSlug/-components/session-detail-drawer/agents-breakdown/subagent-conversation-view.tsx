import type { AgentNode } from "@domain/spans"
import { Button, Conversation, Text } from "@repo/ui"
import { useMemo } from "react"
import {
  useConversationSpanMaps,
  useSpansByTraceCollection,
} from "../../../../../../../domains/spans/spans.collection.ts"
import { useSpanConversationMessages } from "../../../../../../../domains/traces/traces.collection.ts"
import { AgentBreadcrumb } from "./agent-breadcrumb.tsx"
import { buildSubagentToolCalls } from "./agent-decorations.ts"
import { useAgentGraph } from "./use-agent-graph.ts"

/**
 * Renders one selected subagent's conversation in place of the main one. Owns
 * its own graph + decorations from its trace's spans, so nested subagents
 * decorate and drill identically at every depth. `onSelectAgent(null)` returns
 * to the main conversation (also bound to Escape).
 */
export function SubagentConversationView({
  projectId,
  agentTraceId,
  agentSpanId,
  onSelectAgent,
}: {
  readonly projectId: string
  readonly agentTraceId: string
  readonly agentSpanId: string
  readonly onSelectAgent: (node: AgentNode | null) => void
}) {
  const { data: spans } = useSpansByTraceCollection({ projectId, traceId: agentTraceId })
  const graph = useAgentGraph(spans)
  const node = graph.nodeForSpanId.get(agentSpanId)
  const traceStartTime = graph.roots[0] ? new Date(graph.roots[0].startTime).toISOString() : undefined
  const conversationSpanId = node?.representativeGenerationSpanId ?? agentSpanId

  const conversation = useSpanConversationMessages({
    projectId,
    traceId: agentTraceId,
    spanId: conversationSpanId,
    enabled: node?.kind === "subagent",
  })

  const { data: spanMaps } = useConversationSpanMaps({
    projectId,
    traceId: agentTraceId,
    startTime: traceStartTime,
    allMessages: conversation.messages,
    enabled: conversation.messages.length > 0,
  })

  const subagentToolCalls = useMemo(
    () =>
      spanMaps
        ? buildSubagentToolCalls({
            graph,
            toolCallSpanMap: spanMaps.toolCallSpanMap,
            onOpenConversation: onSelectAgent,
          })
        : undefined,
    [graph, spanMaps, onSelectAgent],
  )
  const subagentToolCallsProp = subagentToolCalls && subagentToolCalls.size > 0 ? subagentToolCalls : undefined

  if (!node || node.kind !== "subagent") {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelectAgent(null)}>
            Back to conversation
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Text.H5 color="foregroundMuted">Agent not found</Text.H5>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AgentBreadcrumb node={node} graph={graph} onSelect={onSelectAgent} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        <Conversation
          messages={conversation.messages}
          {...(subagentToolCallsProp ? { subagentToolCalls: subagentToolCallsProp } : {})}
        />
        {conversation.hasNextPage && (
          <div className="flex flex-col items-center py-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={conversation.isFetchingNextPage}
              onClick={() => conversation.fetchNextPage()}
            >
              {conversation.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
