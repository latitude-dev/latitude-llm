import { desc, eq, getTableColumns } from 'drizzle-orm'
import { claimedPromocodes } from '../schema'
import Repository from './repositoryV2'
import { ClaimedPromocode } from '../browser'

const tt = getTableColumns(claimedPromocodes)

export class ClaimedPromocodeRepository extends Repository<ClaimedPromocode> {
  get scopeFilter() {
    return eq(claimedPromocodes.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(claimedPromocodes)
      .where(this.scopeFilter)
      .orderBy(desc(claimedPromocodes.createdAt), desc(claimedPromocodes.id))
      .$dynamic()
  }
}
