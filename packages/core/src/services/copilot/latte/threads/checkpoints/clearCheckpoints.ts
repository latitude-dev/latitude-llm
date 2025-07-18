import { Result } from '../../../../../lib/Result'
import Transaction from '../../../../../lib/Transaction'
import { and, eq, inArray } from 'drizzle-orm'
import { latteThreadCheckpoints, latteThreads } from '../../../../../schema'

export function clearLatteThreadCheckpoints(
  {
    workspaceId,
    threadUuid,
  }: {
    workspaceId: number
    threadUuid: string
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const existingCheckpoints = await tx
      .select({
        id: latteThreadCheckpoints.id,
      })
      .from(latteThreadCheckpoints)
      .leftJoin(
        latteThreads,
        eq(latteThreadCheckpoints.threadUuid, latteThreads.uuid),
      )
      .where(
        and(
          eq(latteThreads.uuid, threadUuid),
          eq(latteThreads.workspaceId, workspaceId),
        ),
      )

    await tx.delete(latteThreadCheckpoints).where(
      inArray(
        latteThreadCheckpoints.id,
        existingCheckpoints.map((c) => c.id),
      ),
    )

    return Result.nil()
  })
}
