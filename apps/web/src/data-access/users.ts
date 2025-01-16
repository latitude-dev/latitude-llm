import { database } from '@latitude-data/core/client'
import {
  SessionData,
  unsafelyFindWorkspacesFromUser,
  unsafelyGetUser,
} from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { PromisedResult } from '@latitude-data/core/lib/Transaction'
import { users } from '@latitude-data/core/schema'
import { getFirstWorkspace } from '$/data-access/workspaces'
import { eq } from 'drizzle-orm'
import {
  SubscriptionPlan,
  SubscriptionPlans,
} from '@latitude-data/core/browser'

function notFoundWithEmail(email: string | undefined | null) {
  return Result.error(new NotFoundError(`Not found user with email: ${email}`))
}

function notFoundWithId(id: string | undefined | null) {
  return Result.error(new NotFoundError(`Not found user with ID: ${id}`))
}

export async function getUserFromCredentials({
  email,
}: {
  email: string
}): PromisedResult<SessionData, NotFoundError> {
  // TODO: move to core
  const user = await database.query.users.findFirst({
    columns: {
      id: true,
      name: true,
      email: true,
    },
    // NOTE: Typescript gets a little bit confused here. Not really a big deal.
    // Please make sure to keep this comment here when you are done trying and
    // failing to fix this.
    //
    // @ts-ignore
    where: eq(users.email, email),
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
}): PromisedResult<SessionData, Error> {
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

export async function unsafelyGetCurrentUserFromDb({
  userId,
}: {
  userId: string | undefined
}) {
  const user = await unsafelyGetUser(userId)
  const workspaces = await unsafelyFindWorkspacesFromUser(userId)
  const workspace = workspaces[0]
  const plan = workspace?.currentSubscription.plan
  const subscriptionPlan = plan
    ? SubscriptionPlans[plan]
    : SubscriptionPlans[SubscriptionPlan.HobbyV2]

  return { user, workspace, subscriptionPlan }
}
