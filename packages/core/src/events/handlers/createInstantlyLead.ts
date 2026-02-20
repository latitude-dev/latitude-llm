import { env } from '@latitude-data/env'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { FREE_PLANS } from '../../plans'
import { createInstantlyLead as createInstantlyLeadService } from '../../services/instantly/createLead'
import { type UserCreatedEvent } from '../events'

export async function createInstantlyLead({
  data: event,
}: {
  data: UserCreatedEvent
}) {
  if (!env.LATITUDE_CLOUD || env.LATITUDE_ENTERPRISE_MODE) return

  const apiKey = env.INSTANTLY_API_KEY
  if (!apiKey?.trim()) return

  const workspace = await unsafelyFindWorkspace(event.data.workspaceId)
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
