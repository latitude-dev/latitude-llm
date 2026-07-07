import Mustache from "mustache"
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

const toMustacheView = (context: AgentDispatchContext): Record<string, unknown> => ({
  ...context,
  tags: context.tags?.join(", ") ?? "",
  sampleTraceIds: context.sampleTraceIds?.join(", ") ?? "",
})

const renderTemplate = (context: AgentDispatchContext, template: string): string =>
  Mustache.render(template, toMustacheView(context))

const renderDefaultPrompt = (context: AgentDispatchContext): string => {
  if (context.trigger === "monitor.incident" && context.monitor) {
    const lines: string[] = [
      `A Latitude monitor fired in project "${context.projectName}".`,
      "",
      `Monitor: ${context.monitor.name}   ID: ${context.monitor.id}`,
    ]
    if (context.monitor.ruleSummary) lines.push(`Rule: ${context.monitor.ruleSummary}`)
    if (context.incident) {
      lines.push(`Incident: ${context.incident.id}`)
      if (context.incident.severity.trim().length > 0) lines.push(`Severity: ${context.incident.severity}`)
    }
    lines.push(`Latitude: ${context.deepLinkUrl}`)
    lines.push(
      "",
      "Before investigating, verify that the Latitude MCP server is installed and available in your environment. If it is not available, stop and ask the user to install or enable it before continuing.",
      "",
      "Using the Latitude MCP, investigate the monitor firing before changing code.",
      "",
      "Use the incident time and monitor rule as the investigation anchor. Look at a bounded window around the firing time, compare it with the preceding healthy period, and correlate the matching traces, spans, sessions, errors, tools, models, users, tags, and recent code or configuration changes. Check whether the breach points to an application bug, instrumentation issue, expected traffic change, data-quality problem, or a monitor threshold/configuration issue.",
      "",
      "If you determine a concrete root cause in this repository, implement the smallest correct fix, add or update a regression test when applicable, and open a PR that explains the evidence, root cause, and fix.",
      "",
      "If you cannot determine a concrete repo-level root cause, do not make speculative code changes and do not open a PR. Instead, return a concise investigation summary with the evidence reviewed, the best-supported explanation, remaining hypotheses, and the next data needed to confirm the cause.",
      "",
      "Do not mute or resolve the monitor. A human will verify after deploy.",
    )
    return lines.join("\n")
  }

  const lines: string[] = [`A Latitude signal needs investigation in project "${context.projectName}".`, ""]

  if (context.signal) {
    lines.push(`Signal: ${context.signal.name} (${context.signal.source})   ID: ${context.signal.id}`)
    if (context.signal.priority) lines.push(`Priority: ${context.signal.priority}`)
  }

  if (context.incident) {
    lines.push(`Incident: ${context.incident.id}`)
    if (context.incident.severity.trim().length > 0) lines.push(`Severity: ${context.incident.severity}`)
  }

  if (context.metrics) {
    const baseline =
      context.metrics.baselinePerHour === null ? "no baseline" : `baseline ~${context.metrics.baselinePerHour}/h`
    lines.push(`Trend: ${context.metrics.occurrences} occurrences in ${context.metrics.windowHours}h (${baseline})`)
  }

  if (context.sampleExcerpt) lines.push(`Sample feedback: "${context.sampleExcerpt}"`)
  if (context.tags && context.tags.length > 0) lines.push(`Tags: ${context.tags.join(", ")}`)
  lines.push(`Latitude: ${context.deepLinkUrl}`)

  if (context.sampleTraceIds && context.sampleTraceIds.length > 0) {
    lines.push("", `Sample trace IDs: ${context.sampleTraceIds.join(", ")}`)
  }

  if (context.sampleConversations && context.sampleConversations.length > 0) {
    lines.push("", "Sample conversation excerpts:")
    for (const [index, example] of context.sampleConversations.entries()) {
      lines.push("", `Example ${index + 1} — trace ${example.traceId}`)
      if (example.scoreFeedback) lines.push(`Score feedback: ${example.scoreFeedback}`)
      lines.push("```text", example.excerpt, "```")
    }
  }

  lines.push(
    "",
    "If Latitude MCP tools are available in your environment, use them to inspect the signal and additional member traces. If they are not available, use the Latitude URL, trace IDs, and excerpts above as your starting evidence.",
    "",
    "Identify the most likely root cause in this repository, implement the smallest correct fix, add a regression test if applicable, and open a PR describing the signal and the fix.",
    "",
    "Do not mute or resolve the signal — a human verifies after deploy.",
  )

  return lines.join("\n")
}

export const renderDispatchPrompt = (input: {
  readonly context: AgentDispatchContext
  readonly template?: string | null
}): string => {
  if (input.template !== undefined && input.template !== null) return renderTemplate(input.context, input.template)
  return renderDefaultPrompt(input.context)
}

export const defaultDispatchPromptTemplate = DEFAULT_PROMPT_TEMPLATE
