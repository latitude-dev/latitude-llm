import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../../lib/Result'
import { LatteChange, LatteEditAction } from '@latitude-data/constants/latte'
import { Commit, DocumentVersion, Workspace } from '../../../../../../browser'
import { createNewDocument, updateDocument } from '../../../../../documents'
import Transaction, { PromisedResult } from '../../../../../../lib/Transaction'

export async function executeEditAction(
  {
    workspace,
    commit,
    documents,
    action,
  }: {
    workspace: Workspace
    commit: Commit
    documents: DocumentVersion[]
    action: LatteEditAction
  },
  transaction = new Transaction(),
): PromisedResult<LatteChange> {
  if (action.operation === 'update') {
    const document = documents.find(
      (doc) => doc.documentUuid === action.promptUuid,
    )
    if (!document) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${action.promptUuid} not found in commit ${commit.uuid}.`,
        ),
      )
    }

    const updateResult = await updateDocument(
      {
        commit,
        document,
        content: action.content,
        path: action.path,
      },
      transaction,
    )
    if (!Result.isOk(updateResult)) {
      return Result.error(updateResult.error!)
    }

    const updatedDocument = updateResult.unwrap()

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      previous: document,
      current: updatedDocument,
    })
  }

  if (action.operation === 'create') {
    const existingDocument = documents.find((doc) => doc.path === action.path)

    if (existingDocument) {
      return Result.error(
        new BadRequestError(
          `Document with path ${action.path} already exists in commit ${commit.uuid}.`,
        ),
      )
    }
    const createResult = await createNewDocument(
      {
        workspace,
        commit,
        path: action.path,
        content: action.content,
        createDemoEvaluation: true,
        includeDefaultContent: false,
      },
      transaction,
    )
    if (!Result.isOk(createResult)) {
      return Result.error(createResult.error!)
    }

    const newDocument = createResult.unwrap()

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      previous: null,
      current: newDocument,
    })
  }

  if (action.operation === 'delete') {
    const document = documents.find(
      (doc) => doc.documentUuid === action.promptUuid,
    )
    if (!document) {
      return Result.error(
        new NotFoundError(
          `Document with UUID ${action.promptUuid} not found in commit ${commit.uuid}.`,
        ),
      )
    }

    const deleteResult = await updateDocument(
      {
        commit,
        document,
        deletedAt: new Date(),
      },
      transaction,
    )
    if (!Result.isOk(deleteResult)) {
      return Result.error(deleteResult.error!)
    }

    const updatedDocument = deleteResult.unwrap()

    return Result.ok({
      projectId: commit.projectId,
      draftUuid: commit.uuid,
      previous: document,
      current: updatedDocument,
    })
  }

  return Result.error(
    new BadRequestError(
      `Unsupported operation: ${(action as LatteEditAction).operation}`,
    ),
  )
}
