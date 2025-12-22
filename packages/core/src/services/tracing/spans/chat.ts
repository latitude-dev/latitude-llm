import { database } from '../../../client'
import {
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
  ATTRIBUTES,
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
    documentLogUuid: attributes[ATTRIBUTES.LATITUDE.documentLogUuid] as string,
    previousTraceId: attributes[ATTRIBUTES.LATITUDE.previousTraceId] as string,
    source: attributes[ATTRIBUTES.LATITUDE.source] as LogSources,
  })
}
