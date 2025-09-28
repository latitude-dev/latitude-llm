import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '@latitude-data/constants/errors'
import { Commit, DocumentTrigger, Workspace } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema/models/documentTriggers'
import {
  DocumentTriggerType,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import { undeployDocumentTrigger } from './deploy'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '../../repositories'
import { eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'

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
    return Result.error(
      new BadRequestError('Cannot delete a trigger in a live version'),
    )
  }

  return transaction.call(
    async (tx) => {
      const triggersScope = new DocumentTriggersRepository(workspace.id, tx)

      const currentDocumentTriggerResult =
        await triggersScope.getTriggerByUuid<T>({
          uuid: triggerUuid,
          commit,
        })

      if (currentDocumentTriggerResult.error) {
        return currentDocumentTriggerResult
      }

      const currentDocumentTrigger = currentDocumentTriggerResult.value
      const liveDocumentTriggerResult = await getLiveDocumentTrigger<T>(
        {
          workspace,
          projectId: currentDocumentTrigger.projectId,
          triggerUuid,
        },
        transaction,
      )

      if (liveDocumentTriggerResult.error) return liveDocumentTriggerResult
      const liveDocumentTrigger = liveDocumentTriggerResult.unwrap()

      const undeployResult = await undeployDocumentTrigger(
        {
          workspace,
          documentTrigger: currentDocumentTrigger,
        },
        transaction,
      )
      if (!Result.isOk(undeployResult)) return undeployResult

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
            triggerHash: liveDocumentTrigger.triggerHash,
            commitId: commit.id,
            deletedAt: new Date(),
            triggerStatus: DocumentTriggerStatus.Deprecated,
            deploymentSettings: null,
          })
          .returning()) as DocumentTrigger<T>[]

        if (!createdTrigger) {
          return Result.error(
            new LatitudeError('Failed to create delete trigger'),
          )
        }

        return Result.ok(createdTrigger)
      }

      return Result.ok(currentDocumentTrigger)
    },
    (deletedTrigger) => {
      publisher.publishLater({
        type: 'documentTriggerDeleted',
        data: {
          workspaceId: workspace.id,
          documentTrigger: deletedTrigger as DocumentTrigger,
          projectId: deletedTrigger.projectId,
          commit,
        },
      })
    },
  )
}
