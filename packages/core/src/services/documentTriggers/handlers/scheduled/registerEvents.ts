import { DocumentTriggerType } from '@latitude-data/constants'
import { DocumentTrigger, DocumentTriggerEvent } from '../../../../browser'
import { database } from '../../../../client'
import { ErrorResult, Result } from '../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../lib/Transaction'
import { documentTriggers } from '../../../../schema'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { checkCronExpression, getNextRunTime } from '../../helpers/cronHelper'
import { CommitsRepository } from '../../../../repositories'
import { registerDocumentTriggerEvent } from '../../triggerEvents/registerEvent'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { NotFoundError } from '@latitude-data/constants/errors'

/**
 * Finds all scheduled triggers that are due to run based on nextRunTime
 *
 * @param db The database instance to use
 * @returns A promise that resolves to an array of triggers due to run
 */
async function findScheduledTriggersDueToRun(
  db = database,
): PromisedResult<DocumentTrigger<DocumentTriggerType.Scheduled>[]> {
  const now = new Date()

  try {
    // Use an optimized query that leverages our index on the JSON path configuration->nextRunTime
    // This query finds all scheduled triggers with nextRunTime <= now
    const triggersWithNextRunTime = (await db
      .select()
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled), // is of type schedule
          isNotNull(documentTriggers.deploymentSettings), // is deployed (only Live or Drafts)
          sql`(${documentTriggers.deploymentSettings}->>'nextRunTime')::timestamptz <= ${now}::timestamptz`, // nextRunTime has already passed
        ),
      )
      .execute()) as DocumentTrigger<DocumentTriggerType.Scheduled>[]

    // Also fetch triggers that don't have nextRunTime set yet
    const triggersWithoutNextRunTime = (await db
      .select()
      .from(documentTriggers)
      .where(
        and(
          eq(documentTriggers.triggerType, DocumentTriggerType.Scheduled), // is of type schedule
          isNotNull(documentTriggers.deploymentSettings), // is deployed (only Live or Drafts)
          sql`${documentTriggers.deploymentSettings}->>'nextRunTime' IS NULL`, // does not have any nextRunTime configured
        ),
      )
      .execute()) as DocumentTrigger<DocumentTriggerType.Scheduled>[]

    // Filter the triggers without nextRunTime using the cron expression
    const dueTriggers = triggersWithoutNextRunTime.filter((trigger) => {
      return checkCronExpression(
        trigger.configuration.cronExpression,
        'UTC',
        trigger.deploymentSettings!.lastRun || trigger.createdAt,
      )
    })

    // Combine and return all due triggers
    return Result.ok([...triggersWithNextRunTime, ...dueTriggers])
  } catch (error) {
    console.error('Error finding scheduled triggers due to run:', error)
    return Result.error(error as Error)
  }
}

async function registerSingleScheduledTriggerEvent(
  documentTrigger: DocumentTrigger<DocumentTriggerType.Scheduled>,
  transaction = new Transaction(),
): PromisedResult<DocumentTriggerEvent<DocumentTriggerType.Scheduled>> {
  return transaction.call(async (tx) => {
    const workspace = await unsafelyFindWorkspace(
      documentTrigger.workspaceId,
      tx,
    )
    if (!workspace) {
      return Result.error(
        new NotFoundError(
          `Workspace with ID '${documentTrigger.workspaceId}' not found`,
        ),
      )
    }

    const commitsScope = new CommitsRepository(workspace.id, tx)
    const commitResult = await commitsScope.find(documentTrigger.commitId)
    if (!Result.isOk(commitResult)) return commitResult
    const commit = commitResult.unwrap()

    let eventCommit = commit
    if (commit.mergedAt) {
      // If the commit is merged, this means the event is coming from Live
      // In this case, we must use the ID for the Live commit for the event
      // However, the trigger's associated commit may not be the Live commit,
      // but rather just the last merged commit where it has been updated.
      // Thus, we need to find the Live commit
      const liveCommitResult = await commitsScope.getHeadCommit(
        documentTrigger.projectId,
      )
      if (!Result.isOk(liveCommitResult)) return liveCommitResult
      const liveCommit = liveCommitResult.unwrap()
      eventCommit = liveCommit!
    }

    const nextRunTime = getNextRunTime(
      documentTrigger.configuration.cronExpression,
      'UTC',
      documentTrigger.deploymentSettings!.nextRunTime,
    )

    // First, we update the trigger deployment for future triggerings
    const [updatedScheduledTrigger] = (await tx
      .update(documentTriggers)
      .set({
        deploymentSettings: {
          ...documentTrigger.deploymentSettings!,
          nextRunTime, // Updated nextRunTime
        },
      })
      .where(eq(documentTriggers.id, documentTrigger.id))
      .returning()) as DocumentTrigger<DocumentTriggerType.Scheduled>[]

    if (!updatedScheduledTrigger) {
      return Result.error(
        new NotFoundError(`Scheduled Document Trigger was not found`),
      )
    }

    // Then, we register the event. If registering the event fails, the
    // transaction will be reverted and the trigger's nextRunTime will
    // not have been updated, so future jobs will try to run them too.
    return registerDocumentTriggerEvent(
      {
        workspace,
        commit: eventCommit,
        triggerUuid: documentTrigger.uuid,
        eventPayload: {}, // Scheduled type triggers do not have payload
      },
      transaction,
    )
  })
}

/**
 * Looks for all Scheduled Document Triggers that require triggering at this time,
 * updates its deployment settings for future triggers, and registers the events.
 *
 * Events will be handled by services/documentTriggers/triggerEvents/registerEvent, which
 * will enqueue their run if the trigger is Live and enabled.
 */
export async function findAndRegisterScheduledTriggerEvents(
  db = database,
): PromisedResult<DocumentTriggerEvent<DocumentTriggerType.Scheduled>[]> {
  const triggersDueToRunResult = await findScheduledTriggersDueToRun(db)
  if (!Result.isOk(triggersDueToRunResult)) return triggersDueToRunResult

  const triggersDueToRun = triggersDueToRunResult.unwrap()
  const results = await Promise.all(
    triggersDueToRun.map((documentTrigger) =>
      registerSingleScheduledTriggerEvent(documentTrigger),
    ),
  )

  const errors = results.filter(
    (result) => !Result.isOk(result),
  ) as ErrorResult<Error>[]

  if (errors.length) {
    return errors[0]!
  }

  return Result.ok(results.map((r) => r.unwrap()))
}
