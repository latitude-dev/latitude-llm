import type { ActionsBlock, HeaderBlock, KnownBlock, SectionBlock } from "@slack/web-api"

export const header = (text: string): HeaderBlock => ({
  type: "header",
  text: { type: "plain_text", text: text.slice(0, 150), emoji: true },
})

export const sectionMarkdown = (text: string): SectionBlock => ({
  type: "section",
  text: { type: "mrkdwn", text },
})

export const actionsLink = (label: string, url: string): ActionsBlock => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: label.slice(0, 75), emoji: true },
      url,
      action_id: "open_in_latitude",
    },
  ],
})

export const contextLine = (text: string): KnownBlock => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
})

export const projectOrOrgContext = (
  organization: { readonly name: string },
  project: { readonly name: string } | null,
): string => (project ? `Project *${project.name}* · ${organization.name}` : `Org *${organization.name}*`)

const SEVERITY_EMOJI: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
}

/**
 * Returns a colored circle emoji for the given severity string.
 * Falls back to ⚪ for unknown values.
 */
export const severityEmoji = (severity: string): string => SEVERITY_EMOJI[severity] ?? "⚪"

/** Color constants for attachment bars. */
export const COLORS = {
  newIssue: "#E8534B",
  regressed: "#F2994A",
  escalating: "#F2C94C",
  resolved: "#27AE60",
  wrapped: "#9B51E0",
  announcement: "#2F80ED",
} as const
