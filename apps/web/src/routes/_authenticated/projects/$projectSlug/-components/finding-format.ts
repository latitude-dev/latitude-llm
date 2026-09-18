const FINDING_LABELS: Readonly<Record<string, string>> = {
  "cost.recoverable_spend_share": "Model spend on avoidable work",
  "cost.cache_gap": "Reusable model input not cached",
  "context.redundant_input_share": "Repeated model input",
  "context.avoidable_pressure": "Context window used by repeated input",
  "tools.dead_surface": "Unused tool definitions",
  "tools.repeated_call": "Repeated tool calls",
  "tools.thrashing": "Tool-call loops",
  "tools.structural_defect": "Malformed tool calls that needed recovery",
  "tools.call_failed": "Failed tool calls",
  "memory.repeated_zero_hit": "Repeated empty memory searches",
  "memory.noop_rewrite": "Memory writes with no changes",
  "memory.reverted_write": "Memory changes later undone",
  "recovery.recovered_incident_rate": "Sessions that recovered from errors",
  "latency:ttft+throughput": "Slow initial response and generation",
  "latency:ttft": "Slow initial response",
  "latency:throughput": "Slow response generation",
  "recovered:toolFailure": "Time spent recovering from tool failures",
  "recovered:providerError": "Time spent recovering from provider errors",
  "recovered:outputDamage": "Time spent recovering from malformed output",
  "recovered:finishFailure": "Time spent recovering from incomplete output",
  "sessions.task_success": "Task outcome",
  "sessions.usable_completion": "Completion",
  "sessions.no_output": "No output",
  "spans.provider_error": "Provider errors",
  noOutput: "No output",
  outputDamage: "Malformed output",
  finishFailure: "Incomplete output",
  toolFailure: "Tool failure",
  toolStructuralDefect: "Malformed tool call",
  providerError: "Provider error",
  "pii leakage": "Personal information exposed",
  jailbreaking: "Safety rules bypassed",
}

const FINDING_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "cost.recoverable_spend_share": "The agent spent money on work that was not needed to produce the result.",
  "cost.cache_gap": "Reusable model input was sent again instead of being served from the provider's cache.",
  "context.redundant_input_share": "The model received input tokens that repeated information it already had.",
  "context.avoidable_pressure": "Repeated input used space in the model's context window that other work could need.",
  "tools.dead_surface": "Tool definitions were sent to the model but were never used during these sessions.",
  "tools.repeated_call": "The agent repeated tool calls that did not add new information or progress.",
  "tools.thrashing": "The agent cycled through tool calls without making useful progress.",
  "tools.structural_defect": "The agent had to recover after producing a malformed or invalid tool call.",
  "tools.call_failed": "A tool call returned an error instead of the result the agent needed.",
  "memory.repeated_zero_hit": "The agent repeatedly searched memory without finding any relevant results.",
  "memory.noop_rewrite": "The agent wrote to memory without changing the stored information.",
  "memory.reverted_write": "The agent changed stored information and later undid that change in the same session.",
  "recovery.recovered_incident_rate": "The agent completed the session after an error, but recovery added extra work.",
  "latency:ttft+throughput":
    "The agent took longer than expected both to begin responding and to generate the rest of its response.",
  "latency:ttft": "The agent took longer than expected to begin streaming its response.",
  "latency:throughput": "After responding began, the remaining output was generated more slowly than expected.",
  "recovered:toolfailure":
    "The agent recovered from a failed tool call, but the retry added avoidable time to the critical path.",
  "recovered:providererror":
    "The agent recovered from a model provider error, but the retry added avoidable time to the critical path.",
  "recovered:outputdamage":
    "The agent recovered from malformed model output, but doing so added avoidable time to the critical path.",
  "recovered:finishfailure":
    "The agent recovered after a response ended incorrectly, but doing so added avoidable time to the critical path.",
  "sessions.no_output": "The agent completed the session without producing a usable response.",
  "spans.provider_error": "The model provider returned an error while the agent was working.",
  nooutput: "The session ended without a usable response.",
  outputdamage: "The model returned malformed output that the agent could not use as intended.",
  finishfailure: "The model response ended before producing a complete, usable result.",
  toolfailure: "A tool call failed and the agent did not recover before the session ended.",
  toolstructuraldefect: "The agent produced a malformed or invalid tool call that prevented completion.",
  providererror: "The model provider returned an error and the session did not recover.",
  "issue:safety:piidisclosure":
    "The agent exposed personal data in its output that the user did not provide or was not meant to receive.",
  "issue:safety:piiexposure":
    "Personal data reached the agent through the conversation or a tool result, but the agent did not disclose it.",
  "issue:safety:injectioncompliance":
    "The agent followed instructions from untrusted content that attempted to override its rules.",
  "issue:safety:injectionattempt":
    "Untrusted content attempted to override the agent's rules, with no evidence that the agent followed it.",
  "issue:safety:injectiondefense":
    "Untrusted content attempted to override the agent's rules, and the agent resisted the attempt.",
  "pii leakage":
    "The agent exposed personal data in its output that the user did not provide or was not meant to receive.",
  jailbreaking: "Content attempted to make the agent bypass its system or safety rules.",
}

export const findingLabel = (value: string): string => {
  const mapped = FINDING_LABELS[value] ?? FINDING_LABELS[value.trim().toLowerCase()]
  if (mapped) return mapped
  if (/\s/.test(value)) return value
  const identifier = value.split(".").at(-1) ?? value
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_:+.]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (character) => character.toUpperCase())
}

export const findingDescription = (value: string): string | undefined =>
  FINDING_DESCRIPTIONS[value.trim().toLowerCase()]

export const formatCompactCount = (value: number): string => {
  const absolute = Math.abs(value)
  const scale =
    absolute >= 1_000_000_000
      ? { divisor: 1_000_000_000, suffix: "B" }
      : absolute >= 1_000_000
        ? { divisor: 1_000_000, suffix: "M" }
        : absolute >= 1_000
          ? { divisor: 1_000, suffix: "k" }
          : null
  if (!scale) return String(Math.round(value))
  return `${(value / scale.divisor).toFixed(1)}${scale.suffix}`
}
