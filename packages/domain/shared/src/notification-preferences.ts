import { z } from "zod"

/**
 * User-visible groupings. The preferences UI surfaces one toggle per group;
 * adding a new kind to an existing group inherits the user's current
 * setting automatically. Adding a new group = a new toggle for users.
 *
 * Lives in `@domain/shared` (not `@domain/notifications`) so the user
 * entity can carry typed preferences without introducing a circular
 * package dep with `@domain/notifications`.
 */
export const NOTIFICATION_GROUPS = ["incidents", "wrapped_reports", "custom_messages"] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]
export const notificationGroupSchema = z.enum(NOTIFICATION_GROUPS)

export const NOTIFICATION_GROUP_META: Record<
  NotificationGroup,
  { readonly label: string; readonly description: string }
> = {
  incidents: {
    label: "Incidents",
    description: "Alerts when issues open, regress, or escalate.",
  },
  wrapped_reports: {
    label: "Wrapped reports",
    description: "Weekly Claude Code Wrapped reports for your projects.",
  },
  custom_messages: {
    label: "Announcements",
    description: "Product announcements and admin messages.",
  },
}

/**
 * Per-channel switches inside a group's preferences. Today only `email`
 * exists; Slack and other channels add fields here without a schema
 * version bump (all fields optional with sensible defaults).
 */
export const channelPreferencesSchema = z.object({
  email: z.boolean().optional(),
})
export type ChannelPreferences = z.infer<typeof channelPreferencesSchema>

const groupPreferencesShape = Object.fromEntries(
  NOTIFICATION_GROUPS.map((g) => [g, channelPreferencesSchema.optional()] as const),
) as { [G in NotificationGroup]: z.ZodOptional<typeof channelPreferencesSchema> }

/**
 * User-level notification preferences, keyed by `NotificationGroup`. Stored
 * on `users.notification_preferences` as jsonb. Missing entries are
 * treated as opt-in (default = email on); a user who has never visited
 * the settings page gets the same delivery as one who explicitly enabled
 * everything.
 */
export const notificationPreferencesSchema = z.object(groupPreferencesShape)
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>
