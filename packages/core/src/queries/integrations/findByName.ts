import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { IntegrationDto } from '../../schema/models/types/Integration'
import { integrations } from '../../schema/models/integrations'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findIntegrationByName = scopedQuery(
  async function findIntegrationByName(
    { workspaceId, name }: { workspaceId: number; name: string },
    db,
  ): Promise<IntegrationDto> {
    const result = await db
      .select(tt)
      .from(integrations)
      .where(and(tenancyFilter(workspaceId), eq(integrations.name, name)))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError('Integration not found')
    }

    return result[0] as IntegrationDto
  },
)
