import {
  ApiKey,
  Otlp,
  SPAN_INGESTION_STORAGE_KEY,
  SpanIngestionData,
  TRACING_JOBS_MAX_ATTEMPTS,
  Workspace,
} from '../../../browser'
import { ingestSpansJobKey } from '../../../jobs/job-definitions/tracing/ingestSpansJob'
import { tracingQueue } from '../../../jobs/queues'
import { diskFactory, DiskWrapper } from '../../../lib/disk'
import { hashContent as hash } from '../../../lib/hashContent'
import { Result } from '../../../lib/Result'

export async function enqueueSpans(
  {
    spans,
    apiKey,
    workspace,
  }: {
    spans: Otlp.ResourceSpan[]
    apiKey?: ApiKey
    workspace?: Workspace
  },
  disk: DiskWrapper = diskFactory('private'),
) {
  let ingestionId = ''
  for (const { scopeSpans } of spans) {
    for (const { spans } of scopeSpans) {
      for (const span of spans) {
        ingestionId += span.traceId + span.spanId
      }
    }
  }
  ingestionId = hash(ingestionId)

  const key = SPAN_INGESTION_STORAGE_KEY(ingestionId)
  const data = { ingestionId, spans } satisfies SpanIngestionData

  try {
    const payload = JSON.stringify(data)
    await disk.put(key, payload).then((r) => r.unwrap())
  } catch (error) {
    return Result.error(error as Error)
  }

  const payload = {
    ingestionId: ingestionId,
    apiKeyId: apiKey?.id,
    workspaceId: workspace?.id,
  }

  await tracingQueue.add('ingestSpansJob', payload, {
    attempts: TRACING_JOBS_MAX_ATTEMPTS,
    deduplication: { id: ingestSpansJobKey(payload) },
  })

  return Result.nil()
}
