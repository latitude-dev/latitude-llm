import { Job } from 'bullmq'
import {
  SPAN_INGESTION_STORAGE_KEY,
  SpanIngestionData,
} from '../../../constants'
import { diskFactory } from '../../../lib/disk'
import { ingestSpans } from '../../../services/tracing/spans/ingest'

export type IngestSpansJobData = {
  ingestionId: string
  apiKeyId?: number
  workspaceId?: number
}

export function ingestSpansJobKey({ ingestionId }: IngestSpansJobData) {
  return `ingestSpansJob-${ingestionId}`
}

export const ingestSpansJob = async (job: Job<IngestSpansJobData>) => {
  const { ingestionId, apiKeyId, workspaceId } = job.data

  const disk = diskFactory('private')
  const key = SPAN_INGESTION_STORAGE_KEY(ingestionId)
  let data
  try {
    const payload = await disk.get(key)
    data = JSON.parse(payload) as SpanIngestionData
  } catch (error) {
    return
  }
  const { spans } = data

  await ingestSpans({ spans, apiKeyId, workspaceId })
  await disk.delete(key)
}
