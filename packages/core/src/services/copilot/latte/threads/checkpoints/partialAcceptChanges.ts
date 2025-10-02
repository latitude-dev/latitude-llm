import { Result } from '../../../../../lib/Result'
import Transaction from '../../../../../lib/Transaction'
import { inArray } from 'drizzle-orm'
import { latteThreadCheckpoints } from '../../../../../schema/models/latteThreadCheckpoints'
import { LatteThreadsRepository } from '../../../../../repositories'
import { Workspace } from '../../../../../schema/types'

export async function partialAcceptLatteChanges(
  {
    workspace,
    threadUuid,
    documentUuidsToAccept,
  }: {
    workspace: Workspace
    threadUuid: string
    documentUuidsToAccept: string[]
  },
  transaction = new Transaction(),
) {
  if (documentUuidsToAccept.length === 0) return Result.ok([])

  const checkpointsToUpdate = await new LatteThreadsRepository(
    workspace.id,
  ).findCheckpointsByDocument({
    threadUuid,
    documentUuids: documentUuidsToAccept,
  })
  if (checkpointsToUpdate.length === 0) return Result.ok([])

  return transaction.call(async (tx) => {
    await tx.delete(latteThreadCheckpoints).where(
      inArray(
        latteThreadCheckpoints.id,
        checkpointsToUpdate.map((c) => c.id),
      ),
    )

    return Result.ok(checkpointsToUpdate)
  })
}
