import {
  BadRequestError,
  LatitudeError,
  NotFoundError,
} from '@latitude-data/constants/errors'
import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  LatteThreadsRepository,
} from '../../../../../repositories'
import { defineLatteTool } from '../types'
import { LatteEditAction } from '@latitude-data/constants/latte'
import { Commit, DocumentVersion, Workspace } from '../../../../../browser'
import { createNewDocument, updateDocument } from '../../../../documents'
import Transaction, { PromisedResult } from '../../../../../lib/Transaction'
import { database } from '../../../../../client'
import { promptPresenter } from '../presenters'
import { WebsocketClient } from '../../../../../websockets/workers'
import { z } from 'zod'
import { scanDocuments } from '../../helpers'
import { createLatteThreadCheckpoints } from '../../threads'

async function executeEditAction(
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
  db = database,
): PromisedResult<DocumentVersion> {
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

    return await updateDocument(
      {
        commit,
        document,
        content: action.content,
        path: action.path,
      },
      db,
    )
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
    return await createNewDocument(
      {
        workspace,
        commit,
        path: action.path,
        content: action.content,
      },
      db,
    )
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

    return await updateDocument(
      {
        commit,
        document,
        deletedAt: new Date(),
      },
      db,
    )
  }

  return Result.error(
    new BadRequestError(
      `Unsupported operation: ${(action as LatteEditAction).operation}`,
    ),
  )
}

const editProject = defineLatteTool(
  async ({ projectId, draftUuid, actions }, { workspace, threadUuid }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId: projectId,
      uuid: draftUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    if (commit.mergedAt) {
      return Result.error(
        new BadRequestError(
          `Cannot edit a merged commit. Select an existing draft or create a new one.`,
        ),
      )
    }

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const documents = await documentsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    const threadsScope = new LatteThreadsRepository(workspace.id)
    const threadCheckpoints = await threadsScope
      .findAllCheckpoints(threadUuid)
      .then((r) => r.unwrap())

    return await Transaction.call(async (tx) => {
      // Update all documents requested
      const results = await Promise.all(
        actions.map((action) =>
          executeEditAction({ workspace, commit, documents, action }, tx),
        ),
      )

      const errors = results.filter((r) => !r.ok)
      if (errors.length > 0) {
        return Result.error(
          new LatitudeError(
            `${errors.length} actions failed. No changes were made:\n${errors.map((e) => e.error!.message).join('\n')}`,
          ),
        )
      }

      const updatedDocuments = results.map((r) => r.unwrap())
      WebsocketClient.sendEvent('latteDraftUpdate', {
        workspaceId: workspace.id,
        data: { draftUuid, updates: updatedDocuments },
      })

      // Create the missing checkpoints (status of the previous documents for documents that were updated and not previously checkpointed)
      const missingCheckpoints = updatedDocuments
        .filter(
          (doc) =>
            !threadCheckpoints.some(
              (checkpoint) =>
                checkpoint.documentUuid === doc.documentUuid &&
                checkpoint.commitId === commit.id,
            ),
        )
        .reduce(
          (acc, { documentUuid }) => ({
            ...acc,
            [documentUuid]: documents.find(
              (doc) => doc.documentUuid === documentUuid,
            ),
          }),
          {},
        )

      const checkpointsResult = await createLatteThreadCheckpoints(
        {
          threadUuid,
          commitId: commit.id,
          checkpoints: missingCheckpoints,
        },
        tx,
      )
      if (!checkpointsResult.ok) {
        return Result.error(checkpointsResult.error!)
      }

      // Scan the updated project for errors
      const newDocuments = await documentsScope
        .getDocumentsAtCommit(commit)
        .then((r) => r.unwrap())

      const metadatasResult = await scanDocuments(
        {
          documents: newDocuments,
          commit,
          workspace,
        },
        tx,
      )

      if (!metadatasResult.ok) {
        return Result.error(metadatasResult.error!)
      }

      const metadatas = metadatasResult.unwrap()

      return Result.ok(
        updatedDocuments.map((document) =>
          promptPresenter({
            document,
            versionUuid: commit.uuid,
            projectId,
            metadata: metadatas[document.path],
          }),
        ),
      )
    })
  },
  z.object({
    projectId: z.number(),
    draftUuid: z.string(),
    actions: z.array(
      z.union([
        z.object({
          type: z.literal('prompt'),
          operation: z.literal('update'),
          promptUuid: z.string(),
          path: z.string().optional(),
          content: z.string().optional(),
        }),
        z.object({
          type: z.literal('prompt'),
          operation: z.literal('create'),
          path: z.string(),
          content: z.string(),
        }),
        z.object({
          type: z.literal('prompt'),
          operation: z.literal('delete'),
          promptUuid: z.string(),
        }),
      ]),
    ),
  }),
)

export default editProject
