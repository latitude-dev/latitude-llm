import { CronExpressionParser } from 'cron-parser'

/**
 * Checks if a cron expression should trigger based on the current time and the last run time.
 *
 * @param cronExpression - A cron expression (e.g. "0 * * * *")
 * @param timezone - The timezone to use for the cron expression (default: UTC)
 * @param lastRunDate - The date of the last run
 * @returns Boolean indicating if the job should run
 */
export function checkCronExpression(
  cronExpression: string,
  timezone: string = 'UTC',
  lastRunDate?: Date,
): boolean {
  try {
    const now = new Date()
    const lastRun = lastRunDate || new Date(0) // If no last run, use epoch time

    // Parse the cron expression
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: lastRun,
      tz: timezone,
    })

    // Get the next run time after the last run
    const nextRun = interval.next().toDate()

    // If the next run time is in the past compared to now, it should run
    return nextRun <= now
  } catch (error) {
    console.error('Error parsing cron expression:', error)
    return false
  }
}

/**
 * Calculates the next run time for a cron expression starting from a given date
 *
 * @param cronExpression - A cron expression (e.g. "0 * * * *")
 * @param timezone - The timezone to use for the cron expression (default: UTC)
 * @param startDate - The date to start calculating from (default: now)
 * @returns The next run time, or null if the expression can't be parsed
 */
export function getNextRunTime(
  cronExpression: string,
  timezone: string = 'UTC',
  startDate: Date = new Date(),
): Date | null {
  try {
    // Parse the cron expression
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: startDate,
      tz: timezone,
    })

    // Get the next occurrence
    return interval.next().toDate()
  } catch (error) {
    console.error('Error calculating next run time:', error)
    return null
  }
}
