import { ConversationMetadata } from '@latitude-data/compiler'
import { LatteChange, LatteEditAction } from '@latitude-data/constants/latte'
import { Commit, DocumentVersion, Workspace } from '../../../../../../browser'
import { Result } from '../../../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../../../lib/Transaction'
import {
  DocumentVersionsRepository,
  LatteThreadsRepository,
} from '../../../../../../repositories'
import { WebsocketClient } from '../../../../../../websockets/workers'
import { scanDocuments } from '../../../helpers'
import { createLatteThreadCheckpoints } from '../../../threads/checkpoints/createCheckpoint'
import { executeEditAction } from './handleAction'

export async function executeLatteActions({
  workspace,
  threadUuid,
  commit,
  documents,
  actions,
}: {
  workspace: Workspace
  threadUuid: string
  commit: Commit
  documents: DocumentVersion[]
  actions: LatteEditAction[]
}): PromisedResult<{
  changes: LatteChange[]
  metadatas: { [path: string]: ConversationMetadata }
}> {
  // 1. create missing checkpoints
  // 2. perform edit actions
  // 3. notify clients of changes
  // 4. scan documents for errors
  // 5. return updated documents and errors

  const threadsScope = new LatteThreadsRepository(workspace.id)
  const threadCheckpointsResult =
    await threadsScope.findAllCheckpoints(threadUuid)
  if (!Result.isOk(threadCheckpointsResult)) {
    return threadCheckpointsResult
  }
  const threadCheckpoints = threadCheckpointsResult.unwrap()

  const transaction = new Transaction()

  return await transaction.call(async (tx) => {
    // Update all documents requested
    const latteChanges: LatteChange[] = []
    for await (const action of actions) {
      const result = await executeEditAction(
        { workspace, commit, documents, action },
        transaction,
      )
      if (!result.ok) {
        return Result.error(result.error!)
      }
      latteChanges.push(result.unwrap())
    }

    WebsocketClient.sendEvent('latteProjectChanges', {
      workspaceId: workspace.id,
      data: {
        threadUuid,
        changes: latteChanges,
      },
    })

    // Create the missing checkpoints (status of the previous documents for documents that were updated and not previously checkpointed)
    const missingCheckpoints = latteChanges
      .filter(
        (change) =>
          !threadCheckpoints.some(
            (checkpoint) =>
              checkpoint.documentUuid === change.current.documentUuid &&
              checkpoint.commitId === commit.id,
          ),
      )
      .reduce(
        (acc, change) => ({
          ...acc,
          [change.current.documentUuid]: change.previous,
        }),
        {},
      )

    if (Object.keys(missingCheckpoints).length) {
      const newCheckpointsResult = await createLatteThreadCheckpoints(
        {
          threadUuid,
          commitId: commit.id,
          checkpoints: missingCheckpoints,
        },
        transaction,
      )
      if (!newCheckpointsResult.ok) {
        return Result.error(newCheckpointsResult.error!)
      }
    }

    // Scan the updated project for errors
    const documentsScope = new DocumentVersionsRepository(workspace.id, tx)
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

    const metadatas = metadatasResult.unwrap() as {
      [path: string]: ConversationMetadata
    }
    return Result.ok({
      changes: latteChanges,
      metadatas,
    })
  })
}
