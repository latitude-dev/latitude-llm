import { workspaces } from '../schema/models/workspaces'
import { database } from '../client'
import { unsafelyFindWorkspace } from '../data-access/workspaces'
import { issueSubscriptionGrants } from '../services/subscriptions/grants'

export async function backfillSubscriptionGrants(real: boolean = false) {
  const workspaceIds = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .then((result) => result.map((r) => r.id))

  console.log(`Found ${workspaceIds.length} workspaces to backfill`)
  if (!real) return

  for (const workspaceId of workspaceIds) {
    try {
      const workspace = await unsafelyFindWorkspace(workspaceId)
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }

      const grants = await issueSubscriptionGrants({
        workspace,
        subscription: workspace.currentSubscription,
      }).then((r) => r.unwrap())
      console.log(
        `Issued seats=${grants.seats.amount} runs=${grants.runs.amount} credits=${grants.credits.amount} for workspace ${workspaceId} in ${workspace.currentSubscription.plan} plan`,
      )
    } catch (error) {
      console.log(error)
      continue
    }
  }
}
