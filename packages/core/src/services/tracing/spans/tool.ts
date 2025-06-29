import {
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_NAME,
} from '@opentelemetry/semantic-conventions/incubating'
import {
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_RESULT_IS_ERROR,
  ATTR_GEN_AI_TOOL_RESULT_VALUE,
  SPAN_SPECIFICATIONS,
  SpanAttribute,
  SpanStatus,
  SpanType,
  ToolSpanMetadata,
} from '../../../browser'
import { database, Database } from '../../../client'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from './../../../lib/Result'
import { SpanProcessArgs } from './shared'

const specification = SPAN_SPECIFICATIONS[SpanType.Tool]
export const ToolSpanSpecification = {
  ...specification,
  process: process,
}

async function process(
  { attributes, status }: SpanProcessArgs<SpanType.Tool>,
  _: Database = database,
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
  const name = String(attributes[ATTR_GEN_AI_TOOL_NAME] || '')
  if (name) return Result.ok(name)

  return Result.error(new UnprocessableEntityError('Tool name is required'))
}

function extractToolCallId(
  attributes: Record<string, SpanAttribute>,
): TypedResult<ToolSpanMetadata['call']['id']> {
  const id = String(attributes[ATTR_GEN_AI_TOOL_CALL_ID] || '')
  if (id) return Result.ok(id)

  return Result.error(new UnprocessableEntityError('Tool call id is required'))
}

function extractToolCallArguments(
  attributes: Record<string, SpanAttribute>,
): TypedResult<ToolSpanMetadata['call']['arguments']> {
  const attribute = String(attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] || '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (error) {
      return Result.error(
        new UnprocessableEntityError('Invalid tool call arguments'),
      )
    }
  }

  return Result.ok({})
}

function extractToolResultValue(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<ToolSpanMetadata>['result']['value']> {
  const attribute = String(attributes[ATTR_GEN_AI_TOOL_RESULT_VALUE] || '')
  if (attribute) {
    try {
      return Result.ok(JSON.parse(attribute))
    } catch (error) {
      return Result.ok(attribute || '')
    }
  }

  return Result.ok('')
}

function extractToolResultIsError(
  attributes: Record<string, SpanAttribute>,
): TypedResult<Required<ToolSpanMetadata>['result']['isError']> {
  const isError = Boolean(attributes[ATTR_GEN_AI_TOOL_RESULT_IS_ERROR] || false)

  return Result.ok(isError)
}
