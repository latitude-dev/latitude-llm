import { eq } from 'drizzle-orm'

import { Integration } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { integrations } from '../../schema'

export async function destroyIntegration(
  integration: Integration,
  db = database,
) {
  return Transaction.call(async (trx) => {
    await trx.delete(integrations).where(eq(integrations.id, integration.id))

    return Result.ok(integration)
  }, db)
}
