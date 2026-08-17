import { z } from "zod"
import { alertSeveritySchema, type IncidentNotificationKey } from "./alert-incident-kinds.ts"

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
  "signals",
  "monitors",
  "wrapped_reports",
  "custom_messages",
  "personal",
  "destinations",
  "billing",
] as const
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]
export const notificationGroupSchema = z.enum(NOTIFICATION_GROUPS)

/**
 * Sub-toggles inside a group, for groups whose kinds are distinct enough
 * that one switch is too coarse. A topic is only ever offered under the
 * group that declares it in `NOTIFICATION_GROUP_META`.
 */
export const NOTIFICATION_TOPICS = ["signal.discovered", "signal.escalating", "signal.regressed"] as const
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]
export const notificationTopicSchema = z.enum(NOTIFICATION_TOPICS)

export const NOTIFICATION_TOPIC_META: Record<
  NotificationTopic,
  { readonly label: string; readonly description: string }
> = {
  "signal.discovered": {
    label: "New signals",
    description: "A signal not seen before shows up for the first time.",
  },
  "signal.escalating": {
    label: "Escalating signals",
    description: "An existing signal escalates into an incident.",
  },
  "signal.regressed": {
    label: "Regressed signals",
    description: "A signal you already resolved starts happening again.",
  },
}

/**
 * Which group an incident notification belongs to. The three `incident.*`
 * kinds fire for both signal escalations and monitors, so the split the
 * settings UI shows is decided here rather than by the kind.
 */
export const GROUP_FOR_INCIDENT_NOTIFICATION_KEY: Record<IncidentNotificationKey, NotificationGroup> = {
  "signal.escalating": "signals",
  "monitor.match": "monitors",
  "monitor.threshold": "monitors",
  "monitor.escalating": "monitors",
}

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
    /**
     * Whether the group's notifications carry a severity, and so can be
     * held to a minimum-severity threshold on both channels.
     */
    readonly severityFiltered: boolean
    /** Sub-toggles offered inside the group; empty means the group toggle is the only switch. */
    readonly topics: readonly NotificationTopic[]
  }
> = {
  personal: {
    label: "Assigned to you",
    description: "Notifications addressed directly to you, like being assigned to an issue.",
    slackRoutable: false,
    severityFiltered: false,
    topics: [],
  },
  signals: {
    label: "Signals",
    description: "Get notified when signals are discovered, escalated and regressed.",
    slackRoutable: true,
    severityFiltered: true,
    topics: ["signal.discovered", "signal.escalating", "signal.regressed"],
  },
  monitors: {
    label: "Monitors",
    description: "Get notified when one of your monitors fires.",
    slackRoutable: true,
    severityFiltered: true,
    topics: [],
  },
  wrapped_reports: {
    label: "Wrapped reports",
    description: "Weekly Claude Code Wrapped reports for your projects.",
    slackRoutable: true,
    severityFiltered: false,
    topics: [],
  },
  custom_messages: {
    label: "Announcements",
    description: "Product announcements and admin messages.",
    slackRoutable: true,
    severityFiltered: false,
    topics: [],
  },
  destinations: {
    label: "Data destinations",
    description: "Get notified when a data destination stops syncing (e.g. quarantined after repeated failures).",
    slackRoutable: true,
    severityFiltered: false,
    topics: [],
  },
  billing: {
    label: "Billing",
    description: "Alerts when your organization exhausts included credits, enters overage, or hits a spend limit.",
    slackRoutable: false,
    severityFiltered: false,
    topics: [],
  },
}

/** Groups eligible for org-level Slack channel routing. */
export const SLACK_ROUTABLE_NOTIFICATION_GROUPS = NOTIFICATION_GROUPS.filter(
  (group) => NOTIFICATION_GROUP_META[group].slackRoutable,
)

/**
 * Per-topic switches on a group's delivery config. Absent topics follow the
 * group toggle, so a user who never opens the settings gets everything.
 */
export const topicPreferencesSchema = z.partialRecord(notificationTopicSchema, z.boolean())
export type TopicPreferences = z.infer<typeof topicPreferencesSchema>

/** Whether a topic passes a topic filter. Notifications with no topic are never filtered. */
export const admitsTopic = (topics: TopicPreferences | undefined, topic: NotificationTopic | null): boolean =>
  topic === null || (topics?.[topic] ?? true)

/**
 * Per-channel switches inside a group's preferences. Today only `email`
 * exists; Slack and other channels add fields here without a schema
 * version bump (all fields optional with sensible defaults).
 */
export const channelPreferencesSchema = z.object({
  email: z.boolean().optional(),
  emailMinSeverity: alertSeveritySchema.optional(),
  emailTopics: topicPreferencesSchema.optional(),
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
