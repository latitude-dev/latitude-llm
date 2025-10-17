import { Result } from '../../../../../lib/Result'
import Transaction from '../../../../../lib/Transaction'
import { restoreThreadCheckpoint } from './undoChanges'
import { type Workspace } from '../../../../../schema/models/types/Workspace'
import { LatteThreadsRepository } from '../../../../../repositories'
import { latteThreadCheckpoints } from '../../../../../schema/models/latteThreadCheckpoints'
import { inArray } from 'drizzle-orm'

export async function partialRejectLatteChanges(
  {
    workspace,
    threadUuid,
    documentUuidsToReject,
  }: {
    workspace: Workspace
    threadUuid: string
    documentUuidsToReject: string[]
  },
  transaction = new Transaction(),
) {
  if (documentUuidsToReject.length === 0) return Result.ok([])

  return transaction.call(async (tx) => {
    const checkpoints = await new LatteThreadsRepository(
      workspace.id,
      tx,
    ).findCheckpointsByDocument({
      threadUuid,
      documentUuids: documentUuidsToReject,
    })
    if (checkpoints.length === 0) return Result.ok([])

    for (const checkpoint of checkpoints) {
      await restoreThreadCheckpoint(checkpoint, transaction).then((r) =>
        r.unwrap(),
      )
    }

    await tx.delete(latteThreadCheckpoints).where(
      inArray(
        latteThreadCheckpoints.id,
        checkpoints.map((c) => c.id),
      ),
    )

    return Result.ok(checkpoints)
  })
}
