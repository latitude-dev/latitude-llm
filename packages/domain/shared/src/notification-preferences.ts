import { z } from "zod"
import { alertSeveritySchema } from "./alert-incident-kinds.ts"

/**
 * User-visible groupings. The preferences UI surfaces one toggle per group;
 * adding a new kind to an existing group inherits the user's current
 * setting automatically. Adding a new group = a new toggle for users.
 *
 * Lives in `@domain/shared` (not `@domain/notifications`) so the user
 * entity can carry typed preferences without introducing a circular
 * package dep with `@domain/notifications`.
 */
export const NOTIFICATION_GROUPS = [
  "incidents",
  "wrapped_reports",
  "custom_messages",
  "personal",
  "destinations",
] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]
export const notificationGroupSchema = z.enum(NOTIFICATION_GROUPS)

export const NOTIFICATION_GROUP_META: Record<
  NotificationGroup,
  {
    readonly label: string
    readonly description: string
    /**
     * Whether the group can be routed to org-level Slack channels. Personal
     * kinds target one specific user, so broadcasting them to a shared
     * channel is never right — non-routable groups are hidden from the
     * Slack routes settings, rejected by the route-config server fns, and
     * skipped by the worker's Slack fan-out.
     */
    readonly slackRoutable: boolean
  }
> = {
  personal: {
    label: "Assigned to you",
    description: "Notifications addressed directly to you, like being assigned to an issue.",
    slackRoutable: false,
  },
  incidents: {
    label: "Monitors",
    description: "Get notified when one of your monitors fires.",
    slackRoutable: true,
  },
  wrapped_reports: {
    label: "Wrapped reports",
    description: "Weekly Claude Code Wrapped reports for your projects.",
    slackRoutable: true,
  },
  custom_messages: {
    label: "Announcements",
    description: "Product announcements and admin messages.",
    slackRoutable: true,
  },
  destinations: {
    label: "Data destinations",
    description: "Get notified when a data destination stops syncing (e.g. quarantined after repeated failures).",
    slackRoutable: true,
  },
}

/** Groups eligible for org-level Slack channel routing. */
export const SLACK_ROUTABLE_NOTIFICATION_GROUPS = NOTIFICATION_GROUPS.filter(
  (group) => NOTIFICATION_GROUP_META[group].slackRoutable,
)

/**
 * Per-channel switches inside a group's preferences. Today only `email`
 * exists; Slack and other channels add fields here without a schema
 * version bump (all fields optional with sensible defaults).
 */
export const channelPreferencesSchema = z.object({
  email: z.boolean().optional(),
  emailMinSeverity: alertSeveritySchema.optional(),
})
export type ChannelPreferences = z.infer<typeof channelPreferencesSchema>

const groupPreferencesShape = Object.fromEntries(
  NOTIFICATION_GROUPS.map((g) => [g, channelPreferencesSchema.optional()] as const),
) as {
  [G in NotificationGroup]: z.ZodOptional<typeof channelPreferencesSchema>
}

/**
 * User-level notification preferences, keyed by `NotificationGroup`. Stored
 * on `users.notification_preferences` as jsonb. Missing entries are
 * treated as opt-in (default = email on); a user who has never visited
 * the settings page gets the same delivery as one who explicitly enabled
 * everything.
 */
export const notificationPreferencesSchema = z.object(groupPreferencesShape)
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>
