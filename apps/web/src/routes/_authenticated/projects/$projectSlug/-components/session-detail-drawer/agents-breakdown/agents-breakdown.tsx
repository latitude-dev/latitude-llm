import type { AgentGraph } from "@domain/spans"
import { DetailSection } from "@repo/ui"
import { BotIcon } from "lucide-react"
import { aggregateByAgentName, hasSubagents } from "./agent-breakdown-helpers.ts"
import { AgentSummaryRow } from "./agent-summary-row.tsx"

/**
 * The "Agents" breakdown: one row per agent name (the main agent plus each subagent),
 * with that agent's total cost, cumulative time, and run count aggregated across every
 * instance and trace. Renders nothing unless the graph actually has subagents.
 */
export function AgentsBreakdown({ graph }: { readonly graph: AgentGraph }) {
  if (!hasSubagents(graph)) return null

  const summaries = aggregateByAgentName(graph)

  return (
    <DetailSection icon={<BotIcon className="h-4 w-4" />} label="Agents" defaultOpen>
      {() => (
        <div className="flex flex-col">
          {summaries.map((summary) => (
            <AgentSummaryRow key={summary.label} summary={summary} />
          ))}
        </div>
      )}
    </DetailSection>
  )
}
