import { and, eq, getTableColumns } from 'drizzle-orm'

import { IntegrationDto, PipedreamIntegration } from '../schema/models/types/Integration'
import { LatitudeError, NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { PromisedResult } from '../lib/Transaction'
import { integrations } from '../schema/models/integrations'
import Repository from './repositoryV2'
import { IntegrationType } from '@latitude-data/constants'

const tt = getTableColumns(integrations)

export class IntegrationsRepository extends Repository<IntegrationDto> {
  get scopeFilter() {
    return eq(integrations.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(integrations)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByName(
    name: string,
  ): PromisedResult<IntegrationDto, LatitudeError> {
    const result = await this.scope.where(
      and(eq(integrations.name, name), this.scopeFilter),
    )

    if (!result.length) {
      return Result.error(new NotFoundError('Integration not found'))
    }

    return Result.ok(result[0]! as IntegrationDto)
  }

  async getConnectedPipedreamApps({
    withTools,
    withTriggers,
  }: {
    withTools?: boolean
    withTriggers?: boolean
  } = {}) {
    const filters = []

    if (withTools !== undefined) {
      filters.push(eq(integrations.hasTools, withTools))
    }

    if (withTriggers !== undefined) {
      filters.push(eq(integrations.hasTriggers, withTriggers))
    }

    return this.scope.where(
      and(
        this.scopeFilter,
        eq(integrations.type, IntegrationType.Pipedream),
        ...filters,
      ),
    ) as Promise<PipedreamIntegration[]>
  }
}
