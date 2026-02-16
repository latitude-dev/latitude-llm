import { Span } from '@latitude-data/constants'
import { Result, TypedResult } from '../../../lib/Result'
import { listTraceIdsByLogUuid } from './findByDocumentLogUuid'
import { getSpan } from './get'

export async function getByDocumentLogUuidAndSpanId({
  workspaceId,
  documentLogUuid,
  spanId,
}: {
  workspaceId: number
  documentLogUuid: string
  spanId: string
}): Promise<TypedResult<Span | undefined>> {
  const traceIds = await listTraceIdsByLogUuid({
    workspaceId,
    logUuid: documentLogUuid,
  })
  if (traceIds.length === 0) return Result.nil()

  for (const traceId of traceIds) {
    const result = await getSpan({ workspaceId, spanId, traceId })
    if (result.ok && result.value) return result
  }

  return Result.nil()
}
