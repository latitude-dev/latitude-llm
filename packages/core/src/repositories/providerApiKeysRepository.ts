import { eq, getTableColumns } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { providerApiKeys } from '../schema'
import Repository from './repository'

export class ProviderApiKeysRepository extends Repository {
  get scope() {
    return this.db
      .select(getTableColumns(providerApiKeys))
      .from(providerApiKeys)
      .where(eq(providerApiKeys.workspaceId, this.workspaceId))
      .as('providerApiKeysScope')
  }

  async find(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
    if (!result.length) {
      return Result.error(new NotFoundError('ProviderApiKey not found'))
    }

    return Result.ok(result[0]!)
  }

  async findAll() {
    const result = await this.db.select().from(this.scope)
    return Result.ok(result)
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
