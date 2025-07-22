import { DocumentVersion, LatteThreadCheckpoint } from '../../../../../browser'
import { Result } from '../../../../../lib/Result'
import Transaction, { PromisedResult } from '../../../../../lib/Transaction'
import { latteThreadCheckpoints } from '../../../../../schema'

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
