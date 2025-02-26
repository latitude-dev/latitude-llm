import { eq, getTableColumns } from 'drizzle-orm'

import { Integration } from '../browser'
import { NotFoundError, Result } from '../lib'
import { integrations } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(integrations)

export class IntegrationsRepository extends Repository<Integration> {
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

  async findByName(name: string) {
    const result = await this.scope.where(eq(integrations.name, name))

    if (!result.length) {
      return Result.error(new NotFoundError('Integration not found'))
    }

    return Result.ok(result[0]!)
  }
}
