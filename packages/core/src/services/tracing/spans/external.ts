import { database } from '../../../client'
import {
  ATTR_LATITUDE_COMMIT_UUID,
  ATTR_LATITUDE_SOURCE,
  ATTR_LATITUDE_DOCUMENT_UUID,
  ATTR_LATITUDE_DOCUMENT_LOG_UUID,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
  ATTR_LATITUDE_EXTERNAL_ID,
  ATTR_LATITUDE_NAME,
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
    promptUuid: attributes[ATTR_LATITUDE_DOCUMENT_UUID] as string,
    documentLogUuid: attributes[ATTR_LATITUDE_DOCUMENT_LOG_UUID] as string,
    source: attributes[ATTR_LATITUDE_SOURCE] as LogSources,
    versionUuid: attributes[ATTR_LATITUDE_COMMIT_UUID] as string | undefined,
    externalId: attributes[ATTR_LATITUDE_EXTERNAL_ID] as string | undefined,
    name: attributes[ATTR_LATITUDE_NAME] as string | undefined,
  })
}
