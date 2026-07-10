import type { AgentGraph, AgentNode } from "@domain/spans"
import { DetailSection, Text } from "@repo/ui"
import { BotIcon } from "lucide-react"
import { flattenAgentTree, hasSubagents, subtreeHasSubagents } from "./agent-breakdown-helpers.ts"
import { AgentNodeRow } from "./agent-node-row.tsx"

type AgentActions = {
  readonly onViewExecutionSpan?: ((ref: { traceId: string; spanId: string | null }) => void) | undefined
  readonly onSelectAgent?: ((node: AgentNode) => void) | undefined
}

function AgentTree({ root, ...actions }: { readonly root: AgentNode } & AgentActions) {
  return (
    <div className="flex flex-col">
      {flattenAgentTree(root).map((node) => (
        <AgentNodeRow key={node.id} node={node} {...actions} />
      ))}
    </div>
  )
}

/**
 * The "Agents" breakdown: the main agent and its subagents (recursively) with
 * per-agent cost/duration/generation counts. Renders nothing unless the graph
 * actually has subagents. The session variant groups each trace's tree under a
 * "Trace N" header; the trace variant renders its single tree.
 */
export function AgentsBreakdown({
  graph,
  variant,
  ...actions
}: { readonly graph: AgentGraph; readonly variant: "trace" | "session" } & AgentActions) {
  if (!hasSubagents(graph)) return null

  return (
    <DetailSection icon={<BotIcon className="h-4 w-4" />} label="Agents" defaultOpen>
      {() =>
        variant === "session" ? (
          <div className="flex flex-col gap-4">
            {graph.roots.map((root, index) =>
              subtreeHasSubagents(root) ? (
                <div key={root.id} className="flex flex-col gap-1">
                  <Text.H6B color="foregroundMuted" noWrap>
                    Trace {index + 1}
                  </Text.H6B>
                  <AgentTree root={root} {...actions} />
                </div>
              ) : null,
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {graph.roots.map((root) => (
              <AgentTree key={root.id} root={root} {...actions} />
            ))}
          </div>
        )
      }
    </DetailSection>
  )
}
