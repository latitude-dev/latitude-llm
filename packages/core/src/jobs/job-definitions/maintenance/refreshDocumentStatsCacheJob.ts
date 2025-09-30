import { Job } from 'bullmq'
import { refreshDocumentStatsCache } from '../../../services/documentLogs/refreshDocumentStatsCache'

export type RefreshDocumentStatsCacheJobData = {
  documentUuid: string
}

export const refreshDocumentStatsCacheJob = async (
  job: Job<RefreshDocumentStatsCacheJobData>,
) => {
  const { documentUuid } = job.data
  await refreshDocumentStatsCache(documentUuid).then((r) => r.unwrap())
}
