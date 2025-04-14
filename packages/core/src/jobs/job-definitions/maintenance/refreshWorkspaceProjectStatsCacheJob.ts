import { Job } from 'bullmq'
import { refreshWorkspaceProjectStatsCache } from '../../../services/projects/refreshProjectStatsCache'

export type RefreshWorkspaceProjectStatsCacheJobData = {
  workspaceId: number
}

/**
 * Job that refreshes the project stats cache for a specific workspace
 */
export const refreshWorkspaceProjectStatsCacheJob = async (
  job: Job<RefreshWorkspaceProjectStatsCacheJobData>,
) => {
  const { workspaceId } = job.data

  return await refreshWorkspaceProjectStatsCache(workspaceId).then((r) =>
    r.unwrap(),
  )
}
