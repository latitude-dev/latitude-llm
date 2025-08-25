import { desc, eq, getTableColumns } from 'drizzle-orm'
import { Subscription } from '../browser'
import { subscriptions } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(subscriptions)

export class SubscriptionRepository extends Repository<Subscription> {
  get scopeFilter() {
    return eq(subscriptions.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(subscriptions)
      .where(this.scopeFilter)
      .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
      .$dynamic()
  }
}
