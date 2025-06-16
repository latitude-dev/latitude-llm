import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { LatteThreadCheckpoint } from '../../../../browser'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  LatteThreadsRepository,
} from '../../../../repositories'
import { getChangesToRevertDocuments } from '../../../commits/computeRevertChanges'
import { updateDocument } from '../../../documents'
import {
  getDocumentsFromCheckpoint,
  groupCheckpointsByCommitId,
} from './helpers'

export async function undoLatteThreadChanges(
  {
    workspaceId,
    threadUuid,
  }: {
    workspaceId: number
    threadUuid: string
  },
  db = database,
): PromisedResult<undefined> {
  const threadsScope = new LatteThreadsRepository(workspaceId, db)
  const checkpoints = await threadsScope
    .findAllCheckpoints(threadUuid)
    .then((r) => r.unwrap())

  const checkpointsByCommitId = groupCheckpointsByCommitId(checkpoints)
  const results = await Promise.all(
    Object.entries(checkpointsByCommitId).map(
      async ([commitId, checkpoints]) => {
        return undoChangesToDraft(
          {
            workspaceId,
            commitId: parseInt(commitId, 10),
            checkpoints,
          },
          db,
        )
      },
    ),
  )

  for (const result of results.flat()) {
    if (!result.ok) {
      return Result.error(result.error!)
    }
  }

  return Result.nil()
}

export async function undoChangesToDraft(
  {
    workspaceId,
    commitId,
    checkpoints,
  }: {
    workspaceId: number
    commitId: number
    checkpoints: LatteThreadCheckpoint[]
  },
  db = database,
) {
  const commitScope = new CommitsRepository(workspaceId, db)
  const commitResult = await commitScope.find(commitId)
  if (!commitResult.ok) {
    return Result.error(commitResult.error!)
  }
  const commit = commitResult.unwrap()

  if (commit.mergedAt) {
    return Result.error(
      new BadRequestError('Cannot undo changes to a merged commit'),
    )
  }

  const documentsScope = new DocumentVersionsRepository(workspaceId, db)
  const currentDraftState = await documentsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  const checkpointedState = getDocumentsFromCheckpoint({
    documents: currentDraftState,
    checkpoints,
  })

  const changesToUpdate = getChangesToRevertDocuments({
    originalDocuments: checkpointedState,
    changedDocuments: currentDraftState,
    targetDraftDocuments: checkpointedState,
  })

  const updateResults = await Promise.all(
    changesToUpdate.map(async (docChange) => {
      const document = currentDraftState.find(
        (doc) => doc.documentUuid === docChange.documentUuid,
      )

      if (!document) {
        return Result.error(
          new NotFoundError(
            `Document ${docChange.documentUuid} not found in commit ${commit.uuid}.`,
          ),
        )
      }

      return updateDocument({
        commit,
        document,
        path: docChange.path,
        content: docChange.content,
        deletedAt: docChange.deletedAt,
      })
    }),
  )

  const failedUpdates = updateResults.filter((result) => !result.ok)
  if (failedUpdates.length > 0) {
    return Result.error(
      new BadRequestError(
        `Failed to update some documents:\n${failedUpdates
          .map((r) => r.error?.message)
          .join('\n')}`,
      ),
    )
  }

  return Result.ok(updateResults.map((r) => r.unwrap()))
}
