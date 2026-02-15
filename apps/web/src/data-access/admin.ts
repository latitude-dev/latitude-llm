import { database, utils } from '@latitude-data/core/client'
import { Grant, Quota, QuotaType } from '@latitude-data/core/constants'
import {
  NotFoundError,
  UnauthorizedError,
} from '@latitude-data/core/lib/errors'
import { OkType, Result } from '@latitude-data/core/lib/Result'
import { GrantsRepository } from '@latitude-data/core/repositories'
import { features } from '@latitude-data/core/schema/models/features'
import { memberships } from '@latitude-data/core/schema/models/memberships'
import { projects } from '@latitude-data/core/schema/models/projects'
import { subscriptions } from '@latitude-data/core/schema/models/subscriptions'
import { users } from '@latitude-data/core/schema/models/users'
import { workspaceFeatures } from '@latitude-data/core/schema/models/workspaceFeatures'
import { workspaces } from '@latitude-data/core/schema/models/workspaces'
import { ilike, isNull } from 'drizzle-orm'

import { computeQuota } from '@latitude-data/core/services/grants/quota'
import { findWorkspaceSubscription } from '@latitude-data/core/services/subscriptions/data-access/find'

import { Subscription } from '@latitude-data/core/schema/models/types/Subscription'
export type WorkspaceWithDetails = {
  id: number
  name: string
  createdAt: Date
  isBigAccount: boolean
  stripeCustomerId: string | null
  subscription: OkType<typeof findWorkspaceSubscription>
  subscriptions: Subscription[]
  quotas: {
    seats: Quota
    runs: Quota
    credits: Quota
  }
  users: Array<{
    id: string
    email: string
    name: string | null
  }>
  projects: Array<{
    id: number
    name: string
  }>
  features: Array<{
    id: number
    name: string
    description: string | null
    enabled: boolean
  }>
  grants: Grant[]
}

export type UserWithDetails = {
  id: string
  email: string
  name: string | null
  confirmedAt: Date | null
  createdAt: Date
  admin: boolean
  workspaces: Array<{
    id: number
    name: string
    plan: string
  }>
}

export type ProjectWithDetails = {
  id: number
  name: string
  workspace: {
    id: number
    name: string
  }
}

async function assertUserIsAdmin(userId: string, db = database) {
  const [user] = await db
    .select()
    .from(users)
    .where(utils.eq(users.id, userId))
    .limit(1)
  if (!user) {
    return Result.error(new NotFoundError('User not found'))
  }

  if (!user.admin) {
    return Result.error(new UnauthorizedError('User is not admin'))
  }

  return Result.ok(undefined)
}

/**
 * Find all subscriptions for a workspace, sorted by creation date descending
 */
async function findWorkspaceSubscriptionsForAdmin(
  workspaceId: number,
  db = database,
): Promise<Subscription[]> {
  return await db
    .select()
    .from(subscriptions)
    .where(utils.eq(subscriptions.workspaceId, workspaceId))
    .orderBy(utils.desc(subscriptions.createdAt))
}

/**
 * Find a workspace by ID for admin purposes (global access)
 */
export async function findWorkspaceByIdForAdmin(
  {
    userId,
    workspaceId,
  }: {
    userId: string
    workspaceId: number
  },
  db = database,
) {
  const assertResult = await assertUserIsAdmin(userId, db)
  if (!Result.isOk(assertResult)) return assertResult

  try {
    // First get the workspace
    const workspaceResult = await db
      .select()
      .from(workspaces)
      .where(utils.eq(workspaces.id, workspaceId))
      .limit(1)

    const workspace = workspaceResult[0]
    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    const subscriptionResult = await findWorkspaceSubscription({ workspace })
    if (subscriptionResult.error) {
      return Result.error(subscriptionResult.error)
    }
    const subscription = subscriptionResult.value

    const seatsResult = await computeQuota({ type: QuotaType.Seats, workspace })
    if (seatsResult.error) {
      return Result.error(seatsResult.error)
    }
    const seats = seatsResult.value

    const runsResult = await computeQuota({ type: QuotaType.Runs, workspace })
    if (runsResult.error) {
      return Result.error(runsResult.error)
    }
    const runs = runsResult.value

    const creditsResult = await computeQuota({
      type: QuotaType.Credits,
      workspace,
    })
    if (creditsResult.error) {
      return Result.error(creditsResult.error)
    }
    const credits = creditsResult.value

    // Get workspace users
    const workspaceUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(memberships)
      .innerJoin(users, utils.eq(memberships.userId, users.id))
      .where(utils.eq(memberships.workspaceId, workspaceId))

    // Get workspace projects
    const workspaceProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
      })
      .from(projects)
      .where(utils.eq(projects.workspaceId, workspaceId))

    // Get workspace features
    const workspaceFeaturesList = await db
      .select({
        id: features.id,
        name: features.name,
        description: features.description,
        enabled: workspaceFeatures.enabled,
      })
      .from(features)
      .leftJoin(
        workspaceFeatures,
        utils.and(
          utils.eq(features.id, workspaceFeatures.featureId),
          utils.eq(workspaceFeatures.workspaceId, workspaceId),
        ),
      )
      .where(utils.eq(workspaceFeatures.enabled, true)) // Only show enabled features

    const repository = new GrantsRepository(workspaceId)
    const grantsResult = await repository.listApplicable(
      subscription.billableFrom,
    )
    if (grantsResult.error) {
      return Result.error(grantsResult.error)
    }
    const grants = grantsResult.value

    // Get all subscriptions for this workspace
    const workspaceSubscriptions = await findWorkspaceSubscriptionsForAdmin(
      workspaceId,
      db,
    )

    const result: WorkspaceWithDetails = {
      ...workspace,
      subscription: subscription,
      subscriptions: workspaceSubscriptions,
      quotas: {
        seats: seats.limit,
        runs: runs.limit,
        credits: credits.limit,
      },
      users: workspaceUsers,
      projects: workspaceProjects,
      features: workspaceFeaturesList.map((feature) => ({
        ...feature,
        enabled: feature.enabled ?? false,
      })),
      grants: grants,
    }

    return Result.ok(result)
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Find a user by email for admin purposes (global access)
 */
export async function findUserByEmailForAdmin(
  {
    userId,
    email,
  }: {
    userId: string
    email: string
  },
  db = database,
) {
  const assertResult = await assertUserIsAdmin(userId, db)
  if (!Result.isOk(assertResult)) return assertResult

  try {
    const userResult = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        confirmedAt: users.confirmedAt,
        createdAt: users.createdAt,
        admin: users.admin,
      })
      .from(users)
      .where(utils.eq(users.email, email))
      .limit(1)

    const user = userResult[0]
    if (!user) {
      return Result.error(new NotFoundError('User not found'))
    }

    const userWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        plan: subscriptions.plan,
      })
      .from(memberships)
      .innerJoin(workspaces, utils.eq(memberships.workspaceId, workspaces.id))
      .innerJoin(
        subscriptions,
        utils.eq(subscriptions.id, workspaces.currentSubscriptionId),
      )
      .where(utils.eq(memberships.userId, user.id))

    const result: UserWithDetails = {
      ...user,
      workspaces: userWorkspaces,
    }

    return Result.ok(result)
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Find a project by ID for admin purposes (global access)
 */
export async function findProjectByIdForAdmin(
  {
    userId,
    projectId,
  }: {
    userId: string
    projectId: number
  },
  db = database,
) {
  const assertResult = await assertUserIsAdmin(userId, db)
  if (!Result.isOk(assertResult)) return assertResult

  try {
    const result = await db
      .select({
        id: projects.id,
        name: projects.name,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
      })
      .from(projects)
      .innerJoin(workspaces, utils.eq(projects.workspaceId, workspaces.id))
      .where(utils.eq(projects.id, projectId))
      .limit(1)

    const project = result[0]
    if (!project) {
      return Result.error(new NotFoundError('Project not found'))
    }

    const projectWithDetails: ProjectWithDetails = {
      id: project.id,
      name: project.name,
      workspace: {
        id: project.workspaceId,
        name: project.workspaceName,
      },
    }

    return Result.ok(projectWithDetails)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export type PayingWorkspace = {
  id: number
  name: string
  stripeCustomerId: string | null
  subscription: OkType<typeof findWorkspaceSubscription>
}

/**
 * Find all workspaces with paying (non-free) subscription plans for admin purposes
 */
export async function findPayingWorkspacesForAdmin(
  {
    userId,
  }: {
    userId: string
  },
  db = database,
) {
  const assertResult = await assertUserIsAdmin(userId, db)
  if (!Result.isOk(assertResult)) return assertResult

  try {
    const { FREE_PLANS } = await import('@latitude-data/core/plans')
    const { addMonths } = await import('date-fns')
    const { getLatestRenewalDate } = await import(
      '@latitude-data/core/services/workspaces/utils/calculateRenewalDate'
    )

    const payingWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        stripeCustomerId: workspaces.stripeCustomerId,
        subscriptionId: subscriptions.id,
        subscriptionWorkspaceId: subscriptions.workspaceId,
        subscriptionPlan: subscriptions.plan,
        subscriptionCreatedAt: subscriptions.createdAt,
        subscriptionUpdatedAt: subscriptions.updatedAt,
        subscriptionTrialEndsAt: subscriptions.trialEndsAt,
        subscriptionCancelledAt: subscriptions.cancelledAt,
      })
      .from(workspaces)
      .innerJoin(
        subscriptions,
        utils.eq(workspaces.currentSubscriptionId, subscriptions.id),
      )
      .where(utils.notInArray(subscriptions.plan, FREE_PLANS))
      .orderBy(utils.desc(workspaces.createdAt))

    const results: PayingWorkspace[] = payingWorkspaces
      .map((workspace) => {
        const billableFrom = getLatestRenewalDate(
          workspace.subscriptionCreatedAt,
          new Date(),
        )
        const billableAt = addMonths(billableFrom, 1)

        return {
          id: workspace.id,
          name: workspace.name,
          stripeCustomerId: workspace.stripeCustomerId,
          subscription: {
            id: workspace.subscriptionId,
            workspaceId: workspace.subscriptionWorkspaceId,
            plan: workspace.subscriptionPlan,
            createdAt: workspace.subscriptionCreatedAt,
            updatedAt: workspace.subscriptionUpdatedAt,
            trialEndsAt: workspace.subscriptionTrialEndsAt,
            cancelledAt: workspace.subscriptionCancelledAt,
            billableFrom,
            billableAt,
          },
        }
      })
      .sort((a, b) => {
        if (!a.stripeCustomerId && b.stripeCustomerId) return -1
        if (a.stripeCustomerId && !b.stripeCustomerId) return 1
        return 0
      })

    return Result.ok(results)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function searchWorkspacesForAdmin(query: string, db = database) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      utils.or(
        ilike(workspaces.name, searchTerm),
        utils.sql`CAST(${workspaces.id} AS TEXT) LIKE ${searchTerm}`,
      ),
    )
    .orderBy(workspaces.name)
    .limit(20)

  return Result.ok(results)
}

export type SearchEntityType = 'all' | 'user' | 'workspace' | 'project'

function getRelevanceScore(value: string, query: string): number {
  const lowerValue = value.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerValue === lowerQuery) return 100
  if (lowerValue.startsWith(lowerQuery)) return 50
  return 10
}

function sortByRelevance<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => string[],
): T[] {
  return items.sort((a, b) => {
    const aFields = getSearchableFields(a)
    const bFields = getSearchableFields(b)
    const aScore = Math.max(...aFields.map((f) => getRelevanceScore(f, query)))
    const bScore = Math.max(...bFields.map((f) => getRelevanceScore(f, query)))
    return bScore - aScore
  })
}

export type UserSearchResult = {
  type: 'user'
  id: string
  email: string
  name: string | null
  createdAt: Date
}

export type WorkspaceUnifiedSearchResult = {
  type: 'workspace'
  id: number
  name: string
  createdAt: Date
}

export type ProjectSearchResult = {
  type: 'project'
  id: number
  name: string
  workspaceId: number
  createdAt: Date
}

export type UnifiedSearchResponse = {
  users: UserSearchResult[]
  workspaces: WorkspaceUnifiedSearchResult[]
  projects: ProjectSearchResult[]
}

async function searchUsers(query: string, db = database, limit = 10) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      utils.or(ilike(users.email, searchTerm), ilike(users.name, searchTerm)),
    )
    .orderBy(users.email)
    .limit(limit)

  return results.map((r) => ({ ...r, type: 'user' as const }))
}

async function searchWorkspacesForUnified(
  query: string,
  db = database,
  limit = 10,
) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .where(
      utils.or(
        ilike(workspaces.name, searchTerm),
        utils.sql`CAST(${workspaces.id} AS TEXT) LIKE ${searchTerm}`,
      ),
    )
    .orderBy(workspaces.name)
    .limit(limit)

  return results.map((r) => ({ ...r, type: 'workspace' as const }))
}

async function searchProjects(query: string, db = database, limit = 10) {
  const searchTerm = `%${query}%`

  const results = await db
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: projects.workspaceId,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(
      utils.and(
        isNull(projects.deletedAt),
        utils.or(
          ilike(projects.name, searchTerm),
          utils.sql`CAST(${projects.id} AS TEXT) LIKE ${searchTerm}`,
        ),
      ),
    )
    .orderBy(projects.name)
    .limit(limit)

  return results.map((r) => ({ ...r, type: 'project' as const }))
}

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS_PER_ENTITY = 10

export async function unifiedSearchForAdmin(
  query: string,
  entityType: SearchEntityType = 'all',
  db = database,
) {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length < MIN_QUERY_LENGTH) {
    return Result.ok({
      users: [],
      workspaces: [],
      projects: [],
    })
  }

  const searchPromises: Promise<void>[] = []
  const response: UnifiedSearchResponse = {
    users: [],
    workspaces: [],
    projects: [],
  }

  if (entityType === 'all' || entityType === 'user') {
    searchPromises.push(
      searchUsers(trimmedQuery, db, MAX_RESULTS_PER_ENTITY).then((results) => {
        response.users = sortByRelevance(results, trimmedQuery, (u) => [
          u.email,
          u.name || '',
        ])
      }),
    )
  }

  if (entityType === 'all' || entityType === 'workspace') {
    searchPromises.push(
      searchWorkspacesForUnified(trimmedQuery, db, MAX_RESULTS_PER_ENTITY).then(
        (results) => {
          response.workspaces = sortByRelevance(results, trimmedQuery, (w) => [
            w.name,
            String(w.id),
          ])
        },
      ),
    )
  }

  if (entityType === 'all' || entityType === 'project') {
    searchPromises.push(
      searchProjects(trimmedQuery, db, MAX_RESULTS_PER_ENTITY).then(
        (results) => {
          response.projects = sortByRelevance(results, trimmedQuery, (p) => [
            p.name,
            String(p.id),
          ])
        },
      ),
    )
  }

  await Promise.all(searchPromises)

  return Result.ok(response)
}
