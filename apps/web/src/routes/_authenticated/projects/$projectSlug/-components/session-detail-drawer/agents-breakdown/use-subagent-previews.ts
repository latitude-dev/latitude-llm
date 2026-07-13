import type { AgentGraph } from "@domain/spans"
import { useQueries } from "@tanstack/react-query"
import { useMemo } from "react"
import type { GenAIMessage } from "rosetta-ai"
import {
  projectScopeData,
  projectScopeKey,
  useProjectScope,
} from "../../../../../../../domains/projects/project-scope.tsx"
import {
  getSpanConversationChunk,
  type TraceConversationChunkRecord,
} from "../../../../../../../domains/traces/traces.functions.ts"

/** First page is enough to peek a subagent's opening request and its reply. */
const PREVIEW_LIMIT = 20

export interface SubagentPreview {
  readonly taskPreview?: string | undefined
  readonly resultPreview?: string | undefined
}

/** Concatenated text-part content of a message, empty when it carries no prose. */
function messageText(message: GenAIMessage): string {
  const parts = (message.parts ?? []) as ReadonlyArray<{ type?: string; content?: unknown }>
  return parts
    .filter((part) => part?.type === "text" && typeof part.content === "string")
    .map((part) => part.content as string)
    .join("\n")
    .trim()
}

/**
 * Fetches each subagent's own conversation (first page) so the inline card can
 * peek the inner input/output as readable text instead of the spawning tool
 * call's raw JSON. Keyed by the spawning tool-call id to line up with the
 * conversation's decoration map.
 */
export function useSubagentPreviews({
  projectId,
  graph,
}: {
  readonly projectId: string
  readonly graph: AgentGraph
}): ReadonlyMap<string, SubagentPreview> {
  const scope = useProjectScope()

  const nodes = useMemo(() => {
    const out: { toolCallId: string; traceId: string; spanId: string }[] = []
    for (const node of graph.nodeByToolCallId.values()) {
      if (node.kind !== "subagent" || node.trigger.type !== "tool" || !node.trigger.toolCallId) continue
      const spanId = node.representativeGenerationSpanId ?? node.ref.spanId
      if (!spanId) continue
      out.push({ toolCallId: node.trigger.toolCallId, traceId: node.ref.traceId, spanId })
    }
    return out
  }, [graph])

  const results = useQueries({
    queries: nodes.map((node) => ({
      queryKey: [...projectScopeKey(scope), "subagentPreview", projectId, node.traceId, node.spanId],
      queryFn: async () => {
        const chunk = (await getSpanConversationChunk({
          data: {
            ...projectScopeData(scope),
            projectId,
            traceId: node.traceId,
            spanId: node.spanId,
            offset: 0,
            limit: PREVIEW_LIMIT,
          },
        })) as TraceConversationChunkRecord
        return chunk.messages
      },
      enabled: projectId.length > 0 && node.traceId.length > 0 && node.spanId.length > 0,
      staleTime: 60_000,
    })),
  })

  const signature = results.map((r, i) => `${nodes[i]?.toolCallId ?? ""}:${r.data?.length ?? -1}`).join("|")

  // Recompute only when a preview's loaded message count changes (`signature`), not on every render.
  return useMemo(() => {
    const map = new Map<string, SubagentPreview>()
    nodes.forEach((node, index) => {
      const messages = results[index]?.data
      if (!messages || messages.length === 0) return
      const taskPreview = messages.map(messageText).find((text) => text.length > 0)
      const resultPreview = [...messages]
        .reverse()
        .map(messageText)
        .find((text) => text.length > 0)
      map.set(node.toolCallId, { taskPreview, resultPreview })
    })
    return map
  }, [signature])
}
