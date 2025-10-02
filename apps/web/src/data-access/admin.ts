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
import { Subscription } from '@latitude-data/core/schema/types'
import { computeQuota } from '@latitude-data/core/services/grants/quota'
import { findWorkspaceSubscription } from '@latitude-data/core/services/subscriptions/data-access/find'

export type WorkspaceWithDetails = {
  id: number
  name: string
  createdAt: Date
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
  workspaces: Array<{
    id: number
    name: string
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
    // First get the user
    const userResult = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(utils.eq(users.email, email))
      .limit(1)

    const user = userResult[0]
    if (!user) {
      return Result.error(new NotFoundError('User not found'))
    }

    // Get user workspaces
    const userWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
      })
      .from(memberships)
      .innerJoin(workspaces, utils.eq(memberships.workspaceId, workspaces.id))
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
