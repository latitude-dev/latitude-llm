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
import { captureException } from '../../../utils/datadogCapture'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'

export type NotifyWorkspacesFinishingFreeTrialJobData = Record<string, never>

/**
 * Job that runs daily at 2 AM to find workspaces whose free trial ends exactly 6 days from today.
 * Creates an Instantly lead for every such workspace. Publishes workspaceFinishingFreeTrial for those who implemented the telemetry
 */
export const notifyWorkspacesFinishingFreeTrialJob = async (
  _: Job<NotifyWorkspacesFinishingFreeTrialJobData>,
) => {
  if (!env.LATITUDE_CLOUD || env.LATITUDE_ENTERPRISE_MODE) return

  const apiKey = env.INSTANTLY_API_KEY
  if (!apiKey?.trim()) {
    captureException(
      new Error(
        `[notifyWorkspacesFinishingFreeTrial] skipped: INSTANTLY_API_KEY is empty`,
      ),
    )
    return
  }

  const now = new Date()
  const trialEndWindowStart = startOfDay(addDays(now, 6))
  const trialEndWindowEnd = startOfDay(addDays(now, 7))

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
    if (!creator) {
      captureException(
        new Error(
          `[notifyWorkspacesFinishingFreeTrial] skipped workspace ${row.workspace.id}: no creator found`,
        ),
      )
      continue
    }

    const email = creator.email?.trim()
    if (!email) {
      captureException(
        new Error(
          `[notifyWorkspacesFinishingFreeTrial] skipped workspace ${row.workspace.id}: creator has no email`,
        ),
      )
      continue
    }

    const userGoal = creator.latitudeGoal ?? creator.latitudeGoalOther

    if (!userGoal) {
      captureException(
        new Error(
          `[notifyWorkspacesFinishingFreeTrial] skipped workspace ${row.workspace.id}: creator has no latitude goal`,
        ),
      )
      continue
    }

    await createInstantlyLead(
      {
        email,
        name: creator.name ?? '',
        latitudeGoal: userGoal,
      },
      apiKey,
      true,
    )

    const hasExternalSpan = await hasAtLeastOneExternalSpan(row.workspace.id)
    if (hasExternalSpan) {
      await publisher.publishLater({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: email,
          userGoal: userGoal,
        },
      })
    }
  }
}
