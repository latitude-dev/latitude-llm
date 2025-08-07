import type { Job } from 'bullmq'
import { refreshProjectStatsCache } from '../../../services/projects/refreshProjectStatsCache'

export type RefreshProjectStatsCacheJobData = {
  projectId: number
}

export const refreshProjectStatsCacheJob = async (job: Job<RefreshProjectStatsCacheJobData>) => {
  const { projectId } = job.data
  return await refreshProjectStatsCache(projectId).then((r) => r.unwrap())
}
