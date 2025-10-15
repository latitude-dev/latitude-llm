import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentTrigger } from '../../schema/models/types/DocumentTrigger'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { documentTriggers } from '../../schema/models/documentTriggers'
import { DocumentTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { deployDocumentTrigger } from './deploy'
import { publisher } from '../../events/publisher'
import { createTriggerHash } from './helpers/triggerHash'

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
    skipDeployment = false,
  }: {
    workspace: Workspace
    project: Project
    commit: Commit
    document: DocumentVersion
    triggerType: T
    configuration: DocumentTriggerConfiguration<T>
    skipDeployment?: boolean
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
      skipDeployment,
    },
    transaction,
  )
  if (!Result.isOk(deploymentSettingsResult)) return deploymentSettingsResult
  const { deploymentSettings, triggerStatus } =
    deploymentSettingsResult.unwrap()

  const triggerHash = createTriggerHash({ configuration })

  return await transaction.call(
    async (tx) => {
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
          triggerStatus,
          triggerHash,
        })
        .returning()) as DocumentTrigger<T>[]

      if (!documentTrigger) {
        return Result.error(
          new LatitudeError('Failed to create document trigger'),
        )
      }

      return Result.ok(documentTrigger)
    },
    (documentTrigger) => {
      publisher.publishLater({
        type: 'documentTriggerCreated',
        data: {
          workspaceId: workspace.id,
          documentTrigger,
          project,
          commit,
        },
      })
    },
  )
}
