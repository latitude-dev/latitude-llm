import { and, eq, getTableColumns, isNull } from 'drizzle-orm'

import { ProviderApiKey } from '../browser'
import { NotFoundError, Result } from '../lib'
import { providerApiKeys } from '../schema'
import RepositoryLegacy from './repository'

const tt = getTableColumns(providerApiKeys)

export class ProviderApiKeysRepository extends RepositoryLegacy<
  typeof tt,
  ProviderApiKey
> {
  get scope() {
    return this.db
      .select(tt)
      .from(providerApiKeys)
      .where(
        and(
          isNull(providerApiKeys.deletedAt),
          eq(providerApiKeys.workspaceId, this.workspaceId),
        ),
      )
      .as('providerApiKeysScope')
  }

  async findByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))

    if (!result.length) {
      return Result.error(new NotFoundError('ProviderApiKey not found'))
    }

    return Result.ok(result[0]!)
  }
}
