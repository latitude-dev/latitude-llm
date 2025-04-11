import { DocumentVersion } from '@latitude-data/constants'
import { DocumentTrigger, Project, Workspace } from '../../browser'
import { InsertDocumentTriggerWithConfiguration } from './helpers/schema'
import { documentTriggers } from '../../schema'
import { database } from '../../client'
import { buildConfiguration } from './helpers/buildConfiguration'
import { generateUUIDIdentifier } from './../../lib/generateUUID'
import { LatitudeError } from './../../lib/errors'
import Transaction, { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

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
  } & InsertDocumentTriggerWithConfiguration,
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
        configuration: buildConfiguration({ triggerType, configuration }),
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
