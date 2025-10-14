import { Job } from 'bullmq'
import { refreshDocumentStatsCache } from '../../../services/documentLogs/refreshDocumentStatsCache'
import { lro } from '../../../client'

export type RefreshDocumentStatsCacheJobData = {
  documentUuid: string
}

export const refreshDocumentStatsCacheJob = async (
  job: Job<RefreshDocumentStatsCacheJobData>,
) => {
  const { documentUuid } = job.data
  await refreshDocumentStatsCache(documentUuid, lro()).then((r) => r.unwrap())
}
