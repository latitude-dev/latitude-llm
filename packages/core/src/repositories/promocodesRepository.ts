import { eq, and, desc } from '../client/utils'
import { promocodes, claimedPromocodes } from '../schema'
import Repository from './repositoryV2'
import { Promocode } from '../browser'
import { getTableColumns } from 'drizzle-orm'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../lib/Result'

const tt = getTableColumns(promocodes)

export class PromocodesRepository extends Repository<Promocode> {
  get scopeFilter() {
    return undefined
  }

  get scope() {
    return this.db
      .select(tt)
      .from(promocodes)
      .orderBy(desc(promocodes.createdAt), desc(promocodes.id))
      .$dynamic()
  }

  async findByCode(code: string) {
    const [result] = await this.db
      .select(tt)
      .from(promocodes)
      .where(eq(promocodes.code, code))
      .limit(1)

    if (!result) {
      return Result.error(new NotFoundError(`Promocode does not exist`))
    }

    return Result.ok(result as Promocode)
  }

  async findClaimedPromocodes() {
    const result = await this.db
      .select(tt)
      .from(promocodes)
      .rightJoin(
        claimedPromocodes,
        and(
          eq(claimedPromocodes.workspaceId, this.workspaceId),
          eq(claimedPromocodes.code, promocodes.code),
        ),
      )

    return Result.ok(result as Promocode[])
  }
}
