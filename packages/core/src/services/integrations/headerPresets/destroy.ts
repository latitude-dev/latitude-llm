import { eq } from 'drizzle-orm'

import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { integrationHeaderPresets } from '../../../schema/models/integrationHeaderPresets'
import { IntegrationHeaderPreset } from '../../../schema/models/types/IntegrationHeaderPreset'
import { NotFoundError } from '../../../lib/errors'

export async function destroyIntegrationHeaderPreset(
  preset: IntegrationHeaderPreset,
  transaction = new Transaction(),
): Promise<TypedResult<IntegrationHeaderPreset, Error>> {
  return transaction.call<IntegrationHeaderPreset>(async (tx) => {
    const [deleted] = await tx
      .delete(integrationHeaderPresets)
      .where(eq(integrationHeaderPresets.id, preset.id))
      .returning()

    if (!deleted) {
      return Result.error(new NotFoundError('Preset not found'))
    }

    return Result.ok(deleted)
  })
}
