import { extractAttribute } from '../../../../../constants/src/tracing/attributes'
import { database } from '../../../client'
import {
  ATTRIBUTES,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
  ToolSpanMetadata,
} from '../../../constants'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export const ToolSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status }: SpanProcessArgs<SpanType.Tool>,
  _ = database,
) {
  const extractingtn = extractToolName(attributes)
  if (extractingtn.error) return Result.error(extractingtn.error)
  const name = extractingtn.value

  const extractingci = extractToolCallId(attributes)
  if (extractingci.error) return Result.error(extractingci.error)
  const callId = extractingci.value

  const extractingca = extractToolCallArguments(attributes)
  if (extractingca.error) return Result.error(extractingca.error)
  const callArguments = extractingca.value

  if (status === SpanStatus.Error) {
    return Result.ok({
      name: name,
      call: {
        id: callId,
        arguments: callArguments,
      },
    })
  }

  const extractingrv = extractToolResultValue(attributes)
  if (extractingrv.error) return Result.error(extractingrv.error)
  const resultValue = extractingrv.value

  const extractingre = extractToolResultIsError(attributes)
  if (extractingre.error) return Result.error(extractingre.error)
  const resultIsError = extractingre.value

  return Result.ok({
    name: name,
    call: {
      id: callId,
      arguments: callArguments,
    },
    result: {
      value: resultValue,
      isError: resultIsError,
    },
  })
}

function extractToolName(
  attributes: Record<string, SpanAttribute>,
): TypedResult<ToolSpanMetadata['name']> {
  const toolName = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.name,
      ATTRIBUTES.OPENINFERENCE.tool.name,
      ATTRIBUTES.AI_SDK.toolCall.name,
    ],
  })

  if (toolName) return Result.ok(toolName)
  return Result.error(new UnprocessableEntityError('Tool name is required'))
}

function extractToolCallId(
  attributes: Record<string, SpanAttribute>,
): TypedResult<ToolSpanMetadata['call']['id']> {
  const toolCallId = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.id,
      ATTRIBUTES.OPENINFERENCE.toolCall.id,
      ATTRIBUTES.AI_SDK.toolCall.id,
    ],
  })

  if (toolCallId) return Result.ok(toolCallId)
  return Result.error(new UnprocessableEntityError('Tool call id is required'))
}

function extractToolCallArguments(
  attributes: Record<string, SpanAttribute>,
): TypedResult<ToolSpanMetadata['call']['arguments']> {
  const toolCallArguments = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.arguments,
      ATTRIBUTES.OPENINFERENCE.toolCall.function.arguments,
      ATTRIBUTES.AI_SDK.toolCall.args,
    ],
    serializer: (value) => {
      try {
        return JSON.parse(String(value)) as Record<string, unknown>
      } catch (error) {
        return undefined
      }
    },
    validation: (value) => value !== undefined,
  })

  if (toolCallArguments) return Result.ok(toolCallArguments)
  return Result.ok({})
}

function extractToolResultValue(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<ToolSpanMetadata>['result']['value']> {
  const toolResultValue = extractAttribute({
    attributes,
    keys: [
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.result.value,
      ATTRIBUTES.OPENINFERENCE.toolCall.function.result,
      ATTRIBUTES.AI_SDK.toolCall.result,
    ],
    serializer: (value) => {
      try {
        return JSON.parse(String(value)) as Record<string, unknown>
      } catch (error) {
        return String(value)
      }
    },
  })

  if (toolResultValue) return Result.ok(toolResultValue)
  return Result.ok('')
}

function extractToolResultIsError(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<ToolSpanMetadata>['result']['isError']> {
  const isError = extractAttribute({
    attributes,
    keys: [ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.result.isError],
    serializer: Boolean,
  })

  return Result.ok(isError ?? false)
}
