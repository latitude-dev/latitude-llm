export interface SpanLabelInput {
  readonly name: string
  readonly operation: string
  readonly attrString?: Readonly<Record<string, string>>
  readonly parentOperation?: string
}

const AGENT_LABEL_ATTR_KEYS = [
  "gen_ai.agent.name",
  "openclaw.subagent.label",
  "subagent.id",
  "openclaw.subagent.agent_id",
  "subagent.type",
] as const

export function resolveAgentLabel(attrString: Readonly<Record<string, string>> | undefined): string | undefined {
  if (!attrString) return undefined
  for (const key of AGENT_LABEL_ATTR_KEYS) {
    const value = attrString[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function isSubagentSpan(input: SpanLabelInput): boolean {
  if (input.operation === "create_agent") return true
  if (input.name === "subagent") return true
  if (input.attrString?.["interaction.kind"] === "subagent") return true
  if (input.operation === "invoke_agent" && input.parentOperation === "execute_tool") return true
  return false
}

export function formatSpanDisplayLabel(input: SpanLabelInput): string {
  const base = input.name.trim() || input.operation
  const agentLabel = resolveAgentLabel(input.attrString)
  if (!agentLabel || base.includes(agentLabel)) return base
  if (isSubagentSpan(input) || input.operation === "invoke_agent" || input.operation === "create_agent") {
    return `${base} · ${agentLabel}`
  }
  return base
}

export function resolveSpanLabels(
  spans: readonly {
    readonly spanId: string
    readonly parentSpanId: string
    readonly name: string
    readonly operation: string
    readonly attrString: Readonly<Record<string, string>>
  }[],
): ReadonlyMap<string, { readonly displayLabel: string; readonly isSubagent: boolean }> {
  const byId = new Map(spans.map((span) => [span.spanId, span]))
  const labels = new Map<string, { displayLabel: string; isSubagent: boolean }>()

  for (const span of spans) {
    const parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined
    const input: SpanLabelInput = {
      name: span.name,
      operation: span.operation,
      attrString: span.attrString,
      ...(parent ? { parentOperation: parent.operation } : {}),
    }
    labels.set(span.spanId, {
      displayLabel: formatSpanDisplayLabel(input),
      isSubagent: isSubagentSpan(input),
    })
  }

  return labels
}
