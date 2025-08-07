import { count, eq, max, sql } from 'drizzle-orm'
import { database } from '../../../client'
import { memberships, subscriptions, users, workspaces } from '../../../schema'

export const workspaceUsageInfoCTE = database.$with('workspaces_subquery').as(
  database
    .select({
      id: sql<number>`workspaces.id`.as('workspace_subquery_id'),
      subscriptionCreatedAt: max(subscriptions.createdAt).as(
        'subscription_created_at',
      ),
      numOfMembers: count(memberships.id).as('members_count'),
      subscriptionPlan: max(subscriptions.plan).as('subscription_plan'),
      emails:
        sql<string>`string_agg(${users.email}, ', ' ORDER BY ${memberships.createdAt} ASC)`.as(
          'emails',
        ),
    })
    .from(workspaces)
    .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(
      subscriptions,
      eq(subscriptions.id, workspaces.currentSubscriptionId),
    )
    .groupBy(workspaces.id),
)
