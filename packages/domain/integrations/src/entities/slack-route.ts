import {
  alertSeveritySchema,
  isSignalEscalation,
  meetsMinSeverity,
  NOTIFICATION_GROUPS,
  type NotificationGroup,
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
})

export type SlackRoute = z.infer<typeof slackRouteSchema>

/**
 * Whether a route accepts a notification payload. Two different things can be
 * missing here, and they answer oppositely — both are spelled out rather than
 * encoded in a sentinel value.
 *
 * A missing payload severity: for kinds that should carry one (incidents,
 * signals) it means nobody has judged the source yet, and it is not delivered.
 * For kinds with no severity concept (wrapped reports, announcements,
 * destination and billing alerts) it always passes. The caller supplies which
 * case applies from `NOTIFICATION_KIND_META`, so this predicate never infers
 * intent from an absent field.
 *
 * A missing route threshold: nothing was configured, so everything passes.
 * Writing that as `minSeverity ?? "low"` would work only for as long as `low`
 * stays the bottom of the scale — add a tier below it and the sentinel silently
 * starts filtering. It also conflates "unset" with "explicitly Low", which the
 * settings UI already does and which has misled a production audit.
 *
 * A signal escalating is exempt from both. Its level says how bad the pattern
 * is; escalating says the rate just broke its own seasonal band, which is a
 * different claim and not one a severity threshold was set to answer. 97% of
 * production escalations come from signals nobody has triaged, so honouring the
 * threshold here would silence almost all of them. The notification says it
 * fired on volume, so the exemption is visible to whoever receives it rather
 * than looking like the filter leaking.
 */

export const routeAdmitsPayload = (
  route: SlackRoute,
  payload: Record<string, unknown>,
  options: { readonly requiresSeverity?: boolean } = {},
): boolean => {
  if (isSignalEscalation(payload)) return true
  const severity = alertSeveritySchema.safeParse(payload.severity)
  if (!severity.success) return options.requiresSeverity !== true
  if (route.minSeverity === undefined) return true
  return meetsMinSeverity(severity.data, route.minSeverity)
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
