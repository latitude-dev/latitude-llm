import { and, eq } from 'drizzle-orm'

import { IntegrationHeaderPreset } from '../../schema/models/types/IntegrationHeaderPreset'
import { integrationHeaderPresets } from '../../schema/models/integrationHeaderPresets'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findIntegrationHeaderPresetsByIntegration = scopedQuery(
  async function findIntegrationHeaderPresetsByIntegration(
    {
      workspaceId,
      integrationId,
    }: { workspaceId: number; integrationId: number },
    db,
  ): Promise<IntegrationHeaderPreset[]> {
    const result = await db
      .select(tt)
      .from(integrationHeaderPresets)
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(integrationHeaderPresets.integrationId, integrationId),
        ),
      )

    return result as IntegrationHeaderPreset[]
  },
)
