import { captureException } from '$/common/tracer'
import {
  AssertedStreamType,
  ChainStepObjectResponse,
  ChainStepTextResponse,
  RunSyncAPIResponse,
} from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'
import { ProviderApiKey } from '@latitude-data/core/schema/models/types/ProviderApiKey'
import { estimateCost } from '@latitude-data/core/services/ai/estimateCost/index'

type DocumentResponse = ChainStepObjectResponse | ChainStepTextResponse

export function v2RunPresenter(
  response: DocumentResponse,
): TypedResult<
  Omit<RunSyncAPIResponse<AssertedStreamType>, 'toolRequests'>,
  LatitudeError
> {
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

export function runPresenter({
  response,
  provider,
}: {
  response: DocumentResponse
  provider: ProviderApiKey
}): TypedResult<RunSyncAPIResponse<AssertedStreamType>, LatitudeError> {
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

  const cost = estimateCost({
    usage: response.usage,
    provider: provider.provider,
    model: response.providerLog?.model!,
  })

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
      cost: cost,
    },
  })
}
