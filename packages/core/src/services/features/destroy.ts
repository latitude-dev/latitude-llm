import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { features } from '../../schema'

export async function destroyFeature(
  feature: { id: number; name: string; description?: string | null },
  db = database,
) {
  return Transaction.call(async (tx) => {
    await tx.delete(features).where(eq(features.id, feature.id))
    return Result.ok(feature)
  }, db)
}
