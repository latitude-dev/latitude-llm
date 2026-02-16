import { addDays, startOfDay } from 'date-fns'
import { Job } from 'bullmq'
import { and, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import { findWorkspaceCreator } from '../../../queries/users/findWorkspaceCreator'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { FREE_PLANS } from '../../../plans'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'

export type NotifyWorkspacesFinishingFreeTrialJobData = Record<string, never>

/**
 * Job that runs daily at 2 AM to find workspaces whose free trial ends exactly 10 days from today
 * and publish a workspaceFinishingFreeTrial event for each. Each workspace receives the event only once.
 */
export const notifyWorkspacesFinishingFreeTrialJob = async (
  _: Job<NotifyWorkspacesFinishingFreeTrialJobData>,
) => {
  const now = new Date()
  const trialEndWindowStart = startOfDay(addDays(now, 10))
  const trialEndWindowEnd = startOfDay(addDays(now, 11))

  const workspacesFinishingTrial = await database
    .select({
      workspace: workspaces,
    })
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(subscriptions.id, workspaces.currentSubscriptionId),
    )
    .where(
      and(
        inArray(subscriptions.plan, FREE_PLANS),
        isNotNull(subscriptions.trialEndsAt),
        gte(subscriptions.trialEndsAt, trialEndWindowStart),
        lt(subscriptions.trialEndsAt, trialEndWindowEnd),
      ),
    )

  for (const row of workspacesFinishingTrial) {
    const creator = await findWorkspaceCreator({ workspace: row.workspace })
    if (!creator) continue

    const userGoal = creator.latitudeGoal ?? creator.latitudeGoalOther ?? null

    await publisher.publishLater({
      type: 'workspaceFinishingFreeTrial',
      data: {
        userEmail: creator.email,
        userGoal: userGoal,
      },
    })
  }
}
