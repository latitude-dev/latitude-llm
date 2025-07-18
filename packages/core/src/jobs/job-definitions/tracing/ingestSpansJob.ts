import { Job } from 'bullmq'
import { SPAN_INGESTION_STORAGE_KEY, SpanIngestionData } from '../../../browser'
import { diskFactory } from '../../../lib/disk'
import { UnprocessableEntityError } from '../../../lib/errors'
import { ingestSpans } from '../../../services/tracing/spans/ingest'
import { captureException } from '../../../utils/workers/sentry'

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
  } catch { return } // prettier-ignore
  const { spans } = data

  const result = await ingestSpans({ spans, apiKeyId, workspaceId })
  if (result.error) {
    // @ts-expect-error ingestSpans currently ignores all errors but leaving this for the future
    if (!(result.error instanceof UnprocessableEntityError)) {
      throw result.error
    }

    if (process.env.NODE_ENV === 'development') {
      captureException(result.error)
    }
  }

  try {
    await disk.delete(key)
  } catch { return } // prettier-ignore
}
