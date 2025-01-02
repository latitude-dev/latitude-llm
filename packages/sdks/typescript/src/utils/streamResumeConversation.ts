import { Readable } from 'stream'

import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'
import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import {
  HandlerType,
  ResumeConversationArguments,
  ResumeConversationOptions,
  SDKOptions,
} from '$sdk/utils/types'

export async function streamResumeConversation(
  {
    versionUuid,
    toolCallResponses,
    conversationUuid,
  }: ResumeConversationArguments,
  {
    onEvent,
    onFinished,
    onError,
    options,
  }: ResumeConversationOptions & {
    options: SDKOptions
  },
) {
  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.ResumeConversation,
      params: { conversationUuid },
      options: options,
      body: { versionUuid, toolCallResponses, stream: true },
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: JSON.stringify(json),
        message: json.message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })

      onError?.(error)
      return !onError ? Promise.reject(error) : Promise.resolve(undefined)
    }

    return handleStream({
      body: response.body! as Readable,
      onEvent,
      onFinished,
      onError,
    })
  } catch (e) {
    const err = e as Error
    const error = new LatitudeApiError({
      status: 500,
      message: err.message,
      serverResponse: err.message,
      errorCode: ApiErrorCodes.InternalServerError,
    })

    onError?.(error)
    return !onError ? Promise.reject(error) : Promise.resolve(undefined)
  }
}
