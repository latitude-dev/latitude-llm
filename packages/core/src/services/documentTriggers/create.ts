import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { Commit, DocumentTrigger, Project, Workspace } from '../../browser'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { deployDocumentTrigger } from './deploy'

export async function createDocumentTrigger<
  T extends DocumentTriggerType = DocumentTriggerType,
>(
  {
    workspace,
    project,
    commit,
    document,
    triggerType,
    configuration,
  }: {
    workspace: Workspace
    project: Project
    commit: Commit
    document: DocumentVersion
    triggerType: T
    configuration: DocumentTriggerConfiguration<T>
  },
  transaction = new Transaction(),
): PromisedResult<DocumentTrigger<T>> {
  if (commit.mergedAt) {
    return Result.error(
      new BadRequestError('Cannot create document trigger in a merged commit'),
    )
  }

  const triggerUuid = generateUUIDIdentifier()
  const deploymentSettingsResult = await deployDocumentTrigger(
    {
      workspace,
      commit,
      triggerUuid,
      triggerType,
      configuration,
    },
    transaction,
  )
  if (!Result.isOk(deploymentSettingsResult)) return deploymentSettingsResult
  const deploymentSettings = deploymentSettingsResult.unwrap()

  return await transaction.call(async (tx) => {
    const [documentTrigger] = (await tx
      .insert(documentTriggers)
      .values({
        uuid: triggerUuid,
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        triggerType,
        configuration,
        deploymentSettings,
      })
      .returning()) as DocumentTrigger<T>[]

    if (!documentTrigger) {
      return Result.error(
        new LatitudeError('Failed to create document trigger'),
      )
    }

    return Result.ok(documentTrigger)
  })
}
