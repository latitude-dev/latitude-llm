import { database } from '../../../client'
import {
  ATTRIBUTES,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.External]
export const ExternalSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes }: SpanProcessArgs<SpanType.External>,
  _ = database,
) {
  return Result.ok({
    promptUuid: attributes[ATTRIBUTES.LATITUDE.documentUuid] as string,
    documentLogUuid: attributes[ATTRIBUTES.LATITUDE.documentLogUuid] as string,
    source: attributes[ATTRIBUTES.LATITUDE.source] as LogSources,
    versionUuid: attributes[ATTRIBUTES.LATITUDE.commitUuid] as
      | string
      | undefined,
    externalId: attributes[ATTRIBUTES.LATITUDE.externalId] as
      | string
      | undefined,
    name: attributes[ATTRIBUTES.LATITUDE.name] as string | undefined,
  })
}
