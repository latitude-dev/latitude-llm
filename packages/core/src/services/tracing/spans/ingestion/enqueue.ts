import {
  Otlp,
  SPAN_INGESTION_STORAGE_KEY,
  SpanIngestionData,
  TRACING_JOBS_MAX_ATTEMPTS,
} from '../../../../constants'
import { ingestSpansJobKey } from '../../../../jobs/job-definitions/tracing/ingestSpansJob'
import { queues } from '../../../../jobs/queues'
import { diskFactory, DiskWrapper } from '../../../../lib/disk'
import { hashContent as hash } from '../../../../lib/hashContent'
import { Result, TypedResult } from '../../../../lib/Result'
import { type ApiKey } from '../../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../../schema/models/types/Workspace'

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
  const ingestionId = await generateIngestionId(spans)
  const uploadResult = await uploadSpansToStorage(ingestionId, spans, disk)
  if (uploadResult.error) return uploadResult

  const payload = {
    ingestionId: ingestionId,
    apiKeyId: apiKey?.id,
    workspaceId: workspace?.id,
  }

  const { tracingQueue } = await queues()
  await tracingQueue.add('ingestSpansJob', payload, {
    attempts: TRACING_JOBS_MAX_ATTEMPTS,
    deduplication: { id: ingestSpansJobKey(payload) },
  })

  return Result.nil()
}

async function uploadSpansToStorage(
  ingestionId: string,
  spans: Otlp.ResourceSpan[],
  disk: DiskWrapper,
): Promise<TypedResult<void, Error>> {
  const key = SPAN_INGESTION_STORAGE_KEY(ingestionId)
  const data = { ingestionId, spans } satisfies SpanIngestionData

  try {
    const payload = JSON.stringify(data)
    await disk.put(key, payload).then((r) => r.unwrap())
    return Result.nil()
  } catch (error) {
    return Result.error(error as Error)
  }
}

async function generateIngestionId(
  spans: Otlp.ResourceSpan[],
): Promise<string> {
  let ingestionId = ''
  for (const { scopeSpans } of spans) {
    for (const { spans } of scopeSpans) {
      for (const span of spans) {
        ingestionId += span.traceId + span.spanId
      }
    }
  }
  return hash(ingestionId)
}
