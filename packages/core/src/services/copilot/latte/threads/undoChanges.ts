import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { DocumentVersion, LatteThreadCheckpoint } from '../../../../browser'
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

  // Group checkpoints by commitId
  const checkpointsByCommitId = checkpoints.reduce(
    (acc, checkpoint) => {
      const commitId = checkpoint.commitId
      if (!acc[commitId]) {
        acc[commitId] = []
      }
      acc[commitId].push(checkpoint)
      return acc
    },
    {} as Record<number, LatteThreadCheckpoint[]>,
  )

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

function getCheckpointedState({
  currentState,
  checkpoints,
}: {
  currentState: DocumentVersion[]
  checkpoints: LatteThreadCheckpoint[]
}): DocumentVersion[] {
  checkpoints.forEach(({ data: documentData, documentUuid }) => {
    if (!documentData) {
      // document did not exist in the checkpoint, so we remove it
      currentState = currentState.filter(
        (doc) => doc.documentUuid !== documentUuid,
      )
      return
    }

    // document existed in the checkpoint, so we return it to that state
    currentState = currentState.map((doc) => {
      if (doc.documentUuid !== documentUuid) return doc
      return documentData as DocumentVersion
    })
  })

  return currentState
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

  const checkpointedState = getCheckpointedState({
    currentState: currentDraftState,
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
