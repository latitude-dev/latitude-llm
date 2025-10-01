import { database } from '../../../client'
import { workspaces } from '../../../schema'
import { queues } from '../../queues'

export const migrateSpansJobs = async () => {
  const freeWorkspaces = await database
    .select({
      id: workspaces.id,
    })
    .from(workspaces)

  let _enqueuedJobs = 0

  for (const workspace of freeWorkspaces) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'migrateSpansJob',
      { workspaceId: workspace.id },
      { attempts: 1 },
    )
    _enqueuedJobs++
  }
}
