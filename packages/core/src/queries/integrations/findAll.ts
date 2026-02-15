import { IntegrationDto } from '../../schema/models/types/Integration'
import { integrations } from '../../schema/models/integrations'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findAllIntegrations = scopedQuery(
  async function findAllIntegrations(
    { workspaceId }: { workspaceId: number },
    db,
  ): Promise<IntegrationDto[]> {
    const result = await db
      .select(tt)
      .from(integrations)
      .where(tenancyFilter(workspaceId))
    return result as IntegrationDto[]
  },
)
