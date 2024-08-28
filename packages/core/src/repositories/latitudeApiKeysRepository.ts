import { eq, getTableColumns } from 'drizzle-orm'

import { Result, UnprocessableEntityError } from '../lib'
import { apiKeys, workspaces } from '../schema'
import Repository from './repository'

export class LatitudeApiKeysRepository extends Repository {
  get scope() {
    return this.db
      .select(getTableColumns(apiKeys))
      .from(apiKeys)
      .innerJoin(workspaces, eq(workspaces.id, apiKeys.workspaceId))
      .as('latitudeApiKeysScope')
  }

  async findFirst() {
    const result = await this.db.select().from(this.scope).limit(1)
    const [first] = result
    if (!first) {
      return Result.error(
        new UnprocessableEntityError(
          'A valid Latitude API keys was not found',
          {
            token: ['Latitude token not found'],
          },
        ),
      )
    }
    return Result.ok(first)
  }
}
