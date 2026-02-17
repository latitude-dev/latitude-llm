import { type ApiKey } from '../../schema/models/types/ApiKey'
import { apiKeys } from '../../schema/models/apiKeys'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export type FindAllApiKeysOpts = {
  limit?: number
  offset?: number
}

export const findAllApiKeys = scopedQuery(async function findAllApiKeys(
  { workspaceId, limit, offset }: { workspaceId: number } & FindAllApiKeysOpts,
  db,
): Promise<ApiKey[]> {
  let query = db.select(tt).from(apiKeys).where(scopeFilter(workspaceId))

  if (limit !== undefined) {
    query = query.limit(limit) as typeof query
  }
  if (offset !== undefined) {
    query = query.offset(offset) as typeof query
  }

  const result = await query
  return result as ApiKey[]
})
