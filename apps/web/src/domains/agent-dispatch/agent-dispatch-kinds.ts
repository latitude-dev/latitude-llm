import { ClaudeCodeIcon, CursorIcon, LinearIcon } from "@repo/ui"
import { Webhook } from "lucide-react"

export const AGENT_DISPATCH_KIND_LABELS = {
  cursor: "Cursor",
  claude_code: "Claude Code",
  linear: "Linear",
  webhook: "Webhook",
} as const

export type AgentDispatchKindKey = keyof typeof AGENT_DISPATCH_KIND_LABELS

export const isAgentDispatchKind = (kind: string): kind is AgentDispatchKindKey => kind in AGENT_DISPATCH_KIND_LABELS

export const AGENT_DISPATCH_KIND_ICONS = {
  cursor: CursorIcon,
  claude_code: ClaudeCodeIcon,
  linear: LinearIcon,
  webhook: Webhook,
} as const
