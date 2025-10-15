import { eq, getTableColumns } from 'drizzle-orm'

import { type ApiKey } from '../schema/models/types/ApiKey'
import { apiKeys } from '../schema/models/apiKeys'
import RepositoryLegacy from './repository'

const tt = getTableColumns(apiKeys)

export class LatitudeApiKeysRepository extends RepositoryLegacy<
  typeof tt,
  ApiKey
> {
  get scope() {
    return this.db
      .select(tt)
      .from(apiKeys)
      .where(eq(apiKeys.workspaceId, this.workspaceId))
      .as('latitudeApiKeysScope')
  }
}
