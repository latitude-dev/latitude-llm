import { eq, and } from 'drizzle-orm'

import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { integrationHeaderPresets } from '../../../schema/models/integrationHeaderPresets'
import { IntegrationHeaderPreset } from '../../../schema/models/types/IntegrationHeaderPreset'
import { BadRequestError } from '../../../lib/errors'

export type CreateIntegrationHeaderPresetParams = {
  integrationId: number
  workspaceId: number
  name: string
  headers: Record<string, string>
  authorId: string
}

export async function createIntegrationHeaderPreset(
  params: CreateIntegrationHeaderPresetParams,
  transaction = new Transaction(),
): Promise<TypedResult<IntegrationHeaderPreset, Error>> {
  const { integrationId, workspaceId, name, headers, authorId } = params

  return transaction.call<IntegrationHeaderPreset>(async (tx) => {
    const existing = await tx
      .select()
      .from(integrationHeaderPresets)
      .where(
        and(
          eq(integrationHeaderPresets.integrationId, integrationId),
          eq(integrationHeaderPresets.name, name),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return Result.error(
        new BadRequestError('A preset with this name already exists'),
      )
    }

    const [preset] = await tx
      .insert(integrationHeaderPresets)
      .values({
        integrationId,
        workspaceId,
        name,
        headers,
        authorId,
      })
      .returning()

    if (!preset) {
      return Result.error(new BadRequestError('Failed to create preset'))
    }

    return Result.ok(preset)
  })
}
