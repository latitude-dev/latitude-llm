import { database } from '../../../client'
import {
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  ATTR_GEN_AI_REQUEST_TEMPLATE,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]
export const PromptSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes }: SpanProcessArgs<SpanType.Prompt>,
  _ = database,
) {
  let parameters: Record<string, unknown>
  try {
    parameters = JSON.parse(
      attributes[ATTR_GEN_AI_REQUEST_PARAMETERS] as string,
    )
  } catch (error) {
    parameters = {}
  }

  return Result.ok({
    parameters,
    template: attributes[ATTR_GEN_AI_REQUEST_TEMPLATE] as string,
    externalId: attributes['latitude.externalId'] as string,

    // References
    experimentUuid: attributes['latitude.experimentUuid'] as string,
    promptUuid: attributes['latitude.documentUuid'] as string,
    versionUuid: attributes['latitude.commitUuid'] as string,
    documentLogUuid: attributes['latitude.documentLogUuid'] as string,
    source: attributes['latitude.source'] as LogSources,
  })
}
