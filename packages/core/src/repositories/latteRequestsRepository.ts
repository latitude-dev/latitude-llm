import { and, desc, eq, getTableColumns, gte, sql } from 'drizzle-orm'
import { LatteUsage } from '../constants'
import { Result } from '../lib/Result'
import { latteRequests } from '../schema/models/latteRequests'
import { type LatteRequest } from '../schema/models/types/LatteRequest'
import Repository from './repositoryV2'

const tt = getTableColumns(latteRequests)

export class LatteRequestsRepository extends Repository<LatteRequest> {
  get scopeFilter() {
    return eq(latteRequests.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(latteRequests)
      .where(this.scopeFilter)
      .orderBy(desc(latteRequests.createdAt), desc(latteRequests.id))
      .$dynamic()
  }

  async usageSinceDate(since: Date) {
    const usage = await this.db
      .select({
        billable:
          sql`COALESCE(SUM(CASE WHEN billable THEN credits ELSE 0 END), 0)`
            .mapWith(Number)
            .as('billable'),
        unbillable:
          sql`COALESCE(SUM(CASE WHEN NOT billable THEN credits ELSE 0 END), 0)`
            .mapWith(Number)
            .as('unbillable'),
      })
      .from(latteRequests)
      .where(and(this.scopeFilter, gte(latteRequests.createdAt, since)))
      .then((r) => r[0]!)

    return Result.ok<Pick<LatteUsage, 'billable' | 'unbillable'>>(usage)
  }
}
