import { eq, getTableColumns } from 'drizzle-orm'

import { ApiKey } from '../browser'
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
}
