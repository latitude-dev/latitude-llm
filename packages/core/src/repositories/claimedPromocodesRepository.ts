import { eq, and, desc } from '../client/utils'
import { promocodes, claimedPromocodes } from '../schema'
import Repository from './repositoryV2'
import { ClaimedPromocode, Promocode } from '../browser'
import { getTableColumns } from 'drizzle-orm'
import { Result } from '../lib/Result'

const tt = getTableColumns(promocodes)

export class ClaimedPromocodesRepository extends Repository<ClaimedPromocode> {
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

  async findUsedPromocodes() {
    const result = await this.db
      .select(tt)
      .from(promocodes)
      .rightJoin(
        claimedPromocodes,
        and(this.scopeFilter, eq(claimedPromocodes.code, promocodes.code)),
      )
      .where(this.scopeFilter)

    return Result.ok(result as Promocode[])
  }
}
