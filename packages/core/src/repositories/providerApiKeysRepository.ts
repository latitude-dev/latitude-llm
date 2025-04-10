import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm'

import { ProviderApiKey } from '../browser'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
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

  async findAllByNames(names: string[]) {
    return await this.db
      .select()
      .from(this.scope)
      .where(inArray(this.scope.name, names))
  }
}
