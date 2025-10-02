import { eq } from 'drizzle-orm'

import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { features } from '../../schema/models/features'

export async function destroyFeature(
  feature: { id: number; name: string; description?: string | null },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    await tx.delete(features).where(eq(features.id, feature.id))
    return Result.ok(feature)
  })
}
