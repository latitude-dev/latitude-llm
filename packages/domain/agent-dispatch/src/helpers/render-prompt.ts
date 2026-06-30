import type { AgentDispatchContext } from "../entities/agent-dispatch-context.ts"

const DEFAULT_PROMPT_TEMPLATE = `A Latitude signal has escalated in project "{{projectName}}".

Signal: {{signal.name}} ({{signal.source}})   ID: {{signal.id}}
Incident: {{incident.id}}   Severity: {{incident.severity}}
Trend: {{metrics.occurrences}} occurrences in {{metrics.windowHours}}h (baseline ~{{metrics.baselinePerHour}}/h)
Sample feedback: "{{sampleExcerpt}}"
Tags: {{tags}}
Latitude: {{deepLinkUrl}}

Use your Latitude MCP tools (getSignal, listSignalTraces, getTrace) to inspect this
signal and a few of its member traces ({{sampleTraceIds}}). Identify the most likely
root cause in this repository, implement the smallest correct fix, add a regression
test if applicable, and open a PR describing the signal and the fix.

Do not mute or resolve the signal — a human verifies after deploy.`

const getPath = (obj: Record<string, unknown>, path: string): unknown => {
  const parts = path.split(".")
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

const renderPlaceholder = (context: AgentDispatchContext, key: string): string => {
  const value = getPath(context as unknown as Record<string, unknown>, key)
  if (value === undefined || value === null) return ""
  if (Array.isArray(value)) return value.join(", ")
  return String(value)
}

export const renderDispatchPrompt = (input: {
  readonly context: AgentDispatchContext
  readonly template?: string | null
}): string => {
  const template = input.template ?? DEFAULT_PROMPT_TEMPLATE
  let result = ""
  let index = 0
  while (index < template.length) {
    const start = template.indexOf("{{", index)
    if (start === -1) {
      result += template.slice(index)
      break
    }
    result += template.slice(index, start)
    const end = template.indexOf("}}", start + 2)
    if (end === -1) {
      result += template.slice(start)
      break
    }
    const key = template.slice(start + 2, end).trim()
    result += renderPlaceholder(input.context, key)
    index = end + 2
  }
  return result
}

export const defaultDispatchPromptTemplate = DEFAULT_PROMPT_TEMPLATE
