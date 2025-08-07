import { and, eq, getTableColumns } from 'drizzle-orm'

import type { IntegrationDto } from '../browser'
import { type LatitudeError, NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import type { PromisedResult } from '../lib/Transaction'
import { integrations } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(integrations)

export class IntegrationsRepository extends Repository<IntegrationDto> {
  get scopeFilter() {
    return eq(integrations.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db.select(tt).from(integrations).where(this.scopeFilter).$dynamic()
  }

  async findByName(name: string): PromisedResult<IntegrationDto, LatitudeError> {
    const result = await this.scope.where(and(eq(integrations.name, name), this.scopeFilter))

    if (!result.length) {
      return Result.error(new NotFoundError('Integration not found'))
    }

    return Result.ok(result[0]! as IntegrationDto)
  }
}
