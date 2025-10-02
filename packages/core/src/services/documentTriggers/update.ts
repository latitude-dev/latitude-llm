import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '@latitude-data/constants/errors'
import { Commit, DocumentTrigger, Workspace } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema/models/documentTriggers'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { DocumentTriggerType } from '@latitude-data/constants'
import { deployDocumentTrigger, undeployDocumentTrigger } from './deploy'
import {
  DocumentTriggersRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { createTriggerHash } from './helpers/triggerHash'

/**
 * Updates the configuration of a document trigger at a given commit.
 * The deployment settings are being handled automatically:
 *  - If the trigger is being updated from a merged version, it will deploy a new instance of the trigger so both draft and merged versions have a different trigger instance.
 *  - If the trigger had already been updated from this draft version, it will undeploy the existing trigger and redeploy it with the new configuration.
 *
 * The trigger must exist and be available from the given commit.
 * The commit must not be merged.
 */
export async function updateDocumentTriggerConfiguration<
  T extends DocumentTriggerType,
>(
  {
    workspace,
    commit,
    triggerUuid,
    documentUuid,
    configuration,
  }: {
    workspace: Workspace
    commit: Commit
    triggerUuid: string
    documentUuid?: string
    configuration: DocumentTriggerConfiguration<T>
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger<T>> {
  if (commit.mergedAt) {
    return Result.error(new BadRequestError('Cannot update a merged commit'))
  }

  const contextResult = await transaction.call<{
    documentTrigger: DocumentTrigger<T>
    isDraftVersion: boolean
    documentAssigned?: string
  }>(async (tx) => {
    if (documentUuid) {
      const documentVersionsRepo = new DocumentVersionsRepository(
        workspace.id,
        tx,
      )
      const documentResult = await documentVersionsRepo.getDocumentAtCommit({
        commitUuid: commit.uuid,
        projectId: commit.projectId,
        documentUuid,
      })
      if (!Result.isOk(documentResult)) {
        return Result.error(
          new NotFoundError(
            `Document with uuid '${documentUuid}' not found in workspace`,
          ),
        )
      }
    }

    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const documentTriggerResult = await triggersScope.getTriggerByUuid<T>({
      uuid: triggerUuid,
      commit,
    })
    if (!Result.isOk(documentTriggerResult)) return documentTriggerResult
    const documentTrigger = documentTriggerResult.unwrap()

    if (commit.projectId !== documentTrigger.projectId) {
      return Result.error(
        new BadRequestError('Cannot update a trigger from a different project'),
      )
    }

    return Result.ok({
      documentTrigger,
      isDraftVersion: documentTrigger.commitId === commit.id,
      documentAssigned: documentUuid,
    })
  })

  if (!Result.isOk(contextResult)) return contextResult
  const { documentTrigger, isDraftVersion, documentAssigned } =
    contextResult.unwrap()

  // Phase 2: external-service operations outside of any active transaction
  if (isDraftVersion) {
    const undeployResult = await undeployDocumentTrigger(
      {
        workspace,
        documentTrigger,
      },
      transaction,
    )
    if (!Result.isOk(undeployResult)) return undeployResult
  }

  const deployResult = await deployDocumentTrigger(
    {
      workspace,
      commit,
      triggerUuid,
      triggerType: documentTrigger.triggerType,
      configuration,
    },
    transaction,
  )
  if (!Result.isOk(deployResult)) return deployResult
  const { deploymentSettings, triggerStatus } = deployResult.unwrap()

  const triggerHash = createTriggerHash({ configuration })

  return transaction.call(async (tx) => {
    const [upsertResult] = (await tx
      .insert(documentTriggers)
      .values({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        uuid: triggerUuid,
        documentUuid: documentAssigned || documentTrigger.documentUuid,
        triggerType: documentTrigger.triggerType,
        commitId: commit.id,
        configuration,
        deploymentSettings,
        triggerStatus,
        triggerHash,
        enabled: false,
      })
      .onConflictDoUpdate({
        target: [documentTriggers.uuid, documentTriggers.commitId],
        set: {
          documentUuid: documentAssigned || documentTrigger.documentUuid,
          configuration,
          deploymentSettings,
          triggerStatus,
          enabled: false,
        },
      })
      .returning()) as DocumentTrigger<T>[]

    if (!upsertResult) {
      return Result.error(
        new LatitudeError('Failed to update document trigger configuration'),
      )
    }

    return Result.ok(upsertResult)
  })
}
