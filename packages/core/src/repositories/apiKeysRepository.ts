import { eq, getTableColumns } from 'drizzle-orm'

import { ApiKey } from '../browser'
import { NotFoundError, Result } from '../lib'
import { apiKeys } from '../schema'
import Repository from './repository'

const tt = getTableColumns(apiKeys)

export class ApiKeysRepository extends Repository<typeof tt, ApiKey> {
  get scope() {
    return this.db
      .select(tt)
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, this.workspaceId))
      .as('apiKeysScope')
  }

  async findByToken(token: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.token, token))

    if (!result.length) {
      return Result.error(new NotFoundError('API key not found'))
    }

    return Result.ok(result[0]!)
  }
}
