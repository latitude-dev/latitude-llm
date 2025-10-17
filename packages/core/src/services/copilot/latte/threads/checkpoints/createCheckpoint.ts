import { type DocumentVersion } from '../../../../../schema/models/types/DocumentVersion'
import { type LatteThreadCheckpoint } from '../../../../../schema/models/types/LatteThreadCheckpoint'
import { Result } from '../../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../../lib/Transaction'
import { latteThreadCheckpoints } from '../../../../../schema/models/latteThreadCheckpoints'

export function createLatteThreadCheckpoints(
  {
    threadUuid,
    commitId,
    checkpoints,
  }: {
    threadUuid: string
    commitId: number
    checkpoints: { [documentUuid: string]: DocumentVersion | undefined }
  },
  transaction = new Transaction(),
): PromisedResult<LatteThreadCheckpoint[]> {
  return transaction.call<LatteThreadCheckpoint[]>(async (tx) => {
    const newCheckpoints = await tx
      .insert(latteThreadCheckpoints)
      .values(
        Object.entries(checkpoints).map(([documentUuid, data]) => ({
          threadUuid,
          commitId,
          documentUuid,
          data,
        })),
      )
      .returning()

    if (newCheckpoints.length !== Object.keys(checkpoints).length) {
      return Result.error(
        new Error('Failed to create latte thread checkpoints'),
      )
    }

    return Result.ok(newCheckpoints)
  })
}
