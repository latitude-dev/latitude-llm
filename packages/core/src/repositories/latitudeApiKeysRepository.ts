import { eq, getTableColumns } from 'drizzle-orm'

import { ApiKey } from '../browser'
import { NotFoundError, Result } from '../lib'
import { apiKeys } from '../schema'
import Repository from './repository'

const tt = getTableColumns(apiKeys)

export class LatitudeApiKeysRepository extends Repository<typeof tt, ApiKey> {
  get scope() {
    return this.db
      .select(tt)
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, this.workspaceId))
      .as('latitudeApiKeysScope')
  }

  async findFirst() {
    const result = await this.db.select().from(this.scope).limit(1)
    const [first] = result
    if (!first) {
      return Result.error(
        new NotFoundError("Couldn't find a valid Latitude API key"),
      )
    }

    return Result.ok(first)
  }
}
