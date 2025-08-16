import { DocumentTriggerType, DocumentVersion } from '@latitude-data/constants'
import { Commit, DocumentTrigger, Workspace } from '../../../../../../browser'
import { IntegrationTriggerConfiguration } from '@latitude-data/constants/documentTriggers'
import { Result } from '../../../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../../../lib/Transaction'
import {
  LatteTriggerAction,
  LatteTriggerChanges,
} from '@latitude-data/constants/latte'
import { NotFoundError } from '@latitude-data/constants/errors'
import {
  DocumentTriggersRepository,
  ProjectsRepository,
} from '../../../../../../repositories'
import { deleteDocumentTrigger } from '../../../../../documentTriggers/delete'
import { updateDocumentTriggerConfiguration } from '../../../../../documentTriggers/update'
import { createDocumentTrigger } from '../../../../../documentTriggers/create'

async function executeTriggerActions(
  {
    workspace,
    commit,
    documents,
    promptUuid,
    action,
  }: {
    workspace: Workspace
    commit: Commit
    documents: DocumentVersion[]
    promptUuid: string
    action: LatteTriggerAction
  },
  transaction = new Transaction(),
): PromisedResult<LatteTriggerChanges> {
  if (action.operation === 'create') {
    const document = documents.find((doc) => doc.documentUuid === promptUuid)

    const projectRepository = new ProjectsRepository(workspace.id)
    const project = await projectRepository
      .getProjectById(commit.projectId)
      .then((r) => r.unwrap())

    if (!document) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${promptUuid} not found in commit ${commit.uuid}.`,
        ),
      )
    }

    const result = await createDocumentTrigger(
      {
        workspace,
        project,
        commit,
        document: document,
        triggerType: action.triggerType,
        configuration: action.configuration,
      },
      transaction,
    )

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      promptUuid: promptUuid,
      triggerType: action.triggerType,
    })
  }

  if (action.operation === 'delete') {
    const triggerResult = await getTriggerDocument(
      action,
      workspace.id,
      commit,
      promptUuid,
    )

    if (!triggerResult.ok) {
      return Result.error(triggerResult.error!)
    }

    const documentTrigger = triggerResult.unwrap()

    if (action.triggerType === DocumentTriggerType.Integration) {
      const projectsRepository = new ProjectsRepository(workspace.id)
      const project = await projectsRepository
        .getProjectById(commit.projectId)
        .then((r) => r.unwrap())

      if (!project) {
        return Result.error(
          new NotFoundError(`Project with ID ${commit.projectId} not found.`),
        )
      }
    }

    const result = await deleteDocumentTrigger(
      {
        workspace,
        commit,
        triggerUuid: documentTrigger.uuid,
      },
      transaction,
    )

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      promptUuid: promptUuid,
      triggerType: action.triggerType,
    })
  }

  if (action.operation === 'update') {
    const triggerResult = await getTriggerDocument(
      action,
      workspace.id,
      commit,
      promptUuid,
    )

    if (!triggerResult.ok) {
      return Result.error(triggerResult.error!)
    }

    const documentTrigger = triggerResult.unwrap()

    const result = await updateDocumentTriggerConfiguration(
      {
        workspace,
        commit,
        triggerUuid: documentTrigger.uuid,
        configuration: action.configuration,
      },
      transaction,
    )

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      promptUuid: promptUuid,
      triggerType: action.triggerType,
    })
  }
  return Result.error(new Error(`Unsupported action operation type`))
}

export default executeTriggerActions

async function getTriggerDocument(
  action: LatteTriggerAction,
  workspaceId: number,
  commit: Commit,
  promptUuid: string,
): PromisedResult<DocumentTrigger> {
  const documentTriggersRepository = new DocumentTriggersRepository(workspaceId)

  const documentTriggers = await documentTriggersRepository
    .getTriggersInDocument({
      documentUuid: promptUuid,
      commit,
    })
    .then((r) => r.unwrap())

  if (documentTriggers.length === 0) {
    return Result.error(
      new NotFoundError(
        `Document with UUID ${promptUuid} has no document triggers.`,
      ),
    )
  }

  if (action.triggerType === DocumentTriggerType.Integration) {
    const integrationTriggers = documentTriggers.filter(
      (trigger) => trigger.triggerType === DocumentTriggerType.Integration,
    )

    const integrationTrigger = integrationTriggers.find((trigger) => {
      const config = trigger.configuration as IntegrationTriggerConfiguration
      return config.integrationId === action.configuration.integrationId
    })

    if (!integrationTrigger) {
      return Result.error(
        new NotFoundError(
          `Integration trigger with ID ${action.configuration.integrationId} not found for document with UUID ${promptUuid}.`,
        ),
      )
    }

    return Result.ok(integrationTrigger)
  }

  // For email and scheduled triggers, there can only be one per document
  const triggerOfType = documentTriggers.find(
    (trigger) => trigger.triggerType === action.triggerType,
  )

  if (!triggerOfType) {
    return Result.error(
      new NotFoundError(
        `${action.triggerType} trigger not found for document with UUID ${promptUuid}.`,
      ),
    )
  }

  return Result.ok(triggerOfType)
}
