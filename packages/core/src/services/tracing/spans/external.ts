import { database } from '../../../client'
import { LogSources, SPAN_SPECIFICATIONS, SpanType } from '../../../constants'
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
    promptUuid: attributes['latitude.documentUuid'] as string,
    documentLogUuid: attributes['latitude.documentLogUuid'] as string,
    source: attributes['latitude.source'] as LogSources,
    versionUuid: attributes['latitude.commitUuid'] as string | undefined,
    externalId: attributes['latitude.externalId'] as string | undefined,
    name: attributes['latitude.name'] as string | undefined,
  })
}
