import { BadRequestError, LatitudeError } from '@latitude-data/constants/errors'
import type { Commit, DocumentTrigger, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction, { type PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema'
import type { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import type { DocumentTriggerType } from '@latitude-data/constants'
import { deployDocumentTrigger, undeployDocumentTrigger } from './deploy'
import { DocumentTriggersRepository } from '../../repositories'

/**
 * Updates the configuration of a document trigger at a given commit.
 * The deployment settings are being handled automatically:
 *  - If the trigger is being updated from a merged version, it will deploy a new instance of the trigger so both draft and merged versions have a different trigger instance.
 *  - If the trigger had already been updated from this draft version, it will undeploy the existing trigger and redeploy it with the new configuration.
 *
 * The trigger must exist and be available from the given commit.
 * The commit must not be merged.
 */
export async function updateDocumentTriggerConfiguration<T extends DocumentTriggerType>(
  {
    workspace,
    commit,
    triggerUuid,
    configuration,
  }: {
    workspace: Workspace
    commit: Commit
    triggerUuid: string
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
  }>(async (tx) => {
    const triggersScope = new DocumentTriggersRepository(workspace.id, tx)
    const documentTriggerResult = await triggersScope.getTriggerByUuid<T>({
      uuid: triggerUuid,
      commit,
    })
    if (!Result.isOk(documentTriggerResult)) return documentTriggerResult
    const documentTrigger = documentTriggerResult.unwrap()

    if (commit.projectId !== documentTrigger.projectId) {
      return Result.error(new BadRequestError('Cannot update a trigger from a different project'))
    }

    return Result.ok({
      documentTrigger,
      isDraftVersion: documentTrigger.commitId === commit.id,
    })
  })
  if (!Result.isOk(contextResult)) return contextResult
  const { documentTrigger, isDraftVersion } = contextResult.unwrap()

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
  const deploymentSettings = deployResult.unwrap()

  return transaction.call(async (tx) => {
    const [upsertResult] = (await tx
      .insert(documentTriggers)
      .values({
        workspaceId: workspace.id,
        projectId: commit.projectId,
        uuid: triggerUuid,
        documentUuid: documentTrigger.documentUuid,
        triggerType: documentTrigger.triggerType,
        commitId: commit.id,
        configuration,
        deploymentSettings,
        enabled: false,
      })
      .onConflictDoUpdate({
        target: [documentTriggers.uuid, documentTriggers.commitId],
        set: {
          configuration,
          deploymentSettings,
          enabled: false,
        },
      })
      .returning()) as DocumentTrigger<T>[]

    if (!upsertResult) {
      return Result.error(new LatitudeError('Failed to update document trigger configuration'))
    }

    return Result.ok(upsertResult)
  })
}
