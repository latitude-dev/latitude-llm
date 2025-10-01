import {
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '../../../browser'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Prompt]
export const PromptSpanSpecification = {
  ...specification,
  process: process,
}

async function process(args: SpanProcessArgs<SpanType.Prompt>, _ = database) {
  let parameters: Record<string, unknown>
  try {
    parameters = JSON.parse(
      attributes[ATTR_GEN_AI_REQUEST_PARAMETERS] as string,
    )
  } catch (error) {
    parameters = {}
  }

  return Result.ok({
    externalId: attributes.externalId as string,
    name: attributes.name as string,
    parameters,
    template: attributes.template as string,

    // References
    experimentUuid: attributes.experimentUuid as string,
    promptUuid: attributes.promptUuid as string,
    versionUuid: attributes.versionUuid as string,
  })
}
