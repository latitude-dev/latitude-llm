import { BadRequestError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  LatteThreadsRepository,
} from '../../../../../../repositories'
import { defineLatteTool } from '../../types'
import { LatteChange } from '@latitude-data/constants/latte'
import Transaction from '../../../../../../lib/Transaction'
import { WebsocketClient } from '../../../../../../websockets/workers'
import { z } from 'zod'
import { scanDocuments } from '../../../helpers'
import { createLatteThreadCheckpoints } from '../../../threads/checkpoints/createCheckpoint'
import { executeEditAction } from './executeAction'

const editProject = defineLatteTool(
  async ({ projectId, draftUuid, actions }, { workspace, threadUuid }) => {
    // 1. create missing checkpoints
    // 2. perform edit actions
    // 3. notify clients of changes
    // 4. scan documents for errors
    // 5. return updated documents and errors

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
      const latteChanges: LatteChange[] = []
      for await (const action of actions) {
        const result = await executeEditAction(
          { workspace, commit, documents, action },
          tx,
        )
        if (!result.ok) {
          return Result.error(result.error!)
        }
        latteChanges.push(result.unwrap())
      }

      WebsocketClient.sendEvent('latteChanges', {
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
          tx,
        )
        if (!newCheckpointsResult.ok) {
          return Result.error(newCheckpointsResult.error!)
        }
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
      const errors = Object.fromEntries(
        Object.entries(metadatas)
          .map(([path, metadata]) => [path, metadata.errors])
          .filter(([, errors]) => !!errors?.length),
      )

      return Result.ok({
        changes: latteChanges,
        errors,
      })
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
