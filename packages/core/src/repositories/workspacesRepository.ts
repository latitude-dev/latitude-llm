import { eq, getTableColumns, sql } from 'drizzle-orm'

import { Database, database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { memberships } from '../schema/models/memberships'
import { subscriptions } from '../schema/models/subscriptions'
import { workspaces } from '../schema/models/workspaces'

export const workspacesDtoColumns = {
  ...getTableColumns(workspaces),
  currentSubscription: {
    id: sql<number>`${subscriptions.id}`
      .mapWith(Number)
      .as('currentSubscriptionId'),
    plan: subscriptions.plan,
    workspaceId: subscriptions.workspaceId,
    trialEndsAt: subscriptions.trialEndsAt,
    cancelledAt: subscriptions.cancelledAt,
    updatedAt: sql<Date>`${subscriptions.updatedAt}`
      .mapWith(subscriptions.updatedAt)
      .as('currentSubscriptionUpdatedAt'),
    createdAt: sql<Date>`${subscriptions.createdAt}`
      .mapWith(subscriptions.createdAt)
      .as('currentSubscriptionCreatedAt'),
  },
}

export class WorkspacesRepository {
  public userId: string
  private db: Database

  constructor(userId: string, db = database) {
    this.userId = userId
    this.db = db
  }

  get scope() {
    return this.db
      .select(workspacesDtoColumns)
      .from(workspaces)
      .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(eq(memberships.userId, this.userId))
      .as('workspacesScope')
  }

  async find(workspaceId: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, workspaceId))
      .limit(1)
    const workspace = result[0]

    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    return Result.ok(workspace)
  }
}
