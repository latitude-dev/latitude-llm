import { type AgentNode, agentGraphSpanKey } from "@domain/spans"
import { Button, Conversation, Skeleton, Text } from "@repo/ui"
import { useMemo } from "react"
import {
  useConversationSpanMaps,
  useSpansByTraceCollection,
} from "../../../../../../../domains/spans/spans.collection.ts"
import { useSpanConversationMessages } from "../../../../../../../domains/traces/traces.collection.ts"
import { buildSubagentToolCalls } from "./agent-decorations.ts"
import { useAgentGraph } from "./use-agent-graph.ts"
import { useSubagentPreviews } from "./use-subagent-previews.ts"

/**
 * Renders one selected subagent's conversation in place of the main one,
 * drilled into from its `SubagentCard`. Owns its own graph + decorations
 * from its trace's spans, so nested subagents decorate and drill identically
 * at every depth — `onOpenAgent` reports further drill-downs up to the
 * caller, which is responsible for the breadcrumb trail.
 */
export function SubagentConversationView({
  projectId,
  agentTraceId,
  agentSpanId,
  onOpenAgent,
  navigateToSpan,
}: {
  readonly projectId: string
  readonly agentTraceId: string
  readonly agentSpanId: string
  readonly onOpenAgent: (node: AgentNode) => void
  readonly navigateToSpan?: ((spanId: string, traceId?: string) => void) | undefined
}) {
  const { data: spans } = useSpansByTraceCollection({ projectId, traceId: agentTraceId })
  const graph = useAgentGraph(spans)
  const node = graph.nodeForSpanId.get(agentGraphSpanKey(agentTraceId, agentSpanId))
  const conversationSpanId = node?.representativeGenerationSpanId ?? agentSpanId

  const conversation = useSpanConversationMessages({
    projectId,
    traceId: agentTraceId,
    spanId: conversationSpanId,
    enabled: node?.kind === "subagent",
  })

  const { data: navSpanMaps } = useConversationSpanMaps({
    projectId,
    traceId: agentTraceId,
    startTime: node ? new Date(node.startTime).toISOString() : undefined,
    allMessages: conversation.messages,
    enabled: navigateToSpan !== undefined && conversation.messages.length > 0,
  })

  const messageActions = useMemo(() => {
    if (!navigateToSpan || !navSpanMaps || Object.keys(navSpanMaps.messageSpanMap).length === 0) return undefined
    return new Map(
      Object.entries(navSpanMaps.messageSpanMap).map(([idx, ref]) => [
        Number(idx),
        () => navigateToSpan(ref.spanId, ref.traceId),
      ]),
    )
  }, [navigateToSpan, navSpanMaps])

  const toolCallActions = useMemo(() => {
    if (!navigateToSpan || !navSpanMaps || Object.keys(navSpanMaps.toolCallSpanMap).length === 0) return undefined
    return new Map(
      Object.entries(navSpanMaps.toolCallSpanMap).map(([toolCallId, ref]) => [
        toolCallId,
        () => navigateToSpan(ref.spanId, ref.traceId),
      ]),
    )
  }, [navigateToSpan, navSpanMaps])

  const subagentPreviews = useSubagentPreviews({ projectId, graph })
  const subagentToolCalls = useMemo(
    () =>
      buildSubagentToolCalls({
        graph,
        previews: subagentPreviews,
        onOpenConversation: onOpenAgent,
        excludeNodeId: node?.id,
      }),
    [graph, subagentPreviews, onOpenAgent, node?.id],
  )
  const subagentToolCallsProp = subagentToolCalls.size > 0 ? subagentToolCalls : undefined

  if (!node || node.kind !== "subagent") {
    return (
      <div className="flex flex-1 items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">Agent not found</Text.H5>
      </div>
    )
  }

  if (conversation.isLoading) {
    return (
      <div className="flex flex-col gap-4 px-4 py-8">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-8">
      <Conversation
        messages={conversation.messages}
        {...(subagentToolCallsProp ? { subagentToolCalls: subagentToolCallsProp } : {})}
        {...(messageActions ? { messageActions } : {})}
        {...(toolCallActions ? { toolCallActions } : {})}
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
  )
}
