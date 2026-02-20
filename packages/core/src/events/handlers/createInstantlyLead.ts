import { env } from '@latitude-data/env'
import { unsafelyFindWorkspacesFromUser } from '../../data-access/workspaces'
import { FREE_PLANS } from '../../plans'
import { createInstantlyLead as createInstantlyLeadService } from '../../services/instantly/createLead'
import { UserOnboardingInfoUpdatedEvent } from '../events'

export async function createInstantlyLead({
  data: event,
}: {
  data: UserOnboardingInfoUpdatedEvent
}) {
  if (!env.LATITUDE_CLOUD || env.LATITUDE_ENTERPRISE_MODE) return

  const apiKey = env.INSTANTLY_API_KEY
  if (!apiKey?.trim()) return

  // Finding the new workspace created by the user
  const workspace = (await unsafelyFindWorkspacesFromUser(event.data.id))[0]
  if (
    !workspace?.currentSubscription ||
    !FREE_PLANS.includes(workspace.currentSubscription.plan)
  ) {
    return
  }

  const email = event.data.userEmail?.trim()
  if (!email) return

  await createInstantlyLeadService(
    {
      email: event.data.userEmail,
      name: event.data.name,
      latitudeGoal: event.data.latitudeGoal,
    },
    apiKey,
  )
}
