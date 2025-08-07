import { asc, eq, getTableColumns, isNull } from 'drizzle-orm'

import type { ApiKey } from '../browser'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { apiKeys } from '../schema'
import RepositoryLegacy from './repository'

const tt = getTableColumns(apiKeys)

export class ApiKeysRepository extends RepositoryLegacy<typeof tt, ApiKey> {
  get scope() {
    return this.db
      .select(tt)
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, this.workspaceId))
      .as('apiKeysScope')
  }

  async findByToken(token: string) {
    const result = await this.db.select().from(this.scope).where(eq(this.scope.token, token))

    if (!result.length) {
      return Result.error(new NotFoundError('API key not found'))
    }

    return Result.ok(result[0]!)
  }

  async selectFirst() {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(isNull(this.scope.deletedAt))
      .orderBy(asc(this.scope.createdAt))
      .limit(1)

    return Result.ok(result[0])
  }
}
