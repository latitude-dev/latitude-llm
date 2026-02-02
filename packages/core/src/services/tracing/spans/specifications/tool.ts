import { extractAttribute } from '../../../../../../constants/src/tracing/attributes'
import { database } from '../../../../client'
import {
  ATTRIBUTES,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
  ToolSpanMetadata,
} from '../../../../constants'
import { UnprocessableEntityError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import { SpanProcessArgs } from '../shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export const ToolSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status }: SpanProcessArgs<SpanType.Tool>,
  _ = database,
) {
  const toolNameResult = extractToolName(attributes)
  if (!Result.isOk(toolNameResult)) return toolNameResult
  const toolName = toolNameResult.unwrap()

  const toolCallIdResult = extractToolCallId(attributes)
  if (!Result.isOk(toolCallIdResult)) return toolCallIdResult
  const toolCallId = toolCallIdResult.unwrap()

  const toolCallArgsResult = extractToolCallArguments(attributes)
  if (!Result.isOk(toolCallArgsResult)) return toolCallArgsResult
  const toolCallArgs = toolCallArgsResult.unwrap()

  if (status === SpanStatus.Error) {
    return Result.ok({
      name: toolName,
      call: {
        id: toolCallId,
        arguments: toolCallArgs,
      },
    })
  }

  const toolOutputResult = extractToolResultValue(attributes)
  if (!Result.isOk(toolOutputResult)) return toolOutputResult
  const toolOutput = toolOutputResult.unwrap()

  const toolIsErrorResult = extractToolResultIsError(attributes)
  if (!Result.isOk(toolIsErrorResult)) return toolIsErrorResult
  const toolIsError = toolIsErrorResult.unwrap()

  return Result.ok({
    name: toolName,
    call: {
      id: toolCallId,
      arguments: toolCallArgs,
    },
    result: {
      value: toolOutput,
      isError: toolIsError,
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
      ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.call.name,
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
      } catch (_error) {
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
      ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.result,
      ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.result.value,
      ATTRIBUTES.OPENINFERENCE.toolCall.function.result,
      ATTRIBUTES.AI_SDK.toolCall.result,
    ],
    serializer: (value) => {
      try {
        return JSON.parse(String(value)) as Record<string, unknown>
      } catch (_error) {
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
    keys: [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.result.isError],
    serializer: Boolean,
  })

  return Result.ok(isError ?? false)
}
