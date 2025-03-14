import { DocumentTriggerType } from '@latitude-data/constants'
import { Result, PromisedResult, Transaction } from '../../../../lib'
import { database } from '../../../../client'
import { DocumentTrigger } from '../../../../browser'
import { documentTriggers } from '../../../../schema'
import { and, eq, sql } from 'drizzle-orm'
import { ScheduledTriggerConfiguration } from '../../helpers/schema'
import { checkCronExpression, getNextRunTime } from '../../helpers/cronHelper'

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
  db?: typeof database,
): PromisedResult<DocumentTrigger> {
  return Transaction.call(async (trx) => {
    try {
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
    } catch (error) {
      return Result.error(error as Error)
    }
  }, db)
}

/**
 * Finds all scheduled triggers
 *
 * @param db The database instance to use
 * @returns A promise that resolves to an array of scheduled triggers
 */
export async function findAllScheduledTriggers(
  db?: typeof database,
): PromisedResult<DocumentTrigger[]> {
  try {
    const triggers = await (db || database)
      .select()
      .from(documentTriggers)
      .where(eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled))

    return Result.ok(triggers as DocumentTrigger[])
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Finds all scheduled triggers that are due to run based on nextRunTime
 *
 * @param db The database instance to use
 * @returns A promise that resolves to an array of triggers due to run
 */
export async function findScheduledTriggersDueToRun(
  db?: typeof database,
): PromisedResult<DocumentTrigger[]> {
  const now = new Date()

  try {
    const dbInstance = db || database

    // Use an optimized query that leverages our index on the JSON path configuration->nextRunTime
    // This query finds all scheduled triggers with nextRunTime <= now
    const triggersWithNextRunTime = (await dbInstance
      .select()
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled),
          sql`(${documentTriggers.configuration}->>'nextRunTime')::timestamptz <= ${now}::timestamptz`,
          sql`(${documentTriggers.configuration}->>'enabled')::boolean IS NOT FALSE`,
        ),
      )
      .execute()) as DocumentTrigger[]

    // Also fetch triggers that don't have nextRunTime set yet
    const triggersWithoutNextRunTime = (await dbInstance
      .select()
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled),
          sql`${documentTriggers.configuration}->>'nextRunTime' IS NULL`,
          sql`(${documentTriggers.configuration}->>'enabled')::boolean IS NOT FALSE`,
        ),
      )
      .execute()) as DocumentTrigger[]

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

/**
 * Initializes or refreshes nextRunTime for all scheduled triggers
 * This should be called once at application startup to ensure all triggers have a nextRunTime
 *
 * @param db The database instance to use
 * @returns A promise that resolves when all triggers have been updated
 */
export async function initializeNextRunTimesForAllScheduledTriggers(
  db?: typeof database,
): PromisedResult<number> {
  return Transaction.call(async (trx) => {
    try {
      // Find all scheduled triggers that are enabled but don't have a nextRunTime
      const triggers = (await trx
        .select()
        .from(documentTriggers)
        .where(eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled))
        .execute()) as DocumentTrigger[]

      let updatedCount = 0

      // Update each trigger
      for (const trigger of triggers) {
        const config = trigger.configuration as ScheduledTriggerConfiguration

        // Skip if nextRunTime is already set and in the future
        if (config.nextRunTime && new Date(config.nextRunTime) > new Date()) {
          continue
        }

        // Calculate the next run time
        const referenceTime = config.lastRun || trigger.createdAt
        const nextRunTime = getNextRunTime(
          config.cronExpression,
          'UTC',
          referenceTime,
        )

        if (nextRunTime) {
          // Update the trigger
          await trx
            .update(documentTriggers)
            .set({
              configuration: {
                ...config,
                nextRunTime,
              },
            })
            .where(eq(documentTriggers.id, trigger.id))

          updatedCount++
        }
      }

      console.log(
        `Initialized nextRunTime for ${updatedCount} scheduled triggers`,
      )

      return Result.ok(updatedCount)
    } catch (error) {
      console.error(
        'Error initializing nextRunTime for scheduled triggers:',
        error,
      )
      return Result.error(error as Error)
    }
  }, db)
}
