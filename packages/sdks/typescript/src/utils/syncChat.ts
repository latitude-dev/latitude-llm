import { LatitudeApiError } from '$sdk/utils/errors'
import { makeRequest } from '$sdk/utils/request'
import {
  ChatOptionsWithSDKOptions,
  ChatSyncAPIResponse,
  HandlerType,
  ToolSpec,
} from '$sdk/utils/types'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
} from '@latitude-data/constants/errors'
import { waitForTools } from './streamRun'

export async function syncChat<Tools extends ToolSpec>(
  uuid: string,
  {
    messages,
    tools,
    onFinished,
    onError,
    options,
  }: ChatOptionsWithSDKOptions<Tools>,
) {
  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.Chat,
      params: { conversationUuid: uuid },
      options: options,
      body: { messages, tools: waitForTools(tools), stream: false },
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

    const finalResponse = (await response.json()) as ChatSyncAPIResponse

    onFinished?.(finalResponse)

    return Promise.resolve(finalResponse)
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
