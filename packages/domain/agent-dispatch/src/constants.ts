export const AGENT_DISPATCH_FLAG = "agent-dispatch" as const

export const AGENT_DISPATCH_KINDS = ["cursor", "claude_code", "linear", "webhook"] as const

export const AGENT_DISPATCH_TRIGGERS = ["incident.opened", "signal.discovered", "monitor.incident"] as const

export const DEFAULT_MAX_DISPATCHES_PER_DAY = 10

export const DEFAULT_COOLDOWN_MINUTES = 60

export const SAMPLE_EXCERPT_MAX_CHARS = 200

export const SAMPLE_TRACE_IDS_LIMIT = 5
