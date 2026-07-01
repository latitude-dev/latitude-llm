import { resolveAgentLabel } from "@domain/spans"
import { DetailSection, DetailSummary } from "@repo/ui"
import { BotIcon } from "lucide-react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

const SUBAGENT_DETAIL_KEYS = [
  ["Agent", "gen_ai.agent.name"],
  ["Subagent", "subagent.id"],
  ["Subagent type", "subagent.type"],
  ["OpenClaw label", "openclaw.subagent.label"],
  ["OpenClaw agent id", "openclaw.subagent.agent_id"],
  ["OpenClaw outcome", "openclaw.subagent.outcome"],
  ["OpenClaw reason", "openclaw.subagent.reason"],
  ["Interaction kind", "interaction.kind"],
] as const

export function SubagentSection({ span }: { readonly span: SpanDetailRecord }) {
  if (!span.isSubagent) return null

  const items = SUBAGENT_DETAIL_KEYS.flatMap(([label, key]) => {
    const value = span.attrString[key]?.trim()
    return value ? [{ label, value }] : []
  })

  const agentLabel = resolveAgentLabel(span.attrString)
  if (agentLabel && !items.some((item) => item.value === agentLabel)) {
    items.unshift({ label: "Agent", value: agentLabel })
  }

  if (items.length === 0) return null

  return (
    <DetailSection icon={<BotIcon className="w-4 h-4" />} label="Subagent">
      <DetailSummary items={items} />
    </DetailSection>
  )
}
