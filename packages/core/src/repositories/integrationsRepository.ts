import { and, eq, getTableColumns } from 'drizzle-orm'

import { IntegrationDto } from '../browser'
import { LatitudeError, NotFoundError, PromisedResult, Result } from '../lib'
import { integrations } from '../schema'
import Repository from './repositoryV2'

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
}
