import { database } from '../../../client'
import {
  ATTR_LATITUDE_DOCUMENT_LOG_UUID,
  ATTR_LATITUDE_PREVIOUS_TRACE_ID,
  ATTR_LATITUDE_SOURCE,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '../../../constants'
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
    documentLogUuid: attributes[ATTR_LATITUDE_DOCUMENT_LOG_UUID] as string,
    previousTraceId: attributes[ATTR_LATITUDE_PREVIOUS_TRACE_ID] as string,
    source: attributes[ATTR_LATITUDE_SOURCE] as LogSources,
  })
}
