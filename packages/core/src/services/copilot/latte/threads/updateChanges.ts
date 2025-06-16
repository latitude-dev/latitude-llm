import { LatteThreadCheckpoint } from '../../../../browser'
import { database } from '../../../../client'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  LatteThreadsRepository,
} from '../../../../repositories'
import { WebsocketClient } from '../../../../websockets/workers'
import { changesPresenter } from '../../../commits'
import {
  getDocumentsFromCheckpoint,
  groupCheckpointsByCommitId,
} from './helpers'
import { LatteThreadChanges } from '@latitude-data/constants/latte'

export async function updateLatteChanges(
  {
    threadUuid,
    workspaceId,
  }: {
    threadUuid: string
    workspaceId: number
  },
  db = database,
): PromisedResult<LatteThreadChanges[]> {
  console.log('Calculating changes for thread:', threadUuid)
  const threadsScope = new LatteThreadsRepository(workspaceId, db)
  const threadResult = await threadsScope.findByUuid({ threadUuid })
  if (!threadResult.ok) {
    return Result.error(threadResult.error!)
  }

  const checkpoints = await threadsScope
    .findAllCheckpoints(threadUuid)
    .then((r) => r.unwrap())

  const checkpointsByCommit = groupCheckpointsByCommitId(checkpoints)

  const results: LatteThreadChanges[] = []
  for await (const [commitId, checkpoints] of Object.entries(
    checkpointsByCommit,
  )) {
    const commitChanges = await getThreadChangesForCommit(
      {
        workspaceId,
        commitId: parseInt(commitId, 10),
        checkpoints,
      },
      db,
    )
    if (!commitChanges.ok) {
      return Result.error(commitChanges.error!)
    }
    results.push(commitChanges.unwrap())
  }

  WebsocketClient.sendEvent('latteChanges', {
    workspaceId,
    data: { threadUuid, changes: results },
  })

  console.log('Found', results.length, 'changes')

  return Result.ok(results)
}

async function getThreadChangesForCommit(
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
): PromisedResult<LatteThreadChanges> {
  const commitsScope = new CommitsRepository(workspaceId, db)
  const commitResult = await commitsScope.find(commitId)
  if (!commitResult.ok) {
    return Result.error(commitResult.error!)
  }
  const commit = commitResult.unwrap()

  const documentsScope = new DocumentVersionsRepository(workspaceId, db)
  const documentsResult = await documentsScope.getDocumentsAtCommit(commit)
  const commitDocuments = documentsResult.unwrap()

  const checkpointDocuments = getDocumentsFromCheckpoint({
    documents: commitDocuments,
    checkpoints,
  })

  const latteChanges = commitDocuments.filter((doc) =>
    checkpoints.some((c) => c.documentUuid === doc.documentUuid),
  )

  return Result.ok({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
    changes: changesPresenter({
      previousCommitDocuments: checkpointDocuments,
      currentCommitChanges: latteChanges,
      errors: {},
    }),
  })
}
