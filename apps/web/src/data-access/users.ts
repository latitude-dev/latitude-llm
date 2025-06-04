import { database, utils } from '@latitude-data/core/client'
import {
  unsafelyFindWorkspacesFromUser,
  unsafelyGetUser,
} from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { PromisedResult } from '@latitude-data/core/lib/Transaction'
import { users } from '@latitude-data/core/schema'
import { getFirstWorkspace } from '$/data-access/workspaces'
import {
  SubscriptionPlan,
  SubscriptionPlans,
  User,
  Workspace,
} from '@latitude-data/core/browser'

function notFoundWithEmail(email: string | undefined | null) {
  return Result.error(new NotFoundError(`Not found user with email: ${email}`))
}

function notFoundWithId(id: string | undefined | null) {
  return Result.error(new NotFoundError(`Not found user with ID: ${id}`))
}

type ReturnType = {
  user: User
  workspace: Workspace
}

export async function getUserFromCredentials({
  email,
}: {
  email: string
}): PromisedResult<ReturnType, NotFoundError> {
  const user = await database.query.users.findFirst({
    where: utils.eq(users.email, email),
  })
  if (!user) return notFoundWithEmail(email)

  const wpResult = await getFirstWorkspace({ userId: user.id })
  if (wpResult.error) {
    return Result.error(wpResult.error)
  }

  const workspace = wpResult.value!

  return Result.ok({
    user,
    workspace,
  })
}

export async function getCurrentUserFromDB({
  userId,
}: {
  userId: string | undefined
}): PromisedResult<ReturnType, Error> {
  try {
    const user = await unsafelyGetUser(userId)
    if (!user) return notFoundWithId(userId)

    const wpResult = await getFirstWorkspace({ userId: user.id })
    if (wpResult.error) return wpResult

    const workspace = wpResult.value!

    return Result.ok({
      user,
      workspace,
    })
  } catch (err) {
    return Result.error(err as Error)
  }
}

export function getPlanFromSubscriptionSlug(
  slug: SubscriptionPlan | undefined,
) {
  const plan = slug || SubscriptionPlan.HobbyV2
  const planData = SubscriptionPlans[plan]
  return { ...planData, plan }
}

export async function unsafelyGetCurrentUserFromDb({
  userId,
}: {
  userId: string | undefined
}) {
  const user = await unsafelyGetUser(userId)
  const workspaces = await unsafelyFindWorkspacesFromUser(userId)
  const workspace = workspaces[0]
  const plan = workspace?.currentSubscription.plan
  const subscriptionPlan = getPlanFromSubscriptionSlug(plan)

  return { user, workspace, subscriptionPlan }
}
