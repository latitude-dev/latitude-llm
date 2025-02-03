import { SQL, sql } from 'drizzle-orm'
import { subscriptions } from '../../../schema'
import { database } from '../../../client'

export function getLatestRenewalDate(firstRenewalDate: Date, targetDate: Date) {
  // If targetDate is before the first renewal date, return the first renewal date
  if (targetDate.getTime() < firstRenewalDate.getTime()) {
    return firstRenewalDate
  }

  const targetYear = targetDate.getFullYear()
  const targetMonth = targetDate.getMonth()
  const targetDay = targetDate.getDate()

  // The day of the month is always maintained so renewal day is the same
  const renewalDay = firstRenewalDate.getDate()

  // If month is january and day is before renewal day, we need to subtract 1 year
  const adjustedYear =
    targetMonth === 0 && targetDay < renewalDay ? targetYear - 1 : targetYear

  // Cases:
  //
  // A) If the target date's day is before the renewal day in the same month,
  //    we need to subtract 1 month.
  //    Example:
  //    First renewal date is 2021-01-15 and target date is 2021-02-10,
  //    the latest renewal date is 2021-01-15.
  //
  // B) If the target date's day is on or after the renewal day,
  //    we stay in the current month.
  //    Example:
  //    First renewal date is 2021-01-15 and target date is 2021-02-20,
  //    the latest renewal date is 2021-02-15.
  //
  //  NOTE: The % 12 ensures that the month is always between 0 and 11
  const adjustedMonth =
    (targetMonth - (targetDay < renewalDay ? 1 : 0) + 12) % 12

  return new Date(adjustedYear, adjustedMonth, renewalDay)
}

/**
 * FIXME: This function will be used only in backoffice for now.
 *
 * But if we see the SQL version is performing ok we can unify usage
 * logic for backoffice and the app. So everybody sees the same data.
 * and is only one source of truth.
 */
function getLatestRenewalSQL({
  targetDate,
  alias,
}: {
  targetDate: SQL<unknown>
  alias: string
}) {
  return sql`
    CASE
      -- If the targetDate is before the first renewal date (subscriptions.createdAt),
      -- return the first renewal date.
      WHEN ${targetDate} < MAX(${subscriptions.createdAt}::TIMESTAMP)
        THEN MAX(${subscriptions.createdAt}::TIMESTAMP)

      -- If the target date is in January and before the renewal day,
      -- subtract one year while keeping the same month and day.
      WHEN EXTRACT(MONTH FROM ${targetDate}) = 1
        AND EXTRACT(DAY FROM ${targetDate}) < EXTRACT(DAY FROM ${subscriptions.createdAt}::TIMESTAMP)
        THEN MAKE_DATE(
          (EXTRACT(YEAR FROM ${targetDate})::INTEGER - 1),
          12, -- Wrap to December
          LEAST(
            EXTRACT(DAY FROM ${subscriptions.createdAt}::TIMESTAMP)::INTEGER,
            DATE_PART('day', (DATE_TRUNC('month', ${targetDate} - INTERVAL '1 year') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER
          )
        )

      -- If the target date is before the renewal day, subtract one month.
      WHEN EXTRACT(DAY FROM ${targetDate}) < EXTRACT(DAY FROM ${subscriptions.createdAt}::TIMESTAMP)
        THEN MAKE_DATE(
          EXTRACT(YEAR FROM ${targetDate})::INTEGER,
          CASE
            WHEN EXTRACT(MONTH FROM ${targetDate}) = 1
              THEN 12 -- Wrap to December
            ELSE EXTRACT(MONTH FROM ${targetDate})::INTEGER - 1
          END,
          LEAST(
            EXTRACT(DAY FROM ${subscriptions.createdAt}::TIMESTAMP)::INTEGER,
            DATE_PART('day', (DATE_TRUNC('month', ${targetDate} - INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER
          )
        )

      -- Otherwise, keep the same year and month, using the original renewal day.
      ELSE MAKE_DATE(
        EXTRACT(YEAR FROM ${targetDate})::INTEGER,
        EXTRACT(MONTH FROM ${targetDate})::INTEGER,
        LEAST(
          EXTRACT(DAY FROM ${subscriptions.createdAt}::TIMESTAMP)::INTEGER,
          DATE_PART('day', (DATE_TRUNC('month', ${targetDate}) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER
        )
      )
    END
  `.as(alias)
}

export function buildSubscriptionWithRenewalDatesQuery(
  target: Date | undefined,
) {
  const targetDate =
    target?.toISOString().replace('T', ' ').replace('Z', '') ?? undefined
  return database
    .select({
      subscriptionId: subscriptions.id,
      currentPeriodAt: getLatestRenewalSQL({
        targetDate:
          targetDate === undefined
            ? sql`CURRENT_DATE`
            : sql`CAST(${targetDate} AS TIMESTAMP)`,
        alias: 'current_period_at',
      }),
      oneMonthAgoPeriodAt: getLatestRenewalSQL({
        targetDate:
          targetDate === undefined
            ? sql`CURRENT_DATE - INTERVAL '1 month'`
            : sql`CAST(${targetDate} AS TIMESTAMP) - INTERVAL '1 month'`,
        alias: 'one_month_ago_period_at',
      }),
      twoMonthsAgoPeriodAt: getLatestRenewalSQL({
        targetDate:
          targetDate === undefined
            ? sql`CURRENT_DATE - INTERVAL '2 months'`
            : sql`CAST(${targetDate} AS TIMESTAMP) - INTERVAL '2 months'`,
        alias: 'two_months_ago_period_at',
      }),
    })
    .from(subscriptions)
    .groupBy(subscriptions.id)
    .as('renewal_dates')
}

export type RenewalDatesQuery = ReturnType<
  typeof buildSubscriptionWithRenewalDatesQuery
>
