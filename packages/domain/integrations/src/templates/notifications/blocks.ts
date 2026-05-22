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

/**
 * Returns a Slack `image` block that renders the incident trend chart.
 * Slack fetches the URL async after posting, so the notification row
 * only needs to exist by the time Slack processes the image — which is
 * well after the create-notification workers have committed.
 *
 * Returns `null` when `notificationId` is absent (kinds that don't
 * write a bell-feed row, or a missing context value).
 */
export const trendChartBlock = (
  notificationId: string | null,
  webAppUrl: string,
): KnownBlock | null => {
  if (!notificationId) return null
  const base = webAppUrl.replace(/\/$/, "")
  const url = `${base}/api/notifications/${encodeURIComponent(notificationId)}/incident-trend.png`
  return {
    type: "image",
    image_url: url,
    alt_text: "Incident trend chart",
  } as KnownBlock
}

/** Color constants for attachment bars. */
export const COLORS = {
  newIssue: "#E8534B",
  regressed: "#F2994A",
  escalating: "#F2C94C",
  resolved: "#27AE60",
  wrapped: "#9B51E0",
  announcement: "#2F80ED",
} as const
