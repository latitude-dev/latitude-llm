import { database } from '../../../client'
import { LogSources, SPAN_SPECIFICATIONS, SpanType } from '../../../constants'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Chat]
export const ChatSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes }: SpanProcessArgs<SpanType.Chat>,
  _ = database,
) {
  return Result.ok({
    documentLogUuid: attributes['latitude.documentLogUuid'] as string,
    previousTraceId: attributes['latitude.previousTraceId'] as string,
    source: attributes['latitude.source'] as LogSources,
  })
}
