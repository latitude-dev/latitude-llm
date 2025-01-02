import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'
import { LatitudeApiError } from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import {
  ChatSyncAPIResponse,
  HandlerType,
  ResumeConversationArguments,
  ResumeConversationOptions,
  SDKOptions,
} from '$sdk/utils/types'

export async function syncResumeConversation(
  {
    versionUuid,
    toolCallResponses,
    conversationUuid,
  }: ResumeConversationArguments,
  {
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
      body: { versionUuid, toolCallResponses, stream: false },
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

    const json = (await response.json()) as ChatSyncAPIResponse
    onFinished?.(json)

    return Promise.resolve(json)
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
