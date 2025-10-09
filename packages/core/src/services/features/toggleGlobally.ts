import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import { features } from '../../schema/models/features'
import Transaction from '../../lib/Transaction'

export async function toggleFeatureGlobally(
  featureId: number,
  enabled: boolean,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .update(features)
      .set({ enabled })
      .where(eq(features.id, featureId))
      .returning()

    if (result.length === 0) {
      return Result.error(new Error('Feature not found'))
    }

    return Result.ok(result[0])
  })
}
