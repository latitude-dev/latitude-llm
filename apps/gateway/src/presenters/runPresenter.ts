import { captureException } from '$/common/tracer'
import {
  AssertedStreamType,
  ChainStepResponse,
  PromptSource,
  RunSyncAPIResponse,
  StreamType,
} from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'

export function runPresenter({
  response,
  source,
}: {
  response: ChainStepResponse<StreamType>
  source?: PromptSource
}): TypedResult<RunSyncAPIResponse<AssertedStreamType>, LatitudeError> {
  const conversation = response.input
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
      cost: response.cost,
      input: response.input,
      model: response.model,
      object: type === 'object' ? response.object : undefined,
      output: response.output,
      provider: response.provider,
      streamType: type,
      text: response.text,
      toolCalls: type === 'text' ? response.toolCalls : [],
      usage: response.usage!,
    },
    source,
  })
}
