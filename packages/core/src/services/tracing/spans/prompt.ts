import { SPAN_SPECIFICATIONS, SpanType } from '../../../browser'
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
    parameters = JSON.parse(args.attributes.parameters as string)
  } catch (error) {
    parameters = {}
  }

  return Result.ok({
    externalId: args.attributes.customIdentifier as string,
    name: args.attributes.name as string,
    parameters,
    template: args.attributes.template as string,

    // References
    experimentUuid: args.attributes.experimentUuid as string,
    promptUuid: args.attributes.promptUuid as string,
    versionUuid: args.attributes.versionUuid as string,
  })
}
