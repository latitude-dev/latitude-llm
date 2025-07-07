import { Job } from 'bullmq'
import { Otlp } from '../../../browser'
import { UnprocessableEntityError } from '../../../lib/errors'
import { ingestSpans } from '../../../services/tracing/spans/ingest'
import { captureException } from '../../../utils/workers/sentry'

export type IngestSpansJobData = {
  spans: Otlp.ResourceSpan[]
  apiKeyId?: number
  workspaceId?: number
}

export const ingestSpansJob = async (job: Job<IngestSpansJobData>) => {
  const { spans, apiKeyId, workspaceId } = job.data

  const result = await ingestSpans({ spans, apiKeyId, workspaceId })
  if (result.error) {
    // @ts-expect-error ingestSpans currently ignores all errors but leaving this for the future
    if (result.error instanceof UnprocessableEntityError) {
      if (process.env.NODE_ENV === 'development') captureException(result.error)
    } else throw result.error
  }
}
