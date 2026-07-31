import { ClaudeCodeIcon, CursorIcon, GithubIcon, LinearIcon, SlackIcon } from "@repo/ui"
import { type LucideProps, Webhook } from "lucide-react"
import type { ComponentType } from "react"
import type { AgentDispatchKindKey } from "../agent-dispatch/agent-dispatch-kinds.ts"

export type IntegrationKey = "slack" | "github" | AgentDispatchKindKey

export interface IntegrationCatalogEntry {
  readonly key: IntegrationKey
  readonly label: string
  readonly icon: ComponentType<LucideProps>
  /** One line of what it gets you, shown on the tile of an unconnected integration. */
  readonly summary: string
}

export const INTEGRATION_CATALOG: readonly IntegrationCatalogEntry[] = [
  {
    key: "slack",
    label: "Slack",
    icon: SlackIcon,
    summary: "Send Latitude notifications to your Slack workspace.",
  },
  {
    key: "github",
    label: "GitHub",
    icon: GithubIcon,
    summary: "Auto-resolve signals when a related PR or commit is merged.",
  },
  {
    key: "cursor",
    label: "Cursor",
    icon: CursorIcon,
    summary: "Cursor agents react to Latitude signals and monitors, then push fixes to your code.",
  },
  {
    key: "claude_code",
    label: "Claude Code",
    icon: ClaudeCodeIcon,
    summary: "Claude Code routines react to Latitude signals and monitors, then push fixes to your code.",
  },
  {
    key: "linear",
    label: "Linear",
    icon: LinearIcon,
    summary: "Create Linear issues for signals that need follow-up.",
  },
  {
    key: "webhook",
    label: "Webhook",
    icon: Webhook,
    summary: "Send integration events to your own endpoint.",
  },
]

export const integrationEntry = (key: IntegrationKey): IntegrationCatalogEntry => {
  const entry = INTEGRATION_CATALOG.find((row) => row.key === key)
  if (!entry) throw new Error(`Unknown integration: ${key}`)
  return entry
}

/**
 * A connected integration, flattened from its own server function so the list can
 * rank and render all six the same way.
 */
export interface ConnectedIntegration {
  readonly entry: IntegrationCatalogEntry
  /** The account that makes it real — workspace, org login, or vendor account. */
  readonly identity: string
  readonly detail: string
  readonly needsAttention: boolean
  readonly attentionLabel?: string | undefined
}

/** Broken first so problems surface without visiting every detail page, then alphabetical for stable muscle memory. */
export const sortConnectedIntegrations = (rows: readonly ConnectedIntegration[]): ConnectedIntegration[] =>
  [...rows].sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1
    return a.entry.label.localeCompare(b.entry.label)
  })
