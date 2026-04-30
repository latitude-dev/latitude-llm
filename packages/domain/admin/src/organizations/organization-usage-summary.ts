import { z } from "zod"

/**
 * One row of the backoffice "organisations by usage" table — surfaces the
 * compact identity / billing / membership signals next to the activity
 * metric the page is sorted by.
 *
 * The trace count is scoped to a rolling window (see
 * `ORGANIZATION_USAGE_WINDOW_DAYS` in `list-organizations-by-usage.ts`)
 * so the table answers "who's using the product right now?" rather than
 * "who has historically produced traces?". Orgs with zero traces in
 * that window do not appear at all — the listing is a usage ranking,
 * not an org directory.
 */
export const adminOrganizationUsageSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /**
   * `subscriptions.plan` of the most recent active or trialing
   * subscription. Null when no such row exists (free tier or churned).
   */
  plan: z.string().nullable(),
  memberCount: z.number().int().nonnegative(),
  /** Trace count over the rolling usage window. Always > 0 for rows that reach this DTO. */
  traceCount: z.number().int().nonnegative(),
  /** End time of the most recent trace in the window. */
  lastTraceAt: z.date().nullable(),
  createdAt: z.date(),
})
export type AdminOrganizationUsageSummary = z.infer<typeof adminOrganizationUsageSummarySchema>

/**
 * Composite cursor for `listOrganizationsByUsageUseCase`. The page is
 * sorted by `traceCount DESC, organizationId ASC`, so a stable cursor
 * needs both halves: the count alone repeats across orgs, the id alone
 * doesn't reflect the sort dimension.
 */
export const adminOrganizationUsageCursorSchema = z.object({
  traceCount: z.number().int().nonnegative(),
  organizationId: z.string().min(1),
})
export type AdminOrganizationUsageCursor = z.infer<typeof adminOrganizationUsageCursorSchema>
