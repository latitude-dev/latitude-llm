import { DocumentTriggerType } from '@latitude-data/constants'
import { Result, PromisedResult } from '../../../../lib'
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

  // Not enabled, don't run
  if (config.enabled === false) {
    return false
  }

  // If we have a nextRunTime, check if it's in the past
  if (config.nextRunTime) {
    return new Date(config.nextRunTime) <= new Date()
  }

  // Fallback to checking the cron expression
  return checkCronExpression(
    config.cronExpression,
    config.timezone,
    config.lastRun || trigger.createdAt,
  )
}

/**
 * Updates the last run time of a scheduled trigger and calculates the next run time
 *
 * @param trigger The document trigger to update (can be a partial trigger with just id and uuid)
 * @param lastRunTime The time to set as the last run time
 * @returns A promise that resolves to the updated trigger
 */
export async function updateScheduledTriggerLastRun(
  trigger: Pick<DocumentTrigger, 'id' | 'uuid'>,
  lastRunTime = new Date(),
): PromisedResult<DocumentTrigger> {
  try {
    // First, get the current configuration if only a partial trigger was provided
    let config: ScheduledTriggerConfiguration

    if (!('configuration' in trigger)) {
      const fullTrigger = await database
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
      config.timezone,
      lastRunTime,
    )

    // Update the trigger configuration with the new last run time and next run time
    const updateResult = await database
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
}

/**
 * Finds all scheduled triggers
 *
 * @returns A promise that resolves to an array of scheduled triggers
 */
export async function findAllScheduledTriggers(): PromisedResult<
  DocumentTrigger[]
> {
  const triggers = await database
    .select()
    .from(documentTriggers)
    .where(eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled))

  return Result.ok(triggers as DocumentTrigger[])
}

/**
 * Finds all scheduled triggers that are due to run based on nextRunTime
 *
 * @returns A promise that resolves to an array of triggers due to run
 */
export async function findScheduledTriggersDueToRun(): PromisedResult<
  DocumentTrigger[]
> {
  const now = new Date()

  try {
    // Use an optimized query that leverages our index on the JSON path configuration->nextRunTime
    // This query finds all scheduled triggers with nextRunTime <= now
    const triggersWithNextRunTime = (await database
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
    const triggersWithoutNextRunTime = (await database
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
        config.timezone,
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
 * @returns A promise that resolves when all triggers have been updated
 */
export async function initializeNextRunTimesForAllScheduledTriggers(): PromisedResult<number> {
  try {
    // Find all scheduled triggers that are enabled but don't have a nextRunTime
    const triggers = (await database
      .select()
      .from(documentTriggers)
      .where(eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled))
      .execute()) as DocumentTrigger[]

    let updatedCount = 0

    // Update each trigger
    for (const trigger of triggers) {
      const config = trigger.configuration as ScheduledTriggerConfiguration

      // Skip disabled triggers
      if (config.enabled === false) {
        continue
      }

      // Skip if nextRunTime is already set and in the future
      if (config.nextRunTime && new Date(config.nextRunTime) > new Date()) {
        continue
      }

      // Calculate the next run time
      const referenceTime = config.lastRun || trigger.createdAt
      const nextRunTime = getNextRunTime(
        config.cronExpression,
        config.timezone,
        referenceTime,
      )

      if (nextRunTime) {
        // Update the trigger
        await database
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
}
