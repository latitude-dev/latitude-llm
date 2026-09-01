import {
  alertSeveritySchema,
  meetsMinSeverity,
  NOTIFICATION_GROUPS,
  type NotificationGroup,
  topicPreferencesSchema,
} from "@domain/shared"
import { z } from "zod"

/**
 * A configured Slack channel target for a notification group. `channelId`
 * is the source of truth (immutable as long as the channel exists);
 * `channelName` is a best-effort label cached at configure-time so the
 * settings UI can render without re-hitting Slack on every load.
 */
export const slackRouteSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string().min(1),
  minSeverity: alertSeveritySchema.optional(),
  /** Per-topic switches for groups with sub-toggles; absent topics are delivered. */
  topics: topicPreferencesSchema.optional(),
})

export type SlackRoute = z.infer<typeof slackRouteSchema>

/**
 * Whether a route accepts a notification payload. Incident payloads carry
 * `severity`; a route with `minSeverity` drops incidents below it. Payloads
 * without a severity (wrapped reports, announcements) always pass.
 */
export const routeAdmitsPayload = (route: SlackRoute, payload: Record<string, unknown>): boolean => {
  const severity = alertSeveritySchema.safeParse(payload.severity)
  if (!severity.success) return true
  return meetsMinSeverity(severity.data, route.minSeverity ?? "low")
}

/**
 * Per-group route map persisted on `slack_integration_details.routes`.
 * Built from `NOTIFICATION_GROUPS` as an all-optional object so adding
 * a new group automatically extends the schema and reading a missing
 * group returns `undefined` (treated as "no Slack delivery for this
 * group" by the producer).
 */
const slackRoutesShape = Object.fromEntries(
  NOTIFICATION_GROUPS.map((g) => [g, z.array(slackRouteSchema).optional()] as const),
) as {
  [G in NotificationGroup]: z.ZodOptional<z.ZodArray<typeof slackRouteSchema>>
}

export const slackRoutesSchema = z.object(slackRoutesShape)
export type SlackRoutes = z.infer<typeof slackRoutesSchema>

export const emptySlackRoutes = (): SlackRoutes => ({})

export const routesForGroup = (routes: SlackRoutes, group: NotificationGroup): readonly SlackRoute[] =>
  routes[group] ?? []
