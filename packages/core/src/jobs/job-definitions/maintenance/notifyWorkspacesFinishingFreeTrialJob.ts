import { env } from '@latitude-data/env'
import { addDays, startOfDay } from 'date-fns'
import { Job } from 'bullmq'
import { and, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import { hasAtLeastOneExternalSpan } from '../../../queries/clickhouse/spans/hasAtLeastOneExternalSpan'
import { findWorkspaceCreator } from '../../../queries/users/findWorkspaceCreator'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { FREE_PLANS } from '../../../plans'
import { createInstantlyLead } from '../../../services/instantly/createLead'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'

export type NotifyWorkspacesFinishingFreeTrialJobData = Record<string, never>

/**
 * Job that runs daily at 2 AM to find workspaces whose free trial ends exactly 10 days from today.
 * Creates an Instantly lead for every such workspace. Publishes workspaceFinishingFreeTrial only for ICPs
 */
export const notifyWorkspacesFinishingFreeTrialJob = async (
  _: Job<NotifyWorkspacesFinishingFreeTrialJobData>,
) => {
  const shouldCreateLeads =
    env.LATITUDE_CLOUD && !env.LATITUDE_ENTERPRISE_MODE && env.INSTANTLY_API_KEY
  if (!shouldCreateLeads) return

  const apiKey = env.INSTANTLY_API_KEY ?? ''

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
    if (!creator || !creator.email?.trim()) continue

    const userGoal = creator.latitudeGoal ?? creator.latitudeGoalOther ?? null

    await createInstantlyLead({ email: creator.email }, apiKey, {
      campaignContext: 'trial_finishing',
      goalForCampaign: userGoal,
    })

    const isIcp = await hasAtLeastOneExternalSpan(row.workspace.id)
    if (isIcp) {
      await publisher.publishLater({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: creator.email,
          userGoal: userGoal,
        },
      })
    }
  }
}
