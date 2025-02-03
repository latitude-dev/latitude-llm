import { sql, eq, countDistinct, max } from 'drizzle-orm'
import { database } from '../../../client'
import { memberships, subscriptions, users, workspaces } from '../../../schema'

export const workspaceUsageInfoQuery = database
  .select({
    id: sql<number>`workspaces.id`.as('workspace_subquery_id'),
    name: max(workspaces.name).as('workspace_name'),
    subscriptionCreatedAt: max(subscriptions.createdAt).as(
      'subscription_created_at',
    ),
    numOfMembers: countDistinct(memberships.id).as('members_count'),
    subscriptionPlan: max(subscriptions.plan).as('subscription_plan'),
    emails:
      sql<string>`string_agg(${users.email}, ', ' ORDER BY ${users.email} ASC)`.as(
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
  .groupBy(workspaces.id)
  .as('workspaces_subquery')
