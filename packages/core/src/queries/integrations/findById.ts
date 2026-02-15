import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { IntegrationDto } from '../../schema/models/types/Integration'
import { integrations } from '../../schema/models/integrations'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findIntegrationById = scopedQuery(
  async function findIntegrationById(
    { workspaceId, id }: { workspaceId: number; id: number },
    db,
  ): Promise<IntegrationDto> {
    const result = await db
      .select(tt)
      .from(integrations)
      .where(and(tenancyFilter(workspaceId), eq(integrations.id, id)))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(`Integration with id ${id} not found`)
    }

    return result[0] as IntegrationDto
  },
)
