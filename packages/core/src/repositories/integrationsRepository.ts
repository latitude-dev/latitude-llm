import { eq, getTableColumns } from 'drizzle-orm'

import { Integration } from '../browser'
import { NotFoundError, Result } from '../lib'
import { integrations } from '../schema'
import RepositoryLegacy from './repository'

const tt = getTableColumns(integrations)

export class IntegrationsRepository extends RepositoryLegacy<
  typeof tt,
  Integration
> {
  get scope() {
    return this.db
      .select(tt)
      .from(integrations)
      .where(eq(integrations.workspaceId, this.workspaceId))
      .as('integrationsScope')
  }

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

    if (!result.length) {
      return Result.error(new NotFoundError('Integration not found'))
    }

    return Result.ok(result[0]!)
  }
}
