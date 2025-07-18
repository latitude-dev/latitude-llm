import { DocumentVersion } from '@latitude-data/constants'
import { Commit, Workspace } from '../../../../../browser'
import { InsertDocumentTriggerWithConfiguration } from '@latitude-data/constants/documentTriggers'
import { Result } from '../../../../../lib/Result'
import { createDocumentTrigger } from '../../../../documentTriggers'
import Transaction, { PromisedResult } from '../../../../../lib/Transaction'
import {
  LatteTriggerAction,
  LatteTriggerChanges,
} from '@latitude-data/constants/latte'
import { NotFoundError } from '@latitude-data/constants/errors'
import {
  DocumentTriggersRepository,
  ProjectsRepository,
} from '../../../../../repositories'
import { deleteDocumentTrigger } from '../../../../documentTriggers/delete'
import { updateDocumentTriggerConfiguration } from '../../../../documentTriggers/update'

async function executeTriggerActions(
  {
    workspace,
    commit,
    documents,
    action,
  }: {
    workspace: Workspace
    commit: Commit
    documents: DocumentVersion[]
    action: LatteTriggerAction
  },
  transaction = new Transaction(),
): PromisedResult<LatteTriggerChanges> {
  if (action.operation === 'create') {
    const document = documents.find(
      (doc) => doc.documentUuid === action.promptUuid,
    )

    const projectRepository = new ProjectsRepository(workspace.id)
    const project = await projectRepository
      .getProjectById(commit.projectId)
      .then((r) => r.unwrap())

    if (!document) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${action.promptUuid} not found in commit ${commit.uuid}.`,
        ),
      )
    }

    const triggerInput = {
      triggerType: action.triggerType,
      configuration: action.configuration,
    } as InsertDocumentTriggerWithConfiguration

    const result = await createDocumentTrigger(
      {
        workspace,
        project,
        document,
        ...triggerInput,
      },
      transaction,
    )

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      promptUuid: action.promptUuid,
      triggerType: action.triggerType,
    })
  }

  if (action.operation === 'delete') {
    const documentTriggersRepository = new DocumentTriggersRepository(
      workspace.id,
    )
    const documentTrigger = await documentTriggersRepository
      .findByDocumentUuid(action.promptUuid)
      // Assuming there can only be one trigger of the specified type per document
      // TODO - change this when adding integrations, as they have the same type
      .then((documentTriggers) =>
        documentTriggers.find(
          (trigger) => trigger.triggerType === action.triggerType,
        ),
      )

    if (!documentTrigger) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${action.promptUuid} has no document triggers.`,
        ),
      )
    }

    const result = await deleteDocumentTrigger(
      {
        workspace,
        documentTrigger: documentTrigger,
      },
      transaction,
    )

    if (!result.ok) {
      return Result.error(result.error!)
    }

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      promptUuid: action.promptUuid,
      triggerType: action.triggerType,
    })
  }

  if (action.operation === 'update') {
    const documentTriggersRepository = new DocumentTriggersRepository(
      workspace.id,
    )
    const documentTrigger = await documentTriggersRepository
      .findByDocumentUuid(action.promptUuid)
      // Assuming there can only be one trigger of the specified type per document
      // TODO - change this when adding integrations, as they have the same type
      .then((documentTriggers) =>
        documentTriggers.find(
          (trigger) => trigger.triggerType === action.triggerType,
        ),
      )

    if (!documentTrigger) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${action.promptUuid} has no document triggers.`,
        ),
      )
    }

    const result = await updateDocumentTriggerConfiguration(
      {
        workspace,
        documentTrigger: documentTrigger,
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
      promptUuid: action.promptUuid,
      triggerType: action.triggerType,
    })
  }
  return Result.error(new Error(`Unsupported action operation type`))
}

export default executeTriggerActions
