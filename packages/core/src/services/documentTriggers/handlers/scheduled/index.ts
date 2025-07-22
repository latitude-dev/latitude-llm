import { DocumentTriggerType } from '@latitude-data/constants'
import { and, eq, sql } from 'drizzle-orm'
import { DocumentTrigger } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../lib/Transaction'
import { documentTriggers } from '../../../../schema'
import { checkCronExpression, getNextRunTime } from '../../helpers/cronHelper'
import { ScheduledTriggerConfiguration } from '../../helpers/schema'
import { database } from '../../../../client'

/**
 * Checks if a scheduled trigger is due to run based on its configuration
 *
 * @param trigger The document trigger to check
 * @returns A boolean indicating whether the trigger should run
 */
export function isScheduledTriggerDue(trigger: DocumentTrigger): boolean {
  const config = trigger.configuration as ScheduledTriggerConfiguration

  // If we have a nextRunTime, check if it's in the past
  if (config.nextRunTime) {
    return new Date(config.nextRunTime) <= new Date()
  }

  // Fallback to checking the cron expression
  return checkCronExpression(
    config.cronExpression,
    'UTC',
    config.lastRun || trigger.createdAt,
  )
}

/**
 * Updates the last run time of a scheduled trigger and calculates the next run time
 *
 * @param trigger The document trigger to update (can be a partial trigger with just id and uuid)
 * @param lastRunTime The time to set as the last run time
 * @param db The database instance to use
 * @returns A promise that resolves to the updated trigger
 */
export async function updateScheduledTriggerLastRun(
  trigger: Pick<DocumentTrigger, 'id' | 'uuid'>,
  lastRunTime = new Date(),
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger> {
  return transaction.call(async (trx) => {
    // First, get the current configuration if only a partial trigger was provided
    let config: ScheduledTriggerConfiguration

    if (!('configuration' in trigger)) {
      const fullTrigger = await trx
        .select()
        .from(documentTriggers)
        .where(eq(documentTriggers.id, trigger.id))
        .then((rows) => rows[0] as DocumentTrigger | undefined)

      if (!fullTrigger) {
        return Result.error(
          new Error(`Trigger with id ${trigger.id} not found`),
        )
      }

      config = fullTrigger.configuration as ScheduledTriggerConfiguration
    } else {
      config = (trigger as DocumentTrigger)
        .configuration as ScheduledTriggerConfiguration
    }

    // Calculate the next run time
    const nextRunTime = getNextRunTime(
      config.cronExpression,
      'UTC',
      lastRunTime,
    )

    // Update the trigger configuration with the new last run time and next run time
    const updateResult = await trx
      .update(documentTriggers)
      .set({
        configuration: {
          ...config,
          lastRun: lastRunTime,
          nextRunTime: nextRunTime || undefined,
        },
      })
      .where(eq(documentTriggers.id, trigger.id))
      .returning()

    if (!updateResult.length) {
      return Result.error(
        new Error(`Failed to update document trigger ${trigger.uuid}`),
      )
    }

    return Result.ok(updateResult[0] as DocumentTrigger)
  })
}

/**
 * Finds all scheduled triggers
 *
 * @param db The database instance to use
 * @returns A promise that resolves to an array of scheduled triggers
 */
export async function findAllScheduledTriggers(
  db = database,
): PromisedResult<DocumentTrigger[]> {
  try {
    const triggers = await db
      .select()
      .from(documentTriggers)
      .where(eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled))

    return Result.ok(triggers as DocumentTrigger[])
  } catch (error) {
    return Result.error(error as Error)
  }
}

type ScheduledTrigger = Extract<
  DocumentTrigger,
  { triggerType: DocumentTriggerType.Scheduled }
>

/**
 * Finds all scheduled triggers that are due to run based on nextRunTime
 *
 * @param db The database instance to use
 * @returns A promise that resolves to an array of triggers due to run
 */
export async function findScheduledTriggersDueToRun(
  db = database,
): PromisedResult<ScheduledTrigger[]> {
  const now = new Date()

  try {
    // Use an optimized query that leverages our index on the JSON path configuration->nextRunTime
    // This query finds all scheduled triggers with nextRunTime <= now
    const triggersWithNextRunTime = (await db
      .select()
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled),
          sql`(${documentTriggers.configuration}->>'nextRunTime')::timestamptz <= ${now}::timestamptz`,
          sql`(${documentTriggers.configuration}->>'enabled')::boolean IS NOT FALSE`,
        ),
      )
      .execute()) as ScheduledTrigger[]

    // Also fetch triggers that don't have nextRunTime set yet
    const triggersWithoutNextRunTime = (await db
      .select()
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled),
          sql`${documentTriggers.configuration}->>'nextRunTime' IS NULL`,
          sql`(${documentTriggers.configuration}->>'enabled')::boolean IS NOT FALSE`,
        ),
      )
      .execute()) as ScheduledTrigger[]

    // Filter the triggers without nextRunTime using the cron expression
    const dueTriggers = triggersWithoutNextRunTime.filter((trigger) => {
      const config = trigger.configuration as ScheduledTriggerConfiguration

      return checkCronExpression(
        config.cronExpression,
        'UTC',
        config.lastRun || trigger.createdAt,
      )
    })

    // Combine and return all due triggers
    return Result.ok([...triggersWithNextRunTime, ...dueTriggers])
  } catch (error) {
    console.error('Error finding scheduled triggers due to run:', error)
    return Result.error(error as Error)
  }
}
