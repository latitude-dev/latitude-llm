import { database, utils } from '@latitude-data/core/client'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { unsafelyGetUser } from '@latitude-data/core/data-access/users'
import { NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '@latitude-data/core/lib/Result'
import type { PromisedResult } from '@latitude-data/core/lib/Transaction'
import { users } from '@latitude-data/core/schema/models/users'
import { getFirstWorkspace } from '$/data-access/workspaces'
import type { User, Workspace } from '@latitude-data/core/schema/types'
import { SubscriptionPlan, SubscriptionPlans } from '@latitude-data/core/plans'
import type { Session } from 'lucia'
import { getSession } from '$/services/auth/getSession'

function notFoundWithEmail(email: string | undefined | null) {
  return Result.error(new NotFoundError(`Not found user with email: ${email}`))
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
  const user = await database
    .select()
    .from(users)
    .where(utils.eq(users.email, email))
    .then(([user]) => user)
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

export function getPlanFromSubscriptionSlug(
  slug: SubscriptionPlan | undefined,
) {
  const plan = slug || SubscriptionPlan.HobbyV2
  const planData = SubscriptionPlans[plan]
  return { ...planData, plan }
}

/**
 * Retrieves user, workspace, and subscription data from a session.
 *
 * This function extracts user and workspace information from a session object.
 * If no session is provided, it attempts to get the current session.
 * Returns null values for all fields if no valid session exists.
 *
 * @param session - Optional session object. If not provided, will attempt to get current session
 * @returns Promise<{
 *   user: User | null
 *   workspace: Workspace | null
 *   subscriptionPlan: { ...planData, plan: SubscriptionPlan }
 *   session: Session | null
 * }> - User data, workspace data, subscription plan, and session object
 */
export async function getDataFromSession(session?: Session | null) {
  try {
    session = session ?? (await getSession().then((s) => s?.session))
  } catch {
    // do nothing
  }

  if (!session) {
    return {
      session: null,
      user: null,
      workspace: null,
      subscriptionPlan: null,
    }
  }

  const user = await unsafelyGetUser(session.userId)
  const workspace = await unsafelyFindWorkspace(session.currentWorkspaceId)
  const plan = workspace?.currentSubscription.plan
  const subscriptionPlan = getPlanFromSubscriptionSlug(plan)

  return { user, workspace, subscriptionPlan, session }
}
