import { database } from '../../../client'
import {
  ATTRIBUTES,
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
      attributes[ATTRIBUTES.LATITUDE.request.parameters] as string,
    )
  } catch (error) {
    parameters = {}
  }

  return Result.ok({
    parameters,
    template: attributes[ATTRIBUTES.LATITUDE.request.template] as string,
    externalId: attributes[ATTRIBUTES.LATITUDE.externalId] as string,

    // References
    experimentUuid: attributes[ATTRIBUTES.LATITUDE.experimentUuid] as string,
    promptUuid: attributes[ATTRIBUTES.LATITUDE.documentUuid] as string,
    versionUuid: attributes[ATTRIBUTES.LATITUDE.commitUuid] as string,
    documentLogUuid: attributes[ATTRIBUTES.LATITUDE.documentLogUuid] as string,
    projectId: attributes[ATTRIBUTES.LATITUDE.projectId] as number,
    testDeploymentId: attributes[ATTRIBUTES.LATITUDE.testDeploymentId] as
      | number
      | undefined,
    source: attributes[ATTRIBUTES.LATITUDE.source] as LogSources,
  })
}
