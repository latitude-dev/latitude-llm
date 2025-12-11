import { database } from '../../../client'
import {
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  ATTR_GEN_AI_REQUEST_TEMPLATE,
  ATTR_LATITUDE_COMMIT_UUID,
  ATTR_LATITUDE_DOCUMENT_LOG_UUID,
  ATTR_LATITUDE_DOCUMENT_UUID,
  ATTR_LATITUDE_EXPERIMENT_UUID,
  ATTR_LATITUDE_EXTERNAL_ID,
  ATTR_LATITUDE_PROJECT_ID,
  ATTR_LATITUDE_SOURCE,
  ATTR_LATITUDE_TEST_DEPLOYMENT_ID,
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
    externalId: attributes[ATTR_LATITUDE_EXTERNAL_ID] as string,

    // References
    experimentUuid: attributes[ATTR_LATITUDE_EXPERIMENT_UUID] as string,
    promptUuid: attributes[ATTR_LATITUDE_DOCUMENT_UUID] as string,
    versionUuid: attributes[ATTR_LATITUDE_COMMIT_UUID] as string,
    documentLogUuid: attributes[ATTR_LATITUDE_DOCUMENT_LOG_UUID] as string,
    projectId: attributes[ATTR_LATITUDE_PROJECT_ID] as number,
    testDeploymentId: attributes[ATTR_LATITUDE_TEST_DEPLOYMENT_ID] as
      | number
      | undefined,
    source: attributes[ATTR_LATITUDE_SOURCE] as LogSources,
  })
}
