import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '@latitude-data/constants/errors'
import { Commit, DocumentTrigger, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema'
import { DocumentTriggerType } from '@latitude-data/constants'
import { undeployDocumentTrigger } from './deploy'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '../../repositories'
import { eq } from 'drizzle-orm'

async function getLiveDocumentTrigger<T extends DocumentTriggerType>(
  {
    workspace,
    projectId,
    triggerUuid,
  }: {
    workspace: Workspace
    projectId: number
    triggerUuid: string
  },
  transaction: Transaction,
): PromisedResult<DocumentTrigger<T> | undefined> {
  return transaction.call(async (tx) => {
    const commitsScope = new CommitsRepository(workspace.id, tx)
    const liveCommitResult = await commitsScope.getHeadCommit(projectId)
    if (!Result.isOk(liveCommitResult) || !liveCommitResult.value) {
      return Result.ok(undefined)
    }
    const liveCommit = liveCommitResult.unwrap()

    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const liveTriggerResult = await triggersScope.getTriggerByUuid<T>({
      uuid: triggerUuid,
      commit: liveCommit,
    })
    if (Result.isOk(liveTriggerResult)) return liveTriggerResult
    // If the trigger is not present in live, treat as undefined
    if (liveTriggerResult.error instanceof NotFoundError) {
      return Result.ok(undefined)
    }
    return liveTriggerResult
  })
}

/**
 * Deletes a document trigger at a given commit, and automatically undeploys it.
 * - If the trigger was created in this same draft version, it will be hard deleted.
 * - If the trigger was created in a previous commit, it will be marked as deleted.
 */
export async function deleteDocumentTrigger<T extends DocumentTriggerType>(
  {
    workspace,
    commit,
    triggerUuid,
  }: {
    workspace: Workspace
    commit: Commit
    triggerUuid: string
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger<T> | null> {
  if (commit.mergedAt) {
    return Result.error(new BadRequestError('Cannot update a merged commit'))
  }

  const contextResult = await transaction.call<{
    currentDocumentTrigger: DocumentTrigger<T>
    liveDocumentTrigger: DocumentTrigger<T> | undefined
  }>(async (tx) => {
    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)

    const currentDocumentTriggerResult =
      await triggersScope.getTriggerByUuid<T>({
        uuid: triggerUuid,
        commit,
      })
    if (!Result.isOk(currentDocumentTriggerResult)) {
      return currentDocumentTriggerResult
    }
    const currentDocumentTrigger = currentDocumentTriggerResult.unwrap()

    const liveDocumentTriggerResult = await getLiveDocumentTrigger<T>(
      {
        workspace,
        projectId: currentDocumentTrigger.projectId,
        triggerUuid,
      },
      transaction,
    )
    if (!Result.isOk(liveDocumentTriggerResult)) {
      return liveDocumentTriggerResult
    }

    return Result.ok({
      currentDocumentTrigger,
      liveDocumentTrigger: liveDocumentTriggerResult.unwrap(),
    })
  })
  if (!Result.isOk(contextResult)) return contextResult
  const { currentDocumentTrigger, liveDocumentTrigger } = contextResult.unwrap()

  if (currentDocumentTrigger.commitId === commit.id) {
    const undeployResult = await undeployDocumentTrigger(
      {
        workspace,
        documentTrigger: currentDocumentTrigger,
      },
      transaction,
    )
    if (!Result.isOk(undeployResult)) return undeployResult
  }

  return transaction.call(async (tx) => {
    if (currentDocumentTrigger.commitId === commit.id) {
      const deleteResult = await tx
        .delete(documentTriggers)
        .where(eq(documentTriggers.id, currentDocumentTrigger.id))
        .returning()

      if (!deleteResult.length) {
        return Result.error(new NotFoundError('Trigger not found'))
      }
    }

    if (liveDocumentTrigger) {
      const [createdTrigger] = (await tx
        .insert(documentTriggers)
        .values({
          workspaceId: workspace.id,
          projectId: liveDocumentTrigger.projectId,
          uuid: currentDocumentTrigger.uuid,
          documentUuid: liveDocumentTrigger.documentUuid,
          triggerType: liveDocumentTrigger.triggerType,
          configuration: liveDocumentTrigger.configuration,

          commitId: commit.id,
          deletedAt: new Date(),
        })
        .returning()) as DocumentTrigger<T>[]

      if (!createdTrigger) {
        return Result.error(
          new LatitudeError('Failed to create delete trigger'),
        )
      }

      return Result.ok(createdTrigger)
    }

    return Result.ok(null)
  })
}
