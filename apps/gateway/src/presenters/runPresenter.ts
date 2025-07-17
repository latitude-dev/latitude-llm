import { captureException } from '$/common/sentry'
import {
  ChainStepObjectResponse,
  ChainStepTextResponse,
  RunSyncAPIResponse,
} from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'

type DocumentResponse = ChainStepObjectResponse | ChainStepTextResponse

export function v2RunPresenter(
  response: DocumentResponse,
  trace: TraceContext,
): TypedResult<Omit<RunSyncAPIResponse, 'toolRequests'>, LatitudeError> {
  const conversation = response.providerLog?.messages
  const uuid = response.documentLogUuid
  const errorMessage = !uuid
    ? 'Document Log uuid not found in response'
    : !conversation
      ? 'Conversation messages not found in response'
      : undefined

  const error = errorMessage ? new LatitudeError(errorMessage) : undefined

  if (error) {
    captureException(error)
    return Result.error(error)
  }

  const type = response.streamType
  return Result.ok({
    uuid: uuid!,
    conversation: conversation!,
    response: {
      streamType: type,
      usage: response.usage!,
      text: response.text,
      object: type === 'object' ? response.object : undefined,
      toolCalls: type === 'text' ? response.toolCalls : [],
    },
    trace,
  })
}

export function runPresenter({
  response,
}: {
  response: DocumentResponse
}): TypedResult<RunSyncAPIResponse, LatitudeError> {
  const conversation = response.providerLog?.messages
  const uuid = response.documentLogUuid
  const errorMessage = !uuid
    ? 'Document Log uuid not found in response'
    : !conversation
      ? 'Conversation messages not found in response'
      : undefined

  const error = errorMessage ? new LatitudeError(errorMessage) : undefined

  if (error) {
    captureException(error)
    return Result.error(error)
  }

  const type = response.streamType
  return Result.ok({
    uuid: uuid!,
    conversation: conversation!,
    response: {
      streamType: type,
      usage: response.usage!,
      text: response.text,
      object: type === 'object' ? response.object : undefined,
      toolCalls: type === 'text' ? response.toolCalls : [],
    },
  })
}
