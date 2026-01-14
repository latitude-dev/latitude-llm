import { Job } from 'bullmq'

import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { Result } from '../../../lib/Result'
import { destroyWorkspace } from '../../../services/workspaces/destroy'
import { queues } from '../../queues'

export type DestroyWorkspaceJobData = {
  workspaceId: number
}

/**
 * Enqueues a job to permanently destroy a workspace.
 * Use this instead of calling destroyWorkspaceJob directly to ensure
 * the deletion runs in the background.
 */
export async function enqueueDestroyWorkspaceJob(workspaceId: number) {
  const { maintenanceQueue } = await queues()
  return maintenanceQueue.add(
    'destroyWorkspaceJob',
    { workspaceId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  )
}

/**
 * Background job that permanently destroys a workspace and all associated data.
 * Delegates to the destroyWorkspace service for the actual deletion logic.
 */
export const destroyWorkspaceJob = async (
  job: Job<DestroyWorkspaceJobData>,
) => {
  const { workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    return Result.nil()
  }

  return destroyWorkspace(workspace)
}
