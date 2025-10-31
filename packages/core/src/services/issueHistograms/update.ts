import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issueHistograms } from '../../schema/models/issueHistograms'
import { IssueHistogram } from '../../schema/models/types/IssueHistogram'
import { eq } from 'drizzle-orm'

export async function updateHistogram(
  {
    histogram,
    count = 1,
    direction = 'increment',
  }: {
    histogram: IssueHistogram
    count?: number
    direction?: 'increment' | 'decrement'
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .update(issueHistograms)
      .set({
        count:
          direction === 'increment'
            ? histogram.count + count
            : Math.max(0, histogram.count - count),
      })
      .where(eq(issueHistograms.id, histogram.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
