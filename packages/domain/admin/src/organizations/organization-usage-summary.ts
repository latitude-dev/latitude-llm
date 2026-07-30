import { z } from "zod"

/**
 * One row of the backoffice "organisations by usage" table — surfaces the
 * compact identity / billing / membership signals next to the activity
 * metrics the page is sorted by.
 *
 * Credit spend is the current billing period's `consumedCredits`. Trace
 * count is scoped to a rolling window (see `ORGANIZATION_USAGE_WINDOW_DAYS`
 * in `list-organizations-by-usage.ts`). Orgs with zero credit spend in the
 * current period do not appear — the listing is a spend ranking, not an
 * org directory.
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
  /**
   * Credits consumed in the organisation's current billing period.
   * Always > 0 for rows that reach this DTO — orgs with no current-period
   * spend don't appear in the listing at all.
   */
  consumedCredits: z.number().int().positive(),
  /**
   * Trace count over the rolling usage window. May be 0 when the org has
   * billed credits without producing traces in that window.
   */
  traceCount: z.number().int().nonnegative(),
  /** End time of the most recent trace in the window. */
  lastTraceAt: z.date().nullable(),
  createdAt: z.date(),
})
export type AdminOrganizationUsageSummary = z.infer<typeof adminOrganizationUsageSummarySchema>

/**
 * Composite cursor for `listOrganizationsByUsageUseCase`. The page is
 * sorted by `consumedCredits DESC, organizationId ASC`, so a stable cursor
 * needs both halves: the credit count alone repeats across orgs, the id
 * alone doesn't reflect the sort dimension.
 *
 * `asOf` pins the billing-period + traces window for the whole listing
 * session so a page fetched after a period boundary still ranks against
 * the same instant as the first page (otherwise counters reset mid-scroll
 * and rows can duplicate or vanish).
 */
export const adminOrganizationUsageCursorSchema = z.object({
  consumedCredits: z.number().int().nonnegative(),
  organizationId: z.string().min(1),
  asOf: z.coerce.date(),
})
export type AdminOrganizationUsageCursor = z.infer<typeof adminOrganizationUsageCursorSchema>
