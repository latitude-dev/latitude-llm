import { DocumentVersion } from '@latitude-data/constants'
import { DocumentTrigger, Project, Workspace } from '../../browser'
import { DocumentTriggerWithConfiguration } from './helpers/schema'
import {
  generateUUIDIdentifier,
  LatitudeError,
  PromisedResult,
  Result,
  Transaction,
} from '../../lib'
import { documentTriggers } from '../../schema'
import { database } from '../../client'

export async function createDocumentTrigger(
  {
    workspace,
    document,
    project,
    triggerType,
    configuration,
  }: {
    workspace: Workspace
    document: DocumentVersion
    project: Project
  } & DocumentTriggerWithConfiguration,
  db = database,
): PromisedResult<DocumentTrigger> {
  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(documentTriggers)
      .values({
        uuid: generateUUIDIdentifier(),
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        projectId: project.id,
        triggerType,
        configuration,
      })
      .returning()

    if (!result.length) {
      return Result.error(
        new LatitudeError('Failed to create document trigger'),
      )
    }

    return Result.ok(result[0]! as DocumentTrigger)
  }, db)
}
