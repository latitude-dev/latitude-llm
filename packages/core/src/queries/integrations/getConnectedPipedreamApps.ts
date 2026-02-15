import { and, eq } from 'drizzle-orm'
import { IntegrationType } from '@latitude-data/constants'

import { PipedreamIntegration } from '../../schema/models/types/Integration'
import { integrations } from '../../schema/models/integrations'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const getConnectedPipedreamApps = scopedQuery(
  async function getConnectedPipedreamApps(
    {
      workspaceId,
      withTools,
      withTriggers,
    }: {
      workspaceId: number
      withTools?: boolean
      withTriggers?: boolean
    },
    db,
  ): Promise<PipedreamIntegration[]> {
    const filters = []

    if (withTools !== undefined) {
      filters.push(eq(integrations.hasTools, withTools))
    }

    if (withTriggers !== undefined) {
      filters.push(eq(integrations.hasTriggers, withTriggers))
    }

    const result = await db
      .select(tt)
      .from(integrations)
      .where(
        and(
          tenancyFilter(workspaceId),
          eq(integrations.type, IntegrationType.Pipedream),
          ...filters,
        ),
      )

    return result as PipedreamIntegration[]
  },
)
