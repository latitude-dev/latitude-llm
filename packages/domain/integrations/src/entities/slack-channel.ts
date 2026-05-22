import { z } from "zod"

/**
 * UI-facing projection of a Slack channel returned by `conversations.list`.
 * Used by the routes-picker in the integrations settings page to render
 * options. Private channels only appear when the bot is already a member
 * (Slack's `groups:read` scope behaviour) — when none of a workspace's
 * private channels show up, the UI invites the user to add the bot to
 * the channel first.
 */
export const slackChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isPrivate: z.boolean(),
  isMember: z.boolean(),
  isArchived: z.boolean(),
})

export type SlackChannel = z.infer<typeof slackChannelSchema>
