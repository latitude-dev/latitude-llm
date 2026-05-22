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

/**
 * Returns a Slack `image` block that renders the incident trend chart.
 * Slack fetches the URL async after posting, so the notification row
 * only needs to exist by the time Slack processes the image — which is
 * well after the create-notification workers have committed.
 *
 * Returns `null` when `notificationId` is absent (kinds that don't
 * write a bell-feed row, or a missing context value).
 */
export const trendChartBlock = (notificationId: string | null, webAppUrl: string): KnownBlock | null => {
  if (!notificationId) return null
  const base = webAppUrl.replace(/\/$/, "")
  const url = `${base}/api/notifications/${encodeURIComponent(notificationId)}/incident-trend.png`
  return {
    type: "image",
    image_url: url,
    alt_text: "Incident trend chart",
  } as KnownBlock
}

/**
 * Color constants for attachment bars.
 *
 * Severity colors map to a four-tier priority scale (low → critical) so
 * the bar communicates urgency — no emoji prefix needed. `resolved` is
 * always green (incident is over regardless of severity). `wrapped` is
 * Claude Code orange.
 */
export const COLORS = {
  // Severity tiers — used by incident renderers
  low: "#F2C94C", // yellow
  medium: "#F2994A", // orange
  high: "#E8534B", // red
  critical: "#C0392B", // dark red (reserved for future severity tier)
  // Lifecycle overrides
  resolved: "#27AE60", // green — incident recovered regardless of severity
  wrapped: "#E8700A", // orange — Claude Code brand
  announcement: "#2F80ED",
} as const

/**
 * Returns the severity bar color. Falls back to red for unknown values
 * so there's always a visible bar.
 */
export const severityColor = (severity: string): string => (COLORS as Record<string, string>)[severity] ?? COLORS.high
