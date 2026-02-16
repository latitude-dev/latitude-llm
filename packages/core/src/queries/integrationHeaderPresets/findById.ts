import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { IntegrationHeaderPreset } from '../../schema/models/types/IntegrationHeaderPreset'
import { integrationHeaderPresets } from '../../schema/models/integrationHeaderPresets'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findIntegrationHeaderPresetById = scopedQuery(
  async function findIntegrationHeaderPresetById(
    { workspaceId, id }: { workspaceId: number; id: number },
    db,
  ): Promise<IntegrationHeaderPreset> {
    const result = await db
      .select(tt)
      .from(integrationHeaderPresets)
      .where(
        and(tenancyFilter(workspaceId), eq(integrationHeaderPresets.id, id)),
      )
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(`IntegrationHeaderPreset with id ${id} not found`)
    }

    return result[0] as IntegrationHeaderPreset
  },
)
