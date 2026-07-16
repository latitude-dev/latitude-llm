import { type AgentGraph, buildAgentGraph } from "@domain/spans"
import { useMemo } from "react"
import type { SpanRecord } from "../../../../../../../domains/spans/spans.functions.ts"

/**
 * Derives the agent graph from spans the caller already loaded (the Spans tab
 * and the details tabs share one cached collection, so this adds no fetch).
 * `SpanRecord` structurally satisfies `AgentGraphSpanInput`.
 */
export function useAgentGraph(spans: readonly SpanRecord[] | undefined): AgentGraph {
  return useMemo(() => buildAgentGraph({ spans: spans ?? [] }), [spans])
}
