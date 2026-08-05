import { alertSeveritySchema, meetsMinSeverity, NOTIFICATION_GROUPS, type NotificationGroup } from "@domain/shared"
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
})

export type SlackRoute = z.infer<typeof slackRouteSchema>

/**
 * Whether a route accepts a notification payload. A route with `minSeverity`
 * drops payloads below it.
 *
 * `requiresSeverity` splits the two meanings of a missing severity. For kinds
 * that should carry one (incidents, signals), missing means nobody has judged
 * the source yet and it is not delivered. For kinds with no severity concept
 * (wrapped reports, announcements, destination and billing alerts) it always
 * passes. The caller supplies the fact from `NOTIFICATION_KIND_META` rather
 * than this predicate inferring intent from an absent field.
 */
export const routeAdmitsPayload = (
  route: SlackRoute,
  payload: Record<string, unknown>,
  options: { readonly requiresSeverity?: boolean } = {},
): boolean => {
  const severity = alertSeveritySchema.safeParse(payload.severity)
  if (!severity.success) return options.requiresSeverity !== true
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
