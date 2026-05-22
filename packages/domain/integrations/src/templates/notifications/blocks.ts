import type { ActionsBlock, HeaderBlock, KnownBlock, SectionBlock } from "@slack/web-api"

/**
 * Tiny block builders so the per-kind renderers stay focused on the
 * narrative bits (titles, summary copy, field labels) instead of the
 * Slack JSON boilerplate. The shape mirrors what `chat.postMessage`
 * accepts — passing the returned arrays straight through.
 */

export const header = (text: string): HeaderBlock => ({
  type: "header",
  text: { type: "plain_text", text: text.slice(0, 150), emoji: true },
})

export const sectionMarkdown = (text: string): SectionBlock => ({
  type: "section",
  text: { type: "mrkdwn", text },
})

export const sectionFields = (fields: ReadonlyArray<{ label: string; value: string }>): SectionBlock => ({
  type: "section",
  fields: fields.map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })),
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

/**
 * Stringify project + organization context line consistently across
 * renderers. Falls back to org-only when the project is gone.
 */
export const projectOrOrgContext = (
  organization: { readonly name: string },
  project: { readonly name: string } | null,
): string => (project ? `Project *${project.name}* · ${organization.name}` : `Org *${organization.name}*`)
