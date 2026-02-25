import { env } from '@latitude-data/env'
import { unsafelyFindWorkspacesFromUser } from '../../data-access/workspaces'
import { FREE_PLANS } from '../../plans'
import { createInstantlyLead as createInstantlyLeadService } from '../../services/instantly/createLead'
import { captureException } from '../../utils/datadogCapture'
import { UserOnboardingInfoUpdatedEvent } from '../events'

export async function createInstantlyLead({
  data: event,
}: {
  data: UserOnboardingInfoUpdatedEvent
}) {
  if (!env.LATITUDE_CLOUD || env.LATITUDE_ENTERPRISE_MODE) return

  const apiKey = env.INSTANTLY_API_KEY
  if (!apiKey?.trim()) {
    captureException(
      new Error(`[createInstantlyLead] skipped: INSTANTLY_API_KEY is empty`),
    )
    return
  }

  const workspaces = await unsafelyFindWorkspacesFromUser(event.data.id)
  if (!workspaces.length) {
    captureException(
      new Error(
        `[createInstantlyLead] skipped for ${event.data.userEmail}: no workspaces found`,
      ),
    )
    return
  }

  const hasPaidPlan = workspaces.some(
    (w) =>
      w.currentSubscription && !FREE_PLANS.includes(w.currentSubscription.plan),
  )
  if (hasPaidPlan) {
    captureException(
      new Error(
        `[createInstantlyLead] skipped for ${event.data.userEmail}: has paid plan`,
      ),
    )
    return
  }

  const workspace = workspaces[0]!
  if (!workspace.currentSubscription) {
    captureException(
      new Error(
        `[createInstantlyLead] skipped for ${event.data.userEmail}: no subscription`,
      ),
    )
    return
  }

  const email = event.data.userEmail?.trim()
  if (!email) {
    captureException(
      new Error(
        `[createInstantlyLead] skipped: empty email (userId: ${event.data.id})`,
      ),
    )
    return
  }

  await createInstantlyLeadService(
    {
      email: event.data.userEmail,
      name: event.data.name,
      latitudeGoal: event.data.latitudeGoal,
    },
    apiKey,
  )
}
