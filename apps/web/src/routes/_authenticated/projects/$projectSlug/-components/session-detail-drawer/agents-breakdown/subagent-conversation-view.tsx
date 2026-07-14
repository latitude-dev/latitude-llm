import { type AgentNode, agentGraphSpanKey } from "@domain/spans"
import { Button, Conversation, Icon, Text } from "@repo/ui"
import { ChevronLeftIcon } from "lucide-react"
import { useMemo } from "react"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"
import { useSpanConversationMessages } from "../../../../../../../domains/traces/traces.collection.ts"
import { AgentBreadcrumb } from "./agent-breadcrumb.tsx"
import { buildSubagentToolCalls } from "./agent-decorations.ts"
import { useAgentGraph } from "./use-agent-graph.ts"
import { useSubagentPreviews } from "./use-subagent-previews.ts"

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
  // Agent nesting is trace-local, so a subagent's own subtree lives entirely in its trace.
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

  const subagentPreviews = useSubagentPreviews({ projectId, graph })
  const subagentToolCalls = useMemo(
    () => buildSubagentToolCalls({ graph, onOpenConversation: onSelectAgent, previews: subagentPreviews }),
    [graph, onSelectAgent, subagentPreviews],
  )
  const subagentToolCallsProp = subagentToolCalls.size > 0 ? subagentToolCalls : undefined

  if (!node || node.kind !== "subagent") {
    return (
      <div className="flex flex-1 flex-col">
        <button
          type="button"
          onClick={() => onSelectAgent(null)}
          className="flex w-full shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2 text-left transition-colors hover:bg-muted cursor-pointer"
        >
          <div className="flex h-8 items-center gap-2">
            <Icon icon={ChevronLeftIcon} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Back to conversation</Text.H6>
          </div>
        </button>
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
