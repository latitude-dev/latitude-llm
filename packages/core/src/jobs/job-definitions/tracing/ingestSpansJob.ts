import { Job } from 'bullmq'
import { Otlp } from '../../../browser'
import { UnprocessableEntityError } from '../../../lib/errors'
import { ingestSpans } from '../../../services/tracing/spans/ingest'

export type IngestSpansJobData = {
  spans: Otlp.ResourceSpan[]
  apiKeyId?: number
  workspaceId?: number
}

export const ingestSpansJob = async (job: Job<IngestSpansJobData>) => {
  const { spans, apiKeyId, workspaceId } = job.data

  const result = await ingestSpans({
    spans: spans,
    apiKeyId: apiKeyId,
    workspaceId: workspaceId,
  })

  if (result.error && !(result.error instanceof UnprocessableEntityError)) {
    throw result.error
  }
}
